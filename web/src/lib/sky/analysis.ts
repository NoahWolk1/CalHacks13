// Light-curve analysis agents: each runs one algorithm over real TESS light curves of the cone's
// brightest stars (fetched from MAST, never synthesised).
//  - Light Curves: picks up to ANALYSIS_MAX_STARS stars with SPOC / TESS-SPOC / QLP light curves
//    (lightcurves.ts: SPOC 2-min targets nearest the cone centre first) and downloads one sector each.
//  - Transit Hunter: flatten (running median) + Box Least Squares periodogram, SDE / SNR / transit
//    count thresholds (bls.ts).
//  - Variability: Lomb-Scargle periodogram of the un-flattened light curve (lombscargle.ts).
//  - Vetter: odd/even, secondary eclipse, depth and blend checks plus position cross-matches
//    against the NASA Exoplanet Archive, the TOI list and SIMBAD eclipsing binaries, so a known
//    planet leaking into a neighbour's aperture isn't mistaken for a new one (vetting.ts).
// Bounded for serverless: a capped star count, a few downloads at a time, and a wall-clock budget
// after which remaining stars are skipped (reported, not hidden).
import { bls, BLS_MIN_SNR, blsDetected, type BlsResult } from "./bls";
import { fieldInventory, fetchLightCurve, LC_TIMEOUT_MS, pickLightCurves, type LightCurve } from "./lightcurves";
import { isVariable, lombScargle, variabilityClass, type LsResult } from "./lombscargle";
import { LABEL as OTYPE_LABEL } from "./simbad";
import { binSeries, cleanSeries, clipUpper, flatten, trimGaps } from "./timeseries";
import { ebNeighbours, impliedRadiusEarth, knownPlanetsNear, toisNear, vetSignal, type Verdict } from "./vetting";
import type { AnalysisStar, Cone, SkyAgentReport, SkyAnalysis, SkyEvent, SkyObject, StarResult } from "./types";

export const ANALYSIS_MAX_STARS = 10;
export const ANALYSIS_CONCURRENCY = 3;
/** Wall-clock budget for the whole analysis, so the summary still fits in the route's maxDuration. */
export const ANALYSIS_BUDGET_MS = 25_000;
/** Light curves are binned to this cadence (days) before searching: 10 min keeps 1-hour transits resolved. */
export const BIN_DAYS = 10 / 1440;
/** Running-median window (days): transits up to ~8 h survive a 1-day window. */
export const FLATTEN_DAYS = 1;

export const ANALYSIS_AGENTS: { id: SkyAgentReport["agent"]; label: string }[] = [
  { id: "lightcurves", label: "Light Curves (MAST TESS)" },
  { id: "transits", label: "Transit Hunter (BLS)" },
  { id: "variability", label: "Variability (Lomb-Scargle)" },
  { id: "vetting", label: "Vetter (cross-match)" },
];

export type StarAnalysis = { points: number; transit: BlsResult; ls: LsResult };

/** The per-star pipeline (pure, CPU only): clean, bin, trim ramps; Lomb-Scargle on that; flatten
 *  and clip flares; BLS on the flattened curve. */
export function analyseLightCurve(lc: Pick<LightCurve, "time" | "flux" | "quality">): StarAnalysis {
  const s = trimGaps(binSeries(cleanSeries(lc.time, lc.flux, lc.quality), BIN_DAYS));
  if (s.t.length < 200) throw new Error(`only ${s.t.length} good cadences`);
  const ls = lombScargle(s);
  const transit = bls(clipUpper(flatten(s, FLATTEN_DAYS)));
  return { points: s.t.length, transit, ls };
}

const r3 = (n: number) => +n.toPrecision(3);
const exofop = (tic: string) => `https://exofop.ipac.caltech.edu/tess/target.php?id=${tic}`;

function toStarResult(tic: string, a: StarAnalysis, ms: number): StarResult {
  const t = a.transit;
  return {
    tic, status: "ok", points: a.points, ms,
    transit: { period: t.period, t0: t.t0, duration: t.duration, depth: t.depth, snr: t.snr, sde: t.sde, transits: t.transits, oddEven: t.oddEven, oddEvenSigma: t.oddEvenSigma, secondary: t.secondary, secondarySigma: t.secondarySigma, detected: blsDetected(t) },
    variability: { period: a.ls.period, amplitude: a.ls.amplitude, power: a.ls.power, fap: a.ls.fap, variable: isVariable(a.ls) },
  };
}

/** Transit-signal result (C id) carrying the Vetter's verdict. */
export function signalObject(id: string, star: AnalysisStar, t: NonNullable<StarResult["transit"]>, v: Verdict, starRadius?: number): SkyObject {
  const rp = impliedRadiusEarth(t.depth, starRadius);
  const props: Record<string, string | number> = {
    verdict: v.label,
    status: v.kind === "candidate" ? "unvetted candidate: needs follow-up, not a confirmed planet" : "rejected as a new candidate",
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
    "light curve": `TESS ${star.pipeline} sector ${star.sector}`,
  };
  if (rp) props["implied radius (Earth = 1)"] = r3(rp);
  return {
    id, name: `TIC ${star.tic} · P ${t.period.toFixed(3)} d`, type: v.label, category: "candidate", ra: star.ra, dec: star.dec,
    source: "lightcurves", url: exofop(star.tic), props,
  };
}

export function variableObject(id: string, star: AnalysisStar, v: NonNullable<StarResult["variability"]>): SkyObject {
  const props: Record<string, string | number> = {
    TIC: star.tic, "period (days)": r3(v.period), "amplitude (ppt)": r3(v.amplitude * 1000), "LS power": r3(v.power),
    "false-alarm probability": v.fap < 1e-10 ? "< 1e-10" : r3(v.fap), "light curve": `TESS ${star.pipeline} sector ${star.sector}`,
  };
  if (star.otype) props["SIMBAD type"] = OTYPE_LABEL[star.otype] ?? star.otype;
  return {
    id, name: `${star.name} (TIC ${star.tic})`, type: `Variable star: ${variabilityClass(v.period)}`, category: "variable", ra: star.ra, dec: star.dec,
    source: "lightcurves", url: exofop(star.tic), props,
  };
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

export async function runAnalysis(c: Cone, signal: AbortSignal, emit: (e: SkyEvent) => void, t0 = Date.now()): Promise<SkyAnalysis> {
  const start = Date.now();
  const deadline = start + ANALYSIS_BUDGET_MS;
  const agents: SkyAgentReport[] = [];
  const report = (agent: SkyAgentReport["agent"], status: SkyAgentReport["status"], detail: string, ms: number) =>
    agents.push({ agent, label: ANALYSIS_AGENTS.find((a) => a.id === agent)!.label, status, detail, ms });
  const done = (extra: Partial<SkyAnalysis>): SkyAnalysis => ({ stars: [], results: [], agents, objects: [], candidates: 0, ms: Date.now() - start, ...extra });

  const inv = await fieldInventory(c, signal);
  const picks = pickLightCurves(c, inv.stars, inv.products, ANALYSIS_MAX_STARS);
  if (!picks.length) {
    const note = inv.stars.length
      ? `None of the ${inv.stars.length} stars found here has a TESS SPOC, TESS-SPOC or QLP light curve at MAST.`
      : "MAST has no TESS SPOC light curves in this cone and SIMBAD lists no bright stars with TIC ids, so there are no light curves to analyse.";
    report("lightcurves", "empty", note, Date.now() - start);
    return done({ note });
  }
  const stars: AnalysisStar[] = picks.map(({ star, product }) => ({ ...star, pipeline: product.pipeline, sector: product.sector }));
  emit({ type: "analysis-start", stars, ms: Date.now() - t0 });

  // Cross-match lookups start now so they're ready when the light curves are.
  const known = knownPlanetsNear(c, signal), tois = toisNear(c, signal), neighbours = ebNeighbours(c, signal);
  [known, tois, neighbours].forEach((p) => p.catch(() => {}));

  const results = new Map<string, StarResult>();
  const radii = new Map<string, number>();
  const lsByTic = new Map<string, LsResult>();
  let downloaded = 0, failed = 0, skipped = 0, cpuMs = 0;
  const tLc = Date.now();
  await pool(picks, ANALYSIS_CONCURRENCY, async ({ star, product }) => {
    const ts = Date.now();
    const finish = (r: StarResult) => { results.set(star.tic, r); emit({ type: "analysis-star", result: r, ms: Date.now() - t0 }); };
    // Leave room for the CPU work and the vetting after the last download.
    if (signal.aborted || Date.now() > deadline - 4_000) { skipped++; finish({ tic: star.tic, status: "skipped", error: "analysis time budget used up", ms: 0 }); return; }
    let lc: LightCurve;
    // getBuffer retries on timeouts, so its per-attempt timeout alone doesn't bound a download: a
    // hard abort at the budget does.
    const limit = Math.min(LC_TIMEOUT_MS, deadline - 2_000 - Date.now());
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal.addEventListener("abort", onAbort);
    const timer = setTimeout(() => ac.abort(), limit);
    try {
      lc = await fetchLightCurve(product, ac.signal, limit);
      downloaded++;
    } catch (e) {
      failed++;
      const msg = ac.signal.aborted && !signal.aborted ? `timed out after ${Math.round(limit / 1000)}s` : (e as Error).message;
      finish({ tic: star.tic, status: "error", error: `download failed: ${msg.slice(0, 100)}`, ms: Date.now() - ts });
      return;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
    await yieldToLoop();
    const tc = Date.now();
    try {
      const a = analyseLightCurve(lc);
      cpuMs += Date.now() - tc;
      if (lc.radius) radii.set(star.tic, lc.radius);
      lsByTic.set(star.tic, a.ls);
      finish(toStarResult(star.tic, a, Date.now() - ts));
    } catch (e) {
      failed++;
      finish({ tic: star.tic, status: "error", error: (e as Error).message.slice(0, 100), ms: Date.now() - ts });
    }
  });
  const ok = [...results.values()].filter((r) => r.status === "ok");
  report("lightcurves", downloaded ? "ok" : "error",
    `${downloaded} of ${picks.length} light curves downloaded${failed ? `, ${failed} failed` : ""}${skipped ? `, ${skipped} skipped (time budget)` : ""}`, Date.now() - tLc);

  const detected = ok.filter((r) => r.transit?.detected);
  const variables = ok.filter((r) => r.variability?.variable);
  report("transits", ok.length ? "ok" : "error", `BLS searched ${ok.length} light curve${ok.length === 1 ? "" : "s"} (0.5 d to half the baseline); ${detected.length} signal${detected.length === 1 ? "" : "s"} passed SDE ≥ 9, SNR ≥ 7.1, ≥ 2 transits`, cpuMs);
  report("variability", ok.length ? "ok" : "error", `Lomb-Scargle: ${variables.length} of ${ok.length} star${ok.length === 1 ? "" : "s"} significantly variable (FAP < 0.1%, ≥ 0.5 ppt)`, 0);

  // Vetting: wait for the cross-matches within what's left of the budget.
  const tv = Date.now();
  // Nothing detected means nothing to vet: don't wait on the lookups at all.
  const left = detected.length ? Math.max(1_500, deadline - Date.now()) : 0;
  const [kp, ti, nb] = await Promise.all([within(known, left), within(tois, left), within(neighbours, left)]);
  const failedXm = [kp.err && "Exoplanet Archive", ti.err && "TOI list", nb.err && "SIMBAD binaries"].filter(Boolean);
  const byTic = new Map(stars.map((s) => [s.tic, s]));
  const objects: SkyObject[] = [];
  let candidates = 0;
  const counts = new Map<string, number>();
  // Every star's strongest dip that is at least SNR-significant (detected or not) counts as a
  // possible source for shared-period and contamination checks.
  const others = ok.filter((r) => r.transit && r.transit.snr >= BLS_MIN_SNR && r.transit.depth > 0)
    .map((r) => ({ tic: r.tic, period: r.transit!.period, depth: r.transit!.depth, ra: byTic.get(r.tic)!.ra, dec: byTic.get(r.tic)!.dec }));
  const knownSignals = [...(kp.v ?? []), ...(ti.v ?? [])];
  detected.forEach((r) => {
    const star = byTic.get(r.tic)!;
    const verdict = vetSignal(r.transit!, {
      star, starRadius: radii.get(r.tic), known: knownSignals, neighbours: nb.v ?? [], ls: lsByTic.get(r.tic), others, unchecked: failedXm as string[],
    });
    if (verdict.kind === "candidate") candidates++;
    counts.set(verdict.kind, (counts.get(verdict.kind) ?? 0) + 1);
    objects.push(signalObject("", star, r.transit!, verdict, radii.get(r.tic)));
  });
  // Unvetted candidates first, then recovered known signals, then the rest.
  const order = ["Unvetted", "Known planet", "Known TOI", "Light from"];
  const rank = (o: SkyObject) => { const k = order.findIndex((p) => o.type.startsWith(p)); return k < 0 ? order.length : k; };
  objects.sort((a, b) => rank(a) - rank(b));
  objects.forEach((o, i) => (o.id = `C${i + 1}`));
  variables.forEach((r, i) => objects.push(variableObject(`V${i + 1}`, byTic.get(r.tic)!, r.variability!)));
  const LABELS: [string, string, string][] = [
    ["candidate", "unvetted candidate", "unvetted candidates"], ["known-planet", "known planet recovered", "known planets recovered"],
    ["known-toi", "known TOI recovered", "known TOIs recovered"], ["contamination", "signal leaking from a neighbour", "signals leaking from neighbours"],
    ["eclipsing-binary", "likely eclipsing binary", "likely eclipsing binaries"], ["systematic", "likely systematic", "likely systematics"],
  ];
  const parts = LABELS.flatMap(([k, one, many]) => { const n = counts.get(k) ?? 0; return n ? [`${n} ${n === 1 ? one : many}`] : []; });
  report("vetting", detected.length && failedXm.length === 3 ? "error" : detected.length ? "ok" : "empty",
    detected.length ? `${parts.join(", ")}${failedXm.length ? ` (cross-match unavailable: ${failedXm.join(", ")})` : ""}` : "no transit signals to vet", Date.now() - tv);

  return done({ stars, results: stars.map((s) => results.get(s.tic) ?? { tic: s.tic, status: "skipped", error: "not reached", ms: 0 }), objects, candidates });
}
