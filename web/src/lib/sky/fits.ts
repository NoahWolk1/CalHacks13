// Minimal FITS reader for light-curve files (TESS SPOC, TESS-SPOC and QLP HLSPs): header cards and
// binary-table columns, big-endian, no dependency. Only what light curves use: scalar numeric
// columns (L/B/I/J/K/E/D, with TSCAL/TZERO) plus the first element of vector columns; readVector
// reads a whole vector column (the pixel images of a TESScut cutout).

const BLOCK = 2880;
const CARD = 80;

export type FitsHeader = Record<string, string | number | boolean>;
export type FitsHdu = { header: FitsHeader; dataStart: number; dataBytes: number };
export type FitsTable = { header: FitsHeader; rows: number; columns: Record<string, Float64Array> };

/** One header card's value: quoted string, logical, or number (FITS "D" exponents included). */
function cardValue(raw: string): string | number | boolean {
  const v = raw.trim();
  if (v.startsWith("'")) {
    const end = v.indexOf("'", 1);
    // '' inside a string is an escaped quote; light-curve headers don't use it, so keep it simple.
    return v.slice(1, end < 0 ? undefined : end).trimEnd();
  }
  const s = v.split("/")[0].trim();
  if (s === "T") return true;
  if (s === "F") return false;
  const n = Number(s.replace(/D/i, "E"));
  return Number.isFinite(n) ? n : s;
}

/** Walks the HDUs of a FITS file (headers parsed, data located but not read). */
export function readHdus(buf: ArrayBuffer): FitsHdu[] {
  const bytes = new Uint8Array(buf);
  if (String.fromCharCode(...bytes.subarray(0, 6)) !== "SIMPLE") throw new Error("not a FITS file");
  const out: FitsHdu[] = [];
  let off = 0;
  while (off + BLOCK <= bytes.length) {
    const header: FitsHeader = {};
    let ended = false;
    while (!ended) {
      if (off + BLOCK > bytes.length) throw new Error("truncated FITS header");
      for (let i = 0; i < BLOCK; i += CARD) {
        const card = String.fromCharCode(...bytes.subarray(off + i, off + i + CARD));
        const key = card.slice(0, 8).trim();
        if (key === "END") { ended = true; break; }
        if (key && card[8] === "=") header[key] = cardValue(card.slice(10));
      }
      off += BLOCK;
    }
    const naxis = Number(header.NAXIS ?? 0);
    let elems = naxis ? 1 : 0;
    for (let k = 1; k <= naxis; k++) elems *= Number(header[`NAXIS${k}`] ?? 0);
    const dataBytes = (Math.abs(Number(header.BITPIX ?? 8)) / 8) * Number(header.GCOUNT ?? 1) * (elems + Number(header.PCOUNT ?? 0));
    out.push({ header, dataStart: off, dataBytes });
    off += Math.ceil(dataBytes / BLOCK) * BLOCK;
  }
  return out;
}

const SIZE: Record<string, number> = { L: 1, B: 1, I: 2, J: 4, K: 8, E: 4, D: 8, A: 1 };

/** Reads the named numeric columns of a binary-table HDU (missing columns are left out). */
export function readTable(buf: ArrayBuffer, hdu: FitsHdu, names: string[]): FitsTable {
  const h = hdu.header;
  if (h.XTENSION !== "BINTABLE") throw new Error("HDU is not a binary table");
  const rowBytes = Number(h.NAXIS1), rows = Number(h.NAXIS2), nf = Number(h.TFIELDS);
  if (hdu.dataStart + rowBytes * rows > buf.byteLength) throw new Error("truncated FITS table");
  // Column byte offsets from TFORMn (repeat count + type code); X (bits) rounds up to bytes.
  const cols: { name: string; type: string; offset: number; scale: number; zero: number }[] = [];
  let offset = 0;
  for (let i = 1; i <= nf; i++) {
    const m = String(h[`TFORM${i}`] ?? "").trim().match(/^(\d*)([LXBIJKAEDCMPQ])/);
    if (!m) throw new Error(`unsupported TFORM${i}: ${h[`TFORM${i}`]}`);
    const rep = m[1] ? Number(m[1]) : 1, type = m[2];
    const width = type === "X" ? Math.ceil(rep / 8) : type === "C" ? 8 * rep : type === "M" ? 16 * rep : type === "P" ? 8 * rep : type === "Q" ? 16 * rep : SIZE[type] * rep;
    const name = String(h[`TTYPE${i}`] ?? "").trim();
    if (names.includes(name) && rep > 0 && type in SIZE && type !== "A") cols.push({ name, type, offset, scale: Number(h[`TSCAL${i}`] ?? 1), zero: Number(h[`TZERO${i}`] ?? 0) });
    offset += width;
  }
  const view = new DataView(buf, hdu.dataStart, rowBytes * rows);
  const columns: Record<string, Float64Array> = {};
  for (const c of cols) {
    const a = new Float64Array(rows);
    for (let r = 0; r < rows; r++) {
      const p = r * rowBytes + c.offset;
      let v: number;
      switch (c.type) {
        case "D": v = view.getFloat64(p); break;
        case "E": v = view.getFloat32(p); break;
        case "J": v = view.getInt32(p); break;
        case "I": v = view.getInt16(p); break;
        case "K": v = Number(view.getBigInt64(p)); break;
        case "B": v = view.getUint8(p); break;
        default: v = view.getUint8(p) === 84 ? 1 : 0; // L: 'T'
      }
      a[r] = c.scale === 1 && c.zero === 0 ? v : v * c.scale + c.zero;
    }
    columns[c.name] = a;
  }
  return { header: h, rows, columns };
}

/** A whole vector column (e.g. FLUX "121E" with TDIM (11, 11)), row-major: value r * repeat + k. */
export function readVector(buf: ArrayBuffer, hdu: FitsHdu, name: string): { repeat: number; rows: number; dims: number[]; data: Float32Array } {
  const h = hdu.header;
  if (h.XTENSION !== "BINTABLE") throw new Error("HDU is not a binary table");
  const rowBytes = Number(h.NAXIS1), rows = Number(h.NAXIS2), nf = Number(h.TFIELDS);
  if (hdu.dataStart + rowBytes * rows > buf.byteLength) throw new Error("truncated FITS table");
  let offset = 0;
  for (let i = 1; i <= nf; i++) {
    const m = String(h[`TFORM${i}`] ?? "").trim().match(/^(\d*)([LXBIJKAEDCMPQ])/);
    if (!m) throw new Error(`unsupported TFORM${i}: ${h[`TFORM${i}`]}`);
    const rep = m[1] ? Number(m[1]) : 1, type = m[2];
    const width = type === "X" ? Math.ceil(rep / 8) : type === "C" ? 8 * rep : type === "M" ? 16 * rep : type === "P" ? 8 * rep : type === "Q" ? 16 * rep : SIZE[type] * rep;
    if (String(h[`TTYPE${i}`] ?? "").trim() === name) {
      if (type !== "E" && type !== "D" && type !== "J" && type !== "I") throw new Error(`column ${name} is not numeric`);
      const dims = String(h[`TDIM${i}`] ?? `(${rep})`).replace(/[()\s]/g, "").split(",").map(Number);
      const view = new DataView(buf, hdu.dataStart, rowBytes * rows), data = new Float32Array(rows * rep), size = SIZE[type];
      for (let r = 0; r < rows; r++) for (let k = 0; k < rep; k++) {
        const p = r * rowBytes + offset + k * size;
        data[r * rep + k] = type === "E" ? view.getFloat32(p) : type === "D" ? view.getFloat64(p) : type === "J" ? view.getInt32(p) : view.getInt16(p);
      }
      return { repeat: rep, rows, dims, data };
    }
    offset += width;
  }
  throw new Error(`no column ${name}`);
}
