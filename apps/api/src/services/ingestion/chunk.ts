// Table-aware chunking. ~1,500 chars per chunk with 200-char overlap for
// prose; spreadsheet text chunks on row boundaries (never splits a row) and
// repeats the header in every chunk so each chunk is self-describing for
// retrieval.

export type Chunk = {
  seq: number;
  content: string;
  charStart: number;
  charEnd: number;
};

const TARGET_CHARS = 1500;
const OVERLAP_CHARS = 200;

export function chunkText(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  if (!text.trim()) return chunks;
  let pos = 0;
  let seq = 0;
  while (pos < text.length) {
    let end = Math.min(pos + TARGET_CHARS, text.length);
    if (end < text.length) {
      // Prefer breaking at a paragraph, then a sentence, then a space.
      const window = text.slice(pos, end);
      const para = window.lastIndexOf("\n\n");
      const sentence = window.lastIndexOf(". ");
      const space = window.lastIndexOf(" ");
      const cut =
        para > TARGET_CHARS / 2 ? para : sentence > TARGET_CHARS / 2 ? sentence + 1 : space;
      if (cut > TARGET_CHARS / 2) end = pos + cut;
    }
    chunks.push({
      seq: seq++,
      content: text.slice(pos, end).trim(),
      charStart: pos,
      charEnd: end,
    });
    if (end >= text.length) break;
    pos = Math.max(end - OVERLAP_CHARS, pos + 1);
  }
  return chunks.filter((c) => c.content.length > 0);
}

// Render one sheet to pipe-delimited lines and chunk on row boundaries.
export function chunkSheet(
  sheetName: string,
  columns: string[],
  rows: (string | number | null)[][]
): Chunk[] {
  const header = `Sheet: ${sheetName}\n${columns.join(" | ")}`;
  const chunks: Chunk[] = [];
  let lines: string[] = [];
  let size = header.length;
  let seq = 0;

  const flush = () => {
    if (lines.length === 0) return;
    chunks.push({
      seq: seq++,
      content: `${header}\n${lines.join("\n")}`,
      charStart: 0,
      charEnd: 0,
    });
    lines = [];
    size = header.length;
  };

  for (const row of rows) {
    const line = row.map((c) => (c === null ? "" : String(c))).join(" | ");
    if (size + line.length > TARGET_CHARS && lines.length > 0) flush();
    lines.push(line);
    size += line.length + 1;
  }
  flush();
  return chunks;
}
