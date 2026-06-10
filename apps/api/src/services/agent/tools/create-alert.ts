import { z } from "zod";
import { pool } from "../../../db/client.js";
import { registerTool } from "../registry.js";

// Validated writer with Mentapath's suggest-runner quality gates baked in:
//  - severity floor (no "low" — too generic to be worth interrupting anyone)
//  - pg_trgm dedup against ALL open alerts (re-finding a known issue is noise)
//  - max 5 alerts per run (forces selectivity)
// Living inside the tool means chat, report, and monitor runs all get the
// gates for free.

const MAX_ALERTS_PER_RUN = 5;
const SIMILARITY_THRESHOLD = 0.55;

const ALERT_TYPES = ["risk", "opportunity", "action"] as const;
const SEVERITIES = ["critical", "high", "medium"] as const;

registerTool({
  name: "create_alert",
  description:
    "File a business finding (risk / opportunity / recommended action) for the owner's alert center. Only file findings with concrete evidence and real consequence (money, deadline, obligation) — generic best practices are rejected by policy. Max 5 per run; duplicates of open alerts are auto-rejected.",
  parameters: z.object({
    type: z.enum(ALERT_TYPES),
    severity: z
      .enum(SEVERITIES)
      .describe("critical = losing money/compliance NOW; high = next 30-60 days; medium = important, not urgent"),
    title: z.string().min(8).max(200),
    description: z.string().min(20).max(2000).describe("The finding, with the evidence (which document, which numbers)"),
    recommended_action: z.string().min(10).max(1000),
    due_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Deadline if the finding has one (YYYY-MM-DD)"),
  }),
  execute: async (args, ctx) => {
    // Gate: per-run cap.
    const { rows: countRows } = await pool.query<{ n: string }>(
      "SELECT COUNT(*)::text AS n FROM alerts WHERE agent_run_id = $1",
      [ctx.runId]
    );
    if (Number(countRows[0].n) >= MAX_ALERTS_PER_RUN) {
      return JSON.stringify({
        error: `alert limit reached for this run (${MAX_ALERTS_PER_RUN}) — keep only the most consequential findings`,
      });
    }

    // Gate: trigram dedup vs open (non-dismissed) alerts.
    const { rows: dupRows } = await pool.query<{ title: string }>(
      `SELECT title FROM alerts
        WHERE workspace_id = $1 AND status = 'open'
          AND similarity(title, $2) > $3
        LIMIT 1`,
      [ctx.workspaceId, args.title, SIMILARITY_THRESHOLD]
    );
    if (dupRows.length > 0) {
      return JSON.stringify({
        skipped: `an open alert already covers this: "${dupRows[0].title}" — do not re-file it`,
      });
    }

    // Future-or-today due dates only (deadline math errors are common).
    let dueAt: string | null = null;
    if (args.due_date) {
      const today = new Date().toISOString().slice(0, 10);
      dueAt = args.due_date >= today ? `${args.due_date}T12:00:00Z` : null;
    }

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO alerts
         (workspace_id, alert_type, severity, title, description, recommended_action, due_at, agent_run_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        ctx.workspaceId,
        `suggestion:${args.type}`,
        args.severity,
        args.title,
        args.description,
        args.recommended_action,
        dueAt,
        ctx.runId,
      ]
    );
    return JSON.stringify({ created: true, alert_id: rows[0].id });
  },
});
