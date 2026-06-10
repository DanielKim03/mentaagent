import { z } from "zod";
import { pool } from "../../../db/client.js";
import { registerTool } from "../registry.js";

// Episodic recall (Hermes session-search analog): FTS over past
// conversations, alerts, and report sections — everything is already
// persisted, this just makes it searchable.

registerTool({
  name: "search_history",
  description:
    "Search past conversations with the owner, past alerts, and past report findings. Use when the owner references something discussed before, or to check whether a finding was already raised and what came of it.",
  parameters: z.object({
    query: z.string().min(2),
  }),
  execute: async (args, ctx) => {
    const [messages, alerts, sections] = await Promise.all([
      pool.query<{ content: string; role: string; created_at: Date }>(
        `SELECT content, role, created_at FROM agent_messages
          WHERE workspace_id = $1 AND role IN ('user', 'assistant') AND content <> ''
            AND to_tsvector('english', content) @@ plainto_tsquery('english', $2)
          ORDER BY created_at DESC LIMIT 6`,
        [ctx.workspaceId, args.query]
      ),
      pool.query<{ title: string; status: string; outcome: string | null; created_at: Date }>(
        `SELECT title, status, outcome, created_at FROM alerts
          WHERE workspace_id = $1
            AND to_tsvector('english', title || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', $2)
          ORDER BY created_at DESC LIMIT 5`,
        [ctx.workspaceId, args.query]
      ),
      pool.query<{ title: string; content_md: string; created_at: Date }>(
        `SELECT rs.title, rs.content_md, r.created_at
           FROM report_sections rs JOIN reports r ON r.id = rs.report_id
          WHERE r.workspace_id = $1 AND rs.status = 'written'
            AND to_tsvector('english', rs.content_md) @@ plainto_tsquery('english', $2)
          ORDER BY r.created_at DESC LIMIT 3`,
        [ctx.workspaceId, args.query]
      ),
    ]);

    const parts: string[] = [];
    if (messages.rows.length > 0) {
      parts.push(
        "Past conversation excerpts:\n" +
          messages.rows
            .map(
              (m) =>
                `- [${m.created_at.toISOString().slice(0, 10)}] ${m.role === "user" ? "Owner" : "You"}: ${m.content.slice(0, 300)}`
            )
            .join("\n")
      );
    }
    if (alerts.rows.length > 0) {
      parts.push(
        "Related alerts:\n" +
          alerts.rows
            .map(
              (a) =>
                `- [${a.created_at.toISOString().slice(0, 10)}] ${a.title} (${a.status}${a.outcome ? `; outcome: ${a.outcome}` : ""})`
            )
            .join("\n")
      );
    }
    if (sections.rows.length > 0) {
      parts.push(
        "Related report findings:\n" +
          sections.rows
            .map(
              (s) =>
                `- [${s.created_at.toISOString().slice(0, 10)}] ${s.title}: ${s.content_md.slice(0, 300)}`
            )
            .join("\n")
      );
    }
    return parts.length > 0 ? parts.join("\n\n") : "Nothing in past history matches that.";
  },
});
