import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import * as Sentry from "@sentry/node";
import { env } from "../env.js";
import { DEFAULT_WORKSPACE_ID } from "./workspace.js";

declare module "fastify" {
  interface FastifyRequest {
    workspaceId: string;
    // Always null: MentaAgent runs locally for one person, with no accounts.
    // Kept on the request so routes that record an author still compile.
    userId: string | null;
    userEmail: string | null;
    role: string | null;
  }
}

const PUBLIC_PATHS = new Set(["/health"]);

// Constant-time compare to avoid leaking the secret length / prefix via timing.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Local, single-user mode: there are no accounts and one workspace. The only
// check is the web -> API shared secret (when set), so that nothing but the
// web server can call the API directly. Who may reach the web server is
// decided by the network: docker compose binds it to 127.0.0.1.
export async function registerAuthHook(app: FastifyInstance) {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    req.workspaceId = DEFAULT_WORKSPACE_ID;
    req.userId = null;
    req.userEmail = null;
    req.role = "admin";

    const path = req.url.split("?")[0];
    if (PUBLIC_PATHS.has(path)) return;

    const expected = env.INTERNAL_API_SECRET;
    if (expected) {
      const auth = req.headers.authorization;
      if (!auth?.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "missing bearer token" });
      }
      if (!safeEqual(auth.slice("Bearer ".length), expected)) {
        return reply.code(401).send({ error: "invalid token" });
      }
    } else if (env.NODE_ENV === "production") {
      return reply.code(500).send({ error: "auth not configured" });
    }

    if (env.SENTRY_DSN) {
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
