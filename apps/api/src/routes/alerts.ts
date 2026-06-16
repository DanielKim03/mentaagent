import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db/client.js";

export async function alertsRoutes(app: FastifyInstance) {
  // Return everything except already-purged rows. The UI buckets them into
  // Open / Wins (resolved) / Dismissed.
  app.get("/api/alerts", async (req) => {
    const { rows } = await pool.query(
      `SELECT id, alert_type, severity, title, description, recommended_action,
              status, due_at, outcome, outcome_noted_at, dismissed_at, created_at
         FROM alerts
        WHERE workspace_id = $1
        ORDER BY (status = 'open') DESC,
                 CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END,
                 created_at DESC
        LIMIT 200`,
      [req.workspaceId]
    );
    return { alerts: rows };
  });

  const patchSchema = z.object({
    status: z.enum(["open", "dismissed", "resolved"]).optional(),
    outcome: z.string().max(1000).optional(),
  });
  app.patch<{ Params: { id: string } }>("/api/alerts/:id", async (req, reply) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success || (!parsed.data.status && parsed.data.outcome === undefined)) {
      return reply.code(400).send({ error: "provide status and/or outcome" });
    }
    const sets: string[] = [];
    const values: unknown[] = [req.params.id, req.workspaceId];
    if (parsed.data.status) {
      values.push(parsed.data.status);
      sets.push(`status = $${values.length}`);
      // Dismissal starts the 24h purge clock; restoring (→ open) clears it.
      if (parsed.data.status === "dismissed") sets.push("dismissed_at = NOW()");
      if (parsed.data.status === "open") sets.push("dismissed_at = NULL");
      if (parsed.data.status === "resolved") sets.push("resolved_at = NOW()");
    }
    if (parsed.data.outcome !== undefined) {
      values.push(parsed.data.outcome);
      sets.push(`outcome = $${values.length}`, "outcome_noted_at = NOW()");
    }
    const { rowCount } = await pool.query(
      `UPDATE alerts SET ${sets.join(", ")} WHERE id = $1 AND workspace_id = $2`,
      values
    );
    if ((rowCount ?? 0) === 0) return reply.code(404).send({ error: "not found" });
    return { updated: true };
  });
}
