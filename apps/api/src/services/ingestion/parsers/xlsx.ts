import * as XLSX from "xlsx";
import type { ParsedSheet, ParsedSpreadsheet } from "./types.js";

// Bounds against a malicious/accidental "spreadsheet bomb" (a small file that
// expands to millions of cells). `sheetRows` caps the parsed array so the
// sheet_to_json explosion never materializes, and we cap sheets/columns.
// NOTE: SheetJS still inflates each worksheet's XML in full before sheetRows
// clips it, so these are a strong mitigation but NOT a complete guard against a
// crafted decompression bomb — full protection needs a size-limited streaming
// unzip (tracked follow-up). The compressed-size ceiling below is the first
// line of defence; real business spreadsheets are comfortably under it.
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB compressed
const MAX_SHEETS = 50;
const MAX_ROWS_PER_SHEET = 5000;
const MAX_COLS = 256;

export async function parseXlsx(buf: Buffer): Promise<ParsedSpreadsheet> {
  if (buf.byteLength > MAX_BYTES) {
    throw new Error(
      `spreadsheet too large: ${buf.byteLength} bytes (max ${MAX_BYTES})`
    );
  }
  const wb = XLSX.read(buf, { type: "buffer", sheetRows: MAX_ROWS_PER_SHEET });
  const sheets: ParsedSheet[] = wb.SheetNames.slice(0, MAX_SHEETS).map((name) => {
    const ws = wb.Sheets[name];
    const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      blankrows: false,
      defval: null,
    });
    const [header = [], ...rest] = aoa;
    return {
      name,
      columns: header.slice(0, MAX_COLS).map((c) => String(c ?? "")),
      rows: rest.slice(0, MAX_ROWS_PER_SHEET).map((r) => r.slice(0, MAX_COLS)),
    };
  });
  return { type: "spreadsheet", sheets };
}
