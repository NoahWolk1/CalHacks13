// Robustness tests for a periodic transit signal (vetReport.ts, Stages 1-2), after the Kepler
// Robovetter (Thompson et al. 2018; Coughlin et al. 2016):
//  - model-shift uniqueness: the transit model slid across the whole phase-folded light curve.
//    The scatter of those "depths" at phases with no transit measures the noise at the transit's
//    own time scale (F_red, the red noise the white-noise errors miss), and the primary has to
//    stand out above it, above the next-deepest dip (MS2) and above the strongest brightening (MS3)
//  - event consistency: the individual depths agree with one depth, and the signal survives
//    dropping its 3 strongest events (one or a few outliers can't make a 100-transit signal)
//  - pulsation removal: sinusoids fitted out of transit (δ Scuti, γ Dor, rotation) are subtracted
//    and the transit measured again, so a dip made of pulsations disappears
import { lombScargle } from "./lombscargle";
import { binSeries, type Series } from "./timeseries";
import { combine } from "./transitFit";

/** Inverse standard normal CDF (Acklam's rational approximation, |rel. error| < 1.2e-9). */
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}
/** √2 erfcinv(x): the one-sided Gaussian threshold whose tail probability is x/2. */
export const sigmaThreshold = (x: number) => -normInv(x / 2);

export type ModelShift = {
  /** White-noise significance at each phase (0 = the transit), depth relative flux. */
  phases: { ph: number; depth: number; sig: number }[];
  pri: number; sec: { ph: number; sig: number; depth: number }; ter: { ph: number; sig: number }; pos: { ph: number; sig: number };
  /** Scatter of the significance away from the primary and secondary: 1 for white noise. */
  fred: number;
  fa1: number; fa2: number;
  ms1: number; ms2: number; ms3: number;
};

/** Model-shift test on phase-folded, flattened flux (normalised to 1). The box model has the
 *  transit's duration; its depth at phase φ is the median out-of-box level minus the mean inside. */
export function modelShift(parts: Series[], P: number, t0: number, T14: number, nTces = 20_000): ModelShift | null {
  const ph: number[] = [], f: number[] = [];
  for (const s of parts) for (let i = 0; i < s.t.length; i++) { const x = (((s.t[i] - t0) / P) % 1 + 1) % 1; ph.push(x); f.push(s.f[i]); }
  if (ph.length < 200) return null;
  const idx = ph.map((_, i) => i).sort((a, b) => ph[a] - ph[b]);
  const P_ = Float64Array.from(idx, (i) => ph[i]), F = Float64Array.from(idx, (i) => f[i]);
  const n = P_.length, w = T14 / P / 2;
  // Prefix sums for window means (the phase axis wraps).
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + F[i];
  const lb = (x: number) => { let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (P_[m] < x) lo = m + 1; else hi = m; } return lo; };
  const windowSum = (a: number, b: number): [number, number] => {
    if (a < 0) { const [s1, n1] = windowSum(a + 1, 1); const [s2, n2] = windowSum(0, b); return [s1 + s2, n1 + n2]; }
    if (b > 1) { const [s1, n1] = windowSum(a, 1); const [s2, n2] = windowSum(0, b - 1); return [s1 + s2, n1 + n2]; }
    const i = lb(a), j = lb(b);
    return [pre[j] - pre[i], j - i];
  };
  // Baseline and white noise from everything outside the primary.
  const outside: number[] = [];
  for (let i = 0; i < n; i++) if (Math.min(P_[i], 1 - P_[i]) > 1.5 * w) outside.push(F[i]);
  outside.sort((a, b) => a - b);
  const base = outside[outside.length >> 1];
  const sd = 1.4826 * outside.map((x) => Math.abs(x - base)).sort((a, b) => a - b)[outside.length >> 1];
  if (!(sd > 0)) return null;
  const step = Math.max(w / 2, 1 / 4000);
  const phases: ModelShift["phases"] = [];
  for (let x = 0; x < 1; x += step) {
    const [s, k] = windowSum(x - w, x + w);
    if (k < 3) continue;
    const depth = base - s / k;
    phases.push({ ph: x, depth, sig: depth / (sd / Math.sqrt(k)) });
  }
  const dist = (a: number, b: number) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
  const pri = phases.find((p) => p.ph === 0)?.sig ?? phases.reduce((b, p) => (dist(p.ph, 0) < dist(b.ph, 0) ? p : b)).sig;
  const away = phases.filter((p) => dist(p.ph, 0) > 2 * w);
  if (away.length < 5) return null;
  const secP = away.reduce((b, p) => (p.sig > b.sig ? p : b));
  const rest = away.filter((p) => dist(p.ph, secP.ph) > 2 * w);
  const ter = rest.length ? rest.reduce((b, p) => (p.sig > b.sig ? p : b)) : { ph: NaN, sig: 0 };
  const pos = rest.length ? rest.reduce((b, p) => (-p.sig > -b.sig ? p : b)) : { ph: NaN, sig: 0 };
  // F_red: robust scatter of the model-shift series (red noise at the transit's time scale).
  const s = rest.map((p) => p.sig).sort((a, b) => a - b), med = s[s.length >> 1];
  const fred = Math.max(1, (1.4826 * s.map((x) => Math.abs(x - med)).sort((a, b) => a - b)[s.length >> 1]) || 1);
  const fa1 = sigmaThreshold(T14 / P / nTces), fa2 = sigmaThreshold(T14 / P);
  return {
    phases, pri, sec: { ph: secP.ph, sig: secP.sig, depth: secP.depth }, ter: { ph: ter.ph, sig: ter.sig }, pos: { ph: pos.ph, sig: -pos.sig }, fred, fa1, fa2,
    ms1: pri / fred - fa1, ms2: (pri - ter.sig) / fred - fa2, ms3: (pri - -pos.sig) / fred - fa2,
  };
}

export type EventStats = { chi2: number; dof: number; outliers: { i: number; dev: number }[]; drop3: { depth: number; err: number; snr: number }; dropped: number[] };

/** Do the individual transits share one depth? χ² about the weighted mean, the events more than
 *  4σ above it, and the combined depth with the 3 events that contribute most removed. */
export function eventStats(ev: { depth: number; err: number }[]): EventStats {
  const all = combine(ev);
  const outliers = ev.map((e, i) => ({ i, dev: (e.depth - all.depth) / e.err })).filter((x) => x.dev > 4).sort((a, b) => b.dev - a.dev);
  const contrib = ev.map((e, i) => ({ i, c: e.depth / e.err ** 2 })).sort((a, b) => b.c - a.c).slice(0, 3).map((x) => x.i);
  const drop = combine(ev.filter((_, i) => !contrib.includes(i)));
  return { chi2: all.chi2, dof: all.dof, outliers, drop3: { depth: drop.depth, err: drop.err, snr: drop.snr }, dropped: contrib };
}

export type Pulsation = { period: number; amplitude: number };

/** Sinusoids fitted to out-of-transit points (`mask` true = in transit) and subtracted from the
 *  whole series, strongest first while significant (FAP < 0.01%, ≥ 0.05 ppt), at most `max`.
 *  The periodogram runs on 10-min bins up to 36 cycles/day, so δ Scuti pulsation is included. */
export function removePulsations(s: Series, mask: (t: number) => boolean, max = 8): { series: Series; removed: Pulsation[] } {
  const keep: number[] = [];
  for (let i = 0; i < s.t.length; i++) if (!mask(s.t[i])) keep.push(i);
  if (keep.length < 100) return { series: s, removed: [] };
  const ot = Float64Array.from(keep, (i) => s.t[i]);
  let of_ = Float64Array.from(keep, (i) => s.f[i]);
  let full = Float64Array.from(s.f);
  const removed: Pulsation[] = [];
  for (let k = 0; k < max; k++) {
    const b = binSeries({ t: ot, f: of_ }, 10 / 1440);
    if (b.t.length < 50) break;
    const r = lombScargle(b, { minPeriod: 1 / 36, maxPeriod: 3, oversample: 2 });
    // No power cut: a multi-mode pulsator spreads its variance over many frequencies.
    if (!r.fit || !(r.fap < 1e-4 && r.amplitude >= 5e-5)) break;
    const { f: fr, a, b: bb, t0 } = r.fit, w = 2 * Math.PI * fr;
    const wave = (t: number) => a * Math.cos(w * (t - t0)) + bb * Math.sin(w * (t - t0));
    of_ = Float64Array.from(of_, (v, i) => v - wave(ot[i]));
    full = Float64Array.from(full, (v, i) => v - wave(s.t[i]));
    removed.push({ period: 1 / fr, amplitude: r.amplitude });
  }
  return { series: { t: s.t, f: full }, removed };
}

/** A pulsation whose period (or a small multiple or fraction of it) matches the transit period. */
export function harmonicOf(P: number, pulsations: Pulsation[], maxN = 4): { pulsation: Pulsation; relation: string } | null {
  for (const p of pulsations) for (let n = 1; n <= maxN; n++) {
    if (Math.abs(P / (n * p.period) - 1) < 0.003) return { pulsation: p, relation: n === 1 ? "equals" : `is ${n}×` };
    if (n > 1 && Math.abs((n * P) / p.period - 1) < 0.003) return { pulsation: p, relation: `is 1/${n} of` };
  }
  return null;
}
