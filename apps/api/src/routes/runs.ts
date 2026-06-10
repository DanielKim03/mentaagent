import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";
import { agentEvents, type AgentEvent } from "../queue/events.js";
import { redisConnection } from "../queue/queue.js";

export async function runRoutes(app: FastifyInstance) {
  // Run status + transcript (the SSE reconnect fallback: fetch state from
  // the DB, then re-attach to the live stream).
  app.get<{ Params: { id: string } }>("/api/runs/:id", async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, session_id, kind, status, iterations, cost_usd_micros::text,
              report_id, error, created_at, started_at, finished_at
         FROM agent_runs WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspaceId]
    );
    if (rows.length === 0) return reply.code(404).send({ error: "not found" });
    const { rows: messages } = await pool.query(
      `SELECT seq, role, content, tool_calls, name, created_at
         FROM agent_messages WHERE run_id = $1 ORDER BY seq`,
      [req.params.id]
    );
    return { run: rows[0], messages };
  });

  // Live event stream for a run. Heartbeats keep proxies from buffering;
  // closes itself on a terminal event.
  app.get<{ Params: { id: string } }>(
    "/api/runs/:id/events",
    async (req, reply) => {
      const { rows } = await pool.query<{ status: string }>(
        "SELECT status FROM agent_runs WHERE id = $1 AND workspace_id = $2",
        [req.params.id, req.workspaceId]
      );
      if (rows.length === 0) return reply.code(404).send({ error: "not found" });

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.raw.write(`event: status\ndata: ${JSON.stringify({ status: rows[0].status })}\n\n`);

      // Already terminal → tell the client to fetch the DB state and close.
      if (!["queued", "running"].includes(rows[0].status)) {
        reply.raw.write(`event: done\ndata: {}\n\n`);
        reply.raw.end();
        return;
      }

      const listener = (event: AgentEvent) => {
        reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        if (
          event.type === "run.finished" ||
          event.type === "run.failed" ||
          event.type === "run.paused"
        ) {
          cleanup();
          reply.raw.end();
        }
      };
      const heartbeat = setInterval(() => {
        reply.raw.write(`: heartbeat\n\n`);
      }, 15_000);
      const cleanup = () => {
        clearInterval(heartbeat);
        agentEvents.removeListener(req.params.id, listener);
      };
      agentEvents.on(req.params.id, listener);
      req.raw.on("close", cleanup);
    }
  );

  // Cooperative cancellation: the loop checks this flag each iteration.
  app.post<{ Params: { id: string } }>(
    "/api/runs/:id/cancel",
    async (req, reply) => {
      const { rows } = await pool.query(
        `SELECT 1 FROM agent_runs
          WHERE id = $1 AND workspace_id = $2 AND status IN ('queued', 'running')`,
        [req.params.id, req.workspaceId]
      );
      if (rows.length === 0) return reply.code(404).send({ error: "no active run" });
      await redisConnection.set(`agent-cancel:${req.params.id}`, "1", "EX", 3600);
      return { cancelling: true };
    }
  );
}
