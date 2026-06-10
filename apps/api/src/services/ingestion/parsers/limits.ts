// Shared bounds for document parsers (pdf/docx/eml/txt). Mirrors the
// spreadsheet-bomb mitigations in xlsx.ts: cap input bytes before handing the
// buffer to a third-party parser, and cap extracted text so one pathological
// file can't balloon worker memory or the LLM prompt. The planner only sends
// the first 50K chars to the LLM, so these caps lose nothing in practice.
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_DOCUMENT_CHARS = 500_000;

export function assertWithinByteLimit(buf: Buffer, kind: string): void {
  if (buf.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error(
      `${kind} too large: ${buf.byteLength} bytes (max ${MAX_DOCUMENT_BYTES})`
    );
  }
}

export function clampDocumentText(text: string): string {
  if (text.length <= MAX_DOCUMENT_CHARS) return text;
  return (
    text.slice(0, MAX_DOCUMENT_CHARS) +
    `\n\n[... truncated: ${text.length - MAX_DOCUMENT_CHARS} more characters]`
  );
}
