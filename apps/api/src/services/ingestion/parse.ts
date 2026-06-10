import { readSourceFile } from "../../lib/storage.js";
import { parseCsv } from "./parsers/csv.js";
import { parseDocx } from "./parsers/docx.js";
import { parseEml } from "./parsers/eml.js";
import { parsePdf } from "./parsers/pdf.js";
import { parseTxt } from "./parsers/txt.js";
import { parseXlsx } from "./parsers/xlsx.js";
import type { ParsedSource } from "./parsers/types.js";

export async function parseSource(
  workspaceId: string,
  fileType: string,
  filePath: string
): Promise<ParsedSource> {
  // Fetch the bytes from wherever the upload was stored (S3/R2 in prod, local
  // disk in dev). This is the step that used to ENOENT when the Worker looked
  // for a file the API had saved to a different service's disk.
  const buf = await readSourceFile(workspaceId, filePath);
  switch (fileType.toLowerCase()) {
    case "csv":
      return parseCsv(buf);
    case "xlsx":
    case "xls":
      return parseXlsx(buf);
    case "pdf":
      return parsePdf(buf);
    case "docx":
      return parseDocx(buf);
    case "txt":
      return parseTxt(buf);
    case "eml":
      return parseEml(buf);
    default:
      throw new Error(`unsupported file_type: ${fileType}`);
  }
}
