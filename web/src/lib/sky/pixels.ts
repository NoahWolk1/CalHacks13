// Pixel-level vetting (vetReport.ts, Stage 3): TESScut cutouts of the TESS full-frame images around
// the star, and the difference-image test that light curves can't do. For each transit, the mean
// image just outside the transit minus the mean image inside it shows where the light went missing.
// Every star that could make the dip is then tried as the source: a model of that star's PSF is
// fitted to the difference image, and stars whose model fits clearly worse than the best one are
// ruled out. A free fit of one PSF gives the source position and its offset from the target, with
// an error from bootstrapping the transits. (Bryson et al. 2013 do this with the Kepler PRF; a
// Gaussian integrated over each pixel stands in for TESS's PRF here, fitted to the star itself.)
import { inflateRawSync } from "node:zlib";
import { readHdus, readTable, readVector } from "./fits";

export const TESSCUT = "https://mast.stsci.edu/tesscut/api/v0.1/astrocut";
export const CUTOUT_PX = 11;
export const ARCSEC_PER_PX = 21;

export type Wcs = { crval1: number; crval2: number; crpix1: number; crpix2: number; cd: [number, number, number, number] };
export type Cutout = { sector: number; camera?: number; ccd?: number; nx: number; ny: number; t: Float64Array; quality: Float64Array; flux: Float32Array; wcs: Wcs };
/** A star that could be the source: pixel position in one cutout, and its brightness relative to the target. */
export type PixStar = { id: string; label: string; ra: number; dec: number; tmag: number };

const D2R = Math.PI / 180;

// ── fetching ────────────────────────────────────────────────────────────────

/** The first FITS file in a zip (TESScut returns one per request), stored or deflated. */
export function unzipFirst(buf: ArrayBuffer): ArrayBuffer {
  const v = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not a zip file");
  let p = v.getUint32(eocd + 16, true);
  const n = v.getUint16(eocd + 10, true);
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("bad zip directory");
    const method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), comment = v.getUint16(p + 32, true), local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (!name.endsWith(".fits")) continue;
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = u8.subarray(start, start + size);
    if (method === 0) return data.slice().buffer;
    if (method === 8) { const out = inflateRawSync(data); return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer; }
    throw new Error(`zip compression method ${method} not supported`);
  }
  throw new Error("no FITS file in the zip");
}

export function parseCutout(buf: ArrayBuffer): Cutout {
  const hdus = readHdus(buf);
  const pix = hdus.find((h) => h.header.EXTNAME === "PIXELS") ?? hdus[1], ap = hdus.find((h) => h.header.EXTNAME === "APERTURE") ?? hdus[2];
  if (!pix || !ap) throw new Error("cutout lacks PIXELS/APERTURE extensions");
  const tab = readTable(buf, pix, ["TIME", "QUALITY"]);
  const flux = readVector(buf, pix, "FLUX");
  const h = ap.header, n = (k: string, d = 0) => (typeof h[k] === "number" ? (h[k] as number) : d);
  const c1 = n("CDELT1", 1), c2 = n("CDELT2", 1);
  const cd: Wcs["cd"] = h.CD1_1 !== undefined ? [n("CD1_1"), n("CD1_2"), n("CD2_1"), n("CD2_2")] : [n("PC1_1", 1) * c1, n("PC1_2") * c1, n("PC2_1") * c2, n("PC2_2", 1) * c2];
  if (!tab.columns.TIME || !(n("CRVAL1") || n("CRVAL2"))) throw new Error("cutout lacks TIME or a WCS");
  const h0 = hdus[0].header;
  return {
    sector: Number(h0.SECTOR ?? pix.header.SECTOR), camera: Number(h0.CAMERA) || undefined, ccd: Number(h0.CCD) || undefined,
    nx: flux.dims[0], ny: flux.dims[1] ?? 1, t: tab.columns.TIME, quality: tab.columns.QUALITY ?? new Float64Array(tab.rows), flux: flux.data,
    wcs: { crval1: n("CRVAL1"), crval2: n("CRVAL2"), crpix1: n("CRPIX1"), crpix2: n("CRPIX2"), cd },
  };
}

/** One sector's 11x11 px cutout of the full-frame images (~25 MB, 10-30 s; not cached: too big). */
export async function fetchCutout(ra: number, dec: number, sector: number, signal: AbortSignal, timeoutMs = 60_000): Promise<Cutout> {
  const url = `${TESSCUT}?${new URLSearchParams({ ra: ra.toFixed(7), dec: dec.toFixed(7), y: String(CUTOUT_PX), x: String(CUTOUT_PX), sector: String(sector) })}`;
  const until = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(Math.max(5_000, until - Date.now()))]), headers: { "User-Agent": "Coordinate/0.1 (CalHacks 13 hackathon project)" } });
      if (!res.ok) throw Object.assign(new Error(`TESScut ${res.status} ${res.statusText}`), { final: res.status < 500 });
      return parseCutout(unzipFirst(await res.arrayBuffer()));
    } catch (e) {
      // Undici reports dropped connections as "fetch failed" with the reason in `cause`: retry those once.
      const err = e as Error & { cause?: { message?: string; code?: string }; final?: boolean };
      if (signal.aborted || err.final || attempt >= 1 || Date.now() > until - 10_000) throw new Error(`${err.message}${err.cause ? ` (${err.cause.code ?? err.cause.message})` : ""}`);
    }
  }
}

// ── geometry ────────────────────────────────────────────────────────────────

/** Sky → 0-based pixel (x = column, axis 1), gnomonic (TAN) projection. */
export function skyToPix(w: Wcs, ra: number, dec: number): { x: number; y: number } {
  const a = ra * D2R, d = dec * D2R, a0 = w.crval1 * D2R, d0 = w.crval2 * D2R;
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(a - a0);
  const xi = (Math.cos(d) * Math.sin(a - a0)) / cosc / D2R, eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(a - a0)) / cosc / D2R;
  const [c11, c12, c21, c22] = w.cd, det = c11 * c22 - c12 * c21;
  return { x: (c22 * xi - c12 * eta) / det + w.crpix1 - 1, y: (-c21 * xi + c11 * eta) / det + w.crpix2 - 1 };
}

/** A pixel offset as a sky offset in arcsec (east, north). */
export function pixToArcsec(w: Wcs, dx: number, dy: number): { e: number; n: number } {
  const [c11, c12, c21, c22] = w.cd;
  return { e: (c11 * dx + c12 * dy) * 3600, n: (c21 * dx + c22 * dy) * 3600 };
}

/** erf, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). */
export function erf(x: number) {
  const s = Math.sign(x), a = Math.abs(x), t = 1 / (1 + 0.3275911 * a);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a));
}

/** A Gaussian PSF integrated over each pixel of an nx x ny image (sums to ~1 when the star is well inside). */
export function psf(nx: number, ny: number, x0: number, y0: number, s: number): Float64Array {
  const k = Math.SQRT2 * s, px = new Float64Array(nx), py = new Float64Array(ny), out = new Float64Array(nx * ny);
  for (let i = 0; i < nx; i++) px[i] = 0.5 * (erf((i + 0.5 - x0) / k) - erf((i - 0.5 - x0) / k));
  for (let j = 0; j < ny; j++) py[j] = 0.5 * (erf((j + 0.5 - y0) / k) - erf((j - 0.5 - y0) / k));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out[j * nx + i] = px[i] * py[j];
  return out;
}

/** Least squares for y ≈ Σ a_k X_k (+ a constant if `bg`), weights w; returns the coefficients and χ². */
export function linearFit(cols: Float64Array[], y: Float64Array, w: Float64Array, bg: boolean): { a: number[]; chi2: number } {
  const X = bg ? [...cols, new Float64Array(y.length).fill(1)] : cols, m = X.length;
  const A = Array.from({ length: m }, () => new Float64Array(m)), b = new Float64Array(m);
  for (let p = 0; p < y.length; p++) {
    if (!(w[p] > 0)) continue;
    for (let i = 0; i < m; i++) { b[i] += w[p] * X[i][p] * y[p]; for (let j = i; j < m; j++) A[i][j] += w[p] * X[i][p] * X[j][p]; }
  }
  for (let i = 0; i < m; i++) for (let j = 0; j < i; j++) A[i][j] = A[j][i];
  // Gaussian elimination with partial pivoting (m is at most a few dozen).
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < m; c++) {
    let piv = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (!(Math.abs(M[c][c]) > 1e-30)) { M[c][c] = 1e-30; }
    for (let r = 0; r < m; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k]; }
  }
  const a = M.map((r, i) => r[m] / r[i]);
  let chi2 = 0;
  for (let p = 0; p < y.length; p++) {
    if (!(w[p] > 0)) continue;
    let mdl = 0;
    for (let i = 0; i < m; i++) mdl += a[i] * X[i][p];
    chi2 += w[p] * (y[p] - mdl) ** 2;
  }
  return { a, chi2 };
}

// ── the difference image ────────────────────────────────────────────────────

export type DiffImage = {
  sector: number; camera?: number; ccd?: number; nx: number; ny: number;
  /** Per pixel: out-of-transit minus in-transit flux (positive = light lost in transit), its error, and the out-of-transit image. */
  diff: Float64Array; err: Float64Array; oot: Float64Array;
  transits: number; wcs: Wcs;
  /** The per-transit difference images (for bootstrapping). */
  each: Float64Array[];
};

/** Mean difference image over the transits at `times` (BTJD) in this cutout: in transit is the
 *  central 70% of T14, out of transit a window of max(T14, 2.4 h) on each side, 0.25 T14 clear
 *  of the transit. Pixel errors from the scatter between transits (≥ 5), else from difference
 *  images at off-transit times. Null with fewer than 2 usable transits. */
export function differenceImage(c: Cutout, times: number[], T14: number, avoid: number[] = times): DiffImage | null {
  const np = c.nx * c.ny, half = T14 / 2, width = Math.max(T14, 0.1);
  const good = (i: number) => c.quality[i] === 0 && Number.isFinite(c.t[i]) && Number.isFinite(c.flux[i * np + (np >> 1)]);
  const one = (tc: number): Float64Array | null => {
    const inn = new Float64Array(np), out = new Float64Array(np);
    let ni = 0, no = 0;
    for (let i = 0; i < c.t.length; i++) {
      const dt = Math.abs(c.t[i] - tc);
      if (dt > half * 1.25 + width || !good(i)) continue;
      const tgt = dt < 0.35 * T14 ? inn : dt > half * 1.25 ? out : null;
      if (!tgt) continue;
      let ok = true;
      for (let p = 0; p < np; p++) if (!Number.isFinite(c.flux[i * np + p])) { ok = false; break; }
      if (!ok) continue;
      for (let p = 0; p < np; p++) tgt[p] += c.flux[i * np + p];
      if (tgt === inn) ni++; else no++;
    }
    if (ni < 2 || no < 4) return null;
    return Float64Array.from({ length: np }, (_, p) => out[p] / no - inn[p] / ni);
  };
  const inRange = (t: number) => t > c.t[0] && t < c.t[c.t.length - 1];
  const each = times.filter(inRange).flatMap((t) => { const d = one(t); return d ? [d] : []; });
  if (each.length < 2) return null;
  const mean = (ds: Float64Array[]) => Float64Array.from({ length: np }, (_, p) => ds.reduce((k, d) => k + d[p], 0) / ds.length);
  let diff: Float64Array, err: Float64Array;
  if (each.length >= 5) {
    // Per pixel, a mean and error over the transits after 4σ (MAD) clipping: scattered light and
    // momentum dumps make a few transits' differences huge, which would swamp both.
    diff = new Float64Array(np); err = new Float64Array(np);
    for (let p = 0; p < np; p++) {
      const v = each.map((d) => d[p]).sort((a, b) => a - b), m = v[v.length >> 1];
      const mad = 1.4826 * [...v].map((x) => Math.abs(x - m)).sort((a, b) => a - b)[v.length >> 1];
      const keep = mad > 0 ? v.filter((x) => Math.abs(x - m) < 4 * mad) : v;
      const mu = keep.reduce((a, b) => a + b, 0) / keep.length;
      diff[p] = mu;
      err[p] = Math.sqrt(keep.reduce((k, x) => k + (x - mu) ** 2, 0) / Math.max(1, keep.length - 1) / keep.length);
    }
  } else {
    diff = mean(each);
    // Null difference images at times well away from every transit, each a mean over as many epochs.
    const clear = (t: number) => avoid.every((x) => Math.abs(t - x) > T14 * 1.5 + width);
    const nulls: Float64Array[] = [];
    for (const k of [-6, -4.5, -3, 3, 4.5, 6, -8, 8, -10, 10]) {
      const ds = times.filter(inRange).map((t) => t + k * width).filter((t) => inRange(t) && clear(t)).flatMap((t) => { const d = one(t); return d ? [d] : []; });
      if (ds.length) nulls.push(mean(ds));
    }
    if (nulls.length < 3) return null;
    err = Float64Array.from({ length: np }, (_, p) => Math.sqrt(nulls.reduce((k, d) => k + d[p] ** 2, 0) / nulls.length));
  }
  const oot = new Float64Array(np);
  let n = 0;
  for (let i = 0; i < c.t.length; i++) {
    if (!good(i) || !avoid.every((x) => Math.abs(c.t[i] - x) > T14)) continue;
    let ok = true;
    for (let p = 0; p < np; p++) if (!Number.isFinite(c.flux[i * np + p])) { ok = false; break; }
    if (!ok) continue;
    for (let p = 0; p < np; p++) oot[p] += c.flux[i * np + p];
    n++;
  }
  for (let p = 0; p < np; p++) oot[p] /= Math.max(1, n);
  return { sector: c.sector, camera: c.camera, ccd: c.ccd, nx: c.nx, ny: c.ny, diff, err, oot, transits: each.length, wcs: c.wcs, each };
}

export type PsfModel = { s: number; dx: number; dy: number; chi2: number };

/** Fits the out-of-transit image with every listed star's PSF (positions from the catalog, one
 *  shared shift for the WCS's error, one shared width) plus a background: the PSF width and the
 *  catalog-to-pixel shift used for the difference image. */
export function fitScene(img: DiffImage, stars: { x: number; y: number }[]): PsfModel {
  const w = Float64Array.from(img.oot, (v) => (Number.isFinite(v) && v > 0 ? 1 / Math.max(v, 1) : 0));
  let best: PsfModel = { s: 0.8, dx: 0, dy: 0, chi2: Infinity };
  const tryAt = (s: number, dx: number, dy: number) => {
    const { chi2 } = linearFit(stars.map((st) => psf(img.nx, img.ny, st.x + dx, st.y + dy, s)), img.oot, w, true);
    if (chi2 < best.chi2) best = { s, dx, dy, chi2 };
  };
  for (const s of [0.5, 0.65, 0.8, 1, 1.25, 1.5]) for (let dx = -1; dx <= 1.001; dx += 0.25) for (let dy = -1; dy <= 1.001; dy += 0.25) tryAt(s, dx, dy);
  const b0 = best;
  for (const s of [b0.s * 0.9, b0.s, b0.s * 1.1]) for (let dx = b0.dx - 0.2; dx <= b0.dx + 0.201; dx += 0.05) for (let dy = b0.dy - 0.2; dy <= b0.dy + 0.201; dy += 0.05) tryAt(s, dx, dy);
  return best;
}

/** χ² of the difference image with one star's PSF as the only source (amplitude ≥ 0, plus a constant). */
export function sourceChi2(diff: Float64Array, err: Float64Array, nx: number, ny: number, x: number, y: number, s: number): { chi2: number; amp: number } {
  const w = Float64Array.from(err, (e) => (e > 0 && Number.isFinite(e) ? 1 / e ** 2 : 0));
  const f = linearFit([psf(nx, ny, x, y, s)], diff, w, true);
  if (f.a[0] >= 0) return { chi2: f.chi2, amp: f.a[0] };
  return { chi2: linearFit([], diff, w, true).chi2, amp: 0 };
}

/** Best single-PSF position for the difference image: coarse grid, then a fine one. */
export function locateSource(diff: Float64Array, err: Float64Array, nx: number, ny: number, s: number, around: { x: number; y: number }, reach = 3): { x: number; y: number; chi2: number } {
  let best = { x: around.x, y: around.y, chi2: Infinity };
  const scan = (cx: number, cy: number, r: number, step: number) => {
    const b = { ...best };
    for (let x = cx - r; x <= cx + r + 1e-9; x += step) for (let y = cy - r; y <= cy + r + 1e-9; y += step) {
      if (x < -0.5 || y < -0.5 || x > nx - 0.5 || y > ny - 0.5) continue;
      const c = sourceChi2(diff, err, nx, ny, x, y, s).chi2;
      if (c < b.chi2) Object.assign(b, { x, y, chi2: c });
    }
    best = b;
  };
  scan(around.x, around.y, reach, 0.25);
  scan(best.x, best.y, 0.3, 0.05);
  return best;
}

export type StarTest = { id: string; label: string; x: number; y: number; chi2: number; amp: number };
export type SectorPixels = {
  sector: number; transits: number;
  /** √(χ²(no source) − χ²(best star)): how clearly the difference image shows a source at all. */
  detection: number;
  stars: StarTest[];
  /** Free-position fit: offset from the target in arcsec (east, north), bootstrap error, and its χ². */
  offset?: { e: number; n: number; err: number };
  free?: number;
  /** Reduced χ² of the best fit (≥ 1): Δχ² are divided by it, since a Gaussian is only roughly TESS's PSF. */
  scale: number;
  scene: PsfModel;
  /** For display: the images (rounded) and positions. */
  image: { nx: number; ny: number; diff: number[]; oot: number[]; target: { x: number; y: number }; source?: { x: number; y: number }; stars: { x: number; y: number; label: string }[] };
};

/** One sector's pixel test: which of `stars` (the target first) can be the source. */
export function testSector(img: DiffImage, stars: PixStar[], rand: () => number = Math.random): SectorPixels {
  const pos = stars.map((s) => ({ ...s, ...skyToPix(img.wcs, s.ra, s.dec) }));
  const inside = pos.filter((s) => s.x > -1.5 && s.y > -1.5 && s.x < img.nx + 0.5 && s.y < img.ny + 0.5);
  const target = pos[0];
  // The scene: the target and stars within 4 mag of it shape the out-of-transit image.
  const scene = fitScene(img, inside.filter((s) => s === target || s.tmag < target.tmag + 4));
  const at = (s: { x: number; y: number }) => ({ x: s.x + scene.dx, y: s.y + scene.dy });
  const w = Float64Array.from(img.err, (e) => (e > 0 && Number.isFinite(e) ? 1 / e ** 2 : 0));
  const none = linearFit([], img.diff, w, true).chi2;
  const tests: StarTest[] = inside.map((s) => { const p = at(s); return { id: s.id, label: s.label, x: p.x, y: p.y, ...sourceChi2(img.diff, img.err, img.nx, img.ny, p.x, p.y, scene.s) }; });
  const bestChi = Math.min(...tests.map((t) => t.chi2));
  const detection = Math.sqrt(Math.max(0, none - bestChi));
  const t0 = at(target);
  let offset: SectorPixels["offset"], source: { x: number; y: number } | undefined, free: number | undefined;
  if (detection >= 3) {
    const loc = locateSource(img.diff, img.err, img.nx, img.ny, scene.s, t0);
    source = { x: loc.x, y: loc.y };
    free = loc.chi2;
    // Bootstrap the transits for the position's error.
    const xs: { e: number; n: number }[] = [];
    for (let b = 0; b < 24 && img.each.length >= 3; b++) {
      const pick = Array.from({ length: img.each.length }, () => img.each[Math.floor(rand() * img.each.length)]);
      const d = Float64Array.from({ length: img.diff.length }, (_, p) => pick.reduce((k, x) => k + x[p], 0) / pick.length);
      const l = locateSource(d, img.err, img.nx, img.ny, scene.s, { x: loc.x, y: loc.y }, 1.5);
      xs.push(pixToArcsec(img.wcs, l.x - t0.x, l.y - t0.y));
    }
    const o = pixToArcsec(img.wcs, loc.x - t0.x, loc.y - t0.y);
    const sd = xs.length >= 5 ? Math.sqrt(xs.reduce((k, x) => k + (x.e - o.e) ** 2 + (x.n - o.n) ** 2, 0) / xs.length / 2) : ARCSEC_PER_PX / Math.max(1, detection);
    offset = { e: o.e, n: o.n, err: Math.max(sd, 1) };
  }
  const round = (a: Float64Array) => Array.from(a, (v) => +v.toPrecision(4));
  return {
    sector: img.sector, transits: img.transits, detection, stars: tests, offset, free, scene,
    scale: Math.max(1, Math.min(bestChi, free ?? Infinity) / Math.max(1, img.diff.length - 4)),
    image: { nx: img.nx, ny: img.ny, diff: round(img.diff), oot: round(img.oot), target: t0, source, stars: inside.slice(1).filter((s) => s.tmag < target.tmag + 8).slice(0, 12).map((s) => ({ ...at(s), label: s.label })) },
  };
}

/** Combines sectors: per star, the χ² (divided by each sector's reduced χ²) summed over the
 *  sectors where a source shows; a star is ruled out when it fits worse than the best one by
 *  Δχ² > 9 (3σ for one parameter). `unlisted`: how much better a free position fits than the best
 *  listed star (Δχ², same scaling): large means the source is none of them. */
export function combineSectors(secs: SectorPixels[]) {
  const by = new Map<string, { id: string; label: string; chi2: number; n: number }>();
  let free = 0;
  for (const s of secs) {
    if (s.detection < 3) continue;
    for (const t of s.stars) { const x = by.get(t.id) ?? { id: t.id, label: t.label, chi2: 0, n: 0 }; x.chi2 += t.chi2 / s.scale; x.n++; by.set(t.id, x); }
    free += (s.free ?? Math.min(...s.stars.map((t) => t.chi2))) / s.scale;
  }
  const used = secs.filter((s) => s.detection >= 3).length;
  const all = [...by.values()].filter((x) => x.n === used);
  const best = all.reduce<(typeof all)[number] | null>((b, x) => (!b || x.chi2 < b.chi2 ? x : b), null);
  const offs = secs.flatMap((s) => (s.offset && s.detection >= 3 ? [s.offset] : []));
  const wsum = offs.reduce((k, o) => k + 1 / o.err ** 2, 0);
  const offset = offs.length ? { e: offs.reduce((k, o) => k + o.e / o.err ** 2, 0) / wsum, n: offs.reduce((k, o) => k + o.n / o.err ** 2, 0) / wsum, err: 1 / Math.sqrt(wsum) } : undefined;
  return { best, stars: all.map((x) => ({ ...x, dchi2: best ? x.chi2 - best.chi2 : 0 })).sort((a, b) => a.dchi2 - b.dchi2), sectors: used, offset, unlisted: best ? Math.max(0, best.chi2 - free) : 0 };
}
