import { readSourceFile } from "../../lib/storage.js";
import { parseCsv } from "./parsers/csv.js";
import { parseDocx } from "./parsers/docx.js";
import { parseEml } from "./parsers/eml.js";
import { parseImage } from "./parsers/image.js";
import { parsePdf } from "./parsers/pdf.js";
import { parseTxt } from "./parsers/txt.js";
import { parseXlsx } from "./parsers/xlsx.js";
import type { ParsedSource } from "./parsers/types.js";

// MIME type for an image file_type (extension without the dot). Needed for the
// data: URL handed to the vision model.
export function imageMime(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export async function parseSource(
  workspaceId: string,
  fileType: string,
  filePath: string
): Promise<ParsedSource> {
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
    case "jpg":
    case "jpeg":
    case "png":
    case "webp":
      return parseImage(workspaceId, buf, imageMime(fileType));
    default:
      throw new Error(`unsupported file_type: ${fileType}`);
  }
}
