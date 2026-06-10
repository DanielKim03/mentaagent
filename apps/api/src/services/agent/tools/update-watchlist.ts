import { z } from "zod";
import { pool } from "../../../db/client.js";
import { registerTool } from "../registry.js";

// The analyst's standing checklist for scheduled monitoring (OpenClaw
// HEARTBEAT.md analog, per-workspace, DB-backed). Monitor runs load only
// items that are DUE; completing an item reschedules it by its cadence.

const MAX_WATCH_ITEMS = 25;

registerTool({
  name: "update_watchlist",
  description:
    "Maintain the standing watchlist for this business — things to check on a schedule (e.g. 'vendor contract renews Aug 1', 'review AR aging'). Actions: add, complete (reschedules by cadence, or removes if cadence=once), remove, list.",
  parameters: z.object({
    action: z.enum(["add", "complete", "remove", "list"]),
    text: z.string().max(300).optional().describe("Item text (add) or distinctive substring (complete/remove)"),
    cadence: z.enum(["daily", "weekly", "monthly", "once"]).optional(),
    first_due: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("When the item first comes due (default: now)"),
  }),
  execute: async (args, ctx) => {
    switch (args.action) {
      case "list": {
        const { rows } = await pool.query<{
          text: string;
          cadence: string;
          next_due_at: Date;
        }>(
          "SELECT text, cadence, next_due_at FROM watch_items WHERE workspace_id = $1 ORDER BY next_due_at",
          [ctx.workspaceId]
        );
        return rows.length === 0
          ? "Watchlist is empty."
          : rows
              .map(
                (r) =>
                  `- ${r.text} (${r.cadence}, next due ${r.next_due_at.toISOString().slice(0, 10)})`
              )
              .join("\n");
      }
      case "add": {
        if (!args.text) return JSON.stringify({ error: "text is required for add" });
        const { rows } = await pool.query<{ n: string }>(
          "SELECT COUNT(*)::text AS n FROM watch_items WHERE workspace_id = $1",
          [ctx.workspaceId]
        );
        if (Number(rows[0].n) >= MAX_WATCH_ITEMS) {
          return JSON.stringify({
            error: `watchlist is full (${MAX_WATCH_ITEMS}) — remove or complete stale items first`,
          });
        }
        await pool.query(
          `INSERT INTO watch_items (workspace_id, text, cadence, next_due_at, created_by)
           VALUES ($1, $2, $3, $4, 'agent')`,
          [
            ctx.workspaceId,
            args.text,
            args.cadence ?? "weekly",
            args.first_due ? `${args.first_due}T08:00:00Z` : new Date().toISOString(),
          ]
        );
        return JSON.stringify({ added: args.text });
      }
      case "complete": {
        if (!args.text) return JSON.stringify({ error: "text is required for complete" });
        const { rows } = await pool.query<{ id: string; cadence: string }>(
          `SELECT id, cadence FROM watch_items
            WHERE workspace_id = $1 AND text ILIKE '%' || $2 || '%' LIMIT 1`,
          [ctx.workspaceId, args.text]
        );
        if (rows.length === 0) return JSON.stringify({ error: "no matching watch item" });
        if (rows[0].cadence === "once") {
          await pool.query("DELETE FROM watch_items WHERE id = $1", [rows[0].id]);
          return JSON.stringify({ completed_and_removed: true });
        }
        const interval =
          rows[0].cadence === "daily" ? "1 day" : rows[0].cadence === "weekly" ? "7 days" : "1 month";
        await pool.query(
          `UPDATE watch_items SET next_due_at = NOW() + $2::interval WHERE id = $1`,
          [rows[0].id, interval]
        );
        return JSON.stringify({ completed: true, rescheduled: rows[0].cadence });
      }
      case "remove": {
        if (!args.text) return JSON.stringify({ error: "text is required for remove" });
        const { rowCount } = await pool.query(
          `DELETE FROM watch_items
            WHERE id IN (SELECT id FROM watch_items
                          WHERE workspace_id = $1 AND text ILIKE '%' || $2 || '%' LIMIT 1)`,
          [ctx.workspaceId, args.text]
        );
        return JSON.stringify(
          (rowCount ?? 0) > 0 ? { removed: true } : { error: "no matching watch item" }
        );
      }
    }
  },
});
