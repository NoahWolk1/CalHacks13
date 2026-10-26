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
};

export type LsOptions = { minPeriod?: number; maxPeriod?: number; oversample?: number };

export function lombScargle(s: Series, opts: LsOptions = {}): LsResult {
  const n = s.t.length;
  if (n < 20) throw new Error("light curve too short for a periodogram");
  const span = s.t[n - 1] - s.t[0];
  const fMin = 1 / Math.min(opts.maxPeriod ?? span / 2, span / 2), fMax = 1 / (opts.minPeriod ?? 1 / 12);
  const df = 1 / (span * (opts.oversample ?? 5));
  const nf = Math.max(1, Math.floor((fMax - fMin) / df));

  let mean = 0;
  for (let i = 0; i < n; i++) mean += s.f[i];
  mean /= n;
  const y = new Float64Array(n);
  let yy = 0;
  for (let i = 0; i < n; i++) { y[i] = s.f[i] - mean; yy += y[i] * y[i]; }
  yy /= n;
  if (!(yy > 0)) return { period: NaN, power: 0, amplitude: 0, fap: 1, frequencies: nf };

  let bestP = 0, bestF = fMin, bestAmp = 0;
  const t0 = s.t[0];
  for (let j = 0; j < nf; j++) {
    const w = 2 * Math.PI * (fMin + j * df);
    let C = 0, S = 0, YC = 0, YS = 0, CC = 0, SS = 0, CS = 0;
    for (let i = 0; i < n; i++) {
      const x = w * (s.t[i] - t0), c = Math.cos(x), sn = Math.sin(x);
      C += c; S += sn; YC += y[i] * c; YS += y[i] * sn; CC += c * c; SS += sn * sn; CS += c * sn;
    }
    C /= n; S /= n; YC /= n; YS /= n; CC /= n; SS /= n; CS /= n;
    // Floating-mean terms (y already has zero mean, so Y = 0 in the paper's notation).
    const cc = CC - C * C, ss = SS - S * S, cs = CS - C * S;
    const D = cc * ss - cs * cs;
    if (!(D > 0)) continue;
    const p = (ss * YC * YC + cc * YS * YS - 2 * cs * YC * YS) / (yy * D);
    if (p > bestP) {
      bestP = p; bestF = fMin + j * df;
      // Least-squares sinusoid coefficients for the amplitude.
      const a = (YC * ss - YS * cs) / D, b = (YS * cc - YC * cs) / D;
      bestAmp = Math.hypot(a, b);
    }
  }
  // FAP: single-frequency probability (1 - p)^((n - 3) / 2), over ~fMax x span independent frequencies.
  const single = Math.pow(Math.max(0, 1 - bestP), (n - 3) / 2);
  const m = Math.max(1, (fMax - fMin) * span);
  const fap = Math.min(1, single * m < 1e-3 ? single * m : 1 - Math.pow(1 - single, m));
  return { period: 1 / bestF, power: bestP, amplitude: bestAmp, fap, frequencies: nf };
}

/** Plain-language class for a dominant periodic signal (a guess from period alone; not a classification). */
export function variabilityClass(period: number): string {
  if (period < 0.25) return "short-period pulsation (δ Scuti / β Cephei-like)";
  if (period < 1) return "fast variability (pulsation, ellipsoidal or contact binary)";
  return "rotational modulation (starspots) or slow pulsation";
}

/** Reported as variable: significant (FAP < 0.1%), coherent enough (power > 0.1) and at least 0.5 ppt. */
export const isVariable = (r: LsResult) => r.fap < 1e-3 && r.power > 0.1 && r.amplitude >= 5e-4;
