// Unified parsed-source shape. Every parser returns one of these so the
// downstream prompt builder doesn't need to know the source format.
export type ParsedSheet = {
  name: string;
  columns: string[];
  rows: (string | number | null)[][];
};

export type ParsedSpreadsheet = {
  type: "spreadsheet";
  sheets: ParsedSheet[];
};

export type ParsedDocument = {
  type: "document";
  text: string;
};

export type ParsedSource = ParsedSpreadsheet | ParsedDocument;
