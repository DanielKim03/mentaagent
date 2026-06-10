import * as XLSX from "xlsx";
import type { ParsedSpreadsheet } from "./types.js";

export async function parseCsv(buf: Buffer): Promise<ParsedSpreadsheet> {
  // Use SheetJS for csv too — it handles quoting, escapes, and BOM correctly.
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheetName = wb.SheetNames[0] ?? "default";
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });
  const [header = [], ...rest] = aoa;
  return {
    type: "spreadsheet",
    sheets: [
      {
        name: sheetName,
        columns: header.map((c) => String(c ?? "")),
        rows: rest,
      },
    ],
  };
}
