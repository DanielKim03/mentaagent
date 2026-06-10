import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db/client.js";

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/api/workspace", async (req) => {
    const { rows } = await pool.query(
      `SELECT id, name, business_profile, plan, source_upload_quota, created_at
         FROM workspaces WHERE id = $1`,
      [req.workspaceId]
    );
    return { workspace: rows[0] };
  });

  // Onboarding / settings: the business profile that grounds every agent run.
  const profileSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    business_profile: z
      .object({
        industry: z.string().max(80).optional(),
        business_model: z.string().max(300).optional(),
        team_size: z.number().int().min(1).max(100000).optional(),
        revenue_band: z.string().max(80).optional(),
        goals: z.string().max(1000).optional(),
        pains: z.string().max(1000).optional(),
        advisor_style: z.enum(["direct", "coaching", "detailed"]).optional(),
      })
      .optional(),
  });
  app.patch("/api/workspace", async (req, reply) => {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid profile", issues: parsed.error.issues });
    }
    if (parsed.data.name) {
      await pool.query("UPDATE workspaces SET name = $2 WHERE id = $1", [
        req.workspaceId,
        parsed.data.name,
      ]);
    }
    if (parsed.data.business_profile) {
      await pool.query(
        "UPDATE workspaces SET business_profile = business_profile || $2::jsonb WHERE id = $1",
        [req.workspaceId, JSON.stringify(parsed.data.business_profile)]
      );
    }
    return { updated: true };
  });

  app.get("/api/watchlist", async (req) => {
    const { rows } = await pool.query(
      `SELECT id, text, cadence, next_due_at, created_by
         FROM watch_items WHERE workspace_id = $1 ORDER BY next_due_at`,
      [req.workspaceId]
    );
    return { items: rows };
  });

  app.delete<{ Params: { id: string } }>(
    "/api/watchlist/:id",
    async (req, reply) => {
      const { rowCount } = await pool.query(
        "DELETE FROM watch_items WHERE id = $1 AND workspace_id = $2",
        [req.params.id, req.workspaceId]
      );
      if ((rowCount ?? 0) === 0) return reply.code(404).send({ error: "not found" });
      return { deleted: true };
    }
  );
}
