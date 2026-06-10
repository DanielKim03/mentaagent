import { z } from "zod";
import { pool } from "../../../db/client.js";
import { parseSource } from "../../ingestion/parse.js";
import { registerTool } from "../registry.js";

// Deterministic spreadsheet aggregation — sums/averages/counts computed in
// code over the ACTUAL parsed rows, because LLMs get column math wrong. The
// source file is re-parsed on demand (SheetJS is fast; rows aren't persisted
// to keep documents lean).

const OPS = ["sum", "avg", "count", "min", "max"] as const;

registerTool({
  name: "aggregate_table",
  description:
    "Compute an exact aggregate (sum/avg/count/min/max) over a column of an uploaded spreadsheet, optionally grouped by another column. Use this instead of adding numbers yourself. Column names must match the sheet header exactly (case-insensitive).",
  parameters: z.object({
    document_id: z.string().uuid(),
    sheet: z.string().optional().describe("Sheet name (defaults to the first sheet)"),
    op: z.enum(OPS),
    column: z.string().min(1).describe("Numeric column to aggregate"),
    group_by: z.string().optional().describe("Column to group results by"),
  }),
  execute: async (args, ctx) => {
    const { rows } = await pool.query<{
      source_id: string | null;
      file_type: string;
      file_path: string;
      title: string;
    }>(
      `SELECT d.source_id, s.file_type, s.file_path, d.title
         FROM documents d LEFT JOIN sources s ON s.id = d.source_id
        WHERE d.id = $1 AND d.workspace_id = $2`,
      [args.document_id, ctx.workspaceId]
    );
    if (rows.length === 0) {
      return JSON.stringify({ error: "document not found" });
    }
    if (!rows[0].source_id) {
      return JSON.stringify({
        error: "this document is not an uploaded spreadsheet — aggregate_table only works on uploaded CSV/XLSX files",
      });
    }
    const parsed = await parseSource(
      ctx.workspaceId,
      rows[0].file_type,
      rows[0].file_path
    );
    if (parsed.type !== "spreadsheet") {
      return JSON.stringify({ error: `${rows[0].title} is not a spreadsheet` });
    }

    const sheet = args.sheet
      ? parsed.sheets.find((s) => s.name.toLowerCase() === args.sheet!.toLowerCase())
      : parsed.sheets[0];
    if (!sheet) {
      return JSON.stringify({
        error: `sheet not found; available: ${parsed.sheets.map((s) => s.name).join(", ")}`,
      });
    }

    const colIdx = sheet.columns.findIndex(
      (c) => c.toLowerCase() === args.column.toLowerCase()
    );
    if (colIdx === -1) {
      return JSON.stringify({
        error: `column "${args.column}" not found; available: ${sheet.columns.join(", ")}`,
      });
    }
    let groupIdx = -1;
    if (args.group_by) {
      groupIdx = sheet.columns.findIndex(
        (c) => c.toLowerCase() === args.group_by!.toLowerCase()
      );
      if (groupIdx === -1) {
        return JSON.stringify({
          error: `group_by column "${args.group_by}" not found; available: ${sheet.columns.join(", ")}`,
        });
      }
    }

    const toNumber = (v: string | number | null): number | null => {
      if (v === null) return null;
      if (typeof v === "number") return v;
      const n = Number(String(v).replace(/[$,%\s]/g, ""));
      return Number.isFinite(n) ? n : null;
    };

    const aggregate = (values: number[]): number | null => {
      if (args.op === "count") return values.length;
      if (values.length === 0) return null;
      switch (args.op) {
        case "sum":
          return values.reduce((a, b) => a + b, 0);
        case "avg":
          return values.reduce((a, b) => a + b, 0) / values.length;
        case "min":
          return Math.min(...values);
        case "max":
          return Math.max(...values);
      }
    };

    if (groupIdx === -1) {
      const values = sheet.rows
        .map((r) => toNumber(r[colIdx]))
        .filter((n): n is number => n !== null);
      return JSON.stringify({
        document: rows[0].title,
        sheet: sheet.name,
        op: args.op,
        column: sheet.columns[colIdx],
        rows_considered: sheet.rows.length,
        numeric_rows: values.length,
        result: aggregate(values),
      });
    }

    const groups = new Map<string, number[]>();
    for (const row of sheet.rows) {
      const key = String(row[groupIdx] ?? "(blank)");
      const n = toNumber(row[colIdx]);
      const list = groups.get(key) ?? [];
      if (n !== null || args.op === "count") list.push(n ?? 0);
      groups.set(key, list);
    }
    const results = [...groups.entries()]
      .map(([key, values]) => ({ [args.group_by!]: key, [args.op]: aggregate(values) }))
      .sort((a, b) => Number(b[args.op] ?? 0) - Number(a[args.op] ?? 0))
      .slice(0, 50);
    return JSON.stringify({
      document: rows[0].title,
      sheet: sheet.name,
      op: args.op,
      column: sheet.columns[colIdx],
      group_by: args.group_by,
      groups: results,
    });
  },
});
