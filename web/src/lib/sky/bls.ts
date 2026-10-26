// Box Least Squares transit search (Kovács, Zucker & Mazeh 2002) on a flattened light curve, plus
// the per-signal checks a transit vetter runs first: SNR, number of transits, odd/even depth
// mismatch and a secondary eclipse at phase 0.5 (both tell-tale signs of an eclipsing binary).
import { median, robustStd, type Series } from "./timeseries";

export type BlsOptions = {
  minPeriod?: number; // days
  maxPeriod?: number; // days; default: half the baseline, so at least two transits are possible
  durations?: number[]; // trial durations, days
  /** Frequency step in units of shortest duration / baseline² (1 = transits drift at most one
   *  shortest-duration across the baseline; default 1.5). The peak is refined on a finer grid. */
  oversample?: number;
  maxFrequencies?: number;
};

export type BlsPeak = { period: number; t0: number; duration: number; power: number };

export type BlsResult = BlsPeak & {
  sde: number; // signal detection efficiency of the peak in the periodogram
  depth: number; // relative flux (0.001 = 1 ppt)
  depthErr: number;
  snr: number;
  transits: number; // transit epochs with data
  inTransit: number; // points in transit
  oddEven: number; // |odd - even depth| / depth
  oddEvenSigma: number; // |odd - even depth| in sigma
  secondary: number; // depth at phase 0.5 (relative flux)
  secondarySigma: number;
  periods: number; // trial periods searched
};

export const DEFAULT_DURATIONS = [1, 1.5, 2, 3, 4, 6, 8].map((h) => h / 24);
/** Detection thresholds. SDE here is robust (median / MAD of the detrended spectrum): on simulated
 *  sectors, white- and red-noise-only peaks stayed at 4.5-6.6 while a 0.8 ppt transit reached 13
 *  and WASP-18 b's real TESS light curve ~30. SNR alone isn't enough (red noise inflates it past
 *  10); 7.1 sigma is Kepler's transit-search SNR threshold. */
export const BLS_MIN_SDE = 9;
export const BLS_MIN_SNR = 7.1;
export const BLS_MIN_TRANSITS = 2;

type Prepared = { t: Float64Array; y: Float64Array; t0: number; durations: number[]; w: number; sy: Float64Array; cnt: Float64Array };

const MAX_BINS = 3000;

function prepare(s: Series, durations: number[]): Prepared {
  const n = s.t.length;
  // Mean-subtracted flux with uniform weights (sum of weights = 1).
  let mean = 0;
  for (let i = 0; i < n; i++) mean += s.f[i];
  mean /= n;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = (s.f[i] - mean) / n;
  return { t: s.t, y, t0: s.t[0], durations, w: 1 / n, sy: new Float64Array(2 * MAX_BINS), cnt: new Float64Array(2 * MAX_BINS) };
}

/** Best box (dip) at one trial frequency: fold into bins, slide each trial duration over phase. */
function boxAt(p: Prepared, f: number): BlsPeak {
  const { t, y, t0, durations, w, sy, cnt } = p;
  const P = 1 / f, n = t.length;
  // Bins about a third of the shortest duration wide; each trial duration spans whole bins.
  const nb = Math.min(MAX_BINS, Math.max(16, Math.ceil(P / (durations[0] / 3))));
  sy.fill(0, 0, 2 * nb); cnt.fill(0, 0, 2 * nb);
  for (let i = 0; i < n; i++) {
    // x - floor(x) rather than x % 1: V8's float modulo is a slow runtime call in this hot loop.
    const x = (t[i] - t0) * f;
    const b = Math.floor((x - Math.floor(x)) * nb);
    sy[b] += y[i]; cnt[b]++;
  }
  // Wrap so windows can straddle phase 0.
  for (let b = 0; b < nb; b++) { sy[nb + b] = sy[b]; cnt[nb + b] = cnt[b]; }
  let bp = 0, bStart = 0, bK = 1;
  for (const d of durations) {
    if (d / P > 0.15) break; // longer than any plausible transit at this period
    const k = Math.max(1, Math.round((d / P) * nb));
    let s0 = 0, c0 = 0;
    for (let b = 0; b < k; b++) { s0 += sy[b]; c0 += cnt[b]; }
    for (let b = 0; b < nb; b++) {
      if (b) { s0 += sy[b + k - 1] - sy[b - 1]; c0 += cnt[b + k - 1] - cnt[b - 1]; }
      if (s0 >= 0 || c0 < 3) continue; // dips only, and enough points to mean something
      const r = c0 * w;
      if (r >= 1) continue;
      const pw = (s0 * s0) / (r * (1 - r));
      if (pw > bp) { bp = pw; bStart = b; bK = k; }
    }
  }
  return { period: P, t0: t0 + ((bStart + bK / 2) / nb) * P, duration: (bK / nb) * P, power: Math.sqrt(bp) };
}

/** Raw periodogram: best box power (signal residue) per trial frequency, uniform in frequency. */
export function blsPeriodogram(s: Series, opts: BlsOptions = {}) {
  const n = s.t.length;
  const span = s.t[n - 1] - s.t[0];
  const durations = (opts.durations ?? DEFAULT_DURATIONS).slice().sort((a, b) => a - b);
  const minP = opts.minPeriod ?? 0.5;
  const maxP = Math.min(opts.maxPeriod ?? span / 2, span / 2);
  if (!(maxP > minP) || n < 50) throw new Error("light curve too short for a transit search");
  const fMin = 1 / maxP, fMax = 1 / minP;
  let df = ((opts.oversample ?? 1.5) * durations[0]) / (span * span);
  const cap = opts.maxFrequencies ?? 25_000;
  if ((fMax - fMin) / df > cap) df = (fMax - fMin) / cap;
  const nf = Math.floor((fMax - fMin) / df) + 1;
  const p = prepare(s, durations);
  const freq = new Float64Array(nf), power = new Float64Array(nf);
  const best: BlsPeak[] = new Array(nf);
  for (let j = 0; j < nf; j++) {
    freq[j] = fMin + j * df;
    best[j] = boxAt(p, freq[j]);
    power[j] = best[j].power;
  }
  return { freq, power, best, df, prepared: p };
}

/** Robust SDE of each periodogram point: subtract a running median (the slow rise of power toward
 *  long periods, where fewer transits make noisier boxes), then scale by the median absolute
 *  deviation. Median/MAD rather than mean/std so a strong signal's own harmonics and aliases don't
 *  inflate the noise estimate and bury the signal that made them. */
export function sdeSpectrum(power: Float64Array, window = 1001) {
  const n = power.length, out = new Float64Array(n);
  // Running median sampled every `step` points and interpolated (exact per-point medians are O(n·w)).
  const step = Math.max(1, Math.floor(window / 8)), half = Math.floor(window / 2);
  const xs: number[] = [], ms: number[] = [];
  for (let i = 0; i < n; i += step) { xs.push(i); ms.push(median(power.subarray(Math.max(0, i - half), Math.min(n, i + half + 1)))); }
  if (xs[xs.length - 1] !== n - 1) { xs.push(n - 1); ms.push(median(power.subarray(Math.max(0, n - 1 - half), n))); }
  let k = 0;
  for (let i = 0; i < n; i++) {
    while (k < xs.length - 2 && xs[k + 1] < i) k++;
    const a = xs[k], b = xs[k + 1] ?? a;
    const trend = b === a ? ms[k] : ms[k] + ((ms[k + 1] - ms[k]) * (i - a)) / (b - a);
    out[i] = power[i] - trend;
  }
  const m = median(out), sd = robustStd(out) || 1;
  for (let i = 0; i < n; i++) out[i] = (out[i] - m) / sd;
  return out;
}

/** Phase offset (days) of a time from the nearest transit centre, and that transit's epoch number. */
const phaseOf = (t: number, P: number, t0: number) => {
  const e = Math.round((t - t0) / P);
  return { e, dt: t - t0 - e * P };
};

/** Depth, SNR and vetting statistics for one box signal, measured on the unbinned (flattened) data. */
export function measureSignal(s: Series, peak: Pick<BlsPeak, "period" | "t0" | "duration">) {
  const { period: P, t0, duration: d } = peak;
  const inn: number[] = [], out: number[] = [], odd: number[] = [], even: number[] = [], sec: number[] = [];
  const epochs = new Set<number>();
  for (let i = 0; i < s.t.length; i++) {
    const { e, dt } = phaseOf(s.t[i], P, t0);
    if (Math.abs(dt) < d / 2) {
      inn.push(s.f[i]); epochs.add(e);
      (e % 2 ? odd : even).push(s.f[i]);
    } else {
      out.push(s.f[i]);
      const ds = phaseOf(s.t[i], P, t0 + P / 2).dt;
      if (Math.abs(ds) < d / 2) sec.push(s.f[i]);
    }
  }
  const base = median(out), sd = robustStd(out) || 1e-6;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const depth = base - mean(inn);
  const depthErr = sd / Math.sqrt(Math.max(1, inn.length));
  const dOdd = base - mean(odd), dEven = base - mean(even);
  const both = odd.length > 0 && even.length > 0;
  const oddEvenSigma = both ? Math.abs(dOdd - dEven) / Math.hypot(sd / Math.sqrt(odd.length), sd / Math.sqrt(even.length)) : 0;
  const oddEven = both && depth > 0 ? Math.abs(dOdd - dEven) / depth : 0;
  const secondary = sec.length ? base - mean(sec) : 0;
  const secondarySigma = sec.length ? secondary / (sd / Math.sqrt(sec.length)) : 0;
  return { depth, depthErr, snr: depth / depthErr, transits: epochs.size, inTransit: inn.length, oddEven, oddEvenSigma, secondary, secondarySigma };
}

/** Full search: periodogram, strongest peak by SDE, the period refined on a 20x finer grid around
 *  it, then the signal measured on the data. */
export function bls(s: Series, opts: BlsOptions = {}): BlsResult {
  const { freq, best, power, df, prepared } = blsPeriodogram(s, opts);
  const sde = sdeSpectrum(power);
  let j = 0;
  for (let i = 1; i < sde.length; i++) if (sde[i] > sde[j]) j = i;
  let peak = best[j];
  for (let k = -20; k <= 20; k++) {
    const b = boxAt(prepared, freq[j] + (k * df) / 20);
    if (b.power > peak.power) peak = b;
  }
  return { ...peak, sde: sde[j], ...measureSignal(s, peak), periods: power.length };
}

/** Whether a BLS result clears the detection thresholds (before vetting). */
export const blsDetected = (r: Pick<BlsResult, "sde" | "snr" | "transits" | "depth">) => r.sde >= BLS_MIN_SDE && r.snr >= BLS_MIN_SNR && r.transits >= BLS_MIN_TRANSITS && r.depth > 0;
