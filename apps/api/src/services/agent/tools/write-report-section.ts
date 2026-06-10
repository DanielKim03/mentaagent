import { z } from "zod";
import { pool } from "../../../db/client.js";
import { registerTool } from "../registry.js";

// Report runs only (enforced by the run-kind tool whitelist AND by requiring
// ctx.reportId). section_key is validated against the report's rubric so the
// model can't invent sections.

registerTool({
  name: "write_report_section",
  description:
    "Write one section of the business health report. Call exactly once per dimension after investigating it. Citations must reference real document_ids you actually read.",
  parameters: z.object({
    section_key: z.string().min(1),
    markdown: z.string().min(50).describe("The section body: findings, evidence, recommendations"),
    score: z.number().int().min(0).max(100).describe("0-100 health score for this dimension"),
    citations: z
      .array(
        z.object({
          document_id: z.string().uuid(),
          quote: z.string().max(300),
        })
      )
      .default([]),
  }),
  execute: async (args, ctx) => {
    if (!ctx.reportId) {
      return JSON.stringify({ error: "this run is not attached to a report" });
    }
    // Validate citations belong to this workspace (the model can't smuggle
    // ids it didn't read, and certainly not another tenant's).
    const citations = args.citations ?? [];
    if (citations.length > 0) {
      const { rows } = await pool.query<{ id: string }>(
        "SELECT id FROM documents WHERE workspace_id = $1 AND id = ANY($2)",
        [ctx.workspaceId, citations.map((c) => c.document_id)]
      );
      const valid = new Set(rows.map((r) => r.id));
      const invalid = citations.filter((c) => !valid.has(c.document_id));
      if (invalid.length > 0) {
        return JSON.stringify({
          error: `citations reference unknown document_ids: ${invalid.map((c) => c.document_id).join(", ")}`,
        });
      }
    }

    const { rowCount } = await pool.query(
      `UPDATE report_sections
          SET content_md = $3, score = $4, citations = $5, status = 'written'
        WHERE report_id = $1 AND section_key = $2`,
      [
        ctx.reportId,
        args.section_key,
        args.markdown,
        args.score,
        JSON.stringify(citations),
      ]
    );
    if ((rowCount ?? 0) === 0) {
      const { rows } = await pool.query<{ section_key: string }>(
        "SELECT section_key FROM report_sections WHERE report_id = $1 AND status = 'pending'",
        [ctx.reportId]
      );
      return JSON.stringify({
        error: `unknown section_key "${args.section_key}"; remaining sections: ${rows.map((r) => r.section_key).join(", ")}`,
      });
    }
    return JSON.stringify({ written: args.section_key });
  },
});
