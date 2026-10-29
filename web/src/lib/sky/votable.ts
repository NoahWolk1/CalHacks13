// Minimal VOTable BINARY reader, for TAP services that only answer in VOTable (HEASARC's Xamin TAP has
// no JSON/CSV). BINARY serialization: each row is its fields in order, big-endian; variable-length
// arrays (arraysize="*") start with a 4-byte length. No null flags (that's BINARY2, handled too).

type Field = { name: string; datatype: string; arraysize?: string };
const SIZE: Record<string, number> = { boolean: 1, bit: 1, unsignedByte: 1, short: 2, int: 4, long: 8, char: 1, unicodeChar: 2, float: 4, double: 8 };

export function parseVotable(xml: string): Record<string, unknown>[] {
  const status = /<INFO[^>]*name="QUERY_STATUS"[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/INFO>/.exec(xml);
  if (status && status[1] !== "OK") throw new Error(`TAP error: ${status[2].replace(/\s+/g, " ").trim().slice(0, 120)}`);
  const fields: Field[] = [...xml.matchAll(/<FIELD\b([^>]*)>/g)].map((m) => {
    const attr = (k: string) => new RegExp(`\\b${k}="([^"]*)"`).exec(m[1])?.[1];
    return { name: attr("name") ?? "", datatype: attr("datatype") ?? "char", arraysize: attr("arraysize") };
  });
  if (/<TABLEDATA>/.test(xml)) {
    return [...xml.matchAll(/<TR>([\s\S]*?)<\/TR>/g)].map((tr) => {
      const cells = [...tr[1].matchAll(/<TD\s*\/>|<TD>([\s\S]*?)<\/TD>/g)].map((c) => c[1] ?? "");
      return Object.fromEntries(fields.map((f, i) => [f.name, cell(f, unescape(cells[i] ?? ""))]));
    });
  }
  const b64 = /<STREAM[^>]*>([\s\S]*?)<\/STREAM>/.exec(xml)?.[1];
  if (!b64) return [];
  const two = /<BINARY2>/.test(xml);
  const buf = Buffer.from(b64.replace(/\s+/g, ""), "base64");
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const rows: Record<string, unknown>[] = [];
  let o = 0;
  while (o < buf.length) {
    let nulls: number[] = [];
    if (two) { const n = Math.ceil(fields.length / 8); nulls = [...buf.subarray(o, o + n)]; o += n; }
    const row: Record<string, unknown> = {};
    fields.forEach((f, i) => {
      const size = SIZE[f.datatype] ?? 1;
      let count = 1;
      if (f.arraysize) { if (f.arraysize.endsWith("*")) { count = view.getUint32(o); o += 4; } else count = f.arraysize.split("x").reduce((a, x) => a * (parseInt(x) || 1), 1); }
      const isNull = two && (nulls[i >> 3] & (0x80 >> (i & 7))) !== 0;
      let v: unknown;
      if (f.datatype === "char") v = buf.subarray(o, o + count).toString("latin1").replace(/\0[\s\S]*$/, "").trim();
      else if (count === 1) v = read(view, o, f.datatype);
      else v = Array.from({ length: count }, (_, k) => read(view, o + k * size, f.datatype));
      o += size * count;
      row[f.name] = isNull ? null : v;
    });
    rows.push(row);
  }
  return rows;
}

function read(v: DataView, o: number, type: string): number | boolean | null {
  switch (type) {
    case "double": { const x = v.getFloat64(o); return Number.isNaN(x) ? null : x; }
    case "float": { const x = v.getFloat32(o); return Number.isNaN(x) ? null : x; }
    case "long": return Number(v.getBigInt64(o));
    case "int": return v.getInt32(o);
    case "short": return v.getInt16(o);
    case "unsignedByte": return v.getUint8(o);
    case "boolean": return /[Tt1]/.test(String.fromCharCode(v.getUint8(o)));
    default: return v.getUint8(o);
  }
}

const unescape = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const cell = (f: Field, s: string): unknown => {
  if (f.datatype === "char" || f.datatype === "unicodeChar") return s;
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : s;
};
