// Deep surveys: the discovery pipeline without the 150 s cap. A survey searches every star with a TESS
// light curve in the cone, every sector, as a background job that runs in steps (each one serverless
// invocation, STEP_BUDGET_MS of work) and saves after every season, so it survives restarts and can
// run for hours. The route chains steps; a lease in the store keeps two from running at once.
//
// Work unit = one season of one star: up to 4 nearby sectors stitched and searched together
// (lightcurves.ts: seasonsFor), with the same analysis as the quick run (analysis.ts: analyseStar).
// Searching seasons separately keeps the BLS affordable on stars with years of data, and makes a
// signal seen in several seasons independently confirmed (the quick run's held-out re-check, built in).
// A blind search misses weak signals in seasons with fewer transits or more noise, so each signal is
// also measured at its period in the star's other seasons (forcedCheck): recovered, present but
// below the detection bar, absent where it should show, or inconclusive. Seasons searched before the
// signal turned up are re-downloaded for that check.
// Two lone dips on one star are paired into a duotransit: the possible periods are Δt/n, pruned to
// those whose other transits would have fallen where TESS wasn't looking (duotransitAliases).
//
// The Strategist plans the order (Claude picks the first stars, the heuristic score orders the rest),
// bumps a star whose season turned something up so its other seasons come next, and at each quarter
// of progress Claude reviews the finds, writes notebook notes and can move stars up the queue.
import { analyseStar, download, forcedCheck, signalObject, singleObject, variableObject } from "./analysis";
import { seasonsFor, surveyInventory, type LcProduct, type LightCurve } from "./lightcurves";
import { variabilityClass, type LsResult } from "./lombscargle";
import { LABEL as OTYPE_LABEL } from "./simbad";
import { claudePlan, claudeSurveyReview, PLAYBOOK_LABEL, prospects } from "./strategy";
import { CONTAM_ARCMIN, ebNeighbours, impliedRadiusEarth, knownPlanetsNear, MAX_PLANET_REARTH, periodsMatch, toisNear, vetSignal } from "./vetting";
import { VARIABLE_OTYPES, variablesNear, vsxEntry } from "./vsx";
import { separation } from "./geom";
import type { SurveyField, SurveyStore } from "./surveyStore";
import {
  isNewFind, type AnalysisStar, type Cone, type ForcedCheck, type SingleDip, type SkyNote, type SkyObject, type SurveySeason, type SurveyStar, type SurveyStarRow,
  type SurveySummary, type TransitSignal,
} from "./types";

/** Work per step. Vercel functions here run up to 300 s; the rest is margin for the last season and saving. */
export const STEP_BUDGET_MS = Number(process.env.SKY_SURVEY_STEP_MS) || 230_000;
/** No new season starts this close to the step's end (4 downloads + a multi-sector search fit in it). */
const STEP_TAIL_MS = 45_000;
export const SURVEY_CONCURRENCY = 4;
const SAVE_EVERY_MS = 4_000;
/** Claude picks this many stars to search first; the heuristic orders the rest. */
const PLAN_FIRST = 20;
const MAX_NOTES = 80;
/** Rejected signals kept in the stored results (every new find is kept). */
const MAX_REJECTED = 150;
const BUMP = 50;

// ── planning (the first step) ───────────────────────────────────────────────

export function newSummary(id: string, cone: Cone, llm: boolean): SurveySummary {
  const now = Date.now();
  return { id, cone, status: "running", createdAt: now, updatedAt: now, llm, planned: false, stars: 0, seasons: 0, seasonsDone: 0, seasonsFailed: 0, lightCurves: 0, cpuMs: 0, steps: 0, finds: 0, candidates: 0 };
}

const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms))]);

/** Inventory every light curve in the field, cross-match catalogs, rank the stars and lay out their seasons. */
export async function planSurvey(c: Cone, signal: AbortSignal, useClaude: boolean) {
  const notes: SkyNote[] = [];
  const settle = <T,>(p: Promise<T>) => within(p, 40_000).then((v) => ({ v, err: "" }), (e: Error) => ({ v: null as T | null, err: e.message }));
  const [inv, kp, ti, nb, vx] = await Promise.all([
    surveyInventory(c, signal), settle(knownPlanetsNear(c, signal)), settle(toisNear(c, signal)), settle(ebNeighbours(c, signal)), settle(variablesNear(c, signal)),
  ]);
  const field: SurveyField = {
    known: [...(kp.v ?? []), ...(ti.v ?? [])], neighbours: nb.v ?? [], vsx: vx.v ?? undefined,
    unchecked: [kp.err && "Exoplanet Archive", ti.err && "TOI list", nb.err && "SIMBAD binaries", vx.err && "AAVSO VSX"].filter(Boolean) as string[],
  };
  const pool = prospects(c, inv.stars, inv.products, field.known, field.vsx ?? []);
  const first = new Map<string, { rank: number; playbook?: SurveyStar["playbook"]; why?: string }>();
  let strategy = "", by: "claude" | "heuristic" = "heuristic";
  if (useClaude && pool.length) {
    try {
      const r = await within(claudePlan(c, pool.slice(0, 60), Math.min(PLAN_FIRST, pool.length), signal), 30_000);
      r.picks.forEach((p, i) => first.set(p.prospect.star.tic, { rank: i, playbook: p.playbook, why: p.why }));
      strategy = r.strategy; by = "claude";
    } catch (e) { notes.push({ agent: "strategist", text: `Claude planning failed (${(e as Error).message.slice(0, 80)}): heuristic order` }); }
  }
  const stars: SurveyStar[] = pool.map((p) => {
    const f = first.get(p.star.tic);
    const masks = p.known.filter((k) => k.t0 !== undefined && k.duration !== undefined);
    return {
      ...p.star, priority: f ? 1000 - f.rank : p.score, playbook: f?.playbook ?? p.playbook, why: f?.why ?? p.reason,
      masked: masks.map((k) => k.name), masks: masks.map((k) => ({ period: k.period, t0: k.t0!, duration: k.duration!, sigmaP: k.sigmaP, sigmaT0: k.sigmaT0 })),
      seasons: seasonsFor(inv.products, p.star.tic).map((g) => ({
        sectors: g.map((x) => x.sector), pipeline: [...new Set(g.map((x) => x.pipeline))].join("+"), status: "pending" as const,
        files: g.map((x) => ({ sector: x.sector, pipeline: x.pipeline, uri: x.uri })),
      })),
    };
  });
  const seasons = stars.reduce((k, s) => k + s.seasons.length, 0);
  if (!strategy) strategy = `Every one of the field's ${stars.length} stars with TESS light curves will be searched, all ${seasons} seasons, highest discovery potential first.`;
  else strategy += ` After those, the remaining ${Math.max(0, stars.length - first.size)} stars follow by discovery potential: ${seasons} seasons in all.`;
  notes.unshift({ agent: "strategist", text: strategy });
  for (const n of inv.notes) notes.push({ agent: "lightcurves", text: n });
  if (field.unchecked.length) notes.push({ agent: "vetting", text: `Cross-match unavailable this survey: ${field.unchecked.join(", ")}. Finds can't be called new against ${field.unchecked.length === 1 ? "it" : "them"}.` });
  return { stars, field, notes, plan: { strategy, by, pool: pool.length } };
}

// ── one season ──────────────────────────────────────────────────────────────

/** Time ranges (BTJD) with good data; gaps longer than `gap` days split them. */
export function coverageOf(lcs: Pick<LightCurve, "time" | "flux" | "quality">[], gap = 0.15): [number, number][] {
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

const round = (n: number, d = 5) => +n.toPrecision(d);
const compactSignal = (t: TransitSignal): TransitSignal => ({ ...t, period: round(t.period, 9), t0: round(t.t0, 9), duration: round(t.duration), depth: round(t.depth), snr: round(t.snr, 4), sde: round(t.sde, 4), oddEven: round(t.oddEven, 3), oddEvenSigma: round(t.oddEvenSigma, 3), secondary: round(t.secondary, 3), secondarySigma: round(t.secondarySigma, 3) });

/** Downloads per season before it counts as failed. */
export const DOWNLOAD_TRIES = 2;

/** Signals from the star's other seasons that `season` hasn't found or measured yet, and whose period
 *  it covers at least twice (deduplicated by period). */
export function forcedTargets(star: SurveyStar, season: SurveySeason): TransitSignal[] {
  const out: TransitSignal[] = [];
  for (const other of star.seasons) {
    if (other === season || other.status !== "ok") continue;
    for (const sig of other.signals ?? []) {
      if (out.some((x) => periodsMatch(x.period, sig.period, 0.01))) continue;
      if ((season.signals ?? []).some((x) => periodsMatch(x.period, sig.period, 0.01))) continue;
      if ((season.forced ?? []).some((x) => periodsMatch(x.period, sig.period, 0.01))) continue;
      if (season.status === "ok" && coveredDays(season) / sig.period < 2) continue;
      out.push(sig);
    }
  }
  return out;
}

const forcedAll = (lcs: LightCurve[], targets: TransitSignal[]): ForcedCheck[] => targets.flatMap((t) => {
  try { return [forcedCheck(lcs, t)]; } catch { return []; }
});
/** Recorded when a re-check can't run, so the season isn't queued for it again. */
const unmeasured = (t: TransitSignal): ForcedCheck => ({ period: t.period, depth: 0, err: 0, snr: 0, transits: 0, result: "inconclusive" });

/** Measures the star's signals from other seasons in an already-searched season (re-downloaded). */
export async function recheckSeason(star: SurveyStar, season: SurveySeason, signal: AbortSignal, deadline: number): Promise<SurveySeason> {
  const targets = forcedTargets(star, season);
  if (!targets.length) return season;
  const products: LcProduct[] = season.files.map((f) => ({ tic: star.tic, sector: f.sector, pipeline: f.pipeline, cadence: 0, uri: f.uri }));
  const { lcs } = await download(products, signal, deadline);
  await new Promise<void>((r) => setImmediate(r));
  const got = lcs.length ? forcedAll(lcs, targets) : [];
  const forced = [...(season.forced ?? []), ...got, ...targets.filter((t) => !got.some((g) => periodsMatch(g.period, t.period, 0.01))).map(unmeasured)];
  return { ...season, forced };
}

export async function searchSeason(star: SurveyStar, season: SurveySeason, signal: AbortSignal, deadline: number): Promise<SurveySeason> {
  const ts = Date.now();
  const products: LcProduct[] = season.files.map((f) => ({ tic: star.tic, sector: f.sector, pipeline: f.pipeline, cadence: 0, uri: f.uri }));
  const { lcs, errors } = await download(products, signal, deadline);
  if (!lcs.length) return { ...season, status: "error", error: `download failed: ${errors[0] ?? "unknown"}`, ms: Date.now() - ts };
  await new Promise<void>((r) => setImmediate(r));
  try {
    const a = analyseStar(lcs, star.masks);
    const ls = { period: round(a.ls.period, 7), amplitude: round(a.ls.amplitude, 4), power: round(a.ls.power, 3), fap: a.ls.fap, variable: a.ls.fap < 1e-3 && a.ls.power > 0.1 && a.ls.amplitude >= 5e-4 };
    const signals = a.signals.map((t) => compactSignal({ period: t.period, t0: t.t0, duration: t.duration, depth: t.depth, snr: t.snr, sde: t.sde, transits: t.transits, oddEven: t.oddEven, oddEvenSigma: t.oddEvenSigma, secondary: t.secondary, secondarySigma: t.secondarySigma, detected: true }));
    const coverage = coverageOf(lcs);
    const searched = { ...season, status: "ok" as const, signals, coverage, forced: [] };
    const forced = forcedAll(lcs, forcedTargets(star, searched));
    return {
      ...season, sectors: lcs.map((l) => l.sector), status: "ok", points: a.points, days: +a.days.toFixed(2), coverage,
      signals, ...(forced.length ? { forced } : {}),
      singles: a.singles.map((e) => ({ t: round(e.t, 9), duration: round(e.duration), depth: round(e.depth), snr: round(e.snr, 4) })),
      ls, prewhitened: a.prewhitened.map((p) => round(p, 6)),
      ...(lcs.find((l) => l.radius) ? { radius: lcs.find((l) => l.radius)!.radius } : {}), ...(lcs.find((l) => l.logg) ? { logg: lcs.find((l) => l.logg)!.logg } : {}),
      ms: Date.now() - ts, ...(errors.length ? { error: `${errors.length} sector${errors.length === 1 ? "" : "s"} failed to download` } : {}),
    };
  } catch (e) {
    return { ...season, status: "error", error: (e as Error).message.slice(0, 120), ms: Date.now() - ts };
  }
}

// ── finds: everything the seasons add up to ─────────────────────────────────

/** Orbital periods for two lone dips Δt apart: Δt/n for every n whose other predicted transits all
 *  fall outside the time TESS covered (a transit there would have been seen), or on another observed
 *  dip (`seen`: times of similar dips on the star). Longest first. */
export function duotransitAliases(t1: number, t2: number, duration: number, coverage: [number, number][], minPeriod = 1, max = 400, seen: number[] = []): number[] {
  const dt = Math.abs(t2 - t1), t0 = Math.min(t1, t2);
  const out: number[] = [];
  for (let n = 1; dt / n >= minPeriod && out.length < max; n++) {
    const P = dt / n;
    let excluded = false;
    for (const [a, b] of coverage) {
      // Epochs whose whole transit would sit inside this covered range (partial ones near edges are unsure).
      for (let k = Math.ceil((a + duration / 2 - t0) / P); t0 + k * P <= b - duration / 2; k++) {
        if (k !== 0 && k !== n && !seen.some((x) => Math.abs(x - t0 - k * P) < duration)) { excluded = true; break; }
      }
      if (excluded) break;
    }
    if (!excluded) out.push(P);
  }
  return out;
}

const asLs = (l: SurveySeason["ls"]): LsResult | undefined => (l ? { ...l, frequencies: 0 } : undefined);
const coveredDays = (s: SurveySeason) => (s.coverage ?? []).reduce((k, [a, b]) => k + b - a, 0);
const sectorsLabel = (s: SurveySeason) => s.sectors.join(", ");

function asAnalysisStar(s: SurveyStar, season: SurveySeason, all?: SurveySeason[]): AnalysisStar {
  const sectors = all ? all.flatMap((x) => x.sectors) : season.sectors;
  return { tic: s.tic, name: s.name, otype: s.otype, ra: s.ra, dec: s.dec, vmag: s.vmag, pipeline: season.pipeline, sector: sectors[sectors.length - 1], sectors, heldOut: 0, playbook: s.playbook, why: s.why, masked: s.masked };
}

const RANK_ORDER = ["Unvetted", "Candidate additional", "Duotransit", "Single-transit", "Uncatalogued", "Known planet", "Known TOI", "Light from"];
const rankOf = (o: SkyObject) => { const k = RANK_ORDER.findIndex((p) => o.type.startsWith(p)); return k < 0 ? RANK_ORDER.length : k; };

/** All results so far, vetted together (cross-star checks need every star): periodic signals clustered
 *  across seasons, single dips paired into duotransits, variables through the census. */
export function surveyObjects(stars: SurveyStar[], field: SurveyField) {
  const oks = (s: SurveyStar) => s.seasons.filter((x) => x.status === "ok");
  type Cluster = { star: SurveyStar; rep: TransitSignal; season: SurveySeason; seen: SurveySeason[] };
  const clusters: Cluster[] = [];
  for (const star of stars) {
    const mine: Cluster[] = [];
    for (const season of oks(star)) {
      for (const sig of season.signals ?? []) {
        const c = mine.find((x) => periodsMatch(sig.period, x.rep.period, 0.01));
        if (!c) { mine.push({ star, rep: sig, season, seen: [season] }); continue; }
        if (!c.seen.includes(season)) c.seen.push(season);
        if (sig.snr > c.rep.snr) { c.rep = sig; c.season = season; }
      }
    }
    clusters.push(...mine);
  }
  const others = clusters.map((c) => ({ tic: c.star.tic, period: c.rep.period, depth: c.rep.depth, ra: c.star.ra, dec: c.star.dec }));
  const out: SkyObject[] = [];

  for (const { star, rep, season, seen } of clusters) {
    let v = vetSignal(rep, { star, starRadius: season.radius, logg: season.logg, known: field.known, neighbours: field.neighbours, vsx: field.vsx, ls: asLs(season.ls), others, unchecked: field.unchecked });
    if (v.kind === "candidate" && star.masked.length) v = { ...v, label: "Candidate additional planet", reasons: [`found after masking ${star.masked.join(", ")}: a possible sibling in a known system`, ...v.reasons] };
    const o = signalObject("", asAnalysisStar(star, season), rep, v, season.radius);
    const searched = oks(star);
    // Every other season that covered at least two transits: measured at the period (forced), else unchecked.
    const rest = searched.filter((x) => !seen.includes(x) && coveredDays(x) / rep.period >= 2)
      .map((x) => ({ season: x, f: (x.forced ?? []).find((f) => f.transits > 0 && periodsMatch(f.period, rep.period, 0.01)) }));
    const by = (r: ForcedCheck["result"]) => rest.filter((x) => x.f?.result === r);
    const recovered = by("recovered"), weak = by("weak"), absent = by("absent"), unchecked = rest.filter((x) => !x.f);
    const total = seen.length + recovered.length;
    o.props.seasons = `found blind in ${seen.length} of ${searched.length} season${searched.length === 1 ? "" : "s"} searched (sectors ${seen.map(sectorsLabel).join(" | ")})`;
    const ppm = (x: number) => `${Math.round(x * 1e6)} ppm`;
    const line = (x: (typeof rest)[number]) => `s${sectorsLabel(x.season)}: ${!x.f ? "not checked yet" : `${x.f.result === "recovered" ? "recovered" : x.f.result === "weak" ? "present, below the detection bar" : x.f.result} (${ppm(x.f.depth)} ± ${ppm(x.f.err)}, ${x.f.transits} transits)`}`;
    if (rest.length) o.props["at the period in other seasons"] = rest.map(line).join("; ");
    if (absent.length) o.props["not recovered"] = `sectors ${absent.map((x) => sectorsLabel(x.season)).join(" | ")}: should show at ${ppm(rep.depth)} and doesn't`;
    if (v.kind === "candidate") {
      o.type += absent.length ? ` · absent in ${absent.length} other season${absent.length === 1 ? "" : "s"}`
        : total >= 2 ? ` · seen in ${total} seasons`
        : weak.length ? ` · weak in ${weak.length} other season${weak.length === 1 ? "" : "s"}`
        : unchecked.length ? " · other seasons not checked yet" : "";
    }
    out.push(o);
  }

  // Single dips: not part of a periodic signal on the same star; simultaneous on another star = systematic.
  const singles = stars.flatMap((star) => oks(star).flatMap((season) => (season.singles ?? [])
    .filter((e) => !clusters.some((c) => c.star === star && Math.abs(e.t - c.rep.t0 - Math.round((e.t - c.rep.t0) / c.rep.period) * c.rep.period) < Math.max(c.rep.duration, e.duration)))
    .map((e) => ({ star, season, e }))));
  const systematic = (x: (typeof singles)[number]) => singles.filter((y) => y.star !== x.star && Math.abs(y.e.t - x.e.t) < 0.5).length;
  const deep = (star: SurveyStar, season: SurveySeason, e: SingleDip) => { const rp = impliedRadiusEarth(e.depth, season.radius); return e.depth > 0.03 || (!!rp && rp > MAX_PLANET_REARTH); };
  const catalogued = (star: SurveyStar) => (field.vsx ? vsxEntry(star, field.vsx) : undefined);
  for (const star of stars) {
    const mine = singles.filter((x) => x.star === star);
    const used = new Set<number>();
    // Duotransit: the strongest pair of similar dips (depth and duration within 2x) more than 2 days apart.
    const pairs: [number, number][] = [];
    mine.forEach((a, i) => mine.forEach((b, j) => {
      if (j <= i || systematic(a) || systematic(b) || Math.abs(a.e.t - b.e.t) < 2) return;
      const dr = a.e.depth / b.e.depth, wr = a.e.duration / b.e.duration;
      if (dr > 0.5 && dr < 2 && wr > 0.5 && wr < 2) pairs.push([i, j]);
    }));
    pairs.sort((p, q) => mine[q[0]].e.snr + mine[q[1]].e.snr - mine[p[0]].e.snr - mine[p[1]].e.snr);
    if (pairs.length) {
      const [i, j] = pairs[0];
      const [a, b] = [mine[i], mine[j]].sort((x, y) => x.e.t - y.e.t);
      used.add(i); used.add(j);
      const coverage = oks(star).flatMap((s) => s.coverage ?? []);
      const dur = Math.max(a.e.duration, b.e.duration);
      // Other similar dips on the star: a period that puts a transit on one of them is pinned by three
      // dips; dips that no surviving period explains cast doubt on the pair.
      const similar = mine.filter((x, k) => k !== i && k !== j && !systematic(x) && x.e.depth / a.e.depth > 0.5 && x.e.depth / a.e.depth < 2);
      let aliases = duotransitAliases(a.e.t, b.e.t, dur, coverage, 1, 400, similar.map((x) => x.e.t));
      const fits = (P: number, x: (typeof mine)[number]) => { const d = x.e.t - a.e.t; return Math.abs(d - Math.round(d / P) * P) < dur; };
      const pinned = aliases.filter((P) => similar.some((x) => fits(P, x)));
      if (pinned.length) { aliases = pinned; similar.forEach((x) => { if (pinned.some((P) => fits(P, x))) used.add(mine.indexOf(x)); }); }
      const unexplained = similar.filter((x) => !aliases.some((P) => fits(P, x))).length;
      const depth = (a.e.depth + b.e.depth) / 2;
      const rp = impliedRadiusEarth(depth, a.season.radius);
      const own = catalogued(star);
      const isDeep = deep(star, a.season, a.e);
      const label = !aliases.length ? "Two dips with no consistent period" : unexplained >= 2 && !pinned.length ? "Repeated dips (no single period)" : isDeep ? (own || VARIABLE_OTYPES.has(star.otype) ? "Eclipsing binary (two eclipses)" : "Uncatalogued eclipsing binary (two eclipses)") : "Duotransit candidate";
      const props: Record<string, string | number> = {
        verdict: label,
        status: label === "Duotransit candidate" ? "two transits of one long-period object: needs more data to pin the period" : label.startsWith("Uncatalogued") ? "not in any variable-star catalog checked" : "rejected as a new candidate",
        vetting: !aliases.length ? "every period that fits both dips predicts another transit where TESS was watching and saw none" : isDeep ? `star-sized (${(depth * 100).toFixed(1)}% deep)${own ? `; VSX lists ${own.name} (${own.type})` : ""}` : "two similar lone dips, not simultaneous with other stars",
        TIC: star.tic, "times (BTJD)": `${a.e.t.toFixed(3)}, ${b.e.t.toFixed(3)}`, "depth (ppt)": +(depth * 1000).toPrecision(3), "duration (hours)": +(dur * 24).toFixed(1),
        SNR: +Math.min(a.e.snr, b.e.snr).toFixed(1), "possible periods": aliases.length,
        ...(pinned.length ? { "third dip": `another dip on the star falls on ${pinned.length === 1 ? "this period" : "these periods"}` } : {}),
        ...(unexplained ? { caution: `${unexplained} other similar dip${unexplained === 1 ? "" : "s"} on the star fit no allowed period: may be variability or systematics` } : {}),
        "longest possible periods (days)": aliases.slice(0, 6).map((p) => p.toFixed(2)).join(", "),
        "light curve": `TESS sectors ${a.season.sectors.join(", ")}${b.season !== a.season ? ` and ${b.season.sectors.join(", ")}` : ""}`, playbook: PLAYBOOK_LABEL[star.playbook],
      };
      if (rp) props["implied radius (Earth = 1)"] = +rp.toPrecision(3);
      out.push({ id: "", name: `TIC ${star.tic} · two dips ${(b.e.t - a.e.t).toFixed(1)} d apart`, type: label, category: "candidate", ra: star.ra, dec: star.dec, source: "lightcurves", url: `https://exofop.ipac.caltech.edu/tess/target.php?id=${star.tic}`, props });
    }
    mine.forEach((x, i) => {
      if (used.has(i)) return;
      const { season, e } = x;
      const sameTime = systematic(x);
      const rp = impliedRadiusEarth(e.depth, season.radius);
      let label = "Single-transit event", reason = "one transit-shaped dip, no repeat in any season searched";
      if (sameTime) { label = "Likely systematic (simultaneous dips)"; reason = `${sameTime} other star${sameTime === 1 ? "" : "s"} dip at the same time: spacecraft or scattered light, not the star`; }
      else if (deep(star, season, e)) {
        const own = catalogued(star);
        const d = `${(e.depth * 100).toFixed(1)}% deep${rp ? `, implied radius ${rp.toFixed(0)} R⊕` : ""}: star-sized`;
        if (field.vsx && !own && !VARIABLE_OTYPES.has(star.otype)) { label = "Uncatalogued eclipsing binary (single eclipse)"; reason = `${d}; not in AAVSO VSX or SIMBAD as a variable star`; }
        else { label = "Single eclipse (likely a stellar companion)"; reason = own ? `${d}; VSX lists the star as ${own.name} (${own.type})` : d; }
      } else if (field.unchecked.length) reason += `; not checked against ${field.unchecked.join(" or ")}`;
      out.push(singleObject("", asAnalysisStar(star, season), e, label, reason, season.radius));
    });
  }
  const signals = out.sort((a, b) => rankOf(a) - rankOf(b) || Number(b.props.SNR) - Number(a.props.SNR));
  signals.forEach((o, i) => (o.id = `C${i + 1}`));

  // Variables: each star's strongest period, seen across seasons, through the census.
  type Var = { star: SurveyStar; season: SurveySeason; seen: number };
  const vars: Var[] = [];
  for (const star of stars) {
    const vs = oks(star).filter((s) => s.ls?.variable).sort((a, b) => b.ls!.power - a.ls!.power);
    if (vs.length) vars.push({ star, season: vs[0], seen: vs.filter((s) => periodsMatch(s.ls!.period, vs[0].ls!.period, 0.03)).length });
  }
  const varObjs = vars.map(({ star, season, seen }, i) => {
    const v = season.ls!;
    const own = catalogued(star);
    const shared = vars.filter((x) => x.star !== star && Math.abs(x.season.ls!.period / v.period - 1) < 0.02).length;
    const near = (field.vsx ?? []).find((x) => x !== own && x.period && periodsMatch(v.period, x.period, 0.02) && separation(x.ra, x.dec, star.ra, star.dec) * 60 <= CONTAM_ARCMIN);
    let census: { label: string; reason: string };
    if (own) census = { label: `Catalogued variable: ${own.name} (${own.type})`, reason: `AAVSO VSX lists it${own.period ? ` with P ${own.period} d${periodsMatch(v.period, own.period, 0.03) ? ", which this period matches" : ", unlike this period"}` : ""}` };
    else if (VARIABLE_OTYPES.has(star.otype)) census = { label: `Catalogued variable (SIMBAD: ${OTYPE_LABEL[star.otype] ?? star.otype})`, reason: "SIMBAD already types the star as variable" };
    else if (near) census = { label: `Light from ${near.name}`, reason: `VSX variable ${near.name} (${near.type}, P ${near.period} d) is ${(separation(near.ra, near.dec, star.ra, star.dec) * 60).toFixed(1)}′ away at this period` };
    else if (shared >= 2) census = { label: "Likely systematic variability", reason: `${shared} other stars vary at the same period: instrumental` };
    else if (!field.vsx) census = { label: `Variable star: ${variabilityClass(v.period)}`, reason: "AAVSO VSX unavailable: can't say whether it's catalogued" };
    else if (v.period * 3 > (season.days ?? 27)) census = { label: `Variable star: ${variabilityClass(v.period)}`, reason: "not in VSX or SIMBAD, but the period is too long for the baseline to call it a new periodic variable" };
    else census = { label: `Uncatalogued variable: ${variabilityClass(v.period)}`, reason: "not in AAVSO VSX or SIMBAD as a variable: a new variable star if it holds up (submit to VSX)" };
    const o = variableObject(`V${i + 1}`, asAnalysisStar(star, season), { period: v.period, amplitude: v.amplitude, power: v.power, fap: v.fap, variable: true }, census);
    o.props.seasons = `variable at this period in ${seen} of ${oks(star).length} season${oks(star).length === 1 ? "" : "s"} searched`;
    if (census.label.startsWith("Uncatalogued") && seen >= 2) o.type += ` · seen in ${seen} seasons`;
    return o;
  });

  const all = [...signals, ...varObjs];
  const finds = all.filter(isNewFind);
  const rest = all.filter((o) => !isNewFind(o));
  return {
    objects: [...finds, ...rest.slice(0, MAX_REJECTED)],
    finds: finds.length,
    candidates: finds.filter((o) => /^(Unvetted|Candidate additional|Duotransit)/.test(o.type)).length,
  };
}

// ── progress ────────────────────────────────────────────────────────────────

export function counts(stars: SurveyStar[]) {
  let seasons = 0, seasonsDone = 0, seasonsFailed = 0, lightCurves = 0;
  for (const s of stars) for (const x of s.seasons) {
    seasons++;
    if (x.status === "ok") { seasonsDone++; lightCurves += x.sectors.length; }
    if (x.status === "error") seasonsFailed++;
  }
  return { stars: stars.length, seasons, seasonsDone, seasonsFailed, lightCurves };
}

export function starRows(stars: SurveyStar[]): SurveyStarRow[] {
  return stars.map((s) => ({
    tic: s.tic, name: s.name, ra: s.ra, dec: s.dec, playbook: s.playbook, priority: s.priority, seasons: s.seasons.length,
    done: s.seasons.filter((x) => x.status === "ok").length, failed: s.seasons.filter((x) => x.status === "error").length,
    signals: s.seasons.reduce((k, x) => k + (x.signals?.length ?? 0), 0), singles: s.seasons.reduce((k, x) => k + (x.singles?.length ?? 0), 0),
    variable: s.seasons.some((x) => x.ls?.variable),
  })).sort((a, b) => b.priority - a.priority);
}

/** Pending seasons, highest-priority star first, latest season first within a star. */
/** The next work unit: a pending season of the highest-priority star, or (`recheck`) a searched
 *  season that still has to measure a signal another season of its star found. */
export function nextSeason(stars: SurveyStar[], busy: Set<string>): { star: SurveyStar; index: number; recheck?: boolean } | null {
  let best: { star: SurveyStar; index: number; recheck?: boolean } | null = null;
  for (const star of stars) {
    if (best && star.priority <= best.star.priority) continue;
    const free = (i: number) => !busy.has(`${star.tic}:${i}`);
    const index = star.seasons.findIndex((x, i) => x.status === "pending" && free(i));
    if (index >= 0) { best = { star, index }; continue; }
    const again = star.seasons.findIndex((x, i) => x.status === "ok" && free(i) && forcedTargets(star, x).length > 0);
    if (again >= 0) best = { star, index: again, recheck: true };
  }
  return best;
}

// ── a step ──────────────────────────────────────────────────────────────────

/** "idle": work is left but this step couldn't do any (the chain should not fire again at once). */
export type StepResult = "continue" | "done" | "busy" | "stopped" | "missing" | "idle";

/** One step of a survey: take the lease, plan if needed, search seasons until the budget is used, save
 *  as it goes. Returns "continue" when work is left for the next step. */
export async function runSurveyStep(store: SurveyStore, id: string, owner: string, opts: { budgetMs?: number } = {}): Promise<StepResult> {
  const t0 = Date.now();
  const budget = opts.budgetMs ?? STEP_BUDGET_MS;
  const deadline = t0 + budget;
  if (!(await store.lease(id, owner, deadline + 60_000))) return "busy";
  const ctl = new AbortController();
  try {
    const row = await store.get(id);
    if (!row) return "missing";
    if (row.summary.status !== "running") return row.summary.status === "done" ? "done" : "stopped";
    let summary: SurveySummary = { ...row.summary, steps: row.summary.steps + 1 };
    let notes = row.notes;
    let stars: SurveyStar[], field: SurveyField;
    const dirty = new Set<string>();
    if (!summary.planned) {
      const p = await planSurvey(summary.cone, ctl.signal, summary.llm);
      stars = p.stars; field = p.field;
      notes = [...notes, ...p.notes];
      summary = { ...summary, planned: true, plan: p.plan, ...(p.stars.length ? {} : { note: "No star in this cone has a TESS light curve at MAST." }) };
      stars.forEach((s) => dirty.add(s.tic));
      if (!stars.length) summary.status = "done";
      await store.save(id, owner, { summary: { ...summary, ...counts(stars), updatedAt: Date.now() }, notes, objects: [], field }, stars);
      dirty.clear();
      if (!stars.length) return "done";
    } else {
      [stars, field] = await Promise.all([store.stars(id), store.field(id).then((f) => f ?? { known: [], neighbours: [], unchecked: ["cross-match data"] })]);
    }
    const byTic = new Map(stars.map((s) => [s.tic, s]));
    let stopped = false, lastSave = 0, cpuMs = 0;
    const note = (n: SkyNote) => { notes = [...notes, n].slice(-MAX_NOTES); };
    const reviewed = new Set<number>(row.notes.filter((n) => n.agent === "strategist" && /^\[review \d+%\]/.test(n.text)).map((n) => Number(n.text.match(/\d+/)![0])));

    const save = async (force = false) => {
      if (!force && Date.now() - lastSave < SAVE_EVERY_MS) return;
      lastSave = Date.now();
      const { objects, finds, candidates } = surveyObjects(stars, field);
      summary = { ...summary, ...counts(stars), finds, candidates, cpuMs: summary.cpuMs + cpuMs, updatedAt: Date.now() };
      cpuMs = 0;
      const changed = [...dirty].map((t) => byTic.get(t)!);
      dirty.clear();
      const status = await store.save(id, owner, { summary, notes, objects }, changed);
      if (status === "stopped") { stopped = true; summary.status = "stopped"; ctl.abort(); }
      return objects;
    };

    const review = async () => {
      if (!summary.llm) return;
      const c = counts(stars);
      const pct = c.seasons ? Math.floor((c.seasonsDone + c.seasonsFailed) / c.seasons * 4) * 25 : 0;
      if (!pct || reviewed.has(pct)) return;
      reviewed.add(pct);
      const { objects } = surveyObjects(stars, field);
      if (!objects.some(isNewFind)) { note({ agent: "strategist", text: `[review ${pct}%] ${c.seasonsDone} of ${c.seasons} seasons searched; nothing new has survived vetting yet.` }); return; }
      const lines = objects.slice(0, 60).map((o) => `[${o.id}] ${o.name}: ${o.type} · ${Object.entries(o.props).filter(([k]) => !["light curve", "status", "playbook"].includes(k)).map(([k, v]) => `${k}=${v}`).join("; ")}`).join("\n");
      try {
        const r = await within(claudeSurveyReview(`${pct}% of seasons done: ${c.seasonsDone} searched, ${c.seasonsFailed} failed, of ${c.seasons} (${c.stars} stars).`, lines, new Set(objects.map((o) => o.id)), new Set(byTic.keys()), ctl.signal), 30_000);
        r.notes.forEach((n, i) => note({ agent: "strategist", text: i ? n.text : `[review ${pct}%] ${n.text}`, ids: n.ids }));
        if (!r.notes.length) note({ agent: "strategist", text: `[review ${pct}%] reviewed ${objects.filter(isNewFind).length} new finds.` });
        for (const p of r.prioritize) {
          const s = byTic.get(p.tic)!;
          if (s.seasons.some((x) => x.status === "pending")) { s.priority = Math.max(...stars.map((x) => x.priority)) + 1; dirty.add(s.tic); note({ agent: "strategist", text: `Moved TIC ${p.tic} to the front: ${p.why}` }); }
        }
      } catch (e) {
        note({ agent: "strategist", text: `[review ${pct}%] Claude review failed (${(e as Error).message.slice(0, 60)})` });
      }
    };

    const busy = new Set<string>();
    // Planning may have used part of the budget; short test budgets still leave room for one season.
    const tail = Math.min(STEP_TAIL_MS, budget * 0.4);
    let searched = 0;
    const worker = async () => {
      while (!stopped && Date.now() < deadline - tail) {
        const next = nextSeason(stars, busy);
        if (!next) return;
        const key = `${next.star.tic}:${next.index}`;
        busy.add(key);
        const season = next.star.seasons[next.index];
        const tc = Date.now();
        if (next.recheck) {
          next.star.seasons[next.index] = await recheckSeason(next.star, season, ctl.signal, deadline);
          cpuMs += Date.now() - tc;
          busy.delete(key);
          searched++;
          dirty.add(next.star.tic);
          await save();
          continue;
        }
        let done = await searchSeason(next.star, season, ctl.signal, deadline);
        cpuMs += Date.now() - tc;
        // A failed download goes back in the queue once; a failed analysis would only fail again.
        if (done.status === "error" && done.error?.startsWith("download failed") && (season.tries ?? 0) < DOWNLOAD_TRIES - 1)
          done = { ...season, tries: (season.tries ?? 0) + 1, error: done.error };
        next.star.seasons[next.index] = done;
        busy.delete(key);
        searched++;
        dirty.add(next.star.tic);
        // Something turned up: search this star's other seasons next, to confirm or reject it.
        if (done.status === "ok" && ((done.signals?.length ?? 0) || (done.singles?.length ?? 0)) && next.star.seasons.some((x) => x.status === "pending")) {
          next.star.priority += BUMP;
          if (next.star.priority > 900 && next.star.priority < 1000) next.star.priority = 1000; // ahead of the plan's first picks
        }
        await save();
        await review();
      }
    };
    await Promise.all(Array.from({ length: SURVEY_CONCURRENCY }, worker));
    const left = nextSeason(stars, new Set()) !== null;
    if (!left && !stopped) {
      summary.status = "done";
      summary.finishedAt = Date.now();
      await review();
      const { finds } = surveyObjects(stars, field);
      note({ agent: "strategist", text: `Survey complete: ${counts(stars).seasonsDone} seasons of ${stars.length} stars searched, ${finds} new find${finds === 1 ? "" : "s"} survived vetting.` });
    }
    await save(true);
    return stopped ? "stopped" : !left ? "done" : searched || !row.summary.planned ? "continue" : "idle";
  } finally {
    ctl.abort();
    await store.release(id, owner).catch(() => {});
  }
}
