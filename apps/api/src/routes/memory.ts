import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  deleteMemoryRow,
  listMemory,
  updateMemoryRow,
} from "../services/memory/store.js";

// "What your analyst knows" — the memory trust UI. Owners can view, edit,
// delete, and export everything the agent has remembered about them.

export async function memoryRoutes(app: FastifyInstance) {
  app.get("/api/memory", async (req) => {
    return { memory: await listMemory(req.workspaceId) };
  });

  const patchSchema = z.object({ content: z.string().min(1).max(1000) });
  app.patch<{ Params: { id: string } }>("/api/memory/:id", async (req, reply) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "content required" });
    const ok = await updateMemoryRow(req.workspaceId, req.params.id, parsed.data.content);
    if (!ok) return reply.code(404).send({ error: "not found" });
    return { updated: true };
  });

  app.delete<{ Params: { id: string } }>("/api/memory/:id", async (req, reply) => {
    const ok = await deleteMemoryRow(req.workspaceId, req.params.id);
    if (!ok) return reply.code(404).send({ error: "not found" });
    return { deleted: true };
  });

  // Plain-text export (data portability — the Inflection lesson).
  app.get("/api/memory/export", async (req, reply) => {
    const rows = await listMemory(req.workspaceId);
    const text = rows
      .map(
        (r) =>
          `[${r.category}] ${r.content}${r.due_at ? ` (due ${new Date(r.due_at).toISOString().slice(0, 10)})` : ""}`
      )
      .join("\n");
    reply.header("Content-Type", "text/plain; charset=utf-8");
    reply.header("Content-Disposition", "attachment; filename=analyst-memory.txt");
    return text;
  });
}
