import type { ParsedDocument } from "./types.js";
import {
  assertWithinByteLimit,
  clampDocumentText,
} from "./limits.js";

export async function parseTxt(buf: Buffer): Promise<ParsedDocument> {
  assertWithinByteLimit(buf, "txt");
  // Strip a UTF-8 BOM if present; otherwise it ends up as a junk char in the
  // first word of the prompt.
  const text = buf.toString("utf8").replace(/^\uFEFF/, "").trim();
  if (!text) {
    throw new Error("Text file is empty.");
  }
  return { type: "document", text: clampDocumentText(text) };
}
