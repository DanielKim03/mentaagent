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

  // Generate a new report: report row + sections + one report-kind run.
  app.post("/api/reports", async (req, reply) => {
    const { rows: active } = await pool.query(
      `SELECT 1 FROM reports WHERE workspace_id = $1 AND status = 'generating' LIMIT 1`,
      [req.workspaceId]
    );
    if (active.length > 0) {
      return reply.code(409).send({ error: "a report is already generating" });
    }

    const { reportId } = await createReport({
      workspaceId: req.workspaceId,
      createdBy: req.userId,
    });
    const { runId } = await createAgentRun({
      workspaceId: req.workspaceId,
      kind: "report",
      reportId,
    });
    await pool.query("UPDATE reports SET run_id = $2 WHERE id = $1", [
      reportId,
      runId,
    ]);
    return reply.code(202).send({ report_id: reportId, run_id: runId });
  });
}
