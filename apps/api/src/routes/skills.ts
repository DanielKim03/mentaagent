import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../db/client.js";
import { listSkills, reviewSkill } from "../services/skills/store.js";

// Skills UI: catalog + the "Your analyst is learning" approval queue.

export async function skillsRoutes(app: FastifyInstance) {
  app.get("/api/skills", async (req) => {
    return { skills: await listSkills(req.workspaceId) };
  });

  app.get<{ Params: { id: string } }>("/api/skills/:id", async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT id, name, description, body, source, status, use_count
         FROM skills
        WHERE id = $1 AND (workspace_id = $2 OR workspace_id IS NULL)`,
      [req.params.id, req.workspaceId]
    );
    if (rows.length === 0) return reply.code(404).send({ error: "not found" });
    return { skill: rows[0] };
  });

  const reviewSchema = z.object({ decision: z.enum(["approve", "reject"]) });
  app.post<{ Params: { id: string } }>(
    "/api/skills/:id/review",
    async (req, reply) => {
      const parsed = reviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "decision must be approve or reject" });
      }
      const ok = await reviewSkill(req.workspaceId, req.params.id, parsed.data.decision);
      if (!ok) return reply.code(404).send({ error: "no pending proposal with that id" });
      return { [parsed.data.decision === "approve" ? "approved" : "rejected"]: true };
    }
  );
}
