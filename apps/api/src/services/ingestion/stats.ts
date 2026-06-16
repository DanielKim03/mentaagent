import type { ParsedSpreadsheet } from "./parsers/types.js";

// Deterministic per-column statistics computed at INGEST time (no LLM), stored
// on documents.metadata, and surfaced via the get_data_overview tool. This
// shifts the common "what's my total / top customer / date range" work off the
// query-time agent loop: the answer is precomputed once when the file lands.

export type ColumnStat = {
  name: string;
  kind: "number" | "date" | "text";
  count: number; // non-empty values
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  earliest?: string;
  latest?: string;
  distinct?: number;
  top?: { value: string; count: number }[];
};

export type SpreadsheetStats = {
  sheets: { name: string; rows: number; columns: ColumnStat[] }[];
};

const MAX_COLS = 64;
const MAX_DISTINCT_TRACKED = 10_000; // bound memory on high-cardinality columns
const DATE_RE = /^\d{4}-\d{2}-\d{2}/; // ISO date (parsers normalize dates to this)

function toNum(v: string | number | null): number | null {
  if (v === null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computeSpreadsheetStats(
  parsed: ParsedSpreadsheet
): SpreadsheetStats {
  return {
    sheets: parsed.sheets.map((sheet) => {
      const columns = sheet.columns.slice(0, MAX_COLS).map((name, idx): ColumnStat => {
        let count = 0;
        let numCount = 0;
        let dateCount = 0;
        let sum = 0;
        let nMin = Infinity;
        let nMax = -Infinity;
        let dMin: string | null = null;
        let dMax: string | null = null;
        const freq = new Map<string, number>();
        let trackText = true;

        for (const row of sheet.rows) {
          const v = row[idx];
          if (v === null || v === undefined || v === "") continue;
          count++;
          if (typeof v === "string" && DATE_RE.test(v)) {
            dateCount++;
            if (dMin === null || v < dMin) dMin = v;
            if (dMax === null || v > dMax) dMax = v;
          } else {
            const num = toNum(v);
            if (num !== null) {
              numCount++;
              sum += num;
              if (num < nMin) nMin = num;
              if (num > nMax) nMax = num;
            }
          }
          if (trackText) {
            const key = String(v).slice(0, 80);
            freq.set(key, (freq.get(key) ?? 0) + 1);
            if (freq.size > MAX_DISTINCT_TRACKED) trackText = false;
          }
        }

        if (count === 0) return { name, kind: "text", count: 0 };
        if (dateCount >= count * 0.8) {
          return {
            name,
            kind: "date",
            count,
            earliest: dMin ?? undefined,
            latest: dMax ?? undefined,
          };
        }
        if (numCount >= count * 0.8) {
          return {
            name,
            kind: "number",
            count,
            sum: round(sum),
            avg: round(sum / numCount),
            min: round(nMin),
            max: round(nMax),
          };
        }
        return {
          name,
          kind: "text",
          count,
          distinct: freq.size,
          top: trackText
            ? [...freq.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([value, c]) => ({ value, count: c }))
            : undefined,
        };
      });
      return { name: sheet.name, rows: sheet.rows.length, columns };
    }),
  };
}
