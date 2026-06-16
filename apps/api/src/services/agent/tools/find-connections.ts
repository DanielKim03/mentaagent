import { z } from "zod";
import { findConnections } from "../../graph/entities.js";
import { registerTool } from "../registry.js";

// Lets the agent traverse the knowledge graph: from an entity (a customer,
// vendor, product, contract, person, place) or a document_id, find what it
// connects to across the whole dataset — which documents mention it and which
// other entities co-occur with it. This is how the model "connects the data
// points" instead of treating each document in isolation.

registerTool({
  name: "find_connections",
  description:
    "Traverse the business knowledge graph. Pass an entity name (e.g. a customer, vendor, product, or contract) or a document_id, and get back the documents it appears in and the other entities connected to it. Use this to follow a thread across multiple documents.",
  parameters: z.object({
    query: z
      .string()
      .min(1)
      .describe("An entity name (e.g. 'Helix Software') or a document_id"),
  }),
  execute: async (args, ctx) => findConnections(ctx.workspaceId, args.query),
});
