import { extname } from "node:path";
import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";
import {
  saveSourceFile,
  SUPPORTED_UPLOAD_EXTS,
} from "../lib/storage.js";
import { ingestQueue } from "../queue/queue.js";
import { sourceEvents, type SourceStatusEvent } from "../queue/events.js";

export async function sourcesRoutes(app: FastifyInstance) {
  app.get("/api/sources", async (req) => {
    const { rows } = await pool.query(
      `SELECT s.id, s.filename, s.file_type, s.status, s.created_at, s.processed_at,
              d.id AS document_id, d.doc_type, d.summary
         FROM sources s
         LEFT JOIN documents d ON d.source_id = s.id
        WHERE s.workspace_id = $1
        ORDER BY s.created_at DESC LIMIT 100`,
      [req.workspaceId]
    );
    return { sources: rows };
  });

  // Multipart upload → sources row (+ quota decrement) → ingest queue.
  app.post("/api/sources", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "no file provided" });

    const ext = extname(file.filename).toLowerCase();
    if (!SUPPORTED_UPLOAD_EXTS.has(ext)) {
      return reply.code(400).send({
        error: `unsupported file type ${ext || "(none)"} — supported: ${[...SUPPORTED_UPLOAD_EXTS].join(", ")}`,
      });
    }
    const data = await file.toBuffer();

    // Atomic quota decrement (NULL = unlimited). Refunded by the worker on
    // final processing failure.
    const { rows: quota } = await pool.query<{ ok: boolean }>(
      `UPDATE workspaces
          SET source_upload_quota = CASE
                WHEN source_upload_quota IS NULL THEN NULL
                ELSE source_upload_quota - 1 END
        WHERE id = $1 AND (source_upload_quota IS NULL OR source_upload_quota > 0)
        RETURNING TRUE AS ok`,
      [req.workspaceId]
    );
    if (quota.length === 0) {
      return reply.code(402).send({ error: "upload quota exhausted — upgrade your plan" });
    }

    // Re-upload of a same-named file replaces the old source (and its
    // document via cascade) — Mentapath semantics.
    await pool.query(
      "DELETE FROM sources WHERE workspace_id = $1 AND filename = $2",
      [req.workspaceId, file.filename]
    );

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO sources (workspace_id, filename, file_type, file_path, file_size, uploaded_by)
       VALUES ($1, $2, $3, '', $4, $5)
       RETURNING id`,
      [req.workspaceId, file.filename, ext.slice(1), data.length, req.userId]
    );
    const sourceId = rows[0].id;

    const { relPath } = await saveSourceFile(
      req.workspaceId,
      sourceId,
      file.filename,
      data
    );
    await pool.query("UPDATE sources SET file_path = $2 WHERE id = $1", [
      sourceId,
      relPath,
    ]);

    await ingestQueue.add("ingest", { sourceId, workspaceId: req.workspaceId });
    return reply.code(202).send({ source_id: sourceId, status: "pending" });
  });

  app.delete<{ Params: { id: string } }>(
    "/api/sources/:id",
    async (req, reply) => {
      const { rowCount } = await pool.query(
        "DELETE FROM sources WHERE id = $1 AND workspace_id = $2",
        [req.params.id, req.workspaceId]
      );
      if ((rowCount ?? 0) === 0) return reply.code(404).send({ error: "not found" });
      return { deleted: true };
    }
  );

  // Live ingest progress (SSE). DB state is the fallback on reconnect.
  app.get<{ Params: { id: string } }>(
    "/api/sources/:id/events",
    async (req, reply) => {
      const { rows } = await pool.query<{ status: string }>(
        "SELECT status FROM sources WHERE id = $1 AND workspace_id = $2",
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
      if (rows[0].status === "processed" || rows[0].status === "failed") {
        reply.raw.end();
        return;
      }

      const listener = (event: SourceStatusEvent) => {
        reply.raw.write(`event: status\ndata: ${JSON.stringify(event)}\n\n`);
        if (event.status === "processed" || event.status === "failed") {
          cleanup();
          reply.raw.end();
        }
      };
      const heartbeat = setInterval(() => reply.raw.write(`: heartbeat\n\n`), 15_000);
      const cleanup = () => {
        clearInterval(heartbeat);
        sourceEvents.removeListener(req.params.id, listener);
      };
      sourceEvents.on(req.params.id, listener);
      req.raw.on("close", cleanup);
    }
  );
}
