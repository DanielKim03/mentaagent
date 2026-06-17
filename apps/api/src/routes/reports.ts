import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";

export async function reportsRoutes(app: FastifyInstance) {
  app.get("/api/reports", async (req) => {
    const { rows } = await pool.query(
      `SELECT id, title, status, overall_score, created_at
         FROM reports WHERE workspace_id = $1
        ORDER BY created_at DESC LIMIT 50`,
      [req.workspaceId]
    );
    return { reports: rows };
  });

  app.get<{ Params: { id: string } }>("/api/reports/:id", async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, title, status, overall_score, rubric, created_at, run_id
         FROM reports WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspaceId]
    );
    if (rows.length === 0) return reply.code(404).send({ error: "not found" });
    const { rows: sections } = await pool.query(
      `SELECT section_key, title, position, content_md, citations, score, status
         FROM report_sections WHERE report_id = $1 ORDER BY position`,
      [req.params.id]
    );
    return { report: rows[0], sections };
  });

  // Reports are generated automatically by the maintenance sweep
  // (sweepScheduledReports: a first report shortly after the workspace has
  // data, then weekly/monthly) and delivered by email — there is no manual
  // "generate now" endpoint.
}
