// Period recovery for single and duo transits (vetReport.ts): what a researcher does before giving a
// one-off dip up as "period unknown". (1) Look for the same transit again in every TESS sector of
// the star: a repeat of the same depth and duration turns a single into a duo, and a duo into a
// periodic signal. (2) Score each period the TESS coverage still allows against the ZTF archive
// (years of sparse ground photometry): ZTF points that fall in transit at the right period are
// fainter by the transit depth, at the wrong one they aren't. (3) Failing both, a most probable
// period from what's left: the periods the coverage allows, weighted by the transit probability
// and the period the transit's shape implies on this star.
import type { ZtfPoint } from "./archives";
import { sigmaThreshold } from "./robust";
import { median, robustStd, type Series } from "./timeseries";
import { lowerBound, measureEvent } from "./transitFit";

export type RepeatEvent = { t: number; depth: number; err: number; snr: number };

/** Other transits of the same depth and duration anywhere in the light curves: a box scan (step
 *  dur/4) away from the known events, SNR in units of the scan's own red noise, over the
 *  false-alarm threshold for that many trials (1%), and a depth that matches the known dip's. */
export function findRepeats(parts: { flat: Series; cadence: number; beta?: number }[], known: number[], dur: number, depth: number) {
  const step = dur / 4;
  const grid: RepeatEvent[] = [];
  for (const p of parts) {
    const t = p.flat.t;
    if (t.length < 50) continue;
    for (let x = t[0] + dur / 2; x < t[t.length - 1] - dur / 2; x += step) {
      if (known.some((k) => Math.abs(x - k) < 1.5 * dur)) continue;
      const m = measureEvent(p.flat, x, dur, p.cadence, p.beta ?? 1);
      if (m && m.coverage >= 0.8) grid.push({ t: x, depth: m.depth, err: m.err, snr: m.snr });
    }
  }
  if (grid.length < 30) return { events: [] as RepeatEvent[], threshold: NaN, fred: NaN, days: 0 };
  // Red noise the per-cadence errors miss: the spread of the scan's own SNRs (1 for white noise).
  const sn = grid.map((g) => g.snr);
  const fred = Math.max(1, robustStd(sn));
  const days = grid.length * step, trials = Math.max(1, Math.round(days / dur));
  const threshold = Math.max(7, sigmaThreshold(0.01 / trials));
  const same = (g: RepeatEvent) => Math.abs(g.depth - depth) < 3 * Math.hypot(g.err * fred, 0.15 * depth);
  // A box on the edge of a much deeper eclipse matches the depth too: anything near one is part of it.
  const deep = grid.filter((g) => g.depth > 2.5 * depth && g.snr / fred >= threshold).map((g) => g.t).sort((a, b) => a - b);
  const nearDeep = (t: number) => { const i = lowerBound(deep, t - 3 * dur); return i < deep.length && deep[i] <= t + 3 * dur; };
  const hits = grid.filter((g) => g.snr / fred >= threshold && same(g) && !nearDeep(g.t)).sort((a, b) => b.snr - a.snr);
  const events: RepeatEvent[] = [];
  for (const h of hits) if (!events.some((e) => Math.abs(e.t - h.t) < 2 * dur)) events.push(h);
  return { events: events.sort((a, b) => a.t - b.t), threshold, fred, days };
}

/** The periods through the known transit that explain the most repeats: each candidate (a repeat's
 *  spacing from the known transit over 1..n) is checked at every transit it predicts with data, by
 *  `measure`: a hit is a dip at about the known depth (3σ), a miss a confident non-detection (under
 *  30% of the depth where 3σ would show it). Periods with a miss are dropped; of the rest, those with
 *  the most hits (2 or more, the known one included). Several left means the period is still one of
 *  those aliases (their extra transits fall in gaps). */
export function bestPeriods(t1: number, repeats: number[], depth: number, minPeriod: number, span: [number, number], measure: (t: number) => { depth: number; err: number; snr: number; coverage: number } | null, maxN = 400) {
  const cands = new Set<number>();
  for (const e of repeats) for (let n = 1; Math.abs(e - t1) / n >= minPeriod && n <= maxN; n++) cands.add(Math.abs(e - t1) / n);
  const scored: { period: number; hits: number[]; misses: number }[] = [];
  for (const P of cands) {
    const hits: number[] = [];
    let misses = 0;
    for (let k = Math.ceil((span[0] - t1) / P); t1 + k * P <= span[1] && !misses; k++) {
      const t = t1 + k * P, m = measure(t);
      if (!m || m.coverage < 0.8) continue;
      if (Math.abs(m.depth - depth) < 3 * Math.hypot(m.err, 0.15 * depth) && m.snr >= 3) hits.push(t);
      else if (depth / m.err >= 3 && m.depth < 0.3 * depth) misses++;
    }
    if (!misses && hits.length >= 2) scored.push({ period: P, hits, misses });
  }
  const most = Math.max(0, ...scored.map((x) => x.hits.length));
  // Candidates from different repeats land on the same solution with slightly different periods:
  // one per set of transits hit, its period refitted to them (least squares, epoch vs time).
  const out: { period: number; hits: number[]; misses: number }[] = [];
  for (const x of scored.filter((y) => y.hits.length === most).sort((a, b) => b.period - a.period)) {
    const ks = x.hits.map((t) => Math.round((t - t1) / x.period));
    const mk = ks.reduce((a, b) => a + b, 0) / ks.length, mt = x.hits.reduce((a, b) => a + b, 0) / ks.length;
    const sxx = ks.reduce((a, k) => a + (k - mk) ** 2, 0);
    const P = sxx > 0 ? ks.reduce((a, k, i) => a + (k - mk) * (x.hits[i] - mt), 0) / sxx : x.period;
    const same = (o: { hits: number[] }) => o.hits.length === x.hits.length && o.hits.every((t, i) => Math.abs(t - x.hits[i]) < 0.5);
    if (!out.some(same)) out.push({ ...x, period: P });
  }
  return out;
}

/** Covered ranges merged across small gaps (sorted). */
export function mergeCoverage(coverage: [number, number][], gap = 0.2) {
  return [...coverage].sort((a, b) => a[0] - b[0]).reduce<[number, number][]>((acc, [a, b]) => {
    const last = acc[acc.length - 1];
    if (last && a - last[1] <= gap) last[1] = Math.max(last[1], b); else acc.push([a, b]);
    return acc;
  }, []);
}

/** Whether TESS would have seen another transit at period P through `t0` (a whole one inside the
 *  coverage, other than at the listed event times). */
export function coverageAllows(P: number, t0: number, dur: number, cov: [number, number][], seen: number[] = []) {
  for (const [a, b] of cov) {
    for (let k = Math.ceil((a + dur / 2 - t0) / P); t0 + k * P <= b - dur / 2; k++) {
      const t = t0 + k * P;
      if (!seen.some((x) => Math.abs(x - t) < dur)) return false;
    }
  }
  return true;
}

/** Periods through every event time (each an integer number of periods from the first, to within
 *  half a duration) that predict no transit TESS watched for and didn't see: the longest first
 *  is the spacing itself, then its integer fractions. */
export function eventAliases(times: number[], dur: number, coverage: [number, number][], minPeriod = 0.5, max = 2000) {
  const ts = [...times].sort((a, b) => a - b), t0 = ts[0], span = ts[ts.length - 1] - t0;
  const cov = mergeCoverage(coverage);
  const out: number[] = [];
  for (let n = 1; span / n >= minPeriod && out.length < max; n++) {
    let P = span / n;
    // Every event on an integer epoch of this period, then the period refitted to all of them.
    const ks = ts.map((t) => Math.round((t - t0) / P));
    if (ts.some((t, i) => Math.abs(t - t0 - ks[i] * P) > dur / 2)) continue;
    if (ts.length > 2) {
      const mk = ks.reduce((a, b) => a + b, 0) / ks.length, mt = ts.reduce((a, b) => a + b, 0) / ts.length;
      const sxx = ks.reduce((a, k) => a + (k - mk) ** 2, 0);
      if (sxx > 0) P = ks.reduce((a, k, i) => a + (k - mk) * (ts[i] - mt), 0) / sxx;
    }
    if (coverageAllows(P, t0, dur, cov, ts)) out.push(P);
  }
  return out;
}

// ── ZTF ──

/** ZTF points as fractional dimming against each field/CCD/band's own median (positive = fainter),
 *  with errors that include the scatter the pipeline errors miss. Sorted by time. */
export type ZtfSeries = { t: Float64Array; r: Float64Array; w: Float64Array };
export function ztfSeries(pts: ZtfPoint[]): ZtfSeries | null {
  const groups = new Map<string, ZtfPoint[]>();
  for (const p of pts) { const k = `${p.band}:${p.oid}`; groups.set(k, [...(groups.get(k) ?? []), p]); }
  const rows: { t: number; r: number; w: number }[] = [];
  for (const ps of groups.values()) {
    if (ps.length < 20) continue;
    const m = median(ps.map((p) => p.mag));
    const r = ps.map((p) => 1 - 10 ** (-0.4 * (p.mag - m)));
    const e = ps.map((p) => 0.921 * p.err);
    const extra2 = Math.max(0, robustStd(r) ** 2 - median(e) ** 2);
    ps.forEach((p, i) => rows.push({ t: p.t, r: r[i], w: 1 / (e[i] ** 2 + extra2) }));
  }
  if (rows.length < 30) return null;
  rows.sort((a, b) => a.t - b.t);
  return { t: Float64Array.from(rows, (x) => x.t), r: Float64Array.from(rows, (x) => x.r), w: Float64Array.from(rows, (x) => x.w) };
}

/** ZTF at one period through t0: the in-transit points' weighted mean dimming (points within
 *  0.4 T14 of a predicted mid-time), Δχ² of that box against none (signed: < 0 if brighter), how
 *  many transits (epochs) have points, and Δχ² without the epoch that contributes most. */
export type ZtfScore = { period: number; depth: number; err: number; dchi2: number; points: number; epochs: number; dchi2Drop: number };
export function ztfScore(z: ZtfSeries, P: number, t0: number, T14: number): ZtfScore {
  const half = 0.4 * T14, t = z.t;
  let sw = 0, swr = 0, points = 0, epochs = 0;
  let bigW = 0, bigWr = 0, big = -Infinity;
  const nLo = Math.ceil((t[0] - half - t0) / P), nHi = Math.floor((t[t.length - 1] + half - t0) / P);
  for (let n = nLo; n <= nHi; n++) {
    const tc = t0 + n * P;
    let ew = 0, ewr = 0;
    for (let i = lowerBound(t, tc - half); i < t.length && t[i] <= tc + half; i++) { ew += z.w[i]; ewr += z.w[i] * z.r[i]; points++; }
    if (!ew) continue;
    epochs++; sw += ew; swr += ewr;
    if (ewr > big) { big = ewr; bigW = ew; bigWr = ewr; }
  }
  const signed = (w: number, wr: number) => (w > 0 ? Math.sign(wr) * (wr * wr) / w : 0);
  return { period: P, depth: sw ? swr / sw : 0, err: sw ? 1 / Math.sqrt(sw) : Infinity, dchi2: signed(sw, swr), points, epochs, dchi2Drop: signed(sw - bigW, swr - bigWr) };
}

/** A transit of depth ≥ half the TESS one is ruled out at this period by ZTF (3σ), assuming the
 *  dip is on the target (ZTF resolves neighbours TESS blends, so on-target dips are no shallower). */
export const ztfExcludes = (s: ZtfScore, depth: number) => s.points > 0 && (0.5 * depth - s.depth) / s.err > 3;
/** A detection: over the false-alarm threshold for `trials` periods (1%), not resting on one night,
 *  in 2+ transits, and at a depth a diluted-in-TESS transit could have. */
export const ztfDetects = (s: ZtfScore, depth: number, trials: number) =>
  s.dchi2 >= Math.max(16, sigmaThreshold(0.01 / Math.max(1, trials)) ** 2) && s.dchi2Drop >= 9 && s.epochs >= 2 && s.depth > 0.5 * depth && s.depth < 3 * depth;

/** Periods for a single transit's search: log-spaced so a transit at the farthest data point moves
 *  by at most T14/4 between neighbours, capped at `maxPoints` (coarser if it would be more). */
export function periodGrid(pMin: number, pMax: number, T14: number, reach: number, maxPoints = 300_000) {
  if (!(pMax > pMin) || !(pMin > 0)) return [];
  let f = 1 + T14 / 4 / Math.max(reach, 1);
  if (Math.log(pMax / pMin) / Math.log(f) > maxPoints) f = Math.exp(Math.log(pMax / pMin) / maxPoints);
  const out: number[] = [];
  for (let p = pMin; p <= pMax; p *= f) out.push(p);
  return out;
}

/** A single transit's period searched in ZTF over `grid` (periods with `allowed` false skipped):
 *  the periods ZTF rules out, the best detection, and other distinct periods ZTF likes about as
 *  well (Δχ² within 9: then the period isn't unique yet). */
export function ztfSearch(z: ZtfSeries, t1: number, T14: number, depth: number, grid: number[], allowed: boolean[]) {
  const sc = grid.map((p, i) => (allowed[i] ? ztfScore(z, p, t1, T14) : null));
  const excluded = sc.map((s) => !!s && ztfExcludes(s, depth));
  // Neighbouring grid periods overlap by design (T14/4 steps at the farthest point): ~2 per independent one.
  const trials = Math.max(1, allowed.filter(Boolean).length / 2);
  let best: ZtfScore | undefined;
  for (const s of sc) if (s && ztfDetects(s, depth, trials) && (!best || s.dchi2 > best.dchi2)) best = s;
  if (!best) return { excluded, best, rivals: [] as ZtfScore[] };
  const b = best;
  const near = sc.filter((s): s is ZtfScore => !!s && Math.abs(s.period / b.period - 1) > 0.002 && s.dchi2 > b.dchi2 - 9 && s.epochs >= 2);
  const rivals = near.filter((s, i) => near.findIndex((x) => Math.abs(x.period / s.period - 1) < 0.002) === i);
  return { excluded, best, rivals };
}

export type PeriodPosterior = { median: number; lo: number; hi: number; allowedFrac: number; ztfExcludedFrac: number };
/** Most probable period of a single transit from the periods still allowed: the geometric transit
 *  probability (∝ P^-2/3, per log period with occurrence flat in log P) times, with a shape estimate,
 *  a log-normal around it (σ ~0.8 in ln P: eccentricity makes the shape period uncertain by ~2x).
 *  Median and the 16-84% range. */
export function periodPosterior(grid: number[], allowed: boolean[], ztfOut: boolean[], pShape?: number): PeriodPosterior | null {
  const w = grid.map((p, i) => (allowed[i] && !ztfOut[i] ? p ** (-2 / 3) * (pShape ? Math.exp(-0.5 * (Math.log(p / pShape) / 0.8) ** 2) : 1) : 0));
  const total = w.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const q = (x: number) => { let s = 0; for (let i = 0; i < grid.length; i++) { s += w[i]; if (s >= x * total) return grid[i]; } return grid[grid.length - 1]; };
  const nA = allowed.filter(Boolean).length;
  return { median: q(0.5), lo: q(0.16), hi: q(0.84), allowedFrac: nA / grid.length, ztfExcludedFrac: nA ? allowed.filter((a, i) => a && ztfOut[i]).length / nA : 0 };
}
