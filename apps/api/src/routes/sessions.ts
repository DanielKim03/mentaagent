import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db/client.js";
import { createAgentRun } from "../services/agent/runner.js";

export async function sessionRoutes(app: FastifyInstance) {
  // List chat sessions (sidebar).
  app.get("/api/sessions", async (req) => {
    const { rows } = await pool.query(
      `SELECT id, title, kind, created_at, summarized_at
         FROM agent_sessions
        WHERE workspace_id = $1 AND kind = 'chat'
        ORDER BY created_at DESC LIMIT 50`,
      [req.workspaceId]
    );
    return { sessions: rows };
  });

  // The chat session with an in-flight run (queued/running), if any, so the
  // UI can default back into a conversation that's still being worked on.
  // Static path — declared before "/:id" so it isn't captured as an id.
  app.get("/api/sessions/active", async (req) => {
    const { rows } = await pool.query<{ session_id: string }>(
      `SELECT s.id AS session_id
         FROM agent_sessions s
         JOIN agent_runs r ON r.session_id = s.id
        WHERE s.workspace_id = $1
          AND r.kind = 'chat'
          AND r.status IN ('queued', 'running')
        ORDER BY r.created_at DESC
        LIMIT 1`,
      [req.workspaceId]
    );
    return { session_id: rows[0]?.session_id ?? null };
  });

  // Create a chat session.
  app.post("/api/sessions", async (req) => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agent_sessions (workspace_id, created_by, kind)
       VALUES ($1, $2, 'chat') RETURNING id`,
      [req.workspaceId, req.userId]
    );
    return { session_id: rows[0].id };
  });

  // Rename a conversation.
  const renameSchema = z.object({ title: z.string().min(1).max(120) });
  app.patch<{ Params: { id: string } }>("/api/sessions/:id", async (req, reply) => {
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "title required" });
    const { rowCount } = await pool.query(
      "UPDATE agent_sessions SET title = $3 WHERE id = $1 AND workspace_id = $2",
      [req.params.id, req.workspaceId, parsed.data.title]
    );
    if ((rowCount ?? 0) === 0) return reply.code(404).send({ error: "not found" });
    return { updated: true };
  });

  // Delete a conversation (cascades runs + messages).
  app.delete<{ Params: { id: string } }>("/api/sessions/:id", async (req, reply) => {
    const { rowCount } = await pool.query(
      "DELETE FROM agent_sessions WHERE id = $1 AND workspace_id = $2",
      [req.params.id, req.workspaceId]
    );
    if ((rowCount ?? 0) === 0) return reply.code(404).send({ error: "not found" });
    return { deleted: true };
  });

  // Session transcript: user/assistant text + tool activity for the UI.
  app.get<{ Params: { id: string } }>("/api/sessions/:id", async (req, reply) => {
    const { rows: sessions } = await pool.query(
      "SELECT id, title FROM agent_sessions WHERE id = $1 AND workspace_id = $2",
      [req.params.id, req.workspaceId]
    );
    if (sessions.length === 0) return reply.code(404).send({ error: "not found" });

    const { rows: messages } = await pool.query(
      `SELECT m.id, m.run_id, m.seq, m.role, m.content, m.tool_calls, m.name, m.created_at,
              r.status AS run_status
         FROM agent_messages m
         JOIN agent_runs r ON r.id = m.run_id
        WHERE m.session_id = $1
        ORDER BY r.created_at, m.seq`,
      [req.params.id]
    );
    return { session: sessions[0], messages };
  });

  // Send a message → one chat-kind agent run (a turn). 202 + runId; the
  // client tails /api/runs/:id/events for the live answer.
  const sendSchema = z.object({ message: z.string().min(1).max(8000) });
  app.post<{ Params: { id: string } }>(
    "/api/sessions/:id/messages",
    async (req, reply) => {
      const parsed = sendSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "message is required (1-8000 chars)" });
      }
      const { rows } = await pool.query(
        "SELECT id FROM agent_sessions WHERE id = $1 AND workspace_id = $2",
        [req.params.id, req.workspaceId]
      );
      if (rows.length === 0) return reply.code(404).send({ error: "not found" });

      // One run at a time per session — a second message while the agent is
      // thinking would interleave transcripts.
      const { rows: active } = await pool.query(
        `SELECT 1 FROM agent_runs
          WHERE session_id = $1 AND status IN ('queued', 'running') LIMIT 1`,
        [req.params.id]
      );
      if (active.length > 0) {
        return reply.code(409).send({ error: "the analyst is still working on the previous message" });
      }

      const { runId } = await createAgentRun({
        workspaceId: req.workspaceId,
        kind: "chat",
        sessionId: req.params.id,
        userMessage: parsed.data.message,
      });
      return reply.code(202).send({ run_id: runId });
    }
  );
}
