import { PDFParse } from "pdf-parse";
import type { ParsedDocument } from "./types.js";
import {
  assertWithinByteLimit,
  clampDocumentText,
} from "./limits.js";

// Page cap: a 200-page business document already far exceeds the planner's
// 50K-char prompt budget, and pdf.js renders pages eagerly — bounding pages
// bounds CPU on a crafted many-page file.
const MAX_PAGES = 200;

export async function parsePdf(buf: Buffer): Promise<ParsedDocument> {
  assertWithinByteLimit(buf, "pdf");
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText({ first: MAX_PAGES });
    // Build from per-page text, not result.text: the combined text decorates
    // every page with a "-- N of M --" separator, so it's non-empty even for
    // an image-only PDF and would defeat the scanned-document check below.
    const pages = result.pages
      .map((p) => ({ num: p.num, text: p.text.trim() }))
      .filter((p) => p.text);
    if (pages.length === 0) {
      throw new Error(
        "PDF contains no extractable text — it may be a scanned document. OCR is not supported yet."
      );
    }
    const text =
      result.total > 1
        ? pages.map((p) => `[Page ${p.num}]\n${p.text}`).join("\n\n")
        : pages[0].text;
    return { type: "document", text: clampDocumentText(text) };
  } finally {
    await parser.destroy().catch(() => {});
  }
}
