import type { FastifyInstance } from "fastify";
import { buildGraph } from "../services/graph/entities.js";

export async function graphRoutes(app: FastifyInstance) {
  // Nodes (documents + entities) and edges (document↔entity) for the
  // workspace — powers the /graph visualization.
  app.get("/api/graph", async (req) => {
    return buildGraph(req.workspaceId);
  });
}
