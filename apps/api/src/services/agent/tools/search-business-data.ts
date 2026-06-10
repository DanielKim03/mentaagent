import { z } from "zod";
import { searchChunks } from "../../retrieval/hybrid.js";
import { registerTool } from "../registry.js";

registerTool({
  name: "search_business_data",
  description:
    "Search across all of this business's documents (semantic + keyword). Returns the most relevant excerpts with their source document. Use this FIRST to find where information lives, then read_document for full context.",
  parameters: z.object({
    query: z.string().min(2).describe("What to search for, in plain language"),
    top_k: z.number().int().min(1).max(20).default(8).optional(),
  }),
  execute: async (args, ctx) => {
    const hits = await searchChunks(ctx.workspaceId, args.query, args.top_k ?? 8);
    if (hits.length === 0) {
      return "No matches. The information may not have been uploaded yet — check list_documents to see what data this business has shared.";
    }
    return hits
      .map(
        (h, i) =>
          `[${i + 1}] ${h.documentTitle} (${h.docType}, document_id=${h.documentId})\n<document>\n${h.content}\n</document>`
      )
      .join("\n\n");
  },
});
