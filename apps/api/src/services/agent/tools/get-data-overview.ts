import { z } from "zod";
import { pool } from "../../../db/client.js";
import { registerTool } from "../registry.js";
import type { SpreadsheetStats } from "../../ingestion/stats.js";

// A precomputed map of ALL the workspace's data — every document with its type
// and summary, plus per-column stats for spreadsheets (computed at ingest).
// Calling this first answers most totals/top-N/date-range questions outright
// and tells the agent exactly which document to read for anything else, so it
// rarely needs to read raw rows or run live aggregations.

registerTool({
  name: "get_data_overview",
  description:
    "Precomputed overview of ALL uploaded business data: each document with its type and summary, plus — for spreadsheets — per-column statistics already computed at upload (row count, numeric sum/avg/min/max, date min/max ranges, and top category values). Call this FIRST. It answers most totals, top-N, and date-range questions directly, and points you to the exact document_id to read for anything deeper — so you rarely need to read raw rows.",
  parameters: z.object({}),
  execute: async (_args, ctx) => {
    const { rows } = await pool.query<{
      id: string;
      title: string;
      doc_type: string;
      summary: string | null;
      metadata: { stats?: SpreadsheetStats } | null;
    }>(
      `SELECT id, title, doc_type, summary, metadata
         FROM documents
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [ctx.workspaceId]
    );
    if (rows.length === 0) {
      return JSON.stringify({
        documents: [],
        note: "No data has been uploaded yet — ask the owner to upload files.",
      });
    }
    const documents = rows.map((d) => ({
      document_id: d.id,
      title: d.title,
      type: d.doc_type,
      summary: d.summary ? d.summary.slice(0, 240) : undefined,
      stats: d.metadata?.stats ?? undefined,
    }));
    return JSON.stringify({ documents });
  },
});
