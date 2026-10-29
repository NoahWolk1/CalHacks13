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

/** Joins per-sector series (each already normalised to 1) into one, in time order. */
export function stitch(parts: Series[]): Series {
  const all = parts.filter((p) => p.t.length).sort((a, b) => a.t[0] - b.t[0]);
  const n = all.reduce((k, p) => k + p.t.length, 0);
  const t = new Float64Array(n), f = new Float64Array(n);
  let o = 0;
  for (const p of all) { t.set(p.t, o); f.set(p.f, o); o += p.t.length; }
  return { t, f };
}

/** A periodic transit window to cut out: centre t0 (days), period and duration (days). Catalog
 *  ephemerides carry their 1σ errors (a period error grows by one per orbit); a re-centred one only
 *  applies between `from` and `to`. */
export type Ephemeris = { period: number; t0: number; duration: number; sigmaP?: number; sigmaT0?: number; from?: number; to?: number };

/** 1σ uncertainty (days) of an ephemeris' predicted transit time nearest `t`. */
export function ephemerisSigma(e: Pick<Ephemeris, "period" | "t0" | "sigmaP" | "sigmaT0">, t: number): number {
  const n = Math.round((t - e.t0) / e.period);
  return Math.hypot(e.sigmaT0 ?? 0, n * (e.sigmaP ?? 0));
}

/** Catalog ephemerides drift: after a few hundred orbits a TOI's predicted transits can be hours off,
 *  and a mask at the catalog times misses the real transits (which then look like new signals). For
 *  each stretch of data (split at gaps > 30 d) where the prediction is uncertain by more than a quarter
 *  duration, the transit times are re-centred on the data: the shift within ±3σ that puts the deepest
 *  box on the predicted transits (SNR ≥ 7). Not found there: the mask is widened by the uncertainty instead. */
export function refineOnData(s: Series, e: Ephemeris): Ephemeris[] {
  if (s.t.length < 50 || !(e.period > 0)) return [e];
  const out: Ephemeris[] = [];
  let i0 = 0;
  for (let i = 1; i <= s.t.length; i++) {
    if (i < s.t.length && s.t[i] - s.t[i - 1] <= 30) continue;
    const from = s.t[i0], to = s.t[i - 1];
    const sig = ephemerisSigma(e, (from + to) / 2);
    if (3 * sig < e.duration / 4) { out.push({ ...e, from, to }); i0 = i; continue; }
    const t = s.t.subarray(i0, i), f = s.f.subarray(i0, i);
    const reach = Math.min(3 * sig, e.period / 2), step = e.duration / 8;
    const noise = robustStd(f), base = median(f);
    let best = { snr: 0, shift: 0 };
    for (let d = -reach; d <= reach; d += step) {
      let sum = 0, n = 0;
      for (let k = 0; k < t.length; k++) {
        const dt = t[k] - e.t0 - d - Math.round((t[k] - e.t0 - d) / e.period) * e.period;
        if (Math.abs(dt) < e.duration / 2) { sum += f[k]; n++; }
      }
      if (n < 5) continue;
      const snr = ((base - sum / n) / noise) * Math.sqrt(n);
      if (snr > best.snr) best = { snr, shift: d };
    }
    out.push(best.snr >= 7
      ? { ...e, t0: e.t0 + best.shift, from, to, sigmaT0: step, sigmaP: 0 }
      : { ...e, duration: e.duration + 2 * Math.min(3 * sig, e.period / 8), from, to });
    i0 = i;
  }
  return out;
}

/** Drops points within `factor` x half a duration of any listed transit (known planets, or signals
 *  already found), so the next search sees what's left. */
export function maskTransits(s: Series, eph: Ephemeris[], factor = 1.5): Series {
  if (!eph.length) return s;
  const keep: number[] = [];
  for (let i = 0; i < s.t.length; i++) {
    const hit = eph.some((e) => {
      if ((e.from !== undefined && s.t[i] < e.from - e.duration) || (e.to !== undefined && s.t[i] > e.to + e.duration)) return false;
      const dt = s.t[i] - e.t0 - Math.round((s.t[i] - e.t0) / e.period) * e.period;
      return Math.abs(dt) < (factor * e.duration) / 2;
    });
    if (!hit) keep.push(i);
  }
  return { t: Float64Array.from(keep, (i) => s.t[i]), f: Float64Array.from(keep, (i) => s.f[i]) };
}
