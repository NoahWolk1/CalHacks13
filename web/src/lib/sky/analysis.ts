// Light-curve analysis agents: a discovery pipeline over real TESS light curves of the cone's stars
// (fetched from MAST, never synthesised). In order:
//  - Strategist: ranks every star with a light curve by where something new can still be found and
//    gives each pick a playbook (strategy.ts); Claude makes the plan when available.
//  - Light Curves: downloads the sectors each playbook asks for (lightcurves.ts: sectorsFor), stitched
//    into one series; other sectors are held out for the Follow-up agent.
//  - Transit Hunter: masks known planets' transits, then iterative Box Least Squares: search, cut out
//    what passed, search again (bls.ts: searchSignals), so siblings of known planets can show.
//  - Single-Transit Hunter: lone transit-shaped dips the periodic search can't see (singles.ts).
//  - Variability: Lomb-Scargle on the un-flattened series (lombscargle.ts).
//  - Vetter: eclipsing-binary, duration and contamination checks plus cross-matches against the NASA
//    Exoplanet Archive, the TOI list, SIMBAD binaries and AAVSO VSX (vetting.ts).
//  - Variable Census: variables and binaries no catalog lists are reported as new (vsx.ts).
//  - Follow-up: the Strategist reviews the finds and picks tests: re-run a signal on a held-out sector,
//    or extend a star's search with more sectors.
// Bounded for serverless: a capped star count, a few downloads at a time, and a wall-clock budget
// after which remaining work is skipped (reported, not hidden).
import { bls, BLS_MIN_SNR, blsDetected, bothPhases, searchSignals, type BlsResult } from "./bls";
import { fieldInventory, fetchLightCurve, LC_TIMEOUT_MS, sectorsFor, type LcProduct, type LightCurve } from "./lightcurves";
import { isVariable, lombScargle, prewhiten, variabilityClass, type LsResult } from "./lombscargle";
import { LABEL as OTYPE_LABEL } from "./simbad";
import { singleEvents, type SingleEvent } from "./singles";
import {
  acceptPlan, claudePlan, claudeReview, heuristicFollowups, heuristicPlan, heuristicStrategy, PLAYBOOK_LABEL, PLAYBOOK_SECTORS, prospects,
  type FollowAction, type Followable, type PlanPick,
} from "./strategy";
import { binSeries, cleanSeries, clipUpper, flatten, maskTransits, stitch, trimGaps, type Ephemeris, type Series } from "./timeseries";
import { CONTAM_ARCMIN, ebNeighbours, impliedRadiusEarth, knownPlanetsNear, MAX_PLANET_REARTH, periodsMatch, toisNear, vetSignal, type KnownSignal, type Verdict } from "./vetting";
import { VARIABLE_OTYPES, variablesNear, vsxEntry, type VsxStar } from "./vsx";
import { separation } from "./geom";
import { isNewFind as isNew, type AnalysisStar, type Cone, type SkyAgentReport, type SkyAnalysis, type SkyEvent, type SkyNote, type SkyObject, type SkyPlan, type StarResult, type TransitSignal } from "./types";

export const ANALYSIS_MAX_STARS = 16;
export const ANALYSIS_CONCURRENCY = 4;
/** Wall-clock budget for the whole analysis, so the summary still fits in the route's maxDuration. */
export const ANALYSIS_BUDGET_MS = 150_000;
/** Light curves are binned to this cadence (days) before searching: 10 min keeps 1-hour transits resolved. */
export const BIN_DAYS = 10 / 1440;
/** Stitched sectors are binned coarser (20 min) so the much finer period grid they need stays affordable. */
export const BIN_DAYS_MULTI = 20 / 1440;
/** Running-median window (days): transits up to ~8 h survive a 1-day window. */
export const FLATTEN_DAYS = 1;
export const FOLLOWUP_MAX = 5;
const PLAN_TIMEOUT_MS = 25_000;
const REVIEW_TIMEOUT_MS = 20_000;

export const ANALYSIS_AGENTS: { id: SkyAgentReport["agent"]; label: string }[] = [
  { id: "strategist", label: "Strategist" },
  { id: "lightcurves", label: "Light Curves (MAST TESS)" },
  { id: "transits", label: "Transit Hunter (iterative BLS)" },
  { id: "singles", label: "Single-Transit Hunter" },
  { id: "variability", label: "Variability (Lomb-Scargle)" },
  { id: "vetting", label: "Vetter (cross-match)" },
  { id: "census", label: "Variable Census (AAVSO VSX)" },
  { id: "followup", label: "Follow-up (held-out sectors)" },
];

export type StarAnalysis = { points: number; days: number; transit?: BlsResult; signals: BlsResult[]; singles: SingleEvent[]; ls: LsResult; prewhitened: number[] };

/** Variability faster than this survives the 1-day flattening and is prewhitened before the transit search. */
export const PREWHITEN_BELOW_DAYS = 1.5;

const prepare = (lc: Pick<LightCurve, "time" | "flux" | "quality">, bin: number) => trimGaps(binSeries(cleanSeries(lc.time, lc.flux, lc.quality), bin));

/** Lomb-Scargle on the cleaned series, then the series the transit searches see: fast pulsations
 *  prewhitened, slow variability flattened out, flares clipped. */
function searchable(s: Series) {
  // Periods past ~13 d in raw flux are mostly TESS's orbit-scale systematics.
  const ls = lombScargle(s, { maxPeriod: 13 });
  const pw = isVariable(ls) && ls.period < PREWHITEN_BELOW_DAYS ? prewhiten(s, { maxPeriod: PREWHITEN_BELOW_DAYS }) : { series: s, removed: [] };
  return { ls, flat: clipUpper(flatten(pw.series, FLATTEN_DAYS)), removed: pw.removed };
}

/** The per-star pipeline (pure, CPU only) over one or more sectors: clean, bin, trim ramps and stitch;
 *  Lomb-Scargle on that; flatten and clip flares; iterative BLS with known transits masked; then a
 *  single-transit search on what's left once every passing signal is cut out too. */
export function analyseStar(parts: Pick<LightCurve, "time" | "flux" | "quality">[], mask: Ephemeris[] = []): StarAnalysis {
  const bin = parts.length > 1 ? BIN_DAYS_MULTI : BIN_DAYS;
  const errors: string[] = [];
  const series = parts.flatMap((lc) => { try { return [prepare(lc, bin)]; } catch (e) { errors.push((e as Error).message); return []; } });
  const s = stitch(series);
  if (s.t.length < 200) throw new Error(errors[0] ?? `only ${s.t.length} good cadences`);
  const days = s.t[s.t.length - 1] - s.t[0];
  const { ls, flat, removed } = searchable(s);
  if (flat.t.length < 50) throw new Error("light curve too short for a transit search");
  // Empty when every peak was the residue of a masked known planet.
  const signals = searchSignals(flat, { mask, maxSignals: 3 });
  const passed = signals.filter(blsDetected);
  const singles = singleEvents(maskTransits(flat, [...mask, ...passed].flatMap(bothPhases)));
  return { points: s.t.length, days, transit: passed[0] ?? signals[0], signals: passed, singles, ls, prewhitened: removed };
}

/** One sector, no masking (kept for the single-light-curve tests and callers). */
export function analyseLightCurve(lc: Pick<LightCurve, "time" | "flux" | "quality">): StarAnalysis {
  return analyseStar([lc]);
}

const r3 = (n: number) => +n.toPrecision(3);
const exofop = (tic: string) => `https://exofop.ipac.caltech.edu/tess/target.php?id=${tic}`;
const sig = (t: BlsResult): TransitSignal => ({ period: t.period, t0: t.t0, duration: t.duration, depth: t.depth, snr: t.snr, sde: t.sde, transits: t.transits, oddEven: t.oddEven, oddEvenSigma: t.oddEvenSigma, secondary: t.secondary, secondarySigma: t.secondarySigma, detected: blsDetected(t) });

function toStarResult(tic: string, a: StarAnalysis, ms: number): StarResult {
  return {
    tic, status: "ok", points: a.points, days: +a.days.toFixed(1), ms,
    ...(a.transit ? { transit: sig(a.transit) } : {}), signals: a.signals.map(sig), singles: a.singles.map((e) => ({ t: e.t, duration: e.duration, depth: e.depth, snr: e.snr })),
    variability: { period: a.ls.period, amplitude: a.ls.amplitude, power: a.ls.power, fap: a.ls.fap, variable: isVariable(a.ls) },
  };
}

const lcLabel = (star: AnalysisStar) => `TESS ${star.pipeline} sector${star.sectors.length > 1 ? "s" : ""} ${star.sectors.join(", ")}`;

/** Transit-signal result (C id) carrying the Vetter's verdict. */
export function signalObject(id: string, star: AnalysisStar, t: TransitSignal, v: Verdict, starRadius?: number): SkyObject {
  const rp = impliedRadiusEarth(t.depth, starRadius);
  const props: Record<string, string | number> = {
    verdict: v.label,
    status: v.kind === "candidate" ? "unvetted candidate: needs follow-up, not a confirmed planet" : v.kind === "new-eb" ? "not in any variable-star catalog checked: a new eclipsing binary if it holds up" : "rejected as a new candidate",
    vetting: v.reasons.join("; "),
    TIC: star.tic,
    "period (days)": +t.period.toFixed(4),
    "depth (ppt)": r3(t.depth * 1000),
    "duration (hours)": +(t.duration * 24).toFixed(2),
    SNR: +t.snr.toFixed(1),
    SDE: +t.sde.toFixed(1),
    "transits observed": t.transits,
    "odd/even mismatch (σ)": +t.oddEvenSigma.toFixed(1),
    "secondary eclipse (σ)": +t.secondarySigma.toFixed(1),
    "first transit (BTJD)": +t.t0.toFixed(4),
    "light curve": lcLabel(star),
    playbook: PLAYBOOK_LABEL[star.playbook],
  };
  if (star.masked.length) props["masked before search"] = star.masked.join(", ");
  if (rp) props["implied radius (Earth = 1)"] = r3(rp);
  return {
    id, name: `TIC ${star.tic} · P ${t.period.toFixed(3)} d`, type: v.label, category: "candidate", ra: star.ra, dec: star.dec,
    source: "lightcurves", url: exofop(star.tic), props,
  };
}

export function variableObject(id: string, star: AnalysisStar, v: NonNullable<StarResult["variability"]>, census?: { label: string; reason: string }): SkyObject {
  const props: Record<string, string | number> = {
    TIC: star.tic, "period (days)": r3(v.period), "amplitude (ppt)": r3(v.amplitude * 1000), "LS power": r3(v.power),
    "false-alarm probability": v.fap < 1e-10 ? "< 1e-10" : r3(v.fap), "light curve": lcLabel(star),
  };
  if (star.otype) props["SIMBAD type"] = OTYPE_LABEL[star.otype] ?? star.otype;
  if (census) props.census = census.reason;
  return {
    id, name: `${star.name} (TIC ${star.tic})`, type: census?.label ?? `Variable star: ${variabilityClass(v.period)}`, category: "variable", ra: star.ra, dec: star.dec,
    source: "lightcurves", url: exofop(star.tic), props,
  };
}

/** Single-dip result (C id). */
function singleObject(id: string, star: AnalysisStar, e: NonNullable<StarResult["singles"]>[number], label: string, reason: string, starRadius?: number): SkyObject {
  const rp = impliedRadiusEarth(e.depth, starRadius);
  const props: Record<string, string | number> = {
    verdict: label,
    status: label.startsWith("Single-transit") ? "one dip only: a possible long-period planet or eclipsing binary, needs more data" : "rejected as a new candidate",
    vetting: reason, TIC: star.tic, "time (BTJD)": +e.t.toFixed(3), "depth (ppt)": r3(e.depth * 1000), "duration (hours)": +(e.duration * 24).toFixed(1),
    SNR: +e.snr.toFixed(1), "light curve": lcLabel(star), playbook: PLAYBOOK_LABEL[star.playbook],
  };
  if (rp) props["implied radius (Earth = 1)"] = r3(rp);
  return { id, name: `TIC ${star.tic} · single dip at BTJD ${e.t.toFixed(2)}`, type: label, category: "candidate", ra: star.ra, dec: star.dec, source: "lightcurves", url: exofop(star.tic), props };
}

/** Runs `fn` over items, at most `n` at a time. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

const yieldToLoop = () => new Promise<void>((r) => setImmediate(r));

/** Waits for p up to ms; null on timeout or failure (the error is kept for the agent report). */
async function within<T>(p: Promise<T>, ms: number): Promise<{ v: T | null; err?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const v = await Promise.race([p, new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`timed out after ${Math.round(ms / 1000)}s`)), Math.max(0, ms)); })]);
    return { v };
  } catch (e) {
    return { v: null, err: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/** Downloads products (two at a time), each bounded by the deadline; failures are counted, not fatal. */
async function download(products: LcProduct[], signal: AbortSignal, deadline: number): Promise<{ lcs: LightCurve[]; errors: string[] }> {
  const lcs: LightCurve[] = [], errors: string[] = [];
  await pool(products, 2, async (p) => {
    const limit = Math.min(LC_TIMEOUT_MS, deadline - Date.now());
    if (limit < 1_500 || signal.aborted) { errors.push("time budget used up"); return; }
    // getBuffer retries on timeouts, so its per-attempt timeout alone doesn't bound a download: a
    // hard abort at the limit does.
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ac.abort(), limit);
    try {
      lcs.push(await fetchLightCurve(p, ac.signal, limit));
    } catch (e) {
      errors.push(ac.signal.aborted && !signal.aborted ? `timed out after ${Math.round(limit / 1000)}s` : (e as Error).message.slice(0, 100));
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  });
  return { lcs: lcs.sort((a, b) => a.sector - b.sector), errors };
}


/** Re-tests a periodic signal on independent data: a BLS restricted to ±1% of its period. */
export function recheckSignal(parts: Pick<LightCurve, "time" | "flux" | "quality">[], period: number, depth: number) {
  const { flat } = searchable(stitch(parts.map((lc) => prepare(lc, BIN_DAYS))));
  const r = bls(flat, { minPeriod: period * 0.99, maxPeriod: period * 1.01 });
  const recovered = r.snr >= 6 && r.transits >= 2 && r.depth > 0.4 * depth && r.depth < 2.5 * depth;
  return { recovered, snr: r.snr, depth: r.depth, transits: r.transits };
}

export async function runAnalysis(c: Cone, signal: AbortSignal, emit: (e: SkyEvent) => void, t0 = Date.now(), useClaude: Promise<boolean> = Promise.resolve(false)): Promise<SkyAnalysis> {
  const start = Date.now();
  const deadline = start + ANALYSIS_BUDGET_MS;
  const agents: SkyAgentReport[] = [];
  const notes: SkyNote[] = [];
  const report = (agent: SkyAgentReport["agent"], status: SkyAgentReport["status"], detail: string, ms: number, label?: string) =>
    agents.push({ agent, label: label ?? ANALYSIS_AGENTS.find((a) => a.id === agent)!.label, status, detail, ms });
  const note = (n: SkyNote) => { notes.push(n); emit({ type: "analysis-note", note: n, ms: Date.now() - t0 }); };
  const done = (extra: Partial<SkyAnalysis>): SkyAnalysis => ({ stars: [], results: [], agents, objects: [], candidates: 0, discoveries: 0, notes, ms: Date.now() - start, ...extra });

  // Cross-match lookups start now: the Strategist needs the known planets, TOIs and catalogued variables.
  const known = knownPlanetsNear(c, signal), tois = toisNear(c, signal), neighbours = ebNeighbours(c, signal), vsxP = variablesNear(c, signal);
  [known, tois, neighbours, vsxP].forEach((p) => p.catch(() => {}));

  const inv = await fieldInventory(c, signal);
  const [kp0, ti0, vx0] = await Promise.all([within(known, 8_000), within(tois, 8_000), within(vsxP, 8_000)]);
  const knownAll: KnownSignal[] = [...(kp0.v ?? []), ...(ti0.v ?? [])];
  const vsx: VsxStar[] | undefined = vx0.v ?? undefined;
  const pool0 = prospects(c, inv.stars, inv.products, knownAll, vsx ?? []);
  if (!pool0.length) {
    const msg = inv.stars.length
      ? `None of the ${inv.stars.length} stars found here has a TESS SPOC, TESS-SPOC or QLP light curve at MAST.`
      : "MAST has no TESS SPOC light curves in this cone and SIMBAD lists no bright stars with TIC ids, so there are no light curves to analyse.";
    report("lightcurves", "empty", msg, Date.now() - start);
    return done({ note: msg });
  }

  // ── Strategist: plan ──
  const tp = Date.now();
  let picks: PlanPick[], plan: SkyPlan;
  const top = pool0.slice(0, 40);
  if (await useClaude) {
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal.addEventListener("abort", onAbort);
    const r = await within(claudePlan(c, top, ANALYSIS_MAX_STARS, ac.signal), PLAN_TIMEOUT_MS);
    signal.removeEventListener("abort", onAbort);
    if (!r.v) ac.abort();
    picks = r.v?.picks ?? heuristicPlan(pool0, ANALYSIS_MAX_STARS);
    plan = r.v
      ? { strategy: r.v.strategy, by: "claude", pool: pool0.length }
      : { strategy: heuristicStrategy(picks), by: "heuristic", pool: pool0.length, note: `Claude planning failed (${r.err?.slice(0, 80)}): heuristic plan` };
  } else {
    picks = acceptPlan(pool0, [], ANALYSIS_MAX_STARS);
    plan = { strategy: heuristicStrategy(picks), by: "heuristic", pool: pool0.length };
  }
  const failedPre = [kp0.err && "Exoplanet Archive", ti0.err && "TOI list", vx0.err && "AAVSO VSX"].filter(Boolean);
  report("strategist", "ok", `${plan.by === "claude" ? "Claude planned" : "Heuristic plan:"} ${picks.length} of ${pool0.length} stars with light curves${failedPre.length ? ` (unavailable: ${failedPre.join(", ")})` : ""}`, Date.now() - tp,
    plan.by === "claude" ? "Strategist (Claude)" : "Strategist (heuristic)");
  note({ agent: "strategist", text: plan.strategy });

  const plans = picks.map((p) => {
    const { use, heldOut } = sectorsFor(inv.products, p.prospect.star.tic, PLAYBOOK_SECTORS[p.playbook]);
    const masks = p.prospect.known.filter((k) => k.t0 !== undefined && k.duration !== undefined);
    const star: AnalysisStar = {
      ...p.prospect.star, pipeline: use[0]?.pipeline ?? "", sector: use[use.length - 1]?.sector ?? 0, sectors: use.map((u) => u.sector), heldOut: heldOut.length,
      playbook: p.playbook, why: p.why, masked: masks.map((k) => k.name),
    };
    return { star, use, heldOut, mask: masks.map((k) => ({ period: k.period, t0: k.t0!, duration: k.duration! })), known: p.prospect.known };
  }).filter((p) => p.use.length);
  const stars = plans.map((p) => p.star);
  emit({ type: "analysis-start", stars, plan, ms: Date.now() - t0 });
  const masked = plans.filter((p) => p.mask.length);
  if (masked.length) note({ agent: "transits", text: `Masking ${masked.flatMap((p) => p.star.masked).join(", ")} before searching, so any additional planet in ${masked.length === 1 ? "that system" : "those systems"} can show.` });

  // ── Light Curves + Transit Hunter + Single-Transit Hunter + Variability ──
  const results = new Map<string, StarResult>();
  const analyses = new Map<string, StarAnalysis>();
  const lcsByTic = new Map<string, LightCurve[]>();
  const header = new Map<string, { radius?: number; logg?: number }>();
  let downloaded = 0, files = 0, failed = 0, skipped = 0, cpuMs = 0;
  const tLc = Date.now();
  await pool(plans, ANALYSIS_CONCURRENCY, async ({ star, use, mask }) => {
    const ts = Date.now();
    const finish = (r: StarResult) => { results.set(star.tic, r); emit({ type: "analysis-star", result: r, ms: Date.now() - t0 }); };
    // Leave room for the CPU work, vetting and follow-up after the last download.
    if (signal.aborted || Date.now() > deadline - 30_000) { skipped++; finish({ tic: star.tic, status: "skipped", error: "analysis time budget used up", ms: 0 }); return; }
    const { lcs, errors } = await download(use, signal, deadline - 25_000);
    if (!lcs.length) { failed++; finish({ tic: star.tic, status: "error", error: `download failed: ${errors[0] ?? "unknown"}`, ms: Date.now() - ts }); return; }
    downloaded++; files += lcs.length;
    // Only the sectors that downloaded are in the search.
    star.sectors = lcs.map((l) => l.sector); star.sector = star.sectors[star.sectors.length - 1];
    await yieldToLoop();
    const tc = Date.now();
    try {
      const a = analyseStar(lcs, mask);
      cpuMs += Date.now() - tc;
      lcsByTic.set(star.tic, lcs);
      analyses.set(star.tic, a);
      header.set(star.tic, { radius: lcs.find((l) => l.radius)?.radius, logg: lcs.find((l) => l.logg)?.logg });
      finish(toStarResult(star.tic, a, Date.now() - ts));
    } catch (e) {
      failed++;
      finish({ tic: star.tic, status: "error", error: (e as Error).message.slice(0, 100), ms: Date.now() - ts });
    }
  });
  const ok = [...results.values()].filter((r) => r.status === "ok");
  report("lightcurves", downloaded ? "ok" : "error",
    `${files} light curve${files === 1 ? "" : "s"} of ${downloaded} of ${plans.length} stars downloaded${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped (time budget)` : ""}`, Date.now() - tLc);

  const nSignals = ok.reduce((k, r) => k + (r.signals?.length ?? 0), 0);
  const nSingles = ok.reduce((k, r) => k + (r.singles?.length ?? 0), 0);
  const variables = ok.filter((r) => r.variability?.variable);
  report("transits", ok.length ? "ok" : "error", `iterative BLS on ${ok.length} star${ok.length === 1 ? "" : "s"}${masked.length ? ` (${masked.flatMap((p) => p.star.masked).length} known planets masked)` : ""}; ${nSignals} signal${nSignals === 1 ? "" : "s"} passed SDE ≥ 9, SNR ≥ 7.1, ≥ 2 transits`, cpuMs);
  report("singles", ok.length ? "ok" : "error", `${nSingles} lone transit-shaped dip${nSingles === 1 ? "" : "s"} at ≥ 8σ of the red-noise level`, 0);
  report("variability", ok.length ? "ok" : "error", `Lomb-Scargle: ${variables.length} of ${ok.length} star${ok.length === 1 ? "" : "s"} significantly variable (FAP < 0.1%, ≥ 0.5 ppt)`, 0);

  // ── Vetter ──
  const tv = Date.now();
  const left = nSignals || nSingles ? Math.max(1_500, deadline - 20_000 - Date.now()) : 0;
  const [kp, ti, nb] = await Promise.all([within(known, left), within(tois, left), within(neighbours, left)]);
  const failedXm = [kp.err && "Exoplanet Archive", ti.err && "TOI list", nb.err && "SIMBAD binaries", !vsx && "AAVSO VSX"].filter(Boolean) as string[];
  const byTic = new Map(stars.map((s) => [s.tic, s]));
  const planByTic = new Map(plans.map((p) => [p.star.tic, p]));
  const counts = new Map<string, number>();
  // Every star's strongest dip that is at least SNR-significant (detected or not) counts as a
  // possible source for shared-period and contamination checks.
  const others = ok.flatMap((r) => [...(r.signals?.length ? r.signals : r.transit ? [r.transit] : [])]
    .filter((t) => t.snr >= BLS_MIN_SNR && t.depth > 0)
    .map((t) => ({ tic: r.tic, period: t.period, depth: t.depth, ra: byTic.get(r.tic)!.ra, dec: byTic.get(r.tic)!.dec })));
  const knownSignals = [...(kp.v ?? []), ...(ti.v ?? [])];
  const signalObjs: { o: SkyObject; tic: string; t?: TransitSignal; single?: NonNullable<StarResult["singles"]>[number] }[] = [];
  const vet = (tic: string, t: TransitSignal) => {
    const star = byTic.get(tic)!, h = header.get(tic) ?? {};
    let v = vetSignal(t, { star, starRadius: h.radius, logg: h.logg, known: knownSignals, neighbours: nb.v ?? [], vsx, ls: analyses.get(tic)?.ls, others, unchecked: failedXm });
    const host = planByTic.get(tic)?.known ?? [];
    if (v.kind === "candidate" && host.length) v = { ...v, label: "Candidate additional planet", reasons: [`found after masking ${host.map((k) => k.name).join(", ")}: a possible sibling in a known system`, ...v.reasons] };
    return v;
  };
  for (const r of ok) {
    for (const t of r.signals ?? []) {
      const v = vet(r.tic, t);
      counts.set(v.kind, (counts.get(v.kind) ?? 0) + 1);
      signalObjs.push({ o: signalObject("", byTic.get(r.tic)!, t, v, header.get(r.tic)?.radius), tic: r.tic, t });
    }
  }
  // Single dips: systematics show up at the same moment on several stars; very deep dips are stars.
  const allSingles = ok.flatMap((r) => (r.singles ?? []).map((e) => ({ tic: r.tic, e })));
  let nSingleNew = 0;
  for (const { tic, e } of allSingles) {
    const star = byTic.get(tic)!, h = header.get(tic) ?? {};
    const sameTime = allSingles.filter((x) => x.tic !== tic && Math.abs(x.e.t - e.t) < 0.5).length;
    const rp = impliedRadiusEarth(e.depth, h.radius);
    let label = "Single-transit event", reason = "one transit-shaped dip, no repeat in the sectors searched";
    if (sameTime) { label = "Likely systematic (simultaneous dips)"; reason = `${sameTime} other star${sameTime === 1 ? "" : "s"} dip at the same time: spacecraft or scattered light, not the star`; }
    else if (e.depth > 0.03 || (rp && rp > MAX_PLANET_REARTH)) {
      // Star-sized: an eclipsing binary. New if no catalog lists the star (or a neighbour at the same time) as variable.
      const own = vsx ? vsxEntry(star, vsx) : undefined;
      const deep = `${(e.depth * 100).toFixed(1)}% deep${rp ? `, implied radius ${rp.toFixed(0)} R⊕` : ""}: star-sized`;
      if (vsx && !own && !VARIABLE_OTYPES.has(star.otype)) { label = "Uncatalogued eclipsing binary (single eclipse)"; reason = `${deep}; not in AAVSO VSX or SIMBAD as a variable star`; }
      else { label = "Single eclipse (likely a stellar companion)"; reason = own ? `${deep}; VSX lists the star as ${own.name} (${own.type})` : deep; }
    }
    else if (failedXm.length) reason += `; not checked against ${failedXm.join(" or ")}`;
    if (label.startsWith("Single-transit") || label.startsWith("Uncatalogued")) nSingleNew++;
    signalObjs.push({ o: singleObject("", star, e, label, reason, h.radius), tic, single: e });
  }
  const order = ["Unvetted", "Candidate additional", "Single-transit", "Uncatalogued", "Known planet", "Known TOI", "Light from"];
  const rank = (o: SkyObject) => { const k = order.findIndex((p) => o.type.startsWith(p)); return k < 0 ? order.length : k; };
  signalObjs.sort((a, b) => rank(a.o) - rank(b.o) || Number(b.o.props.SNR) - Number(a.o.props.SNR));
  signalObjs.forEach((s, i) => (s.o.id = `C${i + 1}`));
  const LABELS: [string, string, string][] = [
    ["candidate", "unvetted candidate", "unvetted candidates"], ["new-eb", "uncatalogued eclipsing binary", "uncatalogued eclipsing binaries"],
    ["known-planet", "known planet recovered", "known planets recovered"], ["known-toi", "known TOI recovered", "known TOIs recovered"],
    ["contamination", "signal leaking from a neighbour", "signals leaking from neighbours"], ["eclipsing-binary", "likely eclipsing binary", "likely eclipsing binaries"],
    ["variability", "harmonic of stellar variability", "harmonics of stellar variability"], ["systematic", "likely systematic", "likely systematics"],
  ];
  const parts = LABELS.flatMap(([k, one, many]) => { const n = counts.get(k) ?? 0; return n ? [`${n} ${n === 1 ? one : many}`] : []; });
  if (nSingles) parts.push(`${nSingleNew} of ${nSingles} single dip${nSingles === 1 ? "" : "s"} kept as new (single transits or uncatalogued eclipses)`);
  report("vetting", nSignals + nSingles && failedXm.length >= 4 ? "error" : nSignals + nSingles ? "ok" : "empty",
    nSignals + nSingles ? `${parts.join(", ")}${failedXm.length ? ` (cross-match unavailable: ${failedXm.join(", ")})` : ""}` : "no transit signals to vet", Date.now() - tv);

  // ── Variable Census ──
  const tcn = Date.now();
  const lsPeriods = variables.map((r) => ({ tic: r.tic, p: r.variability!.period }));
  let uncatalogued = 0;
  const varObjs = variables.map((r, i) => {
    const star = byTic.get(r.tic)!, v = r.variability!;
    const own = vsx ? vsxEntry(star, vsx) : undefined;
    const shared = lsPeriods.filter((x) => x.tic !== r.tic && Math.abs(x.p / v.period - 1) < 0.02).length;
    const near = (vsx ?? []).find((x) => x !== own && x.period && periodsMatch(v.period, x.period, 0.02) && separation(x.ra, x.dec, star.ra, star.dec) * 60 <= CONTAM_ARCMIN);
    let census: { label: string; reason: string };
    if (own) census = { label: `Catalogued variable: ${own.name} (${own.type})`, reason: `AAVSO VSX lists it${own.period ? ` with P ${own.period} d${periodsMatch(v.period, own.period, 0.03) ? ", which this period matches" : ", unlike this period"}` : ""}` };
    else if (VARIABLE_OTYPES.has(star.otype)) census = { label: `Catalogued variable (SIMBAD: ${OTYPE_LABEL[star.otype] ?? star.otype})`, reason: "SIMBAD already types the star as variable" };
    else if (near) census = { label: `Light from ${near.name}`, reason: `VSX variable ${near.name} (${near.type}, P ${near.period} d) is ${(separation(near.ra, near.dec, star.ra, star.dec) * 60).toFixed(1)}′ away at this period` };
    else if (shared >= 2) census = { label: "Likely systematic variability", reason: `${shared} other stars vary at the same period: instrumental` };
    else if (!vsx) census = { label: `Variable star: ${variabilityClass(v.period)}`, reason: "AAVSO VSX unavailable this run: can't say whether it's catalogued" };
    else if (v.period * 3 > (r.days ?? 27)) census = { label: `Variable star: ${variabilityClass(v.period)}`, reason: "not in VSX or SIMBAD, but the period is too long for the baseline to call it a new periodic variable" };
    else { uncatalogued++; census = { label: `Uncatalogued variable: ${variabilityClass(v.period)}`, reason: "not in AAVSO VSX or SIMBAD as a variable: a new variable star if it holds up (submit to VSX)" }; }
    return variableObject(`V${i + 1}`, star, v, census);
  });
  const newEb = counts.get("new-eb") ?? 0;
  report("census", !vsx ? "error" : "ok", !vsx ? `AAVSO VSX lookup failed (${vx0.err?.slice(0, 60)})` : `${vsx.length} catalogued variables in the field; ${uncatalogued} uncatalogued variable${uncatalogued === 1 ? "" : "s"}, ${newEb} uncatalogued eclipsing binar${newEb === 1 ? "y" : "ies"}`, Date.now() - tcn);

  const objects = [...signalObjs.map((s) => s.o), ...varObjs];

  // ── Strategist review + Follow-up ──
  const tf = Date.now();
  const sigByObj = new Map(signalObjs.map((s) => [s.o.id, s]));
  const followable: Followable[] = objects.filter(isNew).map((o) => {
    const p = planByTic.get(String(o.props.TIC))!;
    const s = sigByObj.get(o.id);
    const period = s?.t?.period ?? (o.category === "variable" ? Number(o.props["period (days)"]) : undefined);
    return { object: o, canRecheck: !!period && period <= 13 && p.heldOut.length > 0, canExtend: p.heldOut.length > 0 };
  });
  let actions: FollowAction[] = [];
  if (followable.length && Date.now() < deadline - 15_000) {
    const lines = objects.map((o) => `[${o.id}] ${o.name}: ${o.type} · ${Object.entries(o.props).filter(([k]) => !["light curve", "status"].includes(k)).map(([k, v]) => `${k}=${v}`).join("; ")}`).join("\n");
    let byClaude = false;
    if (await useClaude) {
      const r = await within(claudeReview(lines, followable, FOLLOWUP_MAX, signal), Math.min(REVIEW_TIMEOUT_MS, deadline - 12_000 - Date.now()));
      if (r.v) {
        byClaude = true;
        actions = r.v.actions;
        r.v.notes.forEach((n) => note({ agent: "strategist", text: n.text, ids: n.ids }));
      }
    }
    if (!byClaude) actions = heuristicFollowups(followable, FOLLOWUP_MAX);
    if (actions.length) note({ agent: "strategist", text: `Follow-up ordered: ${actions.map((a) => `${a.action} ${a.id} (${a.why})`).join("; ")}`, ids: actions.map((a) => a.id) });
  }
  let rechecked = 0, recovered = 0, extended = 0;
  for (const a of actions) {
    if (signal.aborted || Date.now() > deadline - 6_000) { note({ agent: "followup", text: `Skipped ${a.action} ${a.id}: time budget used up`, ids: [a.id] }); continue; }
    const o = objects.find((x) => x.id === a.id)!;
    const tic = String(o.props.TIC);
    const p = planByTic.get(tic)!;
    const s = sigByObj.get(a.id);
    if (a.action === "recheck") {
      const { lcs } = await download(p.heldOut.slice(0, 1), signal, deadline - 4_000);
      if (!lcs.length) { note({ agent: "followup", text: `Couldn't download a held-out sector for ${a.id}`, ids: [a.id] }); continue; }
      await yieldToLoop();
      rechecked++;
      const sector = lcs[0].sector;
      try {
        if (o.category === "variable") {
          const s2 = prepare(lcs[0], BIN_DAYS);
          const ls = lombScargle(s2, { maxPeriod: 13 });
          const P = Number(o.props["period (days)"]);
          const ok2 = isVariable(ls) && periodsMatch(ls.period, P, 0.03);
          if (ok2) recovered++;
          o.props["follow-up"] = ok2 ? `recovered in held-out sector ${sector} (P ${r3(ls.period)} d)` : `not recovered in held-out sector ${sector} (strongest P ${r3(ls.period)} d)`;
        } else if (s?.t) {
          const r = recheckSignal(lcs, s.t.period, s.t.depth);
          if (r.recovered) recovered++;
          o.props["follow-up"] = r.recovered
            ? `recovered in held-out sector ${sector}: SNR ${r.snr.toFixed(1)}, depth ${r3(r.depth * 1000)} ppt, ${r.transits} transits`
            : `not recovered in held-out sector ${sector} (SNR ${r.snr.toFixed(1)} at this period): may be a false alarm`;
        }
        if (o.props["follow-up"]) {
          if (String(o.props["follow-up"]).startsWith("recovered")) o.type += " · recovered in an independent sector";
          note({ agent: "followup", text: `${a.id}: ${o.props["follow-up"]}`, ids: [a.id] });
        }
      } catch (e) {
        note({ agent: "followup", text: `${a.id}: recheck failed (${(e as Error).message.slice(0, 80)})`, ids: [a.id] });
      }
    } else {
      // extend: more sectors of the star, then a fresh search over everything.
      const more = p.heldOut.filter((h) => !(lcsByTic.get(tic) ?? []).some((l) => l.sector === h.sector)).slice(0, 3);
      const { lcs } = await download(more, signal, deadline - 4_000);
      if (!lcs.length) { note({ agent: "followup", text: `Couldn't download more sectors for ${a.id}`, ids: [a.id] }); continue; }
      await yieldToLoop();
      extended++;
      const all = [...(lcsByTic.get(tic) ?? []), ...lcs];
      lcsByTic.set(tic, all);
      try {
        const an = analyseStar(all, p.mask);
        const secs = all.map((l) => l.sector).join(", ");
        let text: string;
        if (s?.single) {
          const e = s.single;
          const hit = an.signals.find((t) => Math.abs(e.t - t.t0 - Math.round((e.t - t.t0) / t.period) * t.period) < Math.max(t.duration, e.duration));
          text = hit
            ? `the dip repeats: period ${hit.period.toFixed(3)} d, depth ${r3(hit.depth * 1000)} ppt, SNR ${hit.snr.toFixed(1)} over sectors ${secs}`
            : `no repeat found over sectors ${secs}: still a single event (period longer than the data, or not real)`;
          if (hit) {
            const v = vet(tic, sig(hit));
            const star = byTic.get(tic)!;
            const fresh = signalObject(`C${objects.filter((x) => x.id.startsWith("C")).length + 1}`, star, sig(hit), v, header.get(tic)?.radius);
            fresh.props["follow-up"] = `period found by extending ${a.id}'s search to sectors ${secs}`;
            const at = objects.findIndex((x) => x.category === "variable");
            objects.splice(at < 0 ? objects.length : at, 0, fresh);
            if (v.kind === "candidate") counts.set("candidate", (counts.get("candidate") ?? 0) + 1);
          }
        } else if (s?.t) {
          const t = s.t;
          const hit = an.signals.find((x) => periodsMatch(x.period, t.period, 0.01));
          text = hit
            ? `holds over sectors ${secs}: SNR ${t.snr.toFixed(1)} → ${hit.snr.toFixed(1)}, period ${hit.period.toFixed(4)} d`
            : `not found again over sectors ${secs}: may be a false alarm`;
          if (hit && hit.snr > t.snr) o.type += " · strengthened with more sectors";
        } else {
          const P = Number(o.props["period (days)"]);
          const ok2 = isVariable(an.ls) && periodsMatch(an.ls.period, P, 0.03);
          text = ok2 ? `variability holds over sectors ${secs} (P ${r3(an.ls.period)} d)` : `variability at P ${P} d not found again over sectors ${secs}`;
        }
        o.props["follow-up"] = text;
        note({ agent: "followup", text: `${a.id}: ${text}`, ids: [a.id] });
      } catch (e) {
        note({ agent: "followup", text: `${a.id}: extended search failed (${(e as Error).message.slice(0, 80)})`, ids: [a.id] });
      }
    }
  }
  report("followup", actions.length ? "ok" : "empty", actions.length
    ? `${rechecked} re-checked on held-out sectors (${recovered} recovered), ${extended} extended with more sectors`
    : followable.length ? "nothing new could be re-tested (no held-out sectors or time)" : "nothing new to follow up", Date.now() - tf);

  const candidates = objects.filter((o) => /^(Unvetted|Candidate additional)/.test(o.type)).length;
  const discoveries = objects.filter(isNew).length;
  return done({
    stars, plan, objects, candidates, discoveries,
    results: stars.map((s) => results.get(s.tic) ?? { tic: s.tic, status: "skipped", error: "not reached", ms: 0 }),
  });
}
