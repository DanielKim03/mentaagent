import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";
import { createAgentRun } from "../services/agent/runner.js";
import { createReport } from "../services/report/orchestrator.js";

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

  // Reports are also generated automatically by the maintenance sweep
  // (sweepScheduledReports: a first report shortly after the workspace has
  // data, then weekly/monthly). This starts one now. At most one report
  // generates at a time: the check and the insert run under a per-workspace
  // advisory lock, so a double click (or a click during a scheduled run)
  // can't start a second.
  app.post("/api/reports", async (req, reply) => {
    const ws = req.workspaceId;
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext('report:' || $1))", [ws]);
      const { rows: docs } = await client.query(
        "SELECT 1 FROM documents WHERE workspace_id = $1 LIMIT 1",
        [ws]
      );
      if (docs.length === 0) {
        return reply.code(400).send({ error: "Upload some files first." });
      }
      const { rows: busy } = await client.query<{ id: string }>(
        "SELECT id FROM reports WHERE workspace_id = $1 AND status = 'generating' LIMIT 1",
        [ws]
      );
      if (busy.length > 0) {
        return reply
          .code(409)
          .send({ error: "A report is already being generated.", report_id: busy[0].id });
      }
      const { reportId } = await createReport({ workspaceId: ws, period: "manual" });
      const { runId } = await createAgentRun({
        workspaceId: ws,
        kind: "report",
        trigger: "user",
        reportId,
      });
      await client.query("UPDATE reports SET run_id = $2 WHERE id = $1", [reportId, runId]);
      return reply.code(202).send({ report_id: reportId, run_id: runId });
    } finally {
      await client
        .query("SELECT pg_advisory_unlock(hashtext('report:' || $1))", [ws])
        .catch(() => {});
      client.release();
    }
  });
}
