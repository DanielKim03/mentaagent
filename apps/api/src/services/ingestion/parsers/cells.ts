// Shared spreadsheet-cell normalization for the xlsx + csv parsers.
//
// With SheetJS `cellDates: true`, date-typed cells arrive as JS Date objects
// instead of raw Excel serial numbers (e.g. 46123). We render those as ISO so
// the agent reads real calendar dates — never burning iterations decoding
// serials by hand — while numbers stay numeric for aggregate_table.

// Local-component formatting: SheetJS hands back a Date at local-midnight for a
// date-only cell, so getFullYear/Month/Date give the correct calendar day
// (round-trip verified not off-by-one). Adds HH:MM only when a time is present.
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return d.getHours() || d.getMinutes() || d.getSeconds()
    ? `${ymd} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    : ymd;
}

export function normalizeCell(
  v: string | number | Date | null
): string | number | null {
  return v instanceof Date ? isoDate(v) : v;
}
