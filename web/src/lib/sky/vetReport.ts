// Vetter (follow-up): staged vetting of one find, cheapest and most decisive checks first, every check
// logged as pass / flag / fail / not run so a skipped check can't be read as a passed one. Stage 0
// (catalogs, seconds) is a hard gate: a known object or a star-sized companion stops the run before
// any light curve is downloaded, unless forced. Stages 1-3 run on every TESS sector of the star
// (best pipeline per sector, sectors with transits first), Stage 4 recommends observations, and the
// tier (vetShared.ts: tierOf) is Stage 5. See vetShared.ts for the stage list.
import { download } from "./analysis";
import { bls } from "./bls";
import { ctoisFor, exofopTarget, gaiaFlags, inKeplerField, koisNear, tessEb, ticNeighbours, ticStar, type GaiaFlags, type Koi } from "./hostStar";
import { ticProducts, type LcProduct, type LightCurve } from "./lightcurves";
import { isVariable, lombScargle } from "./lombscargle";
import { duotransitAliases } from "./survey";
import { binSeries, cleanSeries, stitch, trimGaps, type Series } from "./timeseries";
import {
  cadenceOf, centralDuration, combine, densityFromTransit, detrendLabel, detrendMasked, fitEphemeris, fitTrapezoid, inOutShift, lowerBound,
  massFromRadius, measureEvent, minPeriodFromCoverage, minPeriodFromDuration, redNoise, rhoOf, rvSemiAmplitude, R_JUP_EARTH, segments, timeEvent,
  type DetrendMethod, type EventMeasure, type ShapeFit, type Window,
} from "./transitFit";
import { BTJD, knownPlanetsNear, periodsMatch, toisNear, type KnownSignal } from "./vetting";
import { isEclipsingType, variablesNear, vsxEntry } from "./vsx";
import { separation } from "./geom";
import { tierOf, type VetCheck, type VetEventRow, type VetInput, type VetReport, type VetStage, type VetStatus, type VetStreamEvent } from "./vetShared";

export const VET_BUDGET_MS = 200_000;
/** Sectors downloaded (best pipeline each), plus a second pipeline for a few sectors with transits. */
export const VET_MAX_SECTORS = 16;
const EXTRA_PIPELINE_SECTORS = 2;
/** 2-min light curves are binned to 5 min: ingress stays resolved for most transits, the arithmetic stays fast. */
const BIN_DAYS = 5 / 1440;
const RANK: Record<LcProduct["pipeline"], number> = { SPOC: 0, "TESS-SPOC": 1, QLP: 2 };
const R_EARTH_PER_RSUN = 109.1;
const ARCSEC_PER_PIXEL = 21;
const R_JUP_LIMIT = 2;

type Part = { lc: LightCurve; raw: Series; flat: Series; cadence: number; beta: number; scatter: number };
type Row = VetEventRow & { part?: Part; m?: EventMeasure };

const settle = <T,>(p: Promise<T>) => p.then((v) => ({ v, err: undefined as string | undefined }), (e: Error) => ({ v: undefined as T | undefined, err: e.message.slice(0, 100) }));
const r3 = (n: number) => +n.toPrecision(3);
const ppt = (d: number) => `${r3(d * 1000)} ppt`;
const hours = (d: number) => `${(d * 24).toFixed(2)} h`;
const btjdNow = () => Date.now() / 86_400_000 + 2440587.5 - BTJD;
const utcOf = (btjd: number) => new Date((btjd + BTJD - 2440587.5) * 86_400_000).toISOString().slice(0, 16).replace("T", " ") + " UTC";

const prepare = (lc: LightCurve) => trimGaps(binSeries(cleanSeries(lc.time, lc.flux, lc.quality), BIN_DAYS));

/** Transit times of an ephemeris inside [from, to]. */
function epochs(P: number, t0: number, from: number, to: number) {
  const out: { n: number; t: number }[] = [];
  for (let n = Math.ceil((from - t0) / P); t0 + n * P <= to; n++) out.push({ n, t: t0 + n * P });
  return out;
}

export async function runVetting(input: VetInput, signal: AbortSignal, emit: (e: VetStreamEvent) => void, opts: { force?: boolean; budgetMs?: number } = {}): Promise<VetReport> {
  const start = Date.now(), deadline = start + (opts.budgetMs ?? VET_BUDGET_MS);
  const ms = () => Date.now() - start;
  const checks: VetCheck[] = [];
  const add = (stage: VetStage, id: string, name: string, status: VetStatus, detail: string, value?: string) => {
    const c: VetCheck = { id, stage, name, status, detail, ...(value ? { value } : {}) };
    checks.push(c);
    emit({ type: "check", check: c, ms: ms() });
  };
  const progress = (text: string) => emit({ type: "progress", text, ms: ms() });
  const d0 = input.duration, depth0 = input.depth;
  const periodic = input.kind === "periodic" && !!input.period && input.t0 !== undefined;

  // ── Stage 0: host star sanity ──
  progress("Stage 0: TIC, Gaia DR3, ExoFOP, CTOIs, the TESS EB catalog, VSX, known planets and TOIs");
  // Everything by TIC id, or around the TIC's position (not the caller's: the star is what matters).
  const productsP = settle(ticProducts(input.tic, signal));
  const exoP = settle(exofopTarget(input.tic, signal)), ctoiP = settle(ctoisFor(input.tic, signal)), ebP = settle(tessEb(input.tic, signal));
  const tic = await settle(ticStar(input.tic, signal));
  const pos = { ra: tic.v?.ra ?? input.ra, dec: tic.v?.dec ?? input.dec };
  const cone = { ...pos, radius: 0.5 / 60 };
  const nbrP = settle(ticNeighbours(pos.ra, pos.dec, 2, signal));
  const [gaia, exo, ctois, eb, vsx, planets, tois, kois] = await Promise.all([
    tic.v?.gaia ? settle(gaiaFlags(tic.v.gaia, signal)) : Promise.resolve({ v: undefined as GaiaFlags | null | undefined, err: tic.err ? "no TIC entry" : "no Gaia id in the TIC" }),
    exoP, ctoiP, ebP,
    settle(variablesNear(cone, signal)), settle(knownPlanetsNear(cone, signal)), settle(toisNear(cone, signal)),
    inKeplerField(pos.ra, pos.dec) ? settle(koisNear(pos.ra, pos.dec, signal)) : Promise.resolve({ v: [] as Koi[], err: undefined }),
  ]);
  const star = tic.v;
  const R = star?.radius, M = star?.mass ?? (star?.logg && R ? (10 ** star.logg * (R * 6.957e10) ** 2) / 6.674e-8 / 1.989e33 : undefined);
  const rho = star?.rho ?? (M && R ? rhoOf(M, R) : undefined);
  const k0 = Math.sqrt(depth0);

  if (star) add(0, "star", "Host star parameters", "info", `TESS Input Catalog v8.2${star.lumclass ? `; luminosity class ${star.lumclass.toLowerCase()}` : ""}`,
    [star.teff && `Teff ${Math.round(star.teff)} K`, R && `R ${r3(R)} R☉`, M && `M ${r3(M)} M☉`, star.logg && `logg ${star.logg.toFixed(2)}`, rho && `ρ ${r3(rho)} ρ☉`, star.tmag !== undefined && `Tmag ${star.tmag.toFixed(2)}`, star.distance && `${Math.round(star.distance)} pc`].filter(Boolean).join(" · "));
  else add(0, "star", "Host star parameters", "not-run", `TIC lookup failed (${tic.err})`);

  // Companion radius: a lower limit (grazing transits and diluted light both hide depth).
  const rp = R ? k0 * R * R_EARTH_PER_RSUN : undefined;
  if (rp === undefined) add(0, "radius", "Companion radius", "not-run", "no stellar radius in the TIC");
  else {
    const rj = rp / R_JUP_EARTH, v = `${r3(rp)} R⊕ (${r3(rj)} R_J)`;
    if (rj > R_JUP_LIMIT) add(0, "radius", "Companion radius", "fail", `larger than ${R_JUP_LIMIT} Jupiter radii: a star or brown dwarf, not a planet (and a lower limit, if the transit is grazing or diluted)`, v);
    else if (rj > 1) add(0, "radius", "Companion radius", "pass", "Jupiter-sized: brown dwarfs and low-mass stars have this radius too, so only a mass (RVs) can tell", v);
    else add(0, "radius", "Companion radius", "pass", "planet-sized", v);
  }

  if (!star) add(0, "host", "Host type", "not-run", "no TIC entry");
  else {
    const why: string[] = [];
    if (star.teff && star.teff > 7500) why.push(`hot (Teff ${Math.round(star.teff)} K): pulsation and fast rotation are likely, and RVs will be hard`);
    if (star.lumclass === "GIANT" || (star.logg !== undefined && star.logg < 3.5)) why.push(`a giant (logg ${star.logg?.toFixed(2) ?? "?"}): a large star makes any companion big, and a blended eclipse easy`);
    else if (star.logg !== undefined && star.logg < 3.9) why.push(`a subgiant (logg ${star.logg.toFixed(2)}): an evolved, larger star`);
    if (why.length) add(0, "host", "Host type", "flag", why.join("; "));
    else add(0, "host", "Host type", "pass", `a main-sequence dwarf${star.teff ? ` (Teff ${Math.round(star.teff)} K)` : ""}`);
  }

  {
    const flags: string[] = [], seen: string[] = [];
    if (gaia.v) {
      seen.push(`Gaia DR3 RUWE ${gaia.v.ruwe?.toFixed(2) ?? "n/a"}`);
      if (gaia.v.ruwe !== undefined && gaia.v.ruwe > 1.4) flags.push(`Gaia RUWE ${gaia.v.ruwe.toFixed(2)} > 1.4: the astrometry doesn't fit a single star (an unresolved companion is likely)`);
      if (gaia.v.nss) flags.push(`Gaia DR3 lists a non-single-star solution (NSS ${gaia.v.nss})`);
    }
    if (exo.v) {
      seen.push(`ExoFOP companions ${exo.v.companions.length}`);
      if (exo.v.companions.length) flags.push(`ExoFOP lists ${exo.v.companions.length} stellar companion${exo.v.companions.length === 1 ? "" : "s"}${exo.v.companions.filter((c) => c.sep !== undefined).map((c) => ` at ${c.sep}″${c.dmag !== undefined ? ` (Δ${c.dmag} mag)` : ""}`).slice(0, 3).join(",")}`);
    }
    if (!gaia.v && !exo.v) add(0, "multiplicity", "Multiplicity", "not-run", `Gaia DR3 (${gaia.err ?? "not found"}) and ExoFOP (${exo.err}) unavailable`);
    else if (flags.length) add(0, "multiplicity", "Multiplicity", "flag", flags.join("; "), seen.join(" · "));
    else add(0, "multiplicity", "Multiplicity", "pass", `no sign of a companion${!gaia.v ? ` (Gaia DR3 not checked: ${gaia.err ?? "no match"})` : ""}${!exo.v ? ` (ExoFOP not checked: ${exo.err})` : ""}`, seen.join(" · "));
  }

  // Already known: a TOI/CTOI/planet/KOI with this signal (on the star = catalogued; on a neighbour = its light).
  const matchesEphem = (P?: number, t0?: number, dur?: number) => {
    if (!P) return false;
    if (periodic) return periodsMatch(input.period!, P, 0.01);
    if (t0 === undefined) return false;
    return (input.times ?? []).some((t) => { const ph = t - t0 - Math.round((t - t0) / P) * P; return Math.abs(ph) < Math.max(dur ?? d0, d0); });
  };
  const self = (k: { tic: string; ra: number; dec: number }) => k.tic === input.tic || separation(k.ra, k.dec, pos.ra, pos.dec) * 3600 < 3;
  let known: string | undefined;
  {
    const lines: string[] = [], other: string[] = [];
    let fail: string | undefined;
    const ks: KnownSignal[] = [...(planets.v ?? []), ...(tois.v ?? [])];
    for (const k of ks) {
      const sep = separation(k.ra, k.dec, pos.ra, pos.dec) * 60;
      if (matchesEphem(k.period, k.t0, k.duration)) {
        if (self(k)) known ??= `${k.name} (P ${k.period.toFixed(4)} d) is this signal, already in the ${k.kind === "planet" ? "NASA Exoplanet Archive" : "TOI list"}`;
        else fail ??= `${k.name} on TIC ${k.tic}, ${sep.toFixed(1)}′ away, has this period: its light leaking in`;
      } else if (self(k)) other.push(`${k.name} (P ${k.period.toFixed(3)} d)`);
    }
    for (const c of ctois.v ?? []) {
      if (matchesEphem(c.period, c.epoch, c.durationH ? c.durationH / 24 : undefined)) known ??= `${c.name} (P ${c.period?.toFixed(4)} d${c.disposition ? `, ${c.disposition}` : ""}) is this signal, already submitted as a community TOI`;
      else other.push(`${c.name}${c.period ? ` (P ${c.period.toFixed(3)} d)` : ""}`);
    }
    for (const k of kois.v ?? []) {
      if (matchesEphem(k.period)) known ??= `${k.name} (${k.disposition}) is this signal, a Kepler Object of Interest`;
      else other.push(k.name);
    }
    // ExoFOP names TOIs "TOI 144.01", the archive "TOI-144.01": anything ExoFOP has that the archive didn't match.
    if (exo.v) for (const t of exo.v.tois) if (!ks.some((k) => k.name === t.replace(" ", "-"))) other.push(t.replace(" ", "-"));
    if (eb.v) {
      const ebHit = periodic ? periodsMatch(input.period!, eb.v.period, 0.01) : matchesEphem(eb.v.period, eb.v.t0);
      if (ebHit) fail ??= `the TESS eclipsing-binary catalog lists the star with P ${eb.v.period.toFixed(4)} d: this is its eclipse`;
      else lines.push(`the TESS EB catalog lists the star as an eclipsing binary (P ${eb.v.period.toFixed(4)} d)`);
    }
    const own = vsx.v ? vsxEntry(pos, vsx.v) : undefined;
    if (own) {
      if (periodic && own.period && isEclipsingType(own.type) && periodsMatch(input.period!, own.period, 0.01)) fail ??= `AAVSO VSX lists the star as ${own.name} (${own.type}, P ${own.period} d): this is its eclipse`;
      else lines.push(`AAVSO VSX lists the star as ${own.name} (${own.type}${own.period ? `, P ${own.period} d` : ""})`);
    }
    if (periodic) for (const v of vsx.v ?? []) {
      if (v === own || !v.period || !isEclipsingType(v.type) || !periodsMatch(input.period!, v.period, 0.01)) continue;
      fail ??= `VSX eclipsing binary ${v.name} (${v.type}, P ${v.period} d) is ${(separation(v.ra, v.dec, pos.ra, pos.dec) * 60).toFixed(1)}′ away at this period: its light leaking in`;
    }
    // A known planet that a binary catalog also lists (the TESS EB catalog has some) is the planet.
    if (known && fail) { lines.push(fail.replace(/: this is its eclipse$/, "")); fail = undefined; }
    const failed = [exo.err && "ExoFOP", ctois.err && "CTOI table", tois.err && "TOI list", planets.err && "Exoplanet Archive", eb.err && "TESS EB catalog", vsx.err && "AAVSO VSX", kois.err && "KOI table"].filter(Boolean);
    const checked = `checked: TOIs, CTOIs, confirmed planets${inKeplerField(pos.ra, pos.dec) ? ", KOIs" : ""}, TESS EB catalog, AAVSO VSX${failed.length ? `; unavailable: ${failed.join(", ")}` : ""}`;
    if (known) add(0, "known", "Already catalogued", "info", `${known}${lines.length ? `; also: ${lines.join("; ")}` : ""}. Not new: add notes on ExoFOP instead of a new submission`, checked);
    else if (fail) add(0, "known", "Already catalogued", "fail", fail, checked);
    else if (failed.length >= 4) add(0, "known", "Already catalogued", "not-run", `${failed.length} of the catalogs were unavailable: it may already be known`, checked);
    else add(0, "known", "Already catalogued", lines.length ? "flag" : "pass", [...lines, other.length ? `the star has other signals on file: ${[...new Set(other)].join(", ")}` : "", lines.length ? "" : "not a TOI, CTOI, known planet or catalogued binary at this period"].filter(Boolean).join("; "), checked);
  }

  const gateFail = checks.find((c) => c.stage === 0 && c.status === "fail");
  const finish = (rest: Partial<VetReport> & { transits: number }): VetReport => {
    const { transits, ...r } = rest;
    const t = tierOf(checks, transits, known);
    const submit = t.tier === "A" || t.tier === "B"
      ? `Eligible for a CTOI at tier ${t.tier}: submit the ephemeris, depth and duration with the open items noted. Check ExoFOP for anything new on the star first.`
      : t.tier === "C" ? "Not ready for a CTOI: resolve the open items first (above all, more transits)."
        : t.tier === "K" ? "Already catalogued: add notes to the existing entry on ExoFOP instead of submitting it again."
          : `Do not submit: ${t.reason}.`;
    const report: VetReport = {
      input, checks, events: [], tier: t.tier, tierReason: t.reason, open: t.open, submit, sectors: [], lightCurves: 0, gated: false, ms: ms(),
      ...(star ? { star: { teff: star.teff, radius: R, mass: M, logg: star.logg, rho, tmag: star.tmag, distance: star.distance, lumclass: star.lumclass } } : {}),
      ...r,
    };
    emit({ type: "report", report, ms: ms() });
    return report;
  };
  if ((known || gateFail) && !opts.force) {
    const why = known ? "already catalogued" : `${gateFail!.name.toLowerCase()} failed`;
    for (const s of [1, 2, 3] as VetStage[]) add(s, `stage${s}`, `Stage ${s}`, "not-run", `Stage 0 gate: ${why}. Run again with "continue past the gate" to see the rest.`);
    return finish({ gated: true, transits: 0 });
  }

  // ── light curves ──
  progress("Downloading every TESS sector of the star (best pipeline per sector)");
  const products = await productsP;
  const prods = products.v ?? [];
  if (!prods.length) {
    const why = products.err ? `MAST lookup failed (${products.err})` : "MAST has no SPOC, TESS-SPOC or QLP light curve for this TIC";
    for (const s of [1, 2, 3] as VetStage[]) add(s, `stage${s}`, `Stage ${s}`, "not-run", why);
    return finish({ transits: 0 });
  }
  const span = { from: Math.min(...prods.map((p) => p.tmin ?? Infinity)), to: Math.max(...prods.map((p) => p.tmax ?? -Infinity)) };
  const planned = periodic && Number.isFinite(span.from) ? epochs(input.period!, input.t0!, span.from - d0, span.to + d0).map((e) => e.t) : input.times ?? [];
  const hasEvent = (p: LcProduct) => p.tmin !== undefined && p.tmax !== undefined && planned.some((t) => t > p.tmin! - d0 && t < p.tmax! + d0);
  const best = new Map<number, LcProduct>();
  for (const p of prods) { const b = best.get(p.sector); if (!b || RANK[p.pipeline] < RANK[b.pipeline]) best.set(p.sector, p); }
  const chosen = [...best.values()].sort((a, b) => Number(hasEvent(b)) - Number(hasEvent(a)) || b.sector - a.sector).slice(0, VET_MAX_SECTORS);
  // A second pipeline (QLP preferred: it also has small and large apertures) for a few sectors with transits.
  const extra = chosen.filter(hasEvent).flatMap((c) => {
    const alt = prods.filter((p) => p.sector === c.sector && p.pipeline !== c.pipeline).sort((a, b) => Number(b.pipeline === "QLP") - Number(a.pipeline === "QLP"))[0];
    return alt ? [alt] : [];
  }).slice(0, EXTRA_PIPELINE_SECTORS);
  const { lcs, errors } = await download([...chosen, ...extra], signal, deadline - 70_000);
  const primary: Part[] = [], alt: Part[] = [];
  const skipped: string[] = [];
  for (const lc of lcs) {
    try {
      const raw = prepare(lc);
      if (raw.t.length < 50) throw new Error("too few good cadences");
      const part: Part = { lc, raw, flat: raw, cadence: cadenceOf(raw.t), beta: 1, scatter: 0 };
      (best.get(lc.sector)?.pipeline === lc.pipeline ? primary : alt).push(part);
    } catch (e) { skipped.push(`s${lc.sector} ${lc.pipeline}: ${(e as Error).message.slice(0, 50)}`); }
  }
  primary.sort((a, b) => a.lc.sector - b.lc.sector);
  const sectors = primary.map((p) => p.lc.sector);
  progress(`${lcs.length} light curves downloaded (sectors ${sectors.join(", ")})${errors.length ? `, ${errors.length} failed` : ""}${skipped.length ? `, ${skipped.length} unusable` : ""}`);
  if (!primary.length) {
    for (const s of [1, 2, 3] as VetStage[]) add(s, `stage${s}`, `Stage ${s}`, "not-run", `no light curve could be downloaded or read (${errors[0] ?? skipped[0] ?? "unknown"})`);
    return finish({ transits: 0, lightCurves: lcs.length });
  }
  const coverage: [number, number][] = primary.flatMap((p) => segments(p.raw.t, 0.2).map(([a, b]) => [p.raw.t[a], p.raw.t[b]] as [number, number]));
  const from = Math.min(...primary.map((p) => p.raw.t[0])), to = Math.max(...primary.map((p) => p.raw.t[p.raw.t.length - 1]));

  // ── ephemeris and detrending ──
  let P = input.period ?? NaN, T0 = input.t0 ?? NaN, dur = d0;
  const windowsOf = (P: number, T0: number, d: number): Window[] => periodic ? epochs(P, T0, from - d, to + d).map((e) => ({ t: e.t, duration: d })) : (input.times ?? []).map((t) => ({ t, duration: d }));
  const baseMethod: DetrendMethod = { kind: "median", window: Math.max(1, 4 * d0) };
  const detrendAll = (parts: Part[], m: DetrendMethod, w: Window[]) => parts.map((p) => detrendMasked(p.raw, w, m, 2));
  const setFlat = (w: Window[]) => {
    const flats = detrendAll([...primary, ...alt], baseMethod, w);
    [...primary, ...alt].forEach((p, i) => {
      p.flat = flats[i];
      p.beta = redNoise(p.flat, dur, w);
      p.scatter = redNoiseFreeScatter(p.flat, w);
    });
  };
  setFlat(windowsOf(P, T0, dur));
  let ephSource = "as found";
  if (periodic) {
    const all = stitch(primary.map((p) => p.flat));
    const total = all.t.length ? all.t[all.t.length - 1] - all.t[0] : 0;
    if (P < total / 2 && Date.now() < deadline - 60_000) {
      try {
        const dP = Math.max(0.003 * P, 0.0005);
        const r = bls(all, { minPeriod: P - dP, maxPeriod: Math.min(P + dP, total / 2), durations: [0.75, 1, 1.25].map((k) => k * d0) });
        const score = (P: number, T0: number, d: number) => combine(epochs(P, T0, from, to).flatMap(({ t }) => { const part = partAt(primary, t, d); const m = part && measureEvent(part.flat, t, d, part.cadence, part.beta); return m && m.coverage >= 0.5 ? [m] : []; })).snr;
        const before = score(P, T0, dur), after = score(r.period, r.t0, r.duration);
        if (after > before * 1.05 && r.depth > 0) {
          // Keep T0 near the reference epoch the find reported.
          const n = Math.round((T0 - r.t0) / r.period);
          P = r.period; T0 = r.t0 + n * r.period; dur = r.duration; ephSource = "refined by BLS on all sectors";
          setFlat(windowsOf(P, T0, dur));
        }
      } catch { /* keep the find's ephemeris */ }
    }
  }

  // ── the individual-transit table ──
  const rows: Row[] = [];
  const rowAt = (n: number, t: number, parts: Part[] = primary): Row | null => {
    const part = partAt(parts, t, dur);
    if (!part) return null;
    const m = measureEvent(part.flat, t, dur, part.cadence, part.beta);
    return { n, t, sector: part.lc.sector, pipeline: part.lc.pipeline, camera: part.lc.camera, ccd: part.lc.ccd, coverage: m?.coverage ?? 0, part, ...(m ? { m, depth: m.depth, err: m.err, snr: m.snr } : {}) };
  };
  if (periodic) for (const e of epochs(P, T0, from - dur, to + dur)) { const r = rowAt(e.n, e.t); if (r) rows.push(r); }
  else (input.times ?? []).forEach((t, i) => { const r = rowAt(i + 1, t); rows.push(r ?? { n: i + 1, t, sector: 0, pipeline: "", coverage: 0, note: "no data at this time in the light curves downloaded" }); });
  const measured = rows.filter((r) => r.m && r.coverage >= 0.5);
  for (const r of rows) if (r.m && r.coverage < 0.5) r.note = "partial: less than half the transit has data";
  const comb = combine(measured.map((r) => r.m!));
  const D = comb.depth > 0 ? comb.depth : depth0;

  // ── shape (needed for timing): folded or stacked transit points ──
  const stack = (times: { t: number; part: Part }[], reach: number) => {
    const dt: number[] = [], f: number[] = [], sg: number[] = [];
    for (const { t, part } of times) {
      const s = part.flat;
      for (let i = lowerBound(s.t, t - reach); i < s.t.length && s.t[i] <= t + reach; i++) { dt.push(s.t[i] - t); f.push(s.f[i]); sg.push(part.scatter || 1e-3); }
    }
    return { dt: Float64Array.from(dt), f: Float64Array.from(f), sg: Float64Array.from(sg) };
  };
  const st = stack(measured.map((r) => ({ t: r.t, part: r.part! })), dur * 2.5);
  let shape: ShapeFit | null = null;
  if (Date.now() < deadline - 40_000) shape = fitTrapezoid(st.dt, st.f, st.sg, dur);

  // ── timing ──
  let ephem: VetReport["ephemeris"] = periodic ? { period: P, t0: T0, source: ephSource } : undefined;
  let timing: ReturnType<typeof fitEphemeris> = null;
  if (shape && measured.length >= 2) {
    const timed: { n: number; t: number; err: number }[] = [];
    for (const r of measured) {
      if ((r.snr ?? 0) < 4) continue;
      const tm = timeEvent(r.part!.flat, r.t, shape, r.part!.scatter || r.m!.scatter, r.part!.cadence, r.part!.beta);
      if (tm) timed.push({ n: r.n, t: tm.t, err: Math.max(tm.err, 1 / 1440) });
    }
    if (periodic) {
      timing = fitEphemeris(timed);
      if (timing) {
        for (const x of timed) { const r = rows.find((y) => y.n === x.n)!; r.oc = x.t - timing.t0 - x.n * timing.P; r.ocErr = x.err; }
        ephem = { period: timing.P, t0: timing.t0, errP: timing.errP, errT0: timing.errT0, source: `linear fit to ${timed.length} timed transits` };
      }
    } else for (const x of timed) { const r = rows.find((y) => y.n === x.n)!; r.oc = x.t - r.t; r.ocErr = x.err; }
  }
  emit({ type: "events", events: rows.map(stripRow), ms: ms() });

  // ── Stage 1: signal integrity ──
  const N = measured.length;
  if (periodic) {
    const det = measured.filter((r) => (r.snr ?? 0) >= 3).length;
    const v = `${N} transit${N === 1 ? "" : "s"} with data in ${new Set(measured.map((r) => r.sector)).size} sector${new Set(measured.map((r) => r.sector)).size === 1 ? "" : "s"}; ${det} individually ≥ 3σ`;
    if (N < 2) add(1, "events", "Individual transits", "fail", "fewer than 2 transits with data: nothing to fold", v);
    else if (N === 2) add(1, "events", "Individual transits", "flag", "only 2 transits: the period rests on one spacing", v);
    else add(1, "events", "Individual transits", "pass", `the period is supported by ${N} independent transits`, v);
  } else {
    const lost = rows.filter((r) => r.m && r.coverage >= 0.5 && (r.snr ?? 0) < 3);
    const v = rows.map((r) => `BTJD ${r.t.toFixed(2)}: ${r.snr !== undefined ? `SNR ${r.snr.toFixed(1)}, ${ppt(r.depth!)}` : "no data"}`).join("; ");
    if (lost.length) add(1, "events", "Individual transits", "fail", `the dip at BTJD ${lost.map((r) => r.t.toFixed(2)).join(", ")} isn't there in a fresh reduction (SNR < 3): a systematic of the first search`, v);
    else if (N < rows.length) add(1, "events", "Individual transits", "not-run", `${rows.length - N} of the listed dips fall outside the light curves that downloaded`, v);
    else add(1, "events", "Individual transits", "flag", input.kind === "single" ? "one transit: the period is unknown" : "two transits: the period rests on one spacing (and its aliases)", v);
  }

  if (!periodic || N < 2) add(1, "snr", "SNR growth", "not-run", periodic ? "fewer than 2 transits" : "needs a periodic signal");
  else {
    const pos = measured.map((r) => Math.max(0, r.snr ?? 0) ** 2), sum = pos.reduce((a, b) => a + b, 0);
    const share = sum ? Math.max(...pos) / sum : 1;
    const flags: string[] = [];
    if (N >= 3 && share > 0.5) flags.push(`one transit (of ${N}) carries ${Math.round(share * 100)}% of the signal: a single event or systematic, not a repeating one`);
    let v = `SNR ${comb.snr.toFixed(1)} over ${N} transits`;
    if (input.snr && input.transits && N > input.transits) {
      const expected = input.snr * Math.sqrt(N / input.transits);
      v += ` (found at SNR ${input.snr.toFixed(1)} on ${input.transits}; √N predicts ${expected.toFixed(1)})`;
      if (comb.snr < 0.5 * expected) flags.push(`SNR grew to ${comb.snr.toFixed(1)}, half or less of the ${expected.toFixed(1)} that √N predicts: the new transits add almost nothing`);
    }
    add(1, "snr", "SNR growth", flags.length ? "flag" : "pass", flags.length ? flags.join("; ") : "the signal builds up across transits as a real one does", v);
  }

  // Period consistency: transits missing where predicted, a dip at half phase, timing scatter.
  if (periodic && N >= 2) {
    const missing = measured.filter((r) => r.coverage >= 0.8 && r.err! > 0 && D / r.err! >= 3 && r.depth! < 0.3 * D);
    const half = combine(epochs(P, T0 + P / 2, from, to).flatMap(({ t }) => { const p = partAt(primary, t, dur); const m = p && measureEvent(p.flat, t, dur, p.cadence, p.beta); return m && m.coverage >= 0.5 ? [m] : []; }));
    const why: string[] = [];
    let status: VetStatus = "pass";
    if (missing.length) {
      why.push(`${missing.length} predicted transit${missing.length === 1 ? "" : "s"} with good data show${missing.length === 1 ? "s" : ""} no dip (BTJD ${missing.slice(0, 4).map((r) => r.t.toFixed(2)).join(", ")}): the period doesn't predict the events`);
      status = missing.length >= 2 && missing.length / N > 0.25 ? "fail" : "flag";
    }
    if (half.snr > 3 && half.depth > 0.5 * D) { why.push(`a dip of ${ppt(half.depth)} at phase 0.5 too: the true period may be P/2 = ${(P / 2).toFixed(4)} d`); if (status === "pass") status = "flag"; }
    if (timing && timing.dof >= 1 && timing.chi2 / timing.dof > 4) { why.push(`transit times scatter about the linear ephemeris (χ²/dof ${(timing.chi2 / timing.dof).toFixed(1)}): timing variations, or not one periodic source`); if (status === "pass") status = "flag"; }
    if (timing && input.period && Math.abs(timing.P - input.period) > 5 * timing.errP && Math.abs(timing.P / input.period - 1) > 0.002) why.push(`period moved from ${input.period.toFixed(5)} to ${timing.P.toFixed(5)} d with all the data`);
    const v = ephem ? `P ${ephem.period.toFixed(5)}${ephem.errP ? ` ± ${ephem.errP.toFixed(5)}` : ""} d` : undefined;
    add(1, "period", "Period consistency", status, why.length ? why.join("; ") : `every covered transit lines up with the ephemeris; 2P is tested by odd/even in Stage 2${timing ? `; timing χ²/dof ${(timing.chi2 / Math.max(1, timing.dof)).toFixed(1)}` : ""}`, v);
  } else if (input.kind === "duo") {
    const r = rows.filter((x) => x.oc !== undefined);
    add(1, "period", "Period consistency", "info", r.length ? `the dips' fitted times move by ${r.map((x) => `${(x.oc! * 1440).toFixed(0)} min`).join(" and ")}` : "two dips: no period to test beyond their spacing", `spacing ${((input.times![1] - input.times![0])).toFixed(3)} d`);
  } else add(1, "period", "Period consistency", "not-run", periodic ? "fewer than 2 transits" : "one transit: no period");

  // Aliases.
  let duoAliases: number[] = [];
  const minPdur = rho && shape ? minPeriodFromDuration(shape.T14, rho, Math.sqrt(D)) : rho ? minPeriodFromDuration(dur, rho, Math.sqrt(D)) : undefined;
  if (periodic && N >= 2) {
    const survive: string[] = [], excluded: string[] = [];
    for (let k = 2; k <= 5; k++) {
      const extraTimes = epochs(P, T0, from, to).flatMap(({ t }) => Array.from({ length: k - 1 }, (_, m) => t + ((m + 1) * P) / k));
      const ms_ = extraTimes.flatMap((t) => { const p = partAt(primary, t, dur); const m = p && measureEvent(p.flat, t, dur, p.cadence, p.beta); return m && m.coverage >= 0.5 ? [m] : []; });
      const c = combine(ms_);
      const label = `P/${k} = ${(P / k).toFixed(4)} d`;
      if (ms_.length && D / c.err >= 4 && c.depth < 0.3 * D) excluded.push(label);
      else if (ms_.length && c.snr > 3 && c.depth > 0.5 * D) survive.push(`${label} (dips there too)`);
      else survive.push(`${label} (${ms_.length ? "too little data at the extra times" : "extra transits fall in gaps"})`);
    }
    add(1, "aliases", "Alias periods", survive.length ? "flag" : "pass", survive.length ? `not ruled out: ${survive.join(", ")}` : "P/2 to P/5 each predict transits where the data show none", excluded.length ? `ruled out: ${excluded.join(", ")}` : undefined);
  } else if (input.kind === "duo" && input.times!.length >= 2) {
    const [t1, t2] = [...input.times!].sort((a, b) => a - b);
    let aliases = duotransitAliases(t1, t2, dur, coverage, 1, 2000);
    const T14 = shape?.T14 ?? dur;
    const fitDur = M && R ? aliases.filter((p) => centralDuration(p, M, R, Math.sqrt(D)) * 1.3 >= T14) : aliases;
    const tooLong = aliases.length - fitDur.length;
    aliases = fitDur;
    duoAliases = aliases;
    const v = aliases.length ? `${aliases.length} allowed: ${aliases.slice(0, 6).map((p) => p.toFixed(2)).join(", ")}${aliases.length > 6 ? " …" : ""} d` : "none";
    if (!aliases.length) add(1, "aliases", "Alias periods", "fail", "no period fits both dips: each predicts another transit where TESS watched and saw none, or a transit longer than the star allows", v);
    else add(1, "aliases", "Alias periods", aliases.length === 1 ? "pass" : "flag", `${aliases.length === 1 ? "only one period fits both dips and the coverage" : `${aliases.length} periods fit both dips and the coverage`}${tooLong ? `; ${tooLong} shorter ${tooLong === 1 ? "one is" : "ones are"} ruled out because the transit is too long for them` : ""}`, v);
    if (aliases.length === 1) ephem = { period: aliases[0], t0: t1, source: "the only alias that fits the coverage" };
  } else if (input.kind === "single") {
    const minCov = minPeriodFromCoverage(input.times![0], coverage, dur);
    add(1, "aliases", "Alias periods", "info", `periods under ${minCov.toFixed(1)} d would have shown a second transit in the data around the dip${minPdur ? `; on this star a ${hours(shape?.T14 ?? dur)} transit needs P ≳ ${minPdur.toFixed(1)} d (central, circular orbit)` : ""}`, `P > ${Math.max(minCov, minPdur ?? 0).toFixed(1)} d`);
  } else add(1, "aliases", "Alias periods", "not-run", "fewer than 2 transits");

  // Detrending sensitivity.
  const eventTimes = measured.map((r) => r.t);
  if (!eventTimes.length) add(1, "detrend", "Detrending sensitivity", "not-run", "no transit with data");
  else if (Date.now() > deadline - 45_000) add(1, "detrend", "Detrending sensitivity", "not-run", "time budget used up");
  else {
    const w = windowsOf(P, T0, dur);
    const methods: DetrendMethod[] = [...new Set([Math.max(0.5, 2.5 * dur), Math.max(1, 4 * dur), Math.max(2, 7 * dur)].map((x) => +x.toFixed(2)))].map((window) => ({ kind: "median" as const, window }));
    methods.push({ kind: "loess", window: +Math.max(1.5, 5 * dur).toFixed(2) });
    const res = methods.map((m) => {
      const flats = detrendAll(primary, m, w);
      const c = combine(measured.flatMap((r) => { const i = primary.indexOf(r.part!); const mm = measureEvent(flats[i], r.t, dur, r.part!.cadence, r.part!.beta); return mm && mm.coverage >= 0.5 ? [mm] : []; }));
      return { m, c };
    });
    const v = res.map(({ m, c }) => `${detrendLabel(m)}: ${ppt(c.depth)} (SNR ${c.snr.toFixed(1)})`).join("; ");
    const lost = res.filter(({ c }) => !(c.snr >= 3));
    const off = res.filter(({ c }) => Math.abs(c.depth / D - 1) > 0.3);
    if (lost.length) add(1, "detrend", "Detrending sensitivity", "fail", `the signal disappears with ${lost.map(({ m }) => detrendLabel(m)).join(", ")}: an artefact of one reduction`, v);
    else if (off.length) add(1, "detrend", "Detrending sensitivity", "flag", `the depth changes by more than 30% with ${off.map(({ m }) => detrendLabel(m)).join(", ")}`, v);
    else add(1, "detrend", "Detrending sensitivity", "pass", `survives ${res.length} detrendings (two methods, transits masked) with the depth within 30%`, v);
  }

  // Depth stability across sectors, cameras and pipelines.
  {
    const by = (key: (r: Row) => string) => {
      const g = new Map<string, Row[]>();
      for (const r of measured) g.set(key(r), [...(g.get(key(r)) ?? []), r]);
      return [...g].map(([k, rs]) => ({ k, ...combine(rs.map((r) => r.m!)) }));
    };
    const groups = [{ name: "sector", gs: by((r) => `s${r.sector}`) }, { name: "camera", gs: by((r) => `camera ${r.camera ?? "?"}`) }, { name: "pipeline", gs: by((r) => r.pipeline) }].filter((x) => x.gs.length >= 2);
    if (!groups.length) add(1, "depth", "Depth stability", "not-run", "transits in only one sector");
    else {
      const bad: string[] = [];
      for (const { name, gs } of groups) for (const g of gs) {
        const dev = Math.abs(g.depth - D) / g.err;
        if (dev > 3 && Math.abs(g.depth / D - 1) > 0.25) bad.push(`${g.k} ${ppt(g.depth)} vs ${ppt(D)} overall (${dev.toFixed(1)}σ, by ${name})`);
      }
      const v = groups[0].gs.map((g) => `${g.k} ${ppt(g.depth)} ± ${r3(g.err * 1000)}`).join("; ");
      add(1, "depth", "Depth stability", bad.length ? "flag" : "pass", bad.length ? `depth differs: ${bad.slice(0, 3).join("; ")}` : `consistent across ${groups.map((g) => `${g.gs.length} ${g.name}s`).join(", ")}`, v);
    }
  }

  // ── Stage 2: astrophysical false positives ──
  if (periodic && N >= 2) {
    const odd = measured.filter((r) => ((r.n % 2) + 2) % 2 === 1), even = measured.filter((r) => ((r.n % 2) + 2) % 2 === 0);
    if (!odd.length || !even.length) add(2, "oddeven", "Odd/even depths", "not-run", "transits of only one parity have data");
    else {
      const o = combine(odd.map((r) => r.m!)), e = combine(even.map((r) => r.m!));
      const sig = Math.abs(o.depth - e.depth) / Math.hypot(o.err, e.err);
      const v = `odd ${ppt(o.depth)} ± ${r3(o.err * 1000)}, even ${ppt(e.depth)} ± ${r3(e.err * 1000)} (${sig.toFixed(1)}σ)`;
      if (sig > 3 && Math.abs(o.depth - e.depth) > 0.1 * D) add(2, "oddeven", "Odd/even depths", "fail", `alternate transits differ by ${sig.toFixed(1)}σ: two different eclipses, an eclipsing binary at ${(2 * P).toFixed(4)} d`, v);
      else add(2, "oddeven", "Odd/even depths", "pass", "alternate transits agree within 3σ", v);
    }
    // Secondary eclipse at phase 0.5, and anywhere else (eccentric orbits).
    const at = (ph: number) => combine(epochs(P, T0 + ph * P, from, to).flatMap(({ t }) => { const p = partAt(primary, t, dur); const m = p && measureEvent(p.flat, t, dur, p.cadence, p.beta); return m && m.coverage >= 0.5 ? [m] : []; }));
    const sec = at(0.5);
    let worst = { ph: 0, snr: 0, depth: 0 };
    if (Date.now() < deadline - 30_000) {
      const step = Math.max(dur / P / 2, 0.005);
      for (let ph = 0.1; ph <= 0.9; ph += step) {
        if (Math.abs(ph - 0.5) < dur / P) continue;
        const c = at(ph);
        if (c.snr > worst.snr) worst = { ph, snr: c.snr, depth: c.depth };
      }
    }
    const v = `phase 0.5: ${Number.isFinite(sec.depth) ? `${ppt(sec.depth)} (${sec.snr.toFixed(1)}σ)` : "no data"}${worst.snr ? `; deepest elsewhere: phase ${worst.ph.toFixed(2)}, ${ppt(worst.depth)} (${worst.snr.toFixed(1)}σ)` : ""}`;
    if (!Number.isFinite(sec.depth)) add(2, "secondary", "Secondary eclipse", "not-run", "no data at phase 0.5");
    else if (sec.snr > 3 && sec.depth > 0.1 * D) add(2, "secondary", "Secondary eclipse", "fail", `a ${sec.snr.toFixed(1)}σ eclipse at phase 0.5, ${Math.round((sec.depth / D) * 100)}% of the transit depth: too bright to be a planet's occultation`, v);
    else if (worst.snr > 4 && worst.depth > 0.1 * D) add(2, "secondary", "Secondary eclipse", "flag", `a ${worst.snr.toFixed(1)}σ dip at phase ${worst.ph.toFixed(2)}: a secondary eclipse on an eccentric orbit?`, v);
    else add(2, "secondary", "Secondary eclipse", "pass", sec.snr > 3 ? "a shallow occultation at phase 0.5 (under 10% of the depth): consistent with a hot planet's thermal emission" : "no secondary eclipse at phase 0.5 or elsewhere", v);
  } else {
    add(2, "oddeven", "Odd/even depths", "not-run", "needs a periodic signal with 2+ transits");
    add(2, "secondary", "Secondary eclipse", "not-run", "needs a period");
  }

  const totalSnr = comb.snr;
  if (!shape) add(2, "shape", "Transit shape", "not-run", N ? "the trapezoid fit didn't converge" : "no transit with data");
  else if (!(totalSnr >= 10)) add(2, "shape", "Transit shape", "not-run", `SNR ${totalSnr.toFixed(1)} is too low to tell a V from a U`, `T14 ${hours(shape.T14)}`);
  else {
    const v = `T14 ${hours(shape.T14)}, ingress ${hours(shape.T12)} (${Math.round(shape.vRatio * 100)}% of the half-duration); depth ${ppt(shape.depth)}`;
    const why: string[] = [];
    if (shape.vRatio >= 0.8 && shape.dChi2V > 9) why.push(`V-shaped (a V fits better by Δχ² ${shape.dChi2V.toFixed(0)}): grazing, or an eclipsing binary`);
    if (shape.asymSigma > 3 && Math.abs(shape.asym) > 0.2) why.push(`asymmetric: the ${shape.asym > 0 ? "first" : "second"} half is ${Math.round(Math.abs(shape.asym) * 100)}% deeper (${shape.asymSigma.toFixed(1)}σ)`);
    add(2, "shape", "Transit shape", why.length ? "flag" : "pass", why.length ? why.join("; ") : shape.vRatio < 0.6 ? "flat-bottomed and symmetric, as a planet transit is" : "symmetric; the ingress is long but a V isn't strongly preferred", v);
  }

  if (!periodic) add(2, "duration", "Duration vs expected", minPdur ? "info" : "not-run", minPdur ? `with no period, the duration bounds it instead: P ≳ ${minPdur.toFixed(1)} d on this star (central, circular orbit)` : "no period and no stellar density");
  else if (!M || !R) add(2, "duration", "Duration vs expected", "not-run", "no stellar mass and radius");
  else {
    const T14 = shape?.T14 ?? dur, exp = centralDuration(P, M, R, Math.sqrt(D)), ratio = T14 / exp;
    const v = `${hours(T14)} measured vs ${hours(exp)} for a central transit (ratio ${ratio.toFixed(2)})`;
    if (ratio > 2.5) add(2, "duration", "Duration vs expected", "fail", "far longer than any transit at this period on this star: a different (larger) host, i.e. a blended background binary, or the wrong period", v);
    else if (ratio > 1.5) add(2, "duration", "Duration vs expected", "flag", "longer than a central transit allows: an eccentric orbit, a larger star than catalogued, or the wrong period", v);
    else if (ratio < 0.3) add(2, "duration", "Duration vs expected", "flag", "much shorter than expected: a very grazing orbit, or a blend around a different (smaller, denser) star", v);
    else add(2, "duration", "Duration vs expected", "pass", "consistent with a transit across this star", v);
  }

  if (!periodic || !shape) add(2, "density", "Stellar density", "not-run", !periodic ? "needs a period" : "no shape fit");
  else if (!rho) add(2, "density", "Stellar density", "not-run", "no catalog density");
  else if (!(totalSnr >= 15) || shape.T12 < 1.5 * Math.min(...measured.map((r) => r.part!.cadence))) add(2, "density", "Stellar density", "not-run", `ingress not resolved (SNR ${totalSnr.toFixed(1)}, ingress ${hours(shape.T12)})`);
  else {
    const dens = densityFromTransit(P, shape.depth, shape.T14, shape.T12);
    if (!dens) add(2, "density", "Stellar density", "not-run", "the fitted shape has no flat bottom, so the impact parameter is unconstrained");
    else {
      const ratio = dens.rho / rho, v = `ρ★ ${r3(dens.rho)} ρ☉ from the transit (b ≈ ${dens.b.toFixed(2)}) vs ${r3(rho)} ρ☉ catalog (×${r3(ratio)})`;
      add(2, "density", "Stellar density", ratio < 0.25 || ratio > 4 ? "flag" : "pass", ratio < 0.25 || ratio > 4 ? "the transit implies a star of a different density: an eccentric orbit, the wrong host (a blend), or the wrong period" : "the transit shape fits this star", v);
    }
  }

  // Variability at the transit period: Lomb-Scargle on each sector's un-flattened light curve
  // (transits masked; one periodogram over years of baseline costs minutes), strongest significant one kept.
  {
    const w = windowsOf(P, T0, dur);
    try {
      const all = primary.slice(-8).flatMap((p) => { try { return [lombScargle(maskedRaw(p.raw, w), { maxPeriod: 13 })]; } catch { return []; } });
      if (!all.length) throw new Error("light curves too short for a periodogram");
      const sig = all.filter(isVariable);
      const ls = (sig.length ? sig : all).sort((a, b) => b.power - a.power)[0];
      const v = isVariable(ls) ? `P ${r3(ls.period)} d, ${r3(ls.amplitude * 1000)} ppt (significant in ${sig.length} of ${all.length} sectors)` : `no significant variability in ${all.length} sector${all.length === 1 ? "" : "s"}`;
      const hot = star?.teff && star.teff > 7500 ? "; a hot star: δ Scuti / γ Dor pulsation is common" : "";
      if (periodic && isVariable(ls)) {
        const r = P / ls.period, n = Math.round(r >= 1 ? r : 1 / r);
        const hit = n >= 1 && n <= 6 && Math.abs((r >= 1 ? r : 1 / r) / n - 1) < 0.01 * n;
        add(2, "variability", "Variability at the transit period", hit ? "flag" : "pass", hit ? `the star varies at ${n === 1 ? "the transit period" : r >= 1 ? `P/${n}` : `${n}×P`}: rotation or pulsation could make the dips (or an ellipsoidal binary)${hot}` : `not at the transit period or a harmonic${hot}`, v);
      } else add(2, "variability", "Variability at the transit period", isVariable(ls) ? "info" : "pass", (isVariable(ls) ? "the star varies (out of transit)" : "out-of-transit light curve is quiet") + hot, v);
    } catch (e) { add(2, "variability", "Variability at the transit period", "not-run", (e as Error).message.slice(0, 80)); }
  }

  // ── Stage 3: contamination and blends ──
  const allParts = [...primary, ...alt];
  let exclArcsec: number | undefined;
  {
    const per: { dx: number; dy: number; ex: number; ey: number; sector: number; pipeline: string; off: number; offErr: number }[] = [];
    for (const p of allParts) {
      if (!p.lc.cx || !p.lc.cy) continue;
      const times = measured.filter((r) => r.sector === p.lc.sector).map((r) => r.t);
      if (!times.length) continue;
      const c = centroidSeries(p.lc);
      if (!c) continue;
      const sx = inOutShift(c.t, c.x, times, dur), sy = inOutShift(c.t, c.y, times, dur);
      if (!sx || !sy) continue;
      const shift = Math.hypot(sx.shift, sy.shift), err = Math.hypot(sx.err, sy.err) / Math.SQRT2;
      per.push({ dx: sx.shift, dy: sy.shift, ex: sx.err, ey: sy.err, sector: p.lc.sector, pipeline: p.lc.pipeline, off: (shift / D) * ARCSEC_PER_PIXEL, offErr: (err / D) * ARCSEC_PER_PIXEL });
    }
    if (!per.length) add(3, "centroid", "Centroid shift", "not-run", "no centroid columns in the light curves with transits");
    else {
      const chi2 = per.reduce((k, x) => k + (x.dx / x.ex) ** 2 + (x.dy / x.ey) ** 2, 0), dof = 2 * per.length;
      const z = (chi2 - dof) / Math.sqrt(2 * dof);
      const w = per.map((x) => 1 / x.offErr ** 2), sw = w.reduce((a, b) => a + b, 0);
      const off = per.reduce((k, x, i) => k + w[i] * x.off, 0) / sw, offErr = 1 / Math.sqrt(sw);
      exclArcsec = Math.max(3 * offErr, off + 3 * offErr);
      const v = `${per.length} sector${per.length === 1 ? "" : "s"}; implied source offset ${off.toFixed(1)} ± ${offErr.toFixed(1)}″ (shift ${Math.max(0, z).toFixed(1)}σ)`;
      if (z >= 5 && off > ARCSEC_PER_PIXEL) add(3, "centroid", "Centroid shift", "fail", `the light centroid moves during transit, as if the source were ~${off.toFixed(0)}″ away: the dip is on a neighbour`, v);
      else if (z >= 3) add(3, "centroid", "Centroid shift", "flag", "the centroid moves during transit: the source may be off-target (or crowding moves the centroid)", v);
      else add(3, "centroid", "Centroid shift", "pass", `no significant centroid motion: the source is within ~${exclArcsec.toFixed(0)}″ of the target (3σ)`, v);
    }
  }
  add(3, "diffimage", "Difference imaging", "not-run", "needs target pixel files (TESScut / TPFs), not fetched here; the centroid shift is the light-curve proxy");

  {
    const qlp = allParts.filter((p) => p.lc.small && p.lc.large && measured.some((r) => r.sector === p.lc.sector));
    if (!qlp.length) add(3, "aperture", "Aperture dependence", "not-run", "no QLP light curve (small and large apertures) covers a transit");
    else {
      const w = windowsOf(P, T0, dur);
      const depthIn = (col: "small" | "large") => combine(qlp.flatMap((p) => {
        let s: Series;
        try { s = detrendMasked(trimGaps(binSeries(cleanSeries(p.lc.time, p.lc[col]!, p.lc.quality), BIN_DAYS)), w, baseMethod, 2); } catch { return []; }
        const beta = redNoise(s, dur, w), cad = cadenceOf(s.t);
        return measured.filter((r) => r.sector === p.lc.sector).flatMap((r) => { const m = measureEvent(s, r.t, dur, cad, beta); return m && m.coverage >= 0.5 ? [m] : []; });
      }));
      const sm = depthIn("small"), lg = depthIn("large");
      const sig = Math.abs(lg.depth - sm.depth) / Math.hypot(lg.err, sm.err), ratio = lg.depth / sm.depth;
      const v = `small ${ppt(sm.depth)} ± ${r3(sm.err * 1000)}, large ${ppt(lg.depth)} ± ${r3(lg.err * 1000)} (QLP, ${qlp.length} sector${qlp.length === 1 ? "" : "s"})`;
      // QLP's small (1x1 px) and large (5x5 px) apertures aren't dilution-corrected like its best one:
      // WASP-18 b, on target and isolated, comes out 3x deeper in the large one. Shown, not scored.
      if (!Number.isFinite(sig)) add(3, "aperture", "Aperture dependence", "not-run", "the aperture light curves couldn't be measured", v);
      else add(3, "aperture", "Aperture dependence", "info", `large/small depth ratio ${ratio.toFixed(2)} (${sig.toFixed(1)}σ). Not scored: QLP's 1x1 and 5x5 px apertures aren't dilution-corrected, and known on-target planets differ by up to 3x too; a pixel-level (TPF) test is needed`, v);
    }
  }

  {
    const nb = await nbrP;
    if (!nb.v) add(3, "neighbours", "Nearby sources", "not-run", `TIC cone search failed (${nb.err})`);
    else if (star?.tmag === undefined) add(3, "neighbours", "Nearby sources", "not-run", "no TESS magnitude for the target");
    else {
      const capable = nb.v.filter((n) => n.tic !== input.tic).map((n) => {
        const fr = 10 ** (-0.4 * (n.tmag - star.tmag!));
        return { ...n, need: (D * (1 + fr)) / fr };
      }).filter((n) => n.need <= 1).sort((a, b) => a.sep - b.sep);
      const open = capable.filter((n) => exclArcsec === undefined || n.sep <= exclArcsec);
      const close = open.filter((n) => n.sep <= 63);
      const v = `${capable.length} of ${nb.v.length - 1} TIC stars within 2′ could cause a ${ppt(D)} dip if eclipsed${capable.length ? `: ${capable.slice(0, 4).map((n) => `TIC ${n.tic} at ${n.sep.toFixed(0)}″, T ${n.tmag.toFixed(1)} (needs a ${Math.round(n.need * 100)}% eclipse)`).join("; ")}` : ""}`;
      if (!capable.length) add(3, "neighbours", "Nearby sources", "pass", "no star within 2′ is bright enough to make this dip, even fully eclipsed", v);
      else if (close.length) add(3, "neighbours", "Nearby sources", "flag", `${close.length} star${close.length === 1 ? "" : "s"} within 1′ (3 TESS pixels) could make the dip${exclArcsec !== undefined ? " and the centroid test doesn't rule them out" : ""}: needs higher-resolution photometry`, v);
      else add(3, "neighbours", "Nearby sources", "pass", exclArcsec !== undefined && open.length < capable.length ? `the centroid test rules out ${capable.length - open.length} of them; the rest are over 1′ away` : "the ones that could are over 1′ away", v);
    }
  }

  if (star?.tmag === undefined) add(3, "saturation", "Saturation", "not-run", "no TESS magnitude");
  else if (star.tmag < 6.8) add(3, "saturation", "Saturation", "flag", "bright enough to saturate: bleed columns can fall outside the aperture and dilute or distort the transit", `Tmag ${star.tmag.toFixed(2)}`);
  else add(3, "saturation", "Saturation", "pass", "too faint to saturate", `Tmag ${star.tmag.toFixed(2)}`);

  {
    const crowd = primary.map((p) => p.lc.crowdsap).filter((x): x is number => x !== undefined);
    const c = crowd.length ? crowd.reduce((a, b) => a + b, 0) / crowd.length : undefined;
    const contam = exo.v?.contamination;
    if (c === undefined && contam === undefined) add(3, "crowding", "Crowding", "not-run", "no SPOC crowding estimate or TIC contamination ratio");
    else {
      const frac = c !== undefined ? 1 - c : contam! / (1 + contam!);
      const v = c !== undefined ? `SPOC CROWDSAP ${c.toFixed(3)}` : `TIC contamination ratio ${contam!.toFixed(3)}`;
      add(3, "crowding", "Crowding", frac > 0.2 ? "flag" : "pass", frac > 0.2 ? `${Math.round(frac * 100)}% of the aperture's light comes from other stars: a blend has room to hide` : `${Math.round(frac * 100)}% of the light is from other stars`, v);
    }
  }

  {
    const pairs = alt.flatMap((a) => {
      const p = primary.find((x) => x.lc.sector === a.lc.sector);
      if (!p) return [];
      const rs = measured.filter((r) => r.sector === a.lc.sector);
      const ca = combine(rs.flatMap((r) => { const m = measureEvent(a.flat, r.t, dur, a.cadence, a.beta); return m && m.coverage >= 0.5 ? [m] : []; }));
      const cp = combine(rs.map((r) => r.m!));
      return Number.isFinite(ca.depth) && Number.isFinite(cp.depth) ? [{ sector: a.lc.sector, a: a.lc.pipeline, p: p.lc.pipeline, ca, cp }] : [];
    });
    if (!pairs.length) add(3, "pipelines", "Independent pipelines", "not-run", "no sector with a transit has a second pipeline's light curve");
    else {
      const bad = pairs.filter((x) => Math.abs(x.ca.depth - x.cp.depth) / Math.hypot(x.ca.err, x.cp.err) > 3 && Math.abs(x.ca.depth / x.cp.depth - 1) > 0.3);
      const v = pairs.map((x) => `s${x.sector}: ${x.p} ${ppt(x.cp.depth)}, ${x.a} ${ppt(x.ca.depth)}`).join("; ");
      add(3, "pipelines", "Independent pipelines", bad.length ? "flag" : "pass", bad.length ? "the depth differs between pipelines' reductions of the same sector" : "two pipelines' reductions of the same sectors agree", v);
    }
  }

  {
    const years = new Set(measured.map((r) => Math.floor((r.t - 1325) / 365.25)));
    const dataYears = new Set(primary.map((p) => Math.floor((p.raw.t[0] - 1325) / 365.25)));
    const ground = exo.v?.photometry ?? 0;
    const v = `transits in ${years.size} TESS year${years.size === 1 ? "" : "s"} (data in ${dataYears.size})${ground ? `; ${ground} ground-based light curve${ground === 1 ? "" : "s"} on ExoFOP` : ""}`;
    if (dataYears.size < 2) add(3, "independent", "Another season", "not-run", "only one year of TESS data", v);
    else if (years.size >= 2) add(3, "independent", "Another season", "pass", "seen in TESS data more than a year apart", v);
    else add(3, "independent", "Another season", input.kind === "single" ? "info" : "flag", input.kind === "single" ? "a single transit can only be in one season" : "transits only in one year, though other years have data", v);
  }

  // ── Stage 4: follow-up observations (recommended, never run here) ──
  const rejected = checks.some((c) => c.status === "fail");
  const nTransits = periodic ? N : rows.filter((r) => r.m && r.coverage >= 0.5).length;
  // The period for RV estimates: the ephemeris, else the shortest allowed alias, else the lower bound.
  const minCovSingle = input.kind === "single" ? minPeriodFromCoverage(input.times![0], coverage, dur) : 0;
  const Pf = ephem?.period ?? (duoAliases.length ? Math.min(...duoAliases) : Math.max(minPdur ?? 0, minCovSingle) || undefined);
  let next: VetReport["next"];
  if (ephem && (periodic || input.kind === "duo")) {
    const now = btjdNow();
    next = epochs(ephem.period, ephem.t0, now, now + Math.max(ephem.period * 3.5, 0)).slice(0, 3).map(({ n, t }) => {
      const err = ephem!.errT0 !== undefined && ephem!.errP !== undefined ? Math.hypot(ephem!.errT0, n * ephem!.errP) : undefined;
      return { t, ...(err !== undefined ? { err } : {}), utc: utcOf(t) };
    });
  }
  if (rejected) add(4, "followup", "Follow-up observations", "not-run", "not recommended: rejected above");
  else {
    const img = exo.v?.imaging ?? [];
    add(4, "imaging", "High-resolution imaging", "not-run", img.length ? `already on ExoFOP: ${img.slice(0, 3).map((i) => `${i.telescope} ${i.type.toLowerCase()} (${i.date}${i.contrast ? `, ${i.contrast}` : ""})`).join("; ")}` : "speckle or AO imaging to find companions at 0.05-2″ (none on ExoFOP yet)");
    const ground = D >= 1e-3 ? "deep enough for 0.4-1 m telescopes" : D >= 4e-4 ? "shallow: needs a 1-2 m telescope and good conditions" : "too shallow for most ground telescopes: needs space photometry (TESS, CHEOPS)";
    add(4, "photometry", "Ground photometry", "not-run", next?.length
      ? `${ground}; next transits ${next.map((x) => `${x.utc}${x.err ? ` ± ${Math.max(1, Math.round(x.err * 1440))} min` : ""}`).join(", ")} (BJD-based; UTC differs by up to ~8 min)`
      : duoAliases.length > 1
        ? `${ground}; several periods allowed, so watch each alias's next predicted transit: ${aliasWindows(duoAliases, Math.max(...input.times!), btjdNow()).map((w) => `P ${w.periods.map((p) => p.toFixed(1)).join(" or ")} d → ${utcOf(w.t)}`).join("; ")} (a dip there fixes the period; none rules ${duoAliases.length > 1 ? "those periods" : "it"} out)`
        : `${ground}; no ephemeris yet (one transit): it needs more TESS data first`);
    if (M && Pf) {
      const kStar = rvSemiAmplitude(Pf, 0.08 * 333_000, M) / 1000;
      add(4, "reconrv", "Reconnaissance RVs", "not-run", `a 0.08 M☉ companion at P ${ephem ? "" : "≥ "}${r3(Pf)} d would give K ≈ ${r3(kStar)} km/s: a few spectra at ~100 m/s rule out a stellar companion and show double lines`);
      const rpE = rp ?? (R ? Math.sqrt(D) * R * R_EARTH_PER_RSUN : undefined);
      if (rpE) {
        const mp = massFromRadius(rpE), K = rvSemiAmplitude(Pf, mp, M);
        const hard = (star?.teff ?? 0) > 6500 ? `the host is hot (Teff ${Math.round(star!.teff!)} K), with few lines and likely fast rotation: precision RVs will be hard` : K < 1 ? "below most spectrographs' reach" : (star?.tmag ?? 99) > 13 ? "faint for precision RVs" : "feasible on the host";
        add(4, "prv", "Precision RVs", "not-run", `K ≈ ${r3(K)} m/s for ~${r3(mp)} M⊕ (mass from radius, Chen & Kipping 2017${rpE > 11 ? "; giants span Saturn to brown-dwarf masses" : ""}); ${hard}`);
      }
    }
  }

  return finish({ events: rows.map(stripRow), ephemeris: ephem, next, sectors, lightCurves: lcs.length, transits: nTransits, gated: !!(known || gateFail) });
}

function stripRow(r: Row): VetEventRow {
  const { part, m, ...row } = r;
  void part; void m;
  return row;
}

/** Next predicted transit of each alias period after `now`, aliases sharing a time grouped (P and
 *  2P often do), the shortest four periods' times, soonest first. */
export function aliasWindows(periods: number[], tLast: number, now: number) {
  const out: { t: number; periods: number[] }[] = [];
  for (const p of [...periods].sort((a, b) => a - b).slice(0, 4)) {
    const t = tLast + Math.max(1, Math.ceil((now - tLast) / p)) * p;
    const same = out.find((w) => Math.abs(w.t - t) < 0.02);
    if (same) same.periods.push(p); else out.push({ t, periods: [p] });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** The part whose data covers time t (within half a duration of its range). */
function partAt(parts: Part[], t: number, duration: number) {
  return parts.find((p) => p.flat.t.length && t >= p.flat.t[0] - duration / 2 && t <= p.flat.t[p.flat.t.length - 1] + duration / 2);
}

/** Point-to-point scatter out of transit (robust σ), the per-point σ for fits. */
function redNoiseFreeScatter(s: Series, w: Window[]) {
  const v: number[] = [];
  for (let i = 0; i < s.t.length; i++) {
    let hit = false;
    for (const x of w) if (Math.abs(s.t[i] - x.t) < x.duration) { hit = true; break; }
    if (!hit) v.push(s.f[i]);
  }
  if (v.length < 10) return 1e-3;
  const m = v.slice().sort((a, b) => a - b)[v.length >> 1];
  const d = v.map((x) => Math.abs(x - m)).sort((a, b) => a - b);
  return 1.4826 * d[d.length >> 1] || 1e-3;
}

function maskedRaw(s: Series, w: Window[]): Series {
  const t: number[] = [], f: number[] = [];
  for (let i = 0; i < s.t.length; i++) {
    let hit = false;
    for (const x of w) if (Math.abs(s.t[i] - x.t) < x.duration) { hit = true; break; }
    if (!hit) { t.push(s.t[i]); f.push(s.f[i]); }
  }
  return { t: Float64Array.from(t), f: Float64Array.from(f) };
}

/** Good-quality centroid samples, as two series in time order (null if the column doesn't move:
 *  some pipelines store the aperture position, not a measured centroid). */
function centroidSeries(lc: LightCurve) {
  const t: number[] = [], x: number[] = [], y: number[] = [];
  for (let i = 0; i < lc.time.length; i++) {
    const tx = lc.time[i], cx = lc.cx![i], cy = lc.cy![i];
    if (lc.quality[i] !== 0 || !Number.isFinite(tx) || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(lc.flux[i])) continue;
    t.push(tx); x.push(cx); y.push(cy);
  }
  if (t.length < 100) return null;
  const idx = t.map((_, i) => i).sort((a, b) => t[a] - t[b]);
  const T = Float64Array.from(idx, (i) => t[i]), X = Float64Array.from(idx, (i) => x[i]), Y = Float64Array.from(idx, (i) => y[i]);
  const spread = (a: Float64Array) => { let lo = Infinity, hi = -Infinity; for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; } return hi - lo; };
  if (!(spread(X) > 1e-6) || !(spread(Y) > 1e-6)) return null;
  return { t: T, x: X, y: Y };
}
