// Light-curve preparation shared by the analysis agents: quality cuts, normalisation, binning,
// running-median detrending and robust statistics. Times are days (TESS BTJD), flux is relative.

export type Series = { t: Float64Array; f: Float64Array };

export function median(a: ArrayLike<number>): number {
  const s = Float64Array.from(a).sort();
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Robust standard deviation: 1.4826 x median absolute deviation. */
export function robustStd(a: ArrayLike<number>): number {
  const m = median(a);
  const d = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) d[i] = Math.abs(a[i] - m);
  return 1.4826 * median(d);
}

/** Keeps finite, unflagged cadences (quality 0) and normalises flux to its median (1 = median).
 *  Throws for background-dominated light curves (faint targets whose flux hovers around zero):
 *  relative depths are meaningless there. */
export function cleanSeries(time: ArrayLike<number>, flux: ArrayLike<number>, quality?: ArrayLike<number>): Series {
  const t: number[] = [], f: number[] = [];
  for (let i = 0; i < time.length; i++) {
    if (!Number.isFinite(time[i]) || !Number.isFinite(flux[i]) || (quality && quality[i] !== 0)) continue;
    t.push(time[i]); f.push(flux[i]);
  }
  const m = median(f);
  if (!f.length) return { t: new Float64Array(0), f: new Float64Array(0) };
  if (!(m > 0) || f.filter((v) => v <= 0).length > 0.01 * f.length) throw new Error("flux at or below zero: too faint (background-dominated)");
  // Times aren't guaranteed sorted across QLP orbits; the algorithms below assume they are.
  const idx = t.map((_, i) => i).sort((a, b) => t[a] - t[b]);
  return { t: Float64Array.from(idx, (i) => t[i]), f: Float64Array.from(idx, (i) => f[i] / m) };
}

/** Mean-bins a series to `width` days (empty bins skipped). A no-op when cadence is already coarser. */
export function binSeries(s: Series, width: number): Series {
  const n = s.t.length;
  if (n < 2 || (s.t[n - 1] - s.t[0]) / n >= width) return s;
  const t: number[] = [], f: number[] = [];
  let i = 0;
  while (i < n) {
    const edge = s.t[i] + width;
    let st = 0, sf = 0, k = 0;
    while (i < n && s.t[i] < edge) { st += s.t[i]; sf += s.f[i]; k++; i++; }
    t.push(st / k); f.push(sf / k);
  }
  return { t: Float64Array.from(t), f: Float64Array.from(f) };
}

/** Drops points within `trim` days after a data gap longer than `gap` days (thermal ramps after
 *  TESS downlinks and momentum dumps), plus the first `trim` days of the series. */
export function trimGaps(s: Series, gap = 0.5, trim = 0.25): Series {
  const keep: number[] = [];
  let start = s.t[0];
  for (let i = 0; i < s.t.length; i++) {
    if (i > 0 && s.t[i] - s.t[i - 1] > gap) start = s.t[i];
    if (s.t[i] - start >= trim) keep.push(i);
  }
  return { t: Float64Array.from(keep, (i) => s.t[i]), f: Float64Array.from(keep, (i) => s.f[i]) };
}

/** Divides out a running median of `window` days, so stellar variability and slow systematics are
 *  removed while dips much shorter than the window (transits of a few hours) survive. */
export function flatten(s: Series, window = 1): Series {
  const n = s.t.length, trend = new Float64Array(n), buf: number[] = [];
  let lo = 0, hi = 0;
  for (let i = 0; i < n; i++) {
    while (s.t[lo] < s.t[i] - window / 2) lo++;
    while (hi < n && s.t[hi] <= s.t[i] + window / 2) hi++;
    buf.length = 0;
    for (let k = lo; k < hi; k++) buf.push(s.f[k]);
    trend[i] = median(buf);
  }
  const f = new Float64Array(n);
  for (let i = 0; i < n; i++) f[i] = s.f[i] / trend[i];
  return { t: s.t, f };
}

/** Removes upward outliers (flares, cosmic rays) above `k` robust sigma; dips are kept: they may be transits. */
export function clipUpper(s: Series, k = 4): Series {
  const m = median(s.f), sd = robustStd(s.f);
  const keep: number[] = [];
  for (let i = 0; i < s.f.length; i++) if (s.f[i] - m <= k * sd) keep.push(i);
  return { t: Float64Array.from(keep, (i) => s.t[i]), f: Float64Array.from(keep, (i) => s.f[i]) };
}
