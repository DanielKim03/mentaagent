import { z } from "zod";
import { pool } from "../../../db/client.js";
import { registerTool } from "../registry.js";

registerTool({
  name: "list_documents",
  description:
    "Inventory of every document this business has shared: title, type, summary, age. Use it to know what data exists — and, just as important, what's MISSING (missing data is a finding).",
  parameters: z.object({
    doc_type: z.string().optional().describe("Filter by document type"),
  }),
  execute: async (args, ctx) => {
    const { rows } = await pool.query<{
      id: string;
      title: string;
      doc_type: string;
      summary: string | null;
      token_count: number | null;
      created_at: Date;
    }>(
      `SELECT id, title, doc_type, summary, token_count, created_at
         FROM documents
        WHERE workspace_id = $1 ${args.doc_type ? "AND doc_type = $2" : ""}
        ORDER BY created_at DESC
        LIMIT 100`,
      args.doc_type ? [ctx.workspaceId, args.doc_type] : [ctx.workspaceId]
    );
    if (rows.length === 0) {
      return "This business has not shared any documents yet. Recommend specific uploads based on what you need to analyze (e.g. P&L, customer list, key contracts).";
    }
    return rows
      .map(
        (d) =>
          `- ${d.title} | type=${d.doc_type} | document_id=${d.id} | ~${d.token_count ?? "?"} tokens | added ${d.created_at.toISOString().slice(0, 10)}\n  ${d.summary ?? "(no summary)"}`
      )
      .join("\n");
  },
});
