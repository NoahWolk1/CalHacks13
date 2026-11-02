// Instrumental-artifact tests for transit-like dips: the checks a person runs before believing a lone
// dip in a pipeline light curve. Each asks whether the dip is in the star's light or was made on the
// way to the light curve: by detrending (is it in the raw SAP flux?), by a bad background estimate
// (does it follow the pipeline's background?), by the detector (is it in our own photometry of the
// pixels, with column-wise background removed?), or by engineering data that isn't science data.
// Written after four sweep "candidates" turned out to be: PDC detrending at momentum dumps, an offset
// down a CCD column beside a broken one, QLP background errors at a CCD edge, and Sector 3 attitude
// tests (candidates-2026-11/*/REPORT.md).
import { median } from "./timeseries";
import { linearFit, skyToPix, type Cutout } from "./pixels";
import { engineeringAt } from "./engineering";
export { ENGINEERING, ENGINEERING_FLAG, engineeringAt, maskEngineering } from "./engineering";

/** A local box depth and its error (red noise included). */
export type Depth = { depth: number; err: number; points: number };
export type LocalDepth = { plain: Depth; decorrelated?: Depth; corr?: number; k?: number };

/** Raw arrays → finite, unflagged points, flux normalised by its median (background on the same scale). */
export function rawPoints(time: ArrayLike<number>, flux: ArrayLike<number>, quality: ArrayLike<number>, bkg?: ArrayLike<number>) {
  const t: number[] = [], f: number[] = [], b: number[] = [];
  for (let i = 0; i < time.length; i++) {
    if (!Number.isFinite(time[i]) || !Number.isFinite(flux[i]) || quality[i] !== 0 || (bkg && !Number.isFinite(bkg[i]))) continue;
    t.push(time[i]); f.push(flux[i]); if (bkg) b.push(bkg[i]);
  }
  const m = median(f);
  if (!(m > 0)) return null;
  const idx = t.map((_, i) => i).sort((x, y) => t[x] - t[y]);
  return { t: Float64Array.from(idx, (i) => t[i]), f: Float64Array.from(idx, (i) => f[i] / m), b: bkg ? Float64Array.from(idx, (i) => b[i] / m) : undefined };
}

function boxDepth(dt: number[], r: number[], duration: number): Depth | null {
  const inn: number[] = [], out: number[] = [], outT: number[] = [];
  dt.forEach((x, i) => { if (Math.abs(x) < duration / 2) inn.push(r[i]); else if (Math.abs(x) > duration) { out.push(r[i]); outT.push(x); } });
  if (inn.length < 2 || out.length < 10) return null;
  const mo = out.reduce((a, b) => a + b, 0) / out.length, mi = inn.reduce((a, b) => a + b, 0) / inn.length;
  const sd = Math.sqrt(out.reduce((k, x) => k + (x - mo) ** 2, 0) / Math.max(1, out.length - 1));
  // Red noise: the scatter of out-of-transit means over transit-length chunks.
  const chunks = new Map<number, number[]>();
  outT.forEach((x, i) => { const k = Math.floor(x / duration); (chunks.get(k) ?? chunks.set(k, []).get(k)!).push(out[i]); });
  const means = [...chunks.values()].filter((c) => c.length >= Math.max(2, inn.length / 2)).map((c) => c.reduce((a, b) => a + b, 0) / c.length);
  const mm = means.reduce((a, b) => a + b, 0) / Math.max(1, means.length);
  const sdChunk = means.length >= 4 ? Math.sqrt(means.reduce((k, x) => k + (x - mm) ** 2, 0) / (means.length - 1)) : 0;
  return { depth: mo - mi, err: Math.max(sd / Math.sqrt(inn.length), sdChunk), points: inn.length };
}

/** The dip at `tc` (box of `duration`) against a quadratic baseline fitted out of transit within
 *  ±`reach` days; with a background series, also with the background regressed out (fitted out of
 *  transit, so a real transit isn't absorbed) and the flux-background correlation. */
export function localDepth(s: { t: Float64Array; f: Float64Array; b?: Float64Array }, tc: number, duration: number, reach = 1.5): LocalDepth | null {
  const dt: number[] = [], f: number[] = [], b: number[] = [];
  for (let i = 0; i < s.t.length; i++) {
    const x = s.t[i] - tc;
    if (Math.abs(x) > reach) continue;
    dt.push(x); f.push(s.f[i]); if (s.b) b.push(s.b[i]);
  }
  if (dt.length < 20) return null;
  const n = dt.length, X1 = Float64Array.from(dt), X2 = Float64Array.from(dt, (x) => x * x), y = Float64Array.from(f);
  const w = Float64Array.from(dt, (x) => (Math.abs(x) > duration ? 1 : 0));
  const resid = (a: number[], cols: Float64Array[]) => Array.from({ length: n }, (_, i) => y[i] - cols.reduce((k, c, j) => k + a[j] * c[i], 0) - a[cols.length]);
  const p = linearFit([X1, X2], y, w, true);
  const plain = boxDepth(dt, resid(p.a, [X1, X2]), duration);
  if (!plain) return null;
  if (!s.b) return { plain };
  const B = Float64Array.from(b);
  const q = linearFit([X1, X2, B], y, w, true);
  const decorrelated = boxDepth(dt, resid(q.a, [X1, X2, B]), duration) ?? undefined;
  // Correlation of the baseline-removed flux with the baseline-removed background.
  const pb = linearFit([X1, X2], B, Float64Array.from(dt, () => 1), true);
  const rf = resid(p.a, [X1, X2]), rb = Array.from({ length: n }, (_, i) => B[i] - pb.a[0] * X1[i] - pb.a[1] * X2[i] - pb.a[2]);
  const mf = rf.reduce((a, c) => a + c, 0) / n, mb = rb.reduce((a, c) => a + c, 0) / n;
  let sfb = 0, sff = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sfb += (rf[i] - mf) * (rb[i] - mb); sff += (rf[i] - mf) ** 2; sbb += (rb[i] - mb) ** 2; }
  const corr = sff > 0 && sbb > 0 ? sfb / Math.sqrt(sff * sbb) : 0;
  return { plain, decorrelated, corr, k: q.a[2] };
}

/** Weighted mean of depths. */
export function combineDepths(xs: Depth[]): Depth | null {
  let w = 0, s = 0, pts = 0;
  for (const x of xs) if (x.err > 0 && Number.isFinite(x.depth)) { w += 1 / x.err ** 2; s += x.depth / x.err ** 2; pts += x.points; }
  return w ? { depth: s / w, err: 1 / Math.sqrt(w), points: pts } : null;
}

/** Does an independent measurement confirm a dip? `expected` is the depth it should show (the
 *  pipeline's, times any dilution difference). "absent": at least 3σ below the expected depth and
 *  under 35% of it; "confirmed": a 3σ dip of at least 35%; otherwise too noisy to say. */
export function confirmation(check: Depth, expected: number): "confirmed" | "absent" | "unclear" {
  if (check.depth / check.err >= 3 && check.depth >= 0.35 * expected) return "confirmed";
  if ((expected - check.depth) / check.err >= 3 && check.depth < 0.35 * expected) return "absent";
  return "unclear";
}

/** Our own aperture photometry of a TESScut cutout: target pixels within `radius` px, minus a
 *  per-frame background and (with `column`) a per-frame, per-column offset measured in the same
 *  column away from the star. TESS's columns can carry offsets of their own (a broken neighbouring
 *  column, smear): a dip that is really a column offset vanishes here. Also the distance (px) from
 *  the star to the nearest dead (zero or empty) row or column: the CCD edge. */
export function pixelPhotometry(c: Cutout, ra: number, dec: number, opts: { radius?: number; column?: boolean } = {}) {
  const radius = opts.radius ?? 1.5, column = opts.column ?? true;
  const { nx, ny } = c, np = nx * ny;
  const { x, y } = skyToPix(c.wcs, ra, dec);
  if (!(x > -0.5 && x < nx - 0.5 && y > -0.5 && y < ny - 0.5)) return null;
  const good: number[] = [];
  for (let i = 0; i < c.t.length; i++) if (c.quality[i] === 0 && !engineeringAt(c.t[i], c.sector) && Number.isFinite(c.t[i]) && Number.isFinite(c.flux[i * np + Math.round(y) * nx + Math.round(x)])) good.push(i);
  if (good.length < 50) return null;
  // Reference image: per-pixel median over (up to 400 evenly spread) good frames.
  const sample = good.filter((_, k) => k % Math.max(1, Math.floor(good.length / 400)) === 0);
  const R = new Float64Array(np);
  for (let p = 0; p < np; p++) R[p] = median(sample.map((i) => c.flux[i * np + p]).filter(Number.isFinite));
  const dist = (p: number) => Math.hypot((p % nx) - x, Math.floor(p / nx) - y);
  const dead = (vals: number[]) => vals.every((v) => !Number.isFinite(v) || v === 0);
  let edge = Infinity;
  for (let i = 0; i < nx; i++) if (dead(Array.from({ length: ny }, (_, j) => R[j * nx + i]))) edge = Math.min(edge, Math.abs(i - x));
  for (let j = 0; j < ny; j++) if (dead(Array.from({ length: nx }, (_, i) => R[j * nx + i]))) edge = Math.min(edge, Math.abs(j - y));
  const live = (p: number) => Number.isFinite(R[p]) && R[p] !== 0;
  const ap = [...Array(np).keys()].filter((p) => dist(p) <= radius && live(p));
  const far = [...Array(np).keys()].filter((p) => dist(p) >= 3 && live(p));
  if (!ap.length || far.length < 8) return null;
  // Sky pixels: far from the star and among the faintest (other stars excluded).
  const cut = median(far.map((p) => R[p]));
  const sky = far.filter((p) => R[p] <= cut);
  const skyR = median(sky.map((p) => R[p]));
  const apCols = [...new Set(ap.map((p) => p % nx))];
  // Per column, the pixels at least 2.5 rows from the star (and not dead) measure that column's offset.
  const colPix = new Map(apCols.map((ci) => [ci, Array.from({ length: ny }, (_, j) => j * nx + ci).filter((p) => Math.abs(Math.floor(p / nx) - y) >= 2.5 && live(p))]));
  const base = ap.reduce((k, p) => k + R[p] - skyR, 0);
  if (!(base > 0)) return null;
  const t: number[] = [], f: number[] = [];
  for (const i of good) {
    const o = i * np;
    const bi = median(sky.map((p) => c.flux[o + p] - R[p]).filter(Number.isFinite));
    let sum = base, ok = Number.isFinite(bi);
    const off = new Map<number, number>();
    if (column) for (const [ci, ps] of colPix) {
      const v = ps.map((p) => c.flux[o + p] - R[p] - bi).filter(Number.isFinite);
      off.set(ci, v.length >= 3 ? median(v) : 0);
    }
    for (const p of ap) {
      const v = c.flux[o + p] - R[p] - bi - (off.get(p % nx) ?? 0);
      if (!Number.isFinite(v)) { ok = false; break; }
      sum += v;
    }
    if (ok) { t.push(c.t[i]); f.push(sum / base); }
  }
  if (t.length < 50) return null;
  return { t: Float64Array.from(t), f: Float64Array.from(f), edge, pixels: ap.length };
}
