// The CPU-heavy part of searching one season (transit search, single dips, variability, coverage), kept
// apart so it can run on a worker thread (searchWorker.ts) as well as inline: it imports no network,
// store or Claude code.
import { analyseStar, forcedCheck, type StarAnalysis } from "./analysis";
import type { LightCurve } from "./lightcurves";
import type { Ephemeris } from "./timeseries";
import type { ForcedCheck, TransitSignal } from "./types";

export type SeasonSearch = { analysis: StarAnalysis; coverage: [number, number][] };
export type SeasonLcs = Pick<LightCurve, "time" | "flux" | "quality">[];

/** Time ranges (BTJD) with good data; gaps longer than `gap` days split them. */
export function coverageOf(lcs: SeasonLcs, gap = 0.15): [number, number][] {
  const t: number[] = [];
  for (const lc of lcs) for (let i = 0; i < lc.time.length; i++) if (Number.isFinite(lc.time[i]) && Number.isFinite(lc.flux[i]) && !lc.quality[i]) t.push(lc.time[i]);
  t.sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const x of t) {
    const last = out[out.length - 1];
    if (last && x - last[1] <= gap) last[1] = x;
    else out.push([x, x]);
  }
  return out.filter(([a, b]) => b - a > 0.05).map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]);
}

export function searchLightCurves(lcs: SeasonLcs, masks: Ephemeris[]): SeasonSearch {
  return { analysis: analyseStar(lcs, masks), coverage: coverageOf(lcs) };
}

/** Forced checks: this season's light curves fitted at periods other seasons found (a target that can't be
 *  fitted is left out). */
export function forcedChecks(lcs: SeasonLcs, targets: TransitSignal[]): ForcedCheck[] {
  return targets.flatMap((t) => {
    try { return [forcedCheck(lcs, t)]; } catch { return []; }
  });
}
