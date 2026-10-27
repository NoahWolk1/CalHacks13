// Generalised Lomb-Scargle periodogram (Zechmeister & Kürster 2009: floating mean, uniform weights)
// for the Variability agent: finds the dominant periodic signal in a light curve (starspot rotation,
// pulsation, ellipsoidal variation) with its amplitude and a false-alarm probability.
import type { Series } from "./timeseries";

export type LsResult = {
  period: number; // days
  power: number; // 0..1, fraction of variance explained by the sinusoid
  amplitude: number; // semi-amplitude, relative flux
  fap: number; // false-alarm probability (Baluev-style approximation over independent frequencies)
  frequencies: number;
  /** The best-fit sinusoid, flux - mean ≈ a cos(2πf(t - t0)) + b sin(2πf(t - t0)) + c (for prewhitening). */
  fit?: { f: number; a: number; b: number; c: number; t0: number; mean: number };
};

export type LsOptions = { minPeriod?: number; maxPeriod?: number; oversample?: number };

export function lombScargle(s: Series, opts: LsOptions = {}): LsResult {
  const n = s.t.length;
  if (n < 20) throw new Error("light curve too short for a periodogram");
  const span = s.t[n - 1] - s.t[0];
  const fMin = 1 / Math.min(opts.maxPeriod ?? span / 2, span / 2), fMax = 1 / (opts.minPeriod ?? 1 / 12);
  // Multi-sector baselines resolve frequencies finely already: 3x oversampling keeps the cost down there.
  const df = 1 / (span * (opts.oversample ?? (span > 40 ? 3 : 5)));
  const nf = Math.max(1, Math.floor((fMax - fMin) / df));

  let mean = 0;
  for (let i = 0; i < n; i++) mean += s.f[i];
  mean /= n;
  const y = new Float64Array(n);
  let yy = 0;
  for (let i = 0; i < n; i++) { y[i] = s.f[i] - mean; yy += y[i] * y[i]; }
  yy /= n;
  if (!(yy > 0)) return { period: NaN, power: 0, amplitude: 0, fap: 1, frequencies: nf };

  const t0 = s.t[0];
  /** Power and least-squares sinusoid at one frequency (null where the fit is degenerate). */
  const at = (freq: number) => {
    const w = 2 * Math.PI * freq;
    let C = 0, S = 0, YC = 0, YS = 0, CC = 0, SS = 0, CS = 0;
    for (let i = 0; i < n; i++) {
      const x = w * (s.t[i] - t0), c = Math.cos(x), sn = Math.sin(x);
      C += c; S += sn; YC += y[i] * c; YS += y[i] * sn; CC += c * c; SS += sn * sn; CS += c * sn;
    }
    C /= n; S /= n; YC /= n; YS /= n; CC /= n; SS /= n; CS /= n;
    // Floating-mean terms (y already has zero mean, so Y = 0 in the paper's notation).
    const cc = CC - C * C, ss = SS - S * S, cs = CS - C * S;
    const D = cc * ss - cs * cs;
    if (!(D > 0)) return null;
    const a = (YC * ss - YS * cs) / D, b = (YS * cc - YC * cs) / D;
    return { p: (ss * YC * YC + cc * YS * YS - 2 * cs * YC * YS) / (yy * D), fit: { f: freq, a, b, c: -(a * C + b * S), t0, mean } };
  };
  let best: NonNullable<ReturnType<typeof at>> | null = null;
  for (let j = 0; j < nf; j++) {
    const r = at(fMin + j * df);
    if (r && r.p > (best?.p ?? 0)) best = r;
  }
  // Refine the peak to a 40th of the grid step: prewhitening with a slightly-off frequency leaves
  // a beat pattern behind.
  if (best) {
    const f0 = best.fit.f;
    for (let k = -20; k <= 20; k++) { const r = at(f0 + (k * df) / 20); if (r && r.p > best.p) best = r; }
  }
  const bestP = best?.p ?? 0, bestF = best?.fit.f ?? fMin, fit = best?.fit;
  const bestAmp = fit ? Math.hypot(fit.a, fit.b) : 0;
  // FAP: single-frequency probability (1 - p)^((n - 3) / 2), over ~fMax x span independent frequencies.
  const single = Math.pow(Math.max(0, 1 - bestP), (n - 3) / 2);
  const m = Math.max(1, (fMax - fMin) * span);
  const fap = Math.min(1, single * m < 1e-3 ? single * m : 1 - Math.pow(1 - single, m));
  return { period: 1 / bestF, power: bestP, amplitude: bestAmp, fap, frequencies: nf, fit };
}

/** Subtracts the strongest sinusoids one at a time while they stay significant (at most `max`):
 *  pulsations faster than the flattening window (δ Scuti, γ Dor, contact binaries) would otherwise
 *  leave periodic dips that a transit search locks onto. */
export function prewhiten(s: Series, opts: LsOptions & { max?: number } = {}): { series: Series; removed: number[] } {
  let f = s.f;
  const removed: number[] = [];
  for (let k = 0; k < (opts.max ?? 5); k++) {
    const r = lombScargle({ t: s.t, f }, opts);
    if (!isVariable(r) || !r.fit) break;
    const { f: fr, a, b, c, t0 } = r.fit;
    const w = 2 * Math.PI * fr;
    f = Float64Array.from(f, (v, i) => v - (a * Math.cos(w * (s.t[i] - t0)) + b * Math.sin(w * (s.t[i] - t0)) + c));
    removed.push(r.period);
  }
  return { series: { t: s.t, f }, removed };
}

/** Plain-language class for a dominant periodic signal (a guess from period alone; not a classification). */
export function variabilityClass(period: number): string {
  if (period < 0.25) return "short-period pulsation (δ Scuti / β Cephei-like)";
  if (period < 1) return "fast variability (pulsation, ellipsoidal or contact binary)";
  return "rotational modulation (starspots) or slow pulsation";
}

/** Reported as variable: significant (FAP < 0.1%), coherent enough (power > 0.1) and at least 0.5 ppt. */
export const isVariable = (r: LsResult) => r.fap < 1e-3 && r.power > 0.1 && r.amplitude >= 5e-4;
