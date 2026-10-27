// Measurements for vetting one transit signal (vetReport.ts), all on real light curves and all pure:
// masked detrending (two methods, several windows), the individual-transit table, per-transit timing
// and a linear ephemeris fit, a trapezoid shape fit (V vs U, asymmetry), the stellar density implied
// by the transit, alias periods against the coverage, and centroid / aperture comparisons in and out
// of transit. Times are BTJD days, flux relative (1 = out of transit).
import { median, robustStd, type Series } from "./timeseries";

/** A transit to mask or measure: centre and full duration (days). */
export type Window = { t: number; duration: number };

const G = 6.674e-8, RSUN = 6.957e10, MSUN = 1.989e33, RHO_SUN = 1.41, DAY = 86400;
export const R_JUP_EARTH = 11.21;

export function inWindows(t: number, windows: Window[], factor = 1.5) {
  for (const w of windows) if (Math.abs(t - w.t) < (factor * w.duration) / 2) return true;
  return false;
}

/** Contiguous stretches of data: [start, end] split at gaps longer than `gap` days. */
export function segments(t: ArrayLike<number>, gap = 0.5): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < t.length; i++) {
    if (!out.length || t[i] - t[i - 1] > gap) out.push([i, i]);
    else out[out.length - 1][1] = i;
  }
  return out;
}

export type DetrendMethod = { kind: "median" | "loess"; window: number };
export const detrendLabel = (m: DetrendMethod) => `${m.kind === "median" ? "running median" : "local quadratic"} ${m.window} d`;

/** Divides out a trend fitted to out-of-transit points only, so the transits keep their full depth:
 *  a running median, or a local quadratic (LOESS-like) fit. The trend is evaluated at knots and
 *  interpolated; points with no out-of-transit data within reach are dropped. */
export function detrendMasked(s: Series, windows: Window[], m: DetrendMethod, factor = 1.5): Series {
  const t: number[] = [], f: number[] = [];
  const step = Math.max(m.window / 12, 0.01);
  for (const [a, b] of segments(s.t)) {
    const oot: number[] = [];
    for (let i = a; i <= b; i++) if (!inWindows(s.t[i], windows, factor)) oot.push(i);
    if (oot.length < 10) continue;
    const kt: number[] = [], kv: number[] = [];
    let lo = 0, hi = 0;
    for (let x = s.t[a]; x <= s.t[b] + step / 2; x += step) {
      while (lo < oot.length && s.t[oot[lo]] < x - m.window / 2) lo++;
      while (hi < oot.length && s.t[oot[hi]] <= x + m.window / 2) hi++;
      if (hi - lo < 5) continue;
      if (m.kind === "median") {
        const buf: number[] = [];
        for (let k = lo; k < hi; k++) buf.push(s.f[oot[k]]);
        kt.push(x); kv.push(median(buf));
      } else {
        const v = quadAt(s, oot, lo, hi, x);
        if (Number.isFinite(v)) { kt.push(x); kv.push(v); }
      }
    }
    if (!kt.length) continue;
    let k = 0;
    for (let i = a; i <= b; i++) {
      const x = s.t[i];
      while (k < kt.length - 2 && kt[k + 1] < x) k++;
      const trend = kt.length === 1 || x <= kt[0] ? kv[0] : x >= kt[kt.length - 1] ? kv[kv.length - 1] : kv[k] + ((kv[k + 1] - kv[k]) * (x - kt[k])) / (kt[k + 1] - kt[k]);
      // Extrapolating more than a window past the last knot is guessing.
      if (x < kt[0] - m.window / 2 || x > kt[kt.length - 1] + m.window / 2 || !(trend > 0)) continue;
      t.push(x); f.push(s.f[i] / trend);
    }
  }
  return { t: Float64Array.from(t), f: Float64Array.from(f) };
}

/** Least-squares quadratic through points idx[lo..hi) (times centred on x), evaluated at x. */
function quadAt(s: Series, idx: number[], lo: number, hi: number, x: number) {
  let n = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, y0 = 0, y1 = 0, y2 = 0;
  for (let k = lo; k < hi; k++) {
    const u = s.t[idx[k]] - x, y = s.f[idx[k]], u2 = u * u;
    n++; s1 += u; s2 += u2; s3 += u2 * u; s4 += u2 * u2; y0 += y; y1 += u * y; y2 += u2 * y;
  }
  // Solve [[n s1 s2][s1 s2 s3][s2 s3 s4]] c = [y0 y1 y2] for c0 (Cramer's rule).
  const det = n * (s2 * s4 - s3 * s3) - s1 * (s1 * s4 - s3 * s2) + s2 * (s1 * s3 - s2 * s2);
  if (!(Math.abs(det) > 1e-18)) return y0 / n;
  return (y0 * (s2 * s4 - s3 * s3) - s1 * (y1 * s4 - s3 * y2) + s2 * (y1 * s3 - s2 * y2)) / det;
}

/** Red-noise factor at the transit's time scale (time-averaging method): scatter of box means
 *  `duration` long, over what white noise would give. At least 1. */
export function redNoise(s: Series, duration: number, windows: Window[] = []): number {
  const oot: number[] = [];
  for (let i = 0; i < s.t.length; i++) if (!inWindows(s.t[i], windows, 2)) oot.push(i);
  if (oot.length < 50) return 1;
  const sd = robustStd(oot.map((i) => s.f[i]));
  const means: number[] = [], counts: number[] = [];
  let start = 0;
  for (let k = 1; k <= oot.length; k++) {
    if (k === oot.length || s.t[oot[k]] - s.t[oot[start]] >= duration) {
      if (k - start >= 3) { let sum = 0; for (let j = start; j < k; j++) sum += s.f[oot[j]]; means.push(sum / (k - start)); counts.push(k - start); }
      start = k;
    }
  }
  if (means.length < 8 || !(sd > 0)) return 1;
  const expected = sd / Math.sqrt(median(counts));
  return Math.max(1, robustStd(means) / expected);
}

export type EventMeasure = { depth: number; err: number; snr: number; points: number; coverage: number; base: number; scatter: number };

/** Box depth of one transit against the local out-of-transit level on both sides (up to 3 durations
 *  out), its error inflated by the red-noise factor `beta`, and the fraction of it covered by data. */
export function measureEvent(s: Series, tc: number, duration: number, cadence: number, beta = 1): EventMeasure | null {
  const half = duration / 2, reach = half + Math.max(3 * duration, 0.25);
  const inn: number[] = [], out: number[] = [];
  let lo = lowerBound(s.t, tc - reach);
  for (; lo < s.t.length && s.t[lo] <= tc + reach; lo++) {
    const dt = Math.abs(s.t[lo] - tc);
    if (dt < half) inn.push(s.f[lo]);
    else if (dt > half * 1.5) out.push(s.f[lo]);
  }
  if (inn.length < 2 || out.length < 6) return null;
  const base = median(out), scatter = robustStd(out) || 1e-6;
  const mean = inn.reduce((a, b) => a + b, 0) / inn.length;
  const err = (beta * scatter) / Math.sqrt(inn.length);
  return { depth: base - mean, err, snr: (base - mean) / err, points: inn.length, coverage: Math.min(1, (inn.length * cadence) / duration), base, scatter };
}

export function lowerBound(a: ArrayLike<number>, x: number) {
  let lo = 0, hi = a.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

export const cadenceOf = (t: ArrayLike<number>) => (t.length > 1 ? median(Array.from({ length: Math.min(t.length - 1, 500) }, (_, i) => t[i + 1] - t[i])) : 0.01);

/** Inverse-variance weighted mean of depths. */
export function combine(xs: { depth: number; err: number }[]) {
  let w = 0, s = 0;
  for (const x of xs) if (x.err > 0) { w += 1 / x.err ** 2; s += x.depth / x.err ** 2; }
  const depth = w ? s / w : NaN, err = w ? 1 / Math.sqrt(w) : NaN;
  const chi2 = xs.reduce((k, x) => k + (x.err > 0 ? ((x.depth - depth) / x.err) ** 2 : 0), 0);
  return { depth, err, snr: depth / err, chi2, dof: Math.max(0, xs.length - 1) };
}

// ── shape ───────────────────────────────────────────────────────────────────

/** Trapezoid profile (0 out of transit, 1 at the flat bottom): total duration T14, ingress T12. */
export function trapezoid(dt: number, T14: number, T12: number) {
  const a = Math.abs(dt), h = T14 / 2;
  if (a >= h) return 0;
  if (a <= h - T12) return 1;
  return (h - a) / T12;
}

export type ShapeFit = {
  depth: number; T14: number; T12: number; shift: number; chi2: number;
  /** Ingress fraction T12 / (T14/2): ~0 box-like, 1 V-shaped. */
  vRatio: number;
  /** Best χ² among U-shaped (ingress fraction ≤ 0.5) minus best among V-shaped (≥ 0.9) fits: > 0 favours V. */
  dChi2V: number;
  /** In-transit residual mean before minus after mid-transit, in σ (asymmetry). */
  asymSigma: number; asym: number;
  points: number;
};

/** Grid fit of a trapezoid to stacked transit points (dt from mid-transit, flux, σ per point or one for all). */
export function fitTrapezoid(dt: Float64Array, f: Float64Array, sigmas: number | Float64Array, duration: number): ShapeFit | null {
  const n = dt.length;
  const w = typeof sigmas === "number" ? new Float64Array(n).fill(1 / sigmas ** 2) : Float64Array.from(sigmas, (x) => 1 / x ** 2);
  if (n < 20) return null;
  const outF: number[] = [];
  for (let i = 0; i < n; i++) if (Math.abs(dt[i]) > duration) outF.push(f[i]);
  const base = outF.length > 5 ? median(outF) : 1;
  const y = Float64Array.from(f, (v) => base - v);
  let best: (ShapeFit & { fr: number }) | null = null;
  let bestU = Infinity, bestV = Infinity;
  const m = new Float64Array(n);
  for (let si = -4; si <= 4; si++) {
    const shift = (si * duration) / 40;
    for (let ti = 0; ti <= 22; ti++) {
      const T14 = duration * (0.5 + ti * 0.05);
      for (let fi = 1; fi <= 20; fi++) {
        const fr = fi / 20, T12 = (fr * T14) / 2;
        let sym = 0, smm = 0;
        for (let i = 0; i < n; i++) { m[i] = trapezoid(dt[i] - shift, T14, T12); sym += w[i] * y[i] * m[i]; smm += w[i] * m[i] * m[i]; }
        if (!(smm > 0)) continue;
        const depth = sym / smm;
        let chi2 = 0;
        for (let i = 0; i < n; i++) chi2 += w[i] * (y[i] - depth * m[i]) ** 2;
        if (fr <= 0.5 && chi2 < bestU) bestU = chi2;
        if (fr >= 0.9 && chi2 < bestV) bestV = chi2;
        if (!best || chi2 < best.chi2) best = { depth, T14, T12, shift, chi2, vRatio: fr, dChi2V: 0, asymSigma: 0, asym: 0, points: n, fr };
      }
    }
  }
  if (!best || !(best.depth > 0)) return null;
  // Asymmetry: residuals of the best fit, first half of the transit against the second.
  // Weighted mean residual on each side, and its error.
  let pw = 0, ps = 0, qw = 0, qs = 0;
  for (let i = 0; i < n; i++) {
    const u = dt[i] - best.shift;
    if (Math.abs(u) >= best.T14 / 2) continue;
    const r = y[i] - best.depth * trapezoid(u, best.T14, best.T12);
    if (u < 0) { pw += w[i]; ps += w[i] * r; } else { qw += w[i]; qs += w[i] * r; }
  }
  const asymErr = pw && qw ? Math.sqrt(1 / pw + 1 / qw) : Infinity;
  const asym = pw && qw ? ps / pw - qs / qw : 0;
  const { fr: _fr, ...fit } = best;
  void _fr;
  return { ...fit, dChi2V: bestU - bestV, asym: asym / best.depth, asymSigma: Math.abs(asym) / asymErr };
}

// ── star and orbit ──────────────────────────────────────────────────────────

/** Total duration (days) of a central transit (b = 0, circular orbit). */
export function centralDuration(P: number, massSun: number, radiusSun: number, k = 0) {
  const a = Math.cbrt((G * massSun * MSUN * (P * DAY) ** 2) / (4 * Math.PI * Math.PI));
  const x = (radiusSun * RSUN * (1 + k)) / a;
  return x >= 1 ? P / 2 : (P / Math.PI) * Math.asin(x);
}

/** Stellar density (solar units) from a transit's shape and period (Seager & Mallén-Ornelas 2003,
 *  circular orbit). Null when the shape is unphysical for that formula (no flat bottom, or b out of range). */
export function densityFromTransit(P: number, depth: number, T14: number, T12: number): { rho: number; b: number } | null {
  const T23 = T14 - 2 * T12;
  if (!(T23 > 0) || !(depth > 0) || !(T14 < P / 2)) return null;
  const k = Math.sqrt(depth), r = T23 / T14;
  const b2 = ((1 - k) ** 2 - r * r * (1 + k) ** 2) / (1 - r * r);
  if (!(b2 >= 0) || b2 > (1 - k) ** 2) return null;
  const s2 = Math.sin((Math.PI * T14) / P) ** 2;
  const aR = Math.sqrt(((1 + k) ** 2 - b2 * (1 - s2)) / s2);
  const rho = ((3 * Math.PI) / (G * (P * DAY) ** 2)) * aR ** 3;
  return { rho: rho / RHO_SUN, b: Math.sqrt(b2) };
}

/** Shortest period consistent with a transit this long on a star this dense (b = 0, circular): a
 *  grazing or eccentric orbit only makes the period longer for the same duration. */
export function minPeriodFromDuration(T14: number, rhoSun: number, k = 0) {
  const T = T14 * DAY;
  return (((Math.PI * T) / (1 + k)) ** 3 * G * rhoSun * RHO_SUN) / (3 * Math.PI) / DAY;
}

/** Density in solar units from mass and radius. */
export const rhoOf = (massSun: number, radiusSun: number) => massSun / radiusSun ** 3;

/** Rough planet mass (Earth masses) from radius (Chen & Kipping 2017 power laws; giants ~1 Jupiter
 *  mass, though anything from Saturn to a low-mass star fits that radius). */
export function massFromRadius(rEarth: number) {
  if (rEarth < 1.23) return rEarth ** (1 / 0.279);
  if (rEarth < 11) return 2 * (rEarth / 1.2) ** (1 / 0.589);
  return 318;
}

/** RV semi-amplitude (m/s), circular, edge-on. */
export function rvSemiAmplitude(P: number, mpEarth: number, mStarSun: number) {
  return 28.43 * (mpEarth / 317.8) * (P / 365.25) ** (-1 / 3) * mStarSun ** (-2 / 3);
}

// ── timing ──────────────────────────────────────────────────────────────────

/** Mid-time of one transit: the profile slid over ±half a duration, χ² minimised, error from the
 *  Δχ² = 1 width of a parabola through the minimum (scaled by the red-noise factor). */
export function timeEvent(s: Series, tc: number, shape: { depth: number; T14: number; T12: number }, sigma: number, cadence: number, beta = 1): { t: number; err: number } | null {
  const reach = shape.T14 * 1.5;
  const lo = lowerBound(s.t, tc - reach - shape.T14 / 2), hi = lowerBound(s.t, tc + reach + shape.T14 / 2);
  if (hi - lo < 10) return null;
  const step = Math.max(cadence / 3, shape.T14 / 80);
  const chi = (tau: number) => {
    let c = 0;
    for (let i = lo; i < hi; i++) c += ((s.f[i] - (1 - shape.depth * trapezoid(s.t[i] - tau, shape.T14, shape.T12))) / sigma) ** 2;
    return c;
  };
  let bt = tc, bc = Infinity;
  const grid: { tau: number; c: number }[] = [];
  for (let tau = tc - shape.T14 / 2; tau <= tc + shape.T14 / 2; tau += step) { const c = chi(tau); grid.push({ tau, c }); if (c < bc) { bc = c; bt = tau; } }
  // Δχ² = 1 half-width from the grid points around the minimum.
  const j = grid.findIndex((g) => g.tau === bt);
  if (j <= 0 || j >= grid.length - 1) return null; // minimum at the edge: not timed
  const c0 = grid[j - 1].c, c2 = grid[j + 1].c, curv = (c0 - 2 * bc + c2) / (step * step);
  if (!(curv > 0)) return null;
  const off = ((c0 - c2) / (2 * (c0 - 2 * bc + c2))) * step;
  return { t: bt + off, err: (beta * Math.sqrt(2 / curv)) };
}

/** Weighted linear ephemeris through timed transits (epoch numbers n, times t): t = t0 + n P. */
export function fitEphemeris(xs: { n: number; t: number; err: number }[]) {
  if (xs.length < 2) return null;
  let S = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0;
  for (const { n, t, err } of xs) { const w = 1 / err ** 2; S += w; Sx += w * n; Sy += w * t; Sxx += w * n * n; Sxy += w * n * t; }
  const D = S * Sxx - Sx * Sx;
  if (!(D > 0)) return null;
  const P = (S * Sxy - Sx * Sy) / D, t0 = (Sxx * Sy - Sx * Sxy) / D;
  const chi2 = xs.reduce((k, x) => k + ((x.t - t0 - x.n * P) / x.err) ** 2, 0);
  return { P, t0, errP: Math.sqrt(S / D), errT0: Math.sqrt(Sxx / D), chi2, dof: xs.length - 2, residuals: xs.map((x) => ({ n: x.n, oc: x.t - t0 - x.n * P, err: x.err })) };
}

// ── coverage and aliases ────────────────────────────────────────────────────

/** For a single dip at t1: periods shorter than this would have put another transit inside the
 *  stretch of data around it (gaps under a day ignored). */
export function minPeriodFromCoverage(t1: number, coverage: [number, number][], duration: number, gap = 1) {
  const blocks = [...coverage].sort((a, b) => a[0] - b[0]).reduce<[number, number][]>((acc, [a, b]) => {
    const last = acc[acc.length - 1];
    if (last && a - last[1] <= gap) last[1] = Math.max(last[1], b); else acc.push([a, b]);
    return acc;
  }, []);
  const blk = blocks.find(([a, b]) => t1 >= a - duration && t1 <= b + duration);
  return blk ? Math.max(t1 - blk[0], blk[1] - t1) - duration / 2 : 0;
}

// ── centroids and apertures ─────────────────────────────────────────────────

/** In- minus out-of-transit mean of a per-cadence quantity (centroid, flux) around each transit time,
 *  combined over transits. σ from the local scatter, inflated by its red noise. */
export function inOutShift(t: Float64Array, v: Float64Array, times: number[], duration: number) {
  const parts: { d: number; err: number }[] = [];
  const s: Series = { t, f: v };
  const beta = redNoise(s, duration, times.map((x) => ({ t: x, duration })));
  const cad = cadenceOf(t);
  for (const tc of times) {
    const m = measureEvent(s, tc, duration, cad, beta);
    // measureEvent reports base - in; the shift is in - base.
    if (m && m.coverage >= 0.5) parts.push({ d: -m.depth, err: m.err });
  }
  if (!parts.length) return null;
  const c = combine(parts.map((p) => ({ depth: p.d, err: p.err })));
  return { shift: c.depth, err: c.err, events: parts.length };
}
