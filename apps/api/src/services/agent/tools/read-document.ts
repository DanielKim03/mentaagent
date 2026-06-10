import { z } from "zod";
import { pool } from "../../../db/client.js";
import { registerTool } from "../registry.js";

const PAGE_CHARS = 6_000;

registerTool({
  name: "read_document",
  description:
    "Read a document's full text, paginated. Use offset to continue reading a long document (page size ~6000 chars).",
  parameters: z.object({
    document_id: z.string().uuid(),
    offset: z.number().int().min(0).default(0).optional(),
  }),
  execute: async (args, ctx) => {
    const { rows } = await pool.query<{
      title: string;
      doc_type: string;
      content_text: string;
    }>(
      "SELECT title, doc_type, content_text FROM documents WHERE id = $1 AND workspace_id = $2",
      [args.document_id, ctx.workspaceId]
    );
    if (rows.length === 0) {
      return JSON.stringify({ error: "document not found — check list_documents for valid ids" });
    }
    const doc = rows[0];
    const offset = args.offset ?? 0;
    const page = doc.content_text.slice(offset, offset + PAGE_CHARS);
    const remaining = Math.max(0, doc.content_text.length - offset - PAGE_CHARS);
    const header = `${doc.title} (${doc.doc_type}) — chars ${offset}-${offset + page.length} of ${doc.content_text.length}`;
    const footer =
      remaining > 0
        ? `\n[${remaining} more chars — call again with offset=${offset + PAGE_CHARS}]`
        : "";
    return `${header}\n<document>\n${page}\n</document>${footer}`;
  },
});
