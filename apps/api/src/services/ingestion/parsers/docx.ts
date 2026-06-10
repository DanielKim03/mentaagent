import mammoth from "mammoth";
import type { ParsedDocument } from "./types.js";
import {
  assertWithinByteLimit,
  clampDocumentText,
} from "./limits.js";

export async function parseDocx(buf: Buffer): Promise<ParsedDocument> {
  assertWithinByteLimit(buf, "docx");
  const result = await mammoth.extractRawText({ buffer: buf });
  const text = result.value.trim();
  if (!text) {
    throw new Error(
      "Document contains no extractable text — it may be empty or image-only."
    );
  }
  return { type: "document", text: clampDocumentText(text) };
}
