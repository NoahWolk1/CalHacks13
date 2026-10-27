// Single-transit search: one deep, transit-shaped dip with no repeat in the data. Periodic searches
// (BLS) need two or more transits, so planets on orbits longer than a sector's length slip through
// them; volunteers in Planet Hunters TESS found many of those by eye as lone dips. This slides a box
// along the flattened light curve and scores each dip against the scatter of box averages of the
// same length, so red noise (which makes neighbouring points move together) sets the bar, not the
// much smaller white-noise error.
import { median, robustStd, type Series } from "./timeseries";

export type SingleEvent = { t: number; duration: number; depth: number; snr: number; points: number };

export const SINGLE_DURATIONS = [2, 3, 4, 6, 8].map((h) => h / 24);
/** Detection threshold, in robust sigma of same-length box averages. */
export const SINGLE_MIN_SNR = 8;
/** Data gaps longer than this split the light curve; dips right next to a gap are thermal ramps. */
const GAP = 0.3;
const EDGE = 0.4;

/** Lone transit-shaped dips, strongest first, at most `max`, at least a day apart. */
export function singleEvents(s: Series, opts: { durations?: number[]; minSnr?: number; max?: number } = {}): SingleEvent[] {
  const n = s.t.length;
  if (n < 100) return [];
  const { t, f } = s;
  const cadence = median(Array.from({ length: Math.min(n - 1, 500) }, (_, i) => t[i + 1] - t[i]));
  // Contiguous segments: a window must sit inside one, clear of its edges.
  const segStart = new Float64Array(n), segEnd = new Float64Array(n);
  for (let i = 0, a = 0; i < n; i++) {
    if (i === n - 1 || t[i + 1] - t[i] > GAP) {
      for (let k = a; k <= i; k++) { segStart[k] = t[a]; segEnd[k] = t[i]; }
      a = i + 1;
    }
  }
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + f[i];
  const base = median(f);
  const found: SingleEvent[] = [];
  for (const d of opts.durations ?? SINGLE_DURATIONS) {
    const expected = d / cadence;
    const means = new Float64Array(n), counts = new Int32Array(n);
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      while (t[lo] < t[i] - d / 2) lo++;
      while (hi < n && t[hi] <= t[i] + d / 2) hi++;
      counts[i] = hi - lo;
      means[i] = (cum[hi] - cum[lo]) / Math.max(1, hi - lo);
    }
    // Box averages one duration apart are nearly independent: their scatter is the noise at this scale.
    const step = Math.max(1, Math.round(expected));
    const sample: number[] = [];
    for (let i = 0; i < n; i += step) if (counts[i] >= 0.6 * expected) sample.push(means[i]);
    const sd = robustStd(sample);
    if (!(sd > 0)) continue;
    for (let i = 0; i < n; i++) {
      if (counts[i] < Math.max(3, 0.6 * expected)) continue;
      const depth = base - means[i];
      const snr = depth / sd;
      if (snr < (opts.minSnr ?? SINGLE_MIN_SNR)) continue;
      if (t[i] - d / 2 - EDGE < segStart[i] || t[i] + d / 2 + EDGE > segEnd[i]) continue;
      // Transit-shaped: flux returns to the baseline on both sides (not a step or a slow trough).
      const side = (from: number, to: number) => {
        let a = i; while (a > 0 && t[a] > from) a--;
        let b = a; while (b < n && t[b] < to) b++;
        return b - a > 2 ? base - (cum[b] - cum[a]) / (b - a) : NaN;
      };
      const left = side(t[i] - 1.5 * d, t[i] - d / 2), right = side(t[i] + d / 2, t[i] + 1.5 * d);
      if (!(left < depth / 3 && right < depth / 3)) continue;
      found.push({ t: t[i], duration: d, depth, snr, points: counts[i] });
    }
  }
  // Strongest first; one per day (the same dip shows up at several centres and durations).
  found.sort((a, b) => b.snr - a.snr);
  const out: SingleEvent[] = [];
  for (const e of found) {
    if (out.some((o) => Math.abs(o.t - e.t) < 1)) continue;
    out.push(e);
    if (out.length >= (opts.max ?? 3)) break;
  }
  return out;
}
