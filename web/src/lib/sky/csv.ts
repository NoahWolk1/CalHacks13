// CSV for the archives that only speak it (ESASky TAP, ExoFOP downloads).

/** Minimal CSV (quoted fields, doubled quotes) → rows keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); cell = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.some((x) => x !== "")) rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  if (/<VOTABLE|QUERY_STATUS/.test(head.join(","))) throw new Error("TAP error (VOTable instead of CSV)");
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}
