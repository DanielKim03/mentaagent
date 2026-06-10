import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as Sentry from "@sentry/node";
import { env } from "../env.js";
import { pool } from "../db/client.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace.js";

declare module "fastify" {
  interface FastifyRequest {
    workspaceId: string;
    userId: string | null;
    userEmail: string | null;
    // Caller's role on req.workspaceId, read from the memberships table at the
    // trust boundary (never trusted from a client header). "admin" unlocks the
    // destructive/config routes (see requireAdminRole). null in dev fallbacks.
    role: string | null;
  }
}

const PUBLIC_PATHS = new Set(["/health"]);

// Machine-to-machine endpoints that authenticate with their OWN credential
// inside the route handler (e.g. the inbound-email relay secret) — the
// standard web-proxy secret + member headers don't apply. req.workspaceId is
// poisoned with an empty string so any handler that forgets to derive its own
// workspace fails loudly instead of touching a tenant.
const MACHINE_PATHS = new Set(["/api/inbound/email"]);

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Constant-time compare to avoid leaking the secret length / prefix via timing.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function registerAuthHook(app: FastifyInstance) {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0];
    if (PUBLIC_PATHS.has(path)) {
      req.workspaceId = DEFAULT_WORKSPACE_ID;
      req.userId = null;
      req.userEmail = null;
      req.role = null;
      return;
    }
    if (MACHINE_PATHS.has(path)) {
      req.workspaceId = "";
      req.userId = null;
      req.userEmail = null;
      req.role = null;
      return;
    }

    const auth = req.headers.authorization;
    const expected = env.INTERNAL_API_SECRET;

    // In production we hard-require the shared secret. In dev, we allow
    // unauthenticated requests so curl/scripts keep working — but only when
    // INTERNAL_API_SECRET is unset. If you set it locally, we enforce it.
    if (expected) {
      if (!auth?.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "missing bearer token" });
      }
      const token = auth.slice("Bearer ".length);
      if (!safeEqual(token, expected)) {
        return reply.code(401).send({ error: "invalid token" });
      }
    } else if (env.NODE_ENV === "production") {
      return reply.code(500).send({ error: "auth not configured" });
    }

    const wsHeader = req.headers["x-workspace-id"];
    const workspaceId = Array.isArray(wsHeader) ? wsHeader[0] : wsHeader;

    const uidHeader = req.headers["x-user-id"];
    const userIdRaw = Array.isArray(uidHeader) ? uidHeader[0] : uidHeader;
    const userId = userIdRaw && isUuid(userIdRaw) ? userIdRaw : null;
    req.userId = userId;

    const emailHeader = req.headers["x-user-email"];
    const email = Array.isArray(emailHeader) ? emailHeader[0] : emailHeader;
    req.userEmail = email ?? null;

    if (expected) {
      // Production-like: the shared secret is enforced. The web injects
      // server-derived x-user-id + x-workspace-id from the authenticated
      // session. We re-verify here, at the trust boundary, that the
      // (user, workspace) pair is a real membership — so a leaked shared
      // secret ALONE can't impersonate an arbitrary tenant — and we read the
      // caller's role from the DB (never trusting a client-supplied role) so
      // route handlers can gate admin-only operations. NEVER fall back to a
      // shared default workspace: that would serve one tenant another's data.
      if (!workspaceId || !isUuid(workspaceId)) {
        return reply.code(400).send({ error: "missing or invalid workspace" });
      }
      if (!userId) {
        return reply.code(403).send({ error: "missing user identity" });
      }
      const { rows } = await pool.query<{ role: string }>(
        `SELECT role FROM memberships WHERE user_id = $1 AND workspace_id = $2`,
        [userId, workspaceId]
      );
      if (rows.length === 0) {
        return reply
          .code(403)
          .send({ error: "not a member of this workspace" });
      }
      req.workspaceId = workspaceId;
      req.role = rows[0].role;
    } else {
      // Dev only (no INTERNAL_API_SECRET set, and not production — the token
      // block above already 500s on a prod misconfig). Single-tenant fallback
      // so curl/scripts work against the seeded default workspace as a
      // superuser. Honor an explicit workspace header if one is provided.
      req.workspaceId =
        workspaceId && isUuid(workspaceId) ? workspaceId : DEFAULT_WORKSPACE_ID;
      req.role = "admin";
    }

    if (env.SENTRY_DSN) {
      Sentry.setUser(req.userId ? { id: req.userId } : null);
      Sentry.setTag("workspace_id", req.workspaceId);
    }
  });
}

// Guard for admin-only routes (workspace deletion, schema/config writes).
// The web enforces role in its Server Actions, but the generic /api/proxy
// faithfully forwards ANY authenticated member's request, so destructive and
// config-changing endpoints MUST also enforce role here at the trust boundary.
// Returns true when the caller may proceed; otherwise sends 403 and returns
// false (caller should `return` immediately).
export function requireAdminRole(
  req: FastifyRequest,
  reply: FastifyReply
): boolean {
  if (req.role !== "admin") {
    reply.code(403).send({ error: "admin role required" });
    return false;
  }
  return true;
}
