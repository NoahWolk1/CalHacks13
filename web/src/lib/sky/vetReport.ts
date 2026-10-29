// Vetter (follow-up): staged vetting of one find, cheapest and most decisive checks first, every check
// logged as pass / flag / fail / not run so a skipped check can't be read as a passed one. Stage 0
// (catalogs, seconds) is a hard gate: a known object or a star-sized companion stops the run before
// any light curve is downloaded, unless forced. Stages 1-3 run on every TESS sector of the star
// (best pipeline per sector, sectors with transits first), Stage 4 recommends observations, and the
// tier (vetShared.ts: tierOf) is Stage 5. See vetShared.ts for the stage list. Beyond the light
// curves: TESScut pixels (difference images, pixels.ts), Gaia DR3 / APOGEE / ZTF archives
// (archives.ts), Robovetter-style robustness tests (robust.ts) and a false-positive probability
// (fpp.ts): what can be done without a telescope.
import { download, forcedCheck } from "./analysis";
import { apogeeNear, fitK, minMassFromK, gaiaCone, gaiaRvLimit, gaiaStar, gaiaStarVizier, ztfDepths, ztfLightCurve, type GaiaNeighbour, type GaiaStar, type ZtfPoint } from "./archives";
import { falsePositiveProbability, starFromGaia, type FppData } from "./fpp";
import { combineSectors, differenceImage, fetchCutout, testSector, type PixStar, type SectorPixels } from "./pixels";
import { eventStats, eventUniqueness, harmonicOf, modelShift, removePulsations, type EventUniqueness, type ModelShift } from "./robust";
import { bls } from "./bls";
import { ctoisFor, exofopTarget, inKeplerField, koisNear, radiusFromLuminosity, tessEb, ticNeighbours, ticStar, type Koi } from "./hostStar";
import { ticProducts, type LcProduct, type LightCurve } from "./lightcurves";
import { keplerK2Curves, type MissionCurve } from "./keplerK2";
import { asassnLightCurve, atlasConfigured, atlasLightCurve, toZtfPoints, type GroundPhot } from "./groundSurveys";
import { isVariable, lombScargle } from "./lombscargle";
import { duotransitAliases } from "./survey";
import { bestPeriods, coverageAllows, findRepeats, mergeCoverage, periodGrid, periodPosterior, ztfDetects, ztfExcludes, ztfScore, ztfSearch, ztfSeries, type PeriodPosterior, type ZtfScore } from "./periodRecovery";
import { binSeries, cleanSeries, ephemerisSigma, median, stitch, trimGaps, type Series } from "./timeseries";
import {
  cadenceOf, centralDuration, combine, densityFromTransit, detrendLabel, detrendMasked, fitEphemeris, fitTrapezoid, inOutShift, lowerBound,
  massFromRadius, measureEvent, minPeriodFromCoverage, minPeriodFromDuration, redNoise, rhoOf, rvSemiAmplitude, R_JUP_EARTH, segments, timeEvent,
  type DetrendMethod, type EventMeasure, type ShapeFit, type Window,
} from "./transitFit";
import { BTJD, GIANT_RADIUS, knownPlanetsNear, periodsMatch, SATURATED_TMAG, toisNear, type KnownSignal } from "./vetting";
import { isEclipsingType, variablesNear, vsxEntry } from "./vsx";
import { separation } from "./geom";
import { tierOf, type VetCheck, type VetPixels, type VetEventRow, type VetInput, type VetReport, type VetStage, type VetStatus, type VetStreamEvent } from "./vetShared";

export const VET_BUDGET_MS = 240_000;
/** Sectors whose full-frame-image cutouts are downloaded for difference images (~25 MB each). */
const PIXEL_SECTORS = 3;
/** Sectors downloaded (best pipeline each), plus a second pipeline for a few sectors with transits. */
export const VET_MAX_SECTORS = 16;
const EXTRA_PIPELINE_SECTORS = 2;
/** 2-min light curves are binned to 5 min: ingress stays resolved for most transits, the arithmetic stays fast. */
const BIN_DAYS = 5 / 1440;
const RANK: Record<LcProduct["pipeline"], number> = { SPOC: 0, "TESS-SPOC": 1, QLP: 2, TGLC: 3, "GSFC-ELEANOR-LITE": 4, CDIPS: 5 };
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
  // A single or duo whose period is recovered below is vetted as periodic from then on; the report
  // keeps the find as asked (saved reports are matched on it).
  const asked = input;
  let periodic = input.kind === "periodic" && !!input.period && input.t0 !== undefined;

  // ── Stage 0: host star sanity ──
  progress("Stage 0: TIC, Gaia DR3, ExoFOP, CTOIs, the TESS EB catalog, VSX, known planets and TOIs");
  // Everything by TIC id, or around the TIC's position (not the caller's: the star is what matters).
  const productsP = settle(ticProducts(input.tic, signal));
  const exoP = settle(exofopTarget(input.tic, signal)), ctoiP = settle(ctoisFor(input.tic, signal)), ebP = settle(tessEb(input.tic, signal));
  const tic = await settle(ticStar(input.tic, signal));
  const pos = { ra: tic.v?.ra ?? input.ra, dec: tic.v?.dec ?? input.dec };
  const cone = { ...pos, radius: 0.5 / 60 };
  const nbrP = settle(ticNeighbours(pos.ra, pos.dec, 2, signal));
  // Gaia DR3 from the ESA archive (VizieR's copy if that fails), every Gaia source within 2.5′, APOGEE.
  const gaiaConeP = settle(gaiaCone(pos.ra, pos.dec, 150, signal));
  const apogeeP = settle(apogeeNear(pos.ra, pos.dec, signal));
  const gaiaLookup = (id: string) => gaiaStar(id, signal).catch((e: Error) => gaiaStarVizier(id, signal).catch(() => { throw e; }));
  const [gaia, exo, ctois, eb, vsx, planets, tois, kois] = await Promise.all([
    tic.v?.gaia ? settle(gaiaLookup(tic.v.gaia)) : Promise.resolve({ v: undefined as GaiaStar | undefined, err: tic.err ? "no TIC entry" : "no Gaia id in the TIC" }),
    exoP, ctoiP, ebP,
    settle(variablesNear(cone, signal)), settle(knownPlanetsNear(cone, signal)), settle(toisNear(cone, signal)),
    inKeplerField(pos.ra, pos.dec) ? settle(koisNear(pos.ra, pos.dec, signal)) : Promise.resolve({ v: [] as Koi[], err: undefined }),
  ]);
  const star = tic.v;
  // No TIC radius (common for very bright and evolved stars): estimated from Tmag, distance and Teff.
  const Rest = !star?.radius && star?.tmag !== undefined && star.distance && star.teff ? radiusFromLuminosity(star.tmag, star.distance, star.teff) : undefined;
  const R = star?.radius ?? Rest, M = star?.mass ?? (star?.logg && R ? (10 ** star.logg * (R * 6.957e10) ** 2) / 6.674e-8 / 1.989e33 : undefined);
  const rho = star?.rho ?? (M && R ? rhoOf(M, R) : undefined);
  const k0 = Math.sqrt(depth0);
  /** Gaia's orbit is at this signal's period and its minimum mass is below the hydrogen-burning limit. */
  const orbitIsCompanion = (o: NonNullable<GaiaStar["orbit"]>) => !!(o.period && o.k1 && M && (periodic ? periodsMatch(input.period!, o.period, 0.01) : false) && minMassFromK(o.k1, o.period, M) < 0.075);

  if (star) add(0, "star", "Host star parameters", "info", `TESS Input Catalog v8.2${star.lumclass ? `; luminosity class ${star.lumclass.toLowerCase()}` : ""}`,
    [star.teff && `Teff ${Math.round(star.teff)} K`, R && `R ${r3(R)} R☉${Rest ? " (estimated from Tmag, distance and Teff)" : ""}`, M && `M ${r3(M)} M☉`, star.logg && `logg ${star.logg.toFixed(2)}`, rho && `ρ ${r3(rho)} ρ☉`, star.tmag !== undefined && `Tmag ${star.tmag.toFixed(2)}`, star.distance && `${Math.round(star.distance)} pc`].filter(Boolean).join(" · "));
  else add(0, "star", "Host star parameters", "not-run", `TIC lookup failed (${tic.err})`);

  // Companion radius: a lower limit (grazing transits and diluted light both hide depth).
  const rp = R ? k0 * R * R_EARTH_PER_RSUN : undefined;
  if (rp === undefined) add(0, "radius", "Companion radius", "not-run", "no stellar radius in the TIC, and no distance and Teff to estimate one");
  else {
    const rj = rp / R_JUP_EARTH, v = `${r3(rp)} R⊕ (${r3(rj)} R_J)${Rest ? `, on an estimated R ${r3(Rest)} R☉` : ""}`;
    if (rj > R_JUP_LIMIT) add(0, "radius", "Companion radius", "fail", `larger than ${R_JUP_LIMIT} Jupiter radii: a star or brown dwarf, not a planet (and a lower limit, if the transit is grazing or diluted)`, v);
    else if (rj > 1) add(0, "radius", "Companion radius", "pass", "Jupiter-sized: brown dwarfs and low-mass stars have this radius too, so only a mass (RVs) can tell", v);
    else add(0, "radius", "Companion radius", "pass", "planet-sized", v);
  }

  if (!star) add(0, "host", "Host type", "not-run", "no TIC entry");
  else {
    const why: string[] = [];
    if (star.teff && star.teff > 7500) why.push(`hot (Teff ${Math.round(star.teff)} K): pulsation and fast rotation are likely, and RVs will be hard`);
    // The TIC's luminosity class can call a star with no radius a dwarf from its Teff alone: the radius (or its estimate) decides.
    const giant = star.lumclass === "GIANT" || (star.logg !== undefined && star.logg < 3.5) || (R !== undefined && R > GIANT_RADIUS);
    const sizeTxt = R !== undefined ? `R ${r3(R)} R☉${Rest ? ", estimated" : ""}` : `logg ${star.logg?.toFixed(2) ?? "?"}`;
    if (giant) why.push(`${R !== undefined && R > 30 ? "a supergiant or bright giant" : "a giant"} (${sizeTxt}${star.lumclass === "DWARF" ? `; the TIC's "dwarf" class is wrong for a star this size` : ""}): a large star makes any companion big, and a blended eclipse easy`);
    else if ((star.logg !== undefined && star.logg < 3.9) || (R !== undefined && R > 2.5)) why.push(`a subgiant (${sizeTxt}): an evolved, larger star`);
    // A lone dip on a big giant (planets do transit smaller ones): no planet makes it, and giants vary on these time scales.
    const big = (R !== undefined && R > GIANT_RADIUS) || (star.logg !== undefined && star.logg < 3);
    if (big && !periodic) add(0, "host", "Host type", "fail", `${why.join("; ")}; a lone dip on a star this large isn't a planet candidate`);
    else if (why.length) add(0, "host", "Host type", "flag", why.join("; "));
    else add(0, "host", "Host type", "pass", `a main-sequence dwarf${star.teff ? ` (Teff ${Math.round(star.teff)} K)` : ""}`);
    // Saturated stars make lone dips of this size in their systematics (bleed columns, scattered light).
    if (!periodic && star.tmag !== undefined && star.tmag < SATURATED_TMAG) add(0, "bright", "Saturated host", "fail", `Tmag ${star.tmag.toFixed(2)} is far into saturation: bleed columns and scattered light make lone dips like this, so a single or duo here can't be trusted`, `Tmag ${star.tmag.toFixed(2)}`);
  }

  {
    const flags: string[] = [], seen: string[] = [];
    if (gaia.v) {
      const g = gaia.v;
      seen.push(`Gaia DR3 RUWE ${g.ruwe?.toFixed(2) ?? "n/a"}${g.ipdHarmonic !== undefined ? `, IPD harmonic ${g.ipdHarmonic.toFixed(3)}, multi-peak ${g.ipdMultiPeak ?? 0}%` : ""}`);
      if (g.ruwe !== undefined && g.ruwe > 1.4) flags.push(`Gaia RUWE ${g.ruwe.toFixed(2)} > 1.4: the astrometry doesn't fit a single star (an unresolved companion is likely)`);
      // Partly resolved doubles (~0.1-1.2″) distort Gaia's image shape before they move RUWE.
      if ((g.ipdMultiPeak ?? 0) > 2 || ((g.ipdHarmonic ?? 0) > 0.1 && (g.ruwe ?? 0) > 1.2)) flags.push(`Gaia's images of the star look double (${g.ipdMultiPeak ?? 0}% of windows with two peaks, harmonic amplitude ${g.ipdHarmonic?.toFixed(2)}): a companion at ~0.1-1″`);
      if (g.nss && !g.orbit) flags.push(`Gaia DR3 lists a non-single-star solution (NSS ${g.nss})`);
      // An orbit at the transit period with a substellar minimum mass is the transiting companion itself (Gaia saw its RV).
      if (g.orbit && !orbitIsCompanion(g.orbit)) flags.push(`Gaia DR3 fits a ${g.orbit.type} orbit${g.orbit.period ? ` with P ${r3(g.orbit.period)} d` : ""}${g.orbit.k1 ? ` (K1 ${r3(g.orbit.k1)} km/s)` : ""}`);
    }
    if (exo.v) {
      seen.push(`ExoFOP companions ${exo.v.companions.length}`);
      if (exo.v.companions.length) flags.push(`ExoFOP lists ${exo.v.companions.length} stellar companion${exo.v.companions.length === 1 ? "" : "s"}${exo.v.companions.filter((c) => c.sep !== undefined).map((c) => ` at ${c.sep}″${c.dmag !== undefined ? ` (Δ${c.dmag} mag)` : ""}`).slice(0, 3).join(",")}`);
    }
    if (!gaia.v && !exo.v) add(0, "multiplicity", "Multiplicity", "not-run", `Gaia DR3 (${gaia.err ?? "not found"}) and ExoFOP (${exo.err}) unavailable`);
    else if (flags.length) add(0, "multiplicity", "Multiplicity", "flag", flags.join("; "), seen.join(" · "));
    // Half a check isn't a pass: with Gaia or ExoFOP missing, it stays open.
    else if (!gaia.v || !exo.v) add(0, "multiplicity", "Multiplicity", "not-run", `partly run: no sign of a companion in ${gaia.v ? "Gaia DR3" : "ExoFOP"}, but ${!gaia.v ? `Gaia DR3 wasn't checked (${gaia.err ?? "no match"})` : `ExoFOP wasn't checked (${exo.err})`}`, seen.join(" · "));
    else add(0, "multiplicity", "Multiplicity", "pass", "no sign of a companion in Gaia DR3 (astrometry, image shape, orbit and binary tables) or on ExoFOP", seen.join(" · "));
  }

  // Already known: a TOI/CTOI/planet/KOI with this signal (on the star = catalogued; on a neighbour = its light).
  // A single or duo matches a known ephemeris within its duration plus 3σ of the predicted time's drift
  // (a TOI's period error, times the orbits since its t0, can reach hours).
  const matchesEphem = (P?: number, t0?: number, dur?: number, sigma?: { sigmaP?: number; sigmaT0?: number }) => {
    if (!P) return false;
    if (periodic) return periodsMatch(input.period!, P, 0.01);
    if (t0 === undefined) return false;
    return (input.times ?? []).some((t) => {
      const ph = t - t0 - Math.round((t - t0) / P) * P;
      return Math.abs(ph) < Math.max(dur ?? d0, d0) + 3 * ephemerisSigma({ period: P, t0, ...sigma }, t);
    });
  };
  const self = (k: { tic: string; ra: number; dec: number }) => k.tic === input.tic || separation(k.ra, k.dec, pos.ra, pos.dec) * 3600 < 3;
  let known: string | undefined;
  {
    const lines: string[] = [], other: string[] = [];
    let fail: string | undefined;
    const ks: KnownSignal[] = [...(planets.v ?? []), ...(tois.v ?? [])];
    for (const k of ks) {
      const sep = separation(k.ra, k.dec, pos.ra, pos.dec) * 60;
      if (matchesEphem(k.period, k.t0, k.duration, k)) {
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
      const e = eb.v, ebHit = periodic ? periodsMatch(input.period!, e.period, 0.01) : matchesEphem(e.period, e.t0);
      const prim = e.depth ? `, primary eclipse ${Math.round(e.depth * 1000)} ppt` : "";
      if (ebHit) fail ??= `the TESS eclipsing-binary catalog lists the star with P ${e.period.toFixed(4)} d${prim}: this is its eclipse`;
      else if (!periodic && Number.isFinite(e.t0)) {
        // A lone dip on a catalogued binary, away from its primary eclipse: its secondary, unless it's
        // deeper than the primary (a secondary can't be).
        const phases = (input.times ?? []).map((t) => ((((t - e.t0) / e.period) % 1) + 1) % 1);
        const tol = (1.5 * d0) / e.period + 0.01;
        const atSec = e.secPhase !== undefined && phases.some((ph) => Math.abs(ph - e.secPhase!) < tol || 1 - Math.abs(ph - e.secPhase!) < tol);
        const phTxt = phases.map((ph) => ph.toFixed(3)).join(", ");
        if (atSec) fail ??= `the TESS EB catalog lists the star as an eclipsing binary (P ${e.period.toFixed(4)} d${prim}); this dip at phase ${phTxt} is its secondary eclipse`;
        else if (!e.depth || input.depth < e.depth) fail ??= `the TESS EB catalog lists the star as an eclipsing binary (P ${e.period.toFixed(4)} d${prim}); this dip falls at phase ${phTxt} of that orbit, shallower than the primary: most likely the secondary eclipse of an eccentric orbit${e.secPhase === undefined ? " (the catalog lists no secondary)" : ""}`;
        else lines.push(`the TESS EB catalog lists the star as an eclipsing binary (P ${e.period.toFixed(4)} d${prim}), and this dip (phase ${phTxt}) is deeper than its primary`);
      } else lines.push(`the TESS EB catalog lists the star as an eclipsing binary (P ${e.period.toFixed(4)} d${prim})`);
    }
    const g = gaia.v;
    const atP = (p?: number) => !!p && (periodic ? [1, 2].some((m) => periodsMatch(input.period! * m, p, 0.01)) : matchesEphem(p));
    if (g?.eb) { if (atP(g.eb.period)) fail ??= `Gaia DR3 classifies the star as an eclipsing binary with P ${r3(g.eb.period)} d: this is its eclipse`; else lines.push(`Gaia DR3 lists the star as an eclipsing binary (P ${r3(g.eb.period)} d)`); }
    if (g?.orbit?.period && atP(g.orbit.period) && !orbitIsCompanion(g.orbit)) fail ??= `Gaia DR3 has a ${g.orbit.type} orbit for the star at P ${r3(g.orbit.period)} d, this signal's period${periodic && periodsMatch(input.period! * 2, g.orbit.period, 0.01) ? " ×2" : ""}: a stellar binary`;
    if (g?.varClass && /ECL/.test(g.varClass.name)) lines.push(`Gaia DR3's classifier calls the star an eclipsing binary (${g.varClass.name}, score ${g.varClass.score?.toFixed(2)})`);
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
    const failed = [exo.err && "ExoFOP", ctois.err && "CTOI table", tois.err && "TOI list", planets.err && "Exoplanet Archive", eb.err && "TESS EB catalog", vsx.err && "AAVSO VSX", kois.err && "KOI table", gaia.err && "Gaia DR3 binary tables"].filter(Boolean);
    const checked = `${failed.length ? "partly checked" : "checked"}: TOIs, CTOIs, confirmed planets${inKeplerField(pos.ra, pos.dec) ? ", KOIs" : ""}, TESS EB catalog, AAVSO VSX, Gaia DR3 eclipsing binaries and orbits${failed.length ? `; unavailable: ${failed.join(", ")}` : ""}`;
    if (known) add(0, "known", "Already catalogued", "info", `${known}${lines.length ? `; also: ${lines.join("; ")}` : ""}. Not new: add notes on ExoFOP instead of a new submission`, checked);
    else if (fail) add(0, "known", "Already catalogued", "fail", fail, checked);
    else if (failed.length >= 4) add(0, "known", "Already catalogued", "not-run", `${failed.length} of the catalogs were unavailable: it may already be known`, checked);
    else if (failed.length && !lines.length) add(0, "known", "Already catalogued", "not-run", `partly run: not in the catalogs that answered, but ${failed.join(", ")} didn't, so it may already be known there${other.length ? `; the star has other signals on file: ${[...new Set(other)].join(", ")}` : ""}`, checked);
    else add(0, "known", "Already catalogued", lines.length ? "flag" : "pass", [...lines, other.length ? `the star has other signals on file: ${[...new Set(other)].join(", ")}` : "", lines.length ? "" : "not a TOI, CTOI, known planet or catalogued binary at this period"].filter(Boolean).join("; "), checked);
  }

  // A single or duo with a recovered period gets a second look at the catalogs that list a period
  // but no usable epoch (KOIs, VSX, a planet or TOI without a transit time): same star, same period.
  const knownAtPeriod = (P: number): string | undefined => {
    for (const k of [...(planets.v ?? []), ...(tois.v ?? [])]) if (self(k) && periodsMatch(P, k.period, 0.01)) return `${k.name} (P ${k.period.toFixed(4)} d) is this signal, already in the ${k.kind === "planet" ? "NASA Exoplanet Archive" : "TOI list"}`;
    for (const c of ctois.v ?? []) if (c.period && periodsMatch(P, c.period, 0.01)) return `${c.name} (P ${c.period.toFixed(4)} d) is this signal, already submitted as a community TOI`;
    for (const k of kois.v ?? []) if (k.period && periodsMatch(P, k.period, 0.01)) return `${k.name} (${k.disposition}) is this signal, a Kepler Object of Interest`;
    const own = vsx.v ? vsxEntry(pos, vsx.v) : undefined;
    if (own?.period && own.type === "EP" && periodsMatch(P, own.period, 0.01)) return `AAVSO VSX lists the star as ${own.name}, a planet host with P ${own.period} d: this is that planet`;
  };
  const markKnown = (why: string) => {
    if (known) return;
    known = why;
    const c = checks.find((x) => x.id === "known");
    if (c) { c.status = "info"; c.detail = `${why} (matched at the recovered period). Not new: add notes on ExoFOP instead of a new submission`; emit({ type: "check", check: c, ms: ms(), replaces: true }); }
  };

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
      input: asked, checks, events: [], tier: t.tier, tierReason: t.reason, open: t.open, submit, sectors: [], lightCurves: 0, gated: false, ms: ms(),
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

  // ZTF, started now (it can take ~30 s): the period recovery and the Stage 3 check both use it.
  const gMag = gaia.v?.g ?? (star?.tmag !== undefined ? star.tmag + 0.4 : undefined);
  const ztfP = gMag !== undefined && gMag >= 12.5 && depth0 >= 3e-3 ? settle(ztfLightCurve(pos.ra, pos.dec, signal)) : undefined;
  // ASAS-SN (and ATLAS with a token): all-sky, so they reach where ZTF doesn't (dec < −30°) and ASAS-SN
  // the bright stars ZTF saturates on; ~1-2% points, so only for deep transits.
  const groundP = gMag !== undefined && gMag >= 9 && gMag <= 17.5 && depth0 >= 3e-3 ? settle(groundPhot(pos.ra, pos.dec, signal)) : undefined;
  // Kepler and K2 light curves of the star: years before TESS, so more transits and a long baseline.
  const kkP = settle(keplerK2Curves({ tic: input.tic, ra: pos.ra, dec: pos.dec }, signal));
  let missionMemo: Promise<MissionPart[]> | undefined;
  const missionParts = () => (missionMemo ??= kkP.then((r) => (r.v?.curves ?? []).flatMap((c) => { const m = missionPart(c); return m ? [m] : []; }).map((m) => {
    m.flat = detrendMasked(m.raw, [], { kind: "median", window: Math.max(1, 4 * dur) }, 2);
    m.beta = redNoise(m.flat, dur, []);
    return m;
  })));

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
  // Full-frame-image cutouts for the difference images, in parallel with the light curves: the
  // sectors with the most predicted transits (later sectors first: shorter FFI cadence).
  const pixSectors = chosen.filter(hasEvent).map((p) => ({ s: p.sector, n: planned.filter((t) => t > p.tmin! && t < p.tmax!).length }))
    .sort((a, b) => b.n - a.n || b.s - a.s).slice(0, PIXEL_SECTORS + 2).map((x) => x.s);
  // Two downloads at a time (each ~25 MB); a sector that fails hands its place to the next one.
  const cutoutsP = (async () => {
    const out: { sector: number; v?: Awaited<ReturnType<typeof fetchCutout>>; err?: string }[] = [];
    const queue = [...pixSectors];
    const worker = async () => {
      while (queue.length && out.filter((x) => x.v).length < PIXEL_SECTORS && Date.now() < deadline - 100_000) {
        const sector = queue.shift()!;
        const r = await settle(fetchCutout(pos.ra, pos.dec, sector, signal, Math.max(20_000, Math.min(90_000, deadline - Date.now() - 90_000))));
        out.push({ sector, ...r });
      }
    };
    await Promise.all([worker(), worker()]);
    return out;
  })();
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
  const stack = (times: { t: number; part: Part }[], reach: number) => {
    const dt: number[] = [], f: number[] = [], sg: number[] = [];
    for (const { t, part } of times) {
      const s = part.flat;
      for (let i = lowerBound(s.t, t - reach); i < s.t.length && s.t[i] <= t + reach; i++) { dt.push(s.t[i] - t); f.push(s.f[i]); sg.push(part.scatter || 1e-3); }
    }
    return { dt: Float64Array.from(dt), f: Float64Array.from(f), sg: Float64Array.from(sg) };
  };

  // ── period recovery (single and duo finds) ──
  // The same transit again anywhere in TESS, then the ZTF archive at every period still allowed
  // (periodRecovery.ts). A period that's pinned down turns the find periodic for everything below.
  let recAliases: number[] | undefined;
  let ztfPeriod: { period: number; t0: number; source: string } | undefined;
  let posterior: PeriodPosterior | null = null;
  if (!periodic && input.times?.length) {
    progress("Period recovery: the transit searched for again in every sector, then in the ZTF archive");
    const known = [...input.times].sort((a, b) => a - b), t1 = known[0];
    const why: string[] = [], vals: string[] = [];
    let status: VetStatus = "info";
    const k = Math.sqrt(depth0);
    // The transit can't be much longer than a central one at P: a floor on the period (eccentric orbits get 1.3x).
    const pFloor = rho ? minPeriodFromDuration(dur / 1.3, rho, k) : 0;
    const rep = findRepeats(primary, known, dur, depth0);
    vals.push(`${primary.length} sector${primary.length === 1 ? "" : "s"} scanned (${rep.days.toFixed(0)} d)${rep.events.length ? `: ${rep.events.slice(0, 4).map((e) => `BTJD ${e.t.toFixed(2)}, ${ppt(e.depth)}, SNR ${e.snr.toFixed(1)}`).join("; ")}` : ""}`);
    if (rep.events.length) why.push(`found the ${ppt(depth0)} transit ${rep.events.length} more time${rep.events.length === 1 ? "" : "s"} in TESS (BTJD ${rep.events.map((e) => e.t.toFixed(2)).join(", ")}; same depth and duration, above the ${rep.threshold.toFixed(1)}σ false-alarm threshold)`);
    else if (Number.isFinite(rep.threshold)) why.push(`no repeat of the transit in ${rep.days.toFixed(0)} days of TESS data (nothing of its depth above ${rep.threshold.toFixed(1)}σ)`);
    const z = ztfP ? await ztfP : undefined;
    const gr = groundP ? await groundP : undefined;
    // ZTF and the all-sky surveys together: ztfSeries normalises each camera on its own.
    const zl = [z?.v?.length ? "ZTF" : "", ...(gr?.v?.surveys ?? [])].filter(Boolean).join(" + ") || "ZTF";
    const zpts = [...(z?.v ?? []), ...(gr?.v?.pts ?? [])];
    const zs = zpts.length ? ztfSeries(zpts) : null;
    if (z?.err) vals.push(`ZTF unavailable (${z.err.slice(0, 60)})`);
    else if (!ztfP) vals.push(gMag !== undefined && gMag < 12.5 ? `ZTF not used: the star (G ${gMag.toFixed(1)}) saturates it` : `ZTF not used: ${ppt(depth0)} is too shallow for its ~1-2% points`);
    if (gr?.v?.notes.length) vals.push(gr.v.notes.join("; "));
    else if (gr?.err) vals.push(`ASAS-SN/ATLAS unavailable (${gr.err.slice(0, 60)})`);
    if (zpts.length && !zs) vals.push(`${zl} has too few points on the star`);
    else if (zs) vals.push(`${zs.t.length} ${zl} points over ${((zs.t[zs.t.length - 1] - zs.t[0]) / 365.25).toFixed(1)} yr`);
    const zTxt = (s: ZtfScore) => `${ppt(s.depth)} ± ${r3(s.err * 1000)} ppt in ${s.epochs} transit${s.epochs === 1 ? "" : "s"} (${s.points} points, Δχ² ${s.dchi2.toFixed(0)})`;
    // Through the known transit (the second of a duo counts as a repeat): the periods explaining the most dips.
    const repeats = [...known.slice(1), ...[...rep.events].sort((a, b) => b.snr - a.snr).slice(0, 8).map((e) => e.t)];
    const at = (t: number) => { const p = partAt(primary, t, dur); return p ? measureEvent(p.flat, t, dur, p.cadence, p.beta) : null; };
    const fits = repeats.length ? bestPeriods(t1, repeats, depth0, Math.max(0.5, pFloor), [from, to], at) : [];
    const fitTimes = fits[0]?.hits ?? [];
    const others = repeats.filter((t) => !fitTimes.some((h) => Math.abs(h - t) < dur));
    const events = fits.length ? fitTimes : known;
    if (fits.length && others.length) why.push(`${others.length} of the dips don't fit the period (BTJD ${others.slice(0, 4).map((t) => t.toFixed(2)).join(", ")}): other events, or systematics`);
    if (repeats.length && !fits.length) { status = "flag"; why.push("the dips don't fit one period without predicting a transit where TESS saw none: not one transiting body, or the repeats are something else"); }
    if (fits.length) {
      let aliases = fits.map((f) => f.period);
      if (M && R) aliases = aliases.filter((p) => centralDuration(p, M, R, k) * 1.3 >= dur);
      if (zs && aliases.length > 1) {
        const sc = aliases.map((p) => ztfScore(zs, p, events[0], dur));
        const det = sc.filter((s) => ztfDetects(s, depth0, aliases.length)).sort((a, b) => b.dchi2 - a.dchi2);
        const kept = sc.filter((s) => !ztfExcludes(s, depth0));
        if (det.length && det.every((s) => s === det[0] || s.dchi2 < det[0].dchi2 - 9)) {
          why.push(`${zl} sees the transit at P ${r3(det[0].period)} d: ${zTxt(det[0])}`);
          aliases = [det[0].period];
        } else if (kept.length && kept.length < sc.length) {
          why.push(`${zl} rules out ${sc.length - kept.length} of the ${sc.length} periods the TESS dips allow (no dip where they predict one)`);
          aliases = kept.map((s) => s.period);
        }
      }
      recAliases = aliases;
      if (aliases.length === 1) {
        // Pinned down: vetted as a periodic signal from here on.
        P = aliases[0]; T0 = t1;
        input = { ...input, kind: "periodic", period: P, t0: T0, transits: known.length };
        periodic = true;
        ephSource = `recovered: ${events.length} TESS transits${why.some((w) => w.startsWith(`${zl} sees`)) ? ` and ${zl}` : ""}`;
        status = "pass";
        why.push(`the period is P = ${P.toFixed(4)} d: the find is vetted as a periodic signal from here on`);
        const cat = knownAtPeriod(P);
        if (cat) { markKnown(cat); why.push(`and it's catalogued: ${cat}`); }
      } else if (!aliases.length) {
        status = "flag";
        why.push("the periods the dips allow are too short for a transit this long on this star");
      } else {
        if (input.kind === "single") input = { ...input, kind: "duo", times: events };
        why.push(`${aliases.length} periods still fit (${aliases.slice(0, 5).map((p) => p.toFixed(2)).join(", ")}${aliases.length > 5 ? " …" : ""} d): the alias check below lists them`);
      }
      setFlat(windowsOf(P, T0, dur));
    } else if (input.kind === "single") {
      // One transit: every period the coverage allows, scored against ZTF.
      const pLo = Math.max(minPeriodFromCoverage(t1, coverage, dur), pFloor, 0.5);
      const reach = Math.max(to - t1, t1 - from, zs ? Math.max(zs.t[zs.t.length - 1] - t1, t1 - zs.t[0]) : 0);
      const grid = periodGrid(pLo, 2000, dur, reach);
      const cov = mergeCoverage(coverage);
      const allowed = grid.map((p) => coverageAllows(p, t1, dur, cov, known));
      let ztfOut = grid.map(() => false);
      if (zs && grid.length) {
        const zr = ztfSearch(zs, t1, dur, depth0, grid, allowed);
        ztfOut = zr.excluded;
        if (zr.best) {
          const best = zr.best, distinct = zr.rivals;
          if (!distinct.length) {
            ztfPeriod = { period: best.period, t0: t1, source: `${zl} archive: ${best.epochs} ${zl} transits through the TESS one` };
            status = "pass";
            why.push(`${zl} sees the transit at P ${best.period.toFixed(4)} d: ${zTxt(best)}; one TESS transit, so the period-based TESS checks still can't run, but it's predicted`);
          } else why.push(`${zl} has dips at P ${r3(best.period)} d and ${distinct.slice(0, 3).map((s) => `${r3(s.period)} d`).join(", ")} about equally: not unique yet`);
        }
      }
      const pShape0 = (() => {
        const part = partAt(primary, t1, dur);
        const st0 = part ? stack([{ t: t1, part }], dur * 2.5) : null;
        const sh = st0 ? fitTrapezoid(st0.dt, st0.f, st0.sg, dur) : null;
        return sh && rho ? periodFromShape(sh, rho) : undefined;
      })();
      posterior = periodPosterior(grid, allowed, ztfOut, pShape0);
      if (posterior) {
        if (!ztfPeriod) why.push(`most probable P ≈ ${r3(posterior.median)} d (68%: ${r3(posterior.lo)}-${r3(posterior.hi)} d)${pShape0 ? `, from the periods the data allow, the transit probability and the shape's ${r3(pShape0)} d` : ", from the periods the data allow and the transit probability"}`);
        vals.push(`${Math.round(posterior.allowedFrac * 100)}% of ${r3(pLo)}-2000 d allowed by the TESS coverage${zs ? `, ${zl} rules out ${Math.round(posterior.ztfExcludedFrac * 100)}% of those` : ""}`);
      }
      if (!ztfPeriod) why.push("a second transit fixes it: the next TESS sectors of the star, or ground photometry");
    }
    // Kepler/K2: the same dip years before TESS. Two or more there pin a period within the mission's
    // run, which links to the TESS transit over the gap if only one whole number of orbits fits.
    if (!periodic && !ztfPeriod) {
      const mp = await missionParts();
      if (mp.length) {
        const mrep = findRepeats(mp, [], dur, depth0);
        vals.push(`Kepler/K2 ${mp.map((m) => m.label).join(", ")}: ${mrep.events.length} dip${mrep.events.length === 1 ? "" : "s"} of this depth and duration${mrep.events.length ? ` (BTJD ${mrep.events.slice(0, 4).map((e) => e.t.toFixed(2)).join(", ")})` : ""}`);
        if (mrep.events.length >= 2) {
          const mAt = (t: number) => { const pt = partAt(mp, t, dur); return pt ? measureEvent(pt.flat, t, dur, pt.cadence, pt.beta) : null; };
          const ts = mrep.events.map((e) => e.t);
          const mSpan: [number, number] = [Math.min(...mp.map((m) => m.raw.t[0])), Math.max(...mp.map((m) => m.raw.t[m.raw.t.length - 1]))];
          const mf = bestPeriods(ts[0], ts.slice(1), depth0, Math.max(0.5, pFloor), mSpan, mAt);
          if (mf.length === 1) {
            const hits = [...mf[0].hits].sort((a, b) => a - b), PK = mf[0].period;
            // A timed dip is good to about a third of its duration: the period to that over the orbits it spans.
            const sigK = dur / 3 / Math.max(1, Math.round((hits[hits.length - 1] - hits[0]) / PK));
            const gap = t1 - hits[hits.length - 1];
            const missesTess = (Pn: number) => epochs(Pn, t1, from, to).some(({ t }) => {
              if (Math.abs(t - t1) < dur) return false;
              const m = at(t);
              return !!m && m.coverage >= 0.5 && depth0 - m.depth > 3 * m.err && m.depth < 0.3 * depth0;
            });
            const fit: number[] = [];
            for (let n = Math.max(1, Math.floor(gap / (PK + 3 * sigK))); n <= Math.ceil(gap / Math.max(PK - 3 * sigK, 0.1)) && fit.length < 20; n++) {
              const Pn = gap / n;
              if (Math.abs(Pn - PK) <= 3 * sigK && !missesTess(Pn)) fit.push(Pn);
            }
            why.push(`Kepler/K2 shows the dip ${hits.length} times at P ${PK.toFixed(4)} ± ${sigK.toFixed(4)} d`);
            if (fit.length === 1) {
              const n = Math.round(gap / fit[0]);
              P = fit[0]; T0 = t1;
              input = { ...input, kind: "periodic", period: P, t0: T0, transits: known.length };
              periodic = true;
              ephSource = `recovered: TESS and Kepler/K2 (${n} orbits apart)`;
              status = "pass";
              why.push(`only one whole number of orbits (${n}) reaches the TESS transit: P = ${P.toFixed(5)} d, and the find is vetted as a periodic signal from here on`);
              const cat = knownAtPeriod(P);
              if (cat) { markKnown(cat); why.push(`and it's catalogued: ${cat}`); }
              setFlat(windowsOf(P, T0, dur));
            } else if (fit.length) why.push(`${fit.length} whole numbers of orbits reach the TESS transit (P ${fit.slice(0, 4).map((x) => x.toFixed(4)).join(", ")}${fit.length > 4 ? " …" : ""} d): not unique yet`);
            else why.push("but no whole number of orbits at that period reaches the TESS transit without predicting a TESS transit that isn't there: another body, or another star");
          }
        }
      }
    }
    add(1, "recovery", "Period recovery", status, why.join("; "), vals.join(" · "));
  }
  // BLS is free in phase: on a recovered period it could slide onto a deeper eclipse (an EB's primary); the timing fit refines those instead.
  if (periodic && asked.kind === "periodic") {
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
  const st = stack(measured.map((r) => ({ t: r.t, part: r.part! })), dur * 2.5);
  let shape: ShapeFit | null = null;
  if (Date.now() < deadline - 40_000) shape = fitTrapezoid(st.dt, st.f, st.sg, dur);

  // ── timing ──
  let ephem: VetReport["ephemeris"] = periodic ? { period: P, t0: T0, source: ephSource } : undefined;
  let timing: ReturnType<typeof fitEphemeris> = null;
  if (shape && measured.length >= 2) {
    const timed: { n: number; t: number; err: number }[] = [];
    for (const r of measured) {
      // Time only transits expected to stand out on their own (depth/err ≥ 5 at the mean depth),
      // and not ones far deeper than the rest: picking the noisiest peaks would fit the outliers.
      if (!(D / r.err! >= 5) || (r.depth! - D) / r.err! > 4 || (r.snr ?? 0) < 3) continue;
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

  // Pulsations (δ Scuti, γ Dor, rotation) fitted out of transit and subtracted, once, on the
  // sectors with the most transits: the uniqueness test runs on the cleaned light curve (the
  // star's own signals aren't noise), and Stage 2 checks the transit survives the removal.
  const cleaned = new Map<Part, { flat: Series; beta: number; cadence: number; removed: { period: number; amplitude: number }[] }>();
  if (measured.length && Date.now() < deadline - 70_000) {
    const w = windowsOf(P, T0, dur);
    // Phase 0.5 is masked too: an occultation there would otherwise be fitted away as harmonics of P.
    const w2 = periodic ? [...w, ...windowsOf(P, T0 + P / 2, dur)] : w;
    const mask = (t: number) => w2.some((x) => Math.abs(t - x.t) < x.duration);
    const count = (p: Part) => measured.filter((r) => r.part === p).length;
    for (const p of [...primary].sort((a, b) => count(b) - count(a)).slice(0, 8)) {
      if (Date.now() > deadline - 60_000) break;
      const pw = removePulsations(p.raw, mask);
      const flat = pw.removed.length ? detrendMasked(pw.series, w, baseMethod, 2) : p.flat;
      cleaned.set(p, { flat, beta: pw.removed.length ? redNoise(flat, dur, w) : p.beta, cadence: cadenceOf(flat.t), removed: pw.removed });
    }
  }
  const removedAll = [...cleaned.values()].flatMap((c) => c.removed);

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
    // This SNR is the vetting's own re-measurement on a fresh reduction, not the search's number.
    const v = rows.map((r) => `BTJD ${r.t.toFixed(2)}: ${r.snr !== undefined ? `vetting SNR ${r.snr.toFixed(1)}, ${ppt(r.depth!)}` : "no data"}`).join("; ") + (input.snr ? ` (the search's SNR was ${r3(input.snr)}: a different detrending, binning and noise estimate)` : "");
    if (lost.length) add(1, "events", "Individual transits", "fail", `the dip at BTJD ${lost.map((r) => r.t.toFixed(2)).join(", ")} isn't there in a fresh reduction (SNR < 3): a systematic of the first search`, v);
    else if (N < rows.length) add(1, "events", "Individual transits", "not-run", `${rows.length - N} of the listed dips fall outside the light curves that downloaded`, v);
    else add(1, "events", "Individual transits", "flag", input.kind === "single" ? (ztfPeriod ? `one TESS transit: the period (${r3(ztfPeriod.period)} d) comes from ZTF alone` : "one transit: the period is unknown") : "two transits: the period rests on one spacing (and its aliases)", v);
  }

  // Event consistency: one depth for every transit, and the signal not resting on a few outliers.
  if (!periodic) add(1, "consistency", "Event consistency", "na", "compares transits with each other: a periodic signal only");
  else if (N < 5) add(1, "consistency", "Event consistency", "not-run", "fewer than 5 transits");
  else {
    const es = eventStats(measured.map((r) => r.m!));
    const red = es.dof ? es.chi2 / es.dof : 1;
    const v = `χ²/dof ${red.toFixed(2)} over ${N} transits; ${es.outliers.length} more than 4σ deep${es.outliers.length ? ` (BTJD ${es.outliers.slice(0, 3).map((o) => measured[o.i].t.toFixed(2)).join(", ")})` : ""}; without the 3 strongest: ${ppt(es.drop3.depth)}, SNR ${es.drop3.snr.toFixed(1)}`;
    if (comb.snr >= 7 && es.drop3.snr < 3) add(1, "consistency", "Event consistency", "fail", `the signal rests on ${Math.min(3, N)} events: without them it's gone (SNR ${es.drop3.snr.toFixed(1)}): outliers or systematics, not a repeating transit`, v);
    else if (es.outliers.length && es.outliers.length <= Math.max(2, 0.05 * N)) add(1, "consistency", "Event consistency", "flag", `${es.outliers.length} transit${es.outliers.length === 1 ? " is" : "s are"} far deeper than the rest (up to ${es.outliers[0].dev.toFixed(1)}σ): a systematic or another source at those times`, v);
    else if (red > 2 && es.dof >= 4 && Math.sqrt(red - 1) * median(measured.map((r) => r.err!)) > 0.1 * D) add(1, "consistency", "Event consistency", "flag", `the depths scatter ${Math.sqrt(red).toFixed(1)}× more than their errors, by over 10% of the depth: the errors are underestimated, or the depth varies`, v);
    else add(1, "consistency", "Event consistency", "pass", `the transits share one depth${red > 2 ? " (to within 10%: the excess scatter is small next to the depth)" : " within their errors"}, and the signal survives dropping its 3 strongest events`, v);
  }

  const eventTimes0 = measured.map((r) => r.t);
  // Model-shift uniqueness (Robovetter): the transit against every other phase, in units of the red noise.
  let shift: ModelShift | null = null;
  let shiftRaw: ModelShift | null = null;
  if (periodic && N >= 3 && Date.now() < deadline - 50_000) {
    shift = modelShift(primary.map((p) => cleaned.get(p)?.flat ?? p.flat), P, T0, shape?.T14 ?? dur);
    if (removedAll.length) shiftRaw = modelShift(primary.map((p) => p.flat), P, T0, shape?.T14 ?? dur);
  }
  // Without a period, the same idea on the time axis: the dip against a box of its length at every
  // other time in every sector (robust.ts: eventUniqueness).
  let lone: EventUniqueness | null = null;
  if (!periodic && eventTimes0.length) {
    lone = eventUniqueness(primary.map((p) => { const c = cleaned.get(p); return c ? { flat: c.flat, cadence: c.cadence } : { flat: p.flat, cadence: p.cadence }; }), eventTimes0, shape?.T14 ?? dur);
    if (!lone) add(1, "uniqueness", "Signal uniqueness (single event)", "not-run", "too little data around the dip");
    else {
      const ev = lone.event, red = ev.snr / lone.fred;
      const v = `the dip ${ev.snr.toFixed(1)}σ white, ${red.toFixed(1)}σ red (F_red ${lone.fred.toFixed(2)} from ${lone.trials} box positions over ${lone.days.toFixed(0)} d); threshold ${lone.fa.toFixed(1)}σ (noise reaches it anywhere in that much data 1% of the time); strongest brightening ${(lone.up.snr / lone.fred).toFixed(1)}σ red at BTJD ${lone.up.t.toFixed(2)}`;
      if (red < lone.fa) add(1, "uniqueness", "Signal uniqueness (single event)", "fail", `only ${red.toFixed(1)}σ against the light curve's own red noise: in ${lone.days.toFixed(0)} days of data, noise makes a dip this big (needs ${lone.fa.toFixed(1)}σ)`, v);
      else if (lone.up.snr / lone.fred > lone.fa) add(1, "uniqueness", "Signal uniqueness (single event)", "flag", `a brightening at BTJD ${lone.up.t.toFixed(2)} is also above the false-alarm threshold: the systematics make events this size in both directions`, v);
      else add(1, "uniqueness", "Signal uniqueness (single event)", "pass", `the dip stands out from every other moment of the data by more than the red noise allows${lone.fred > 1.5 ? `, though the noise is ${lone.fred.toFixed(1)}× white at this time scale` : ""}`, v);
    }
  }
  if (!shift && periodic) add(1, "uniqueness", "Signal uniqueness (model-shift)", "not-run", N < 3 ? "fewer than 3 transits" : "too little data or time");
  else if (shift) {
    const v = `${removedAll.length ? `after removing ${removedAll.length} pulsation signal${removedAll.length === 1 ? "" : "s"}${shiftRaw ? ` (before: ${(shiftRaw.pri / shiftRaw.fred).toFixed(1)}σ red, F_red ${shiftRaw.fred.toFixed(2)})` : ""}: ` : ""}primary ${shift.pri.toFixed(1)}σ white, ${(shift.pri / shift.fred).toFixed(1)}σ red (F_red ${shift.fred.toFixed(2)}); next dip ${shift.ter.sig.toFixed(1)}σ, strongest brightening ${shift.pos.sig.toFixed(1)}σ; thresholds ${shift.fa1.toFixed(1)}σ / ${shift.fa2.toFixed(1)}σ; MS1 ${shift.ms1.toFixed(1)}, MS2 ${shift.ms2.toFixed(1)}, MS3 ${shift.ms3.toFixed(1)}`;
    const why: string[] = [];
    if (shift.ms1 <= 0) why.push(`only ${(shift.pri / shift.fred).toFixed(1)}σ against the light curve's own red noise (needs ${shift.fa1.toFixed(1)}σ)`);
    if (shift.ms2 <= 0) why.push(`a dip at phase ${shift.ter.ph.toFixed(2)} is nearly as strong: the transit isn't unique in the phased light curve`);
    if (shift.ms3 <= 0) why.push(`a brightening at phase ${shift.pos.ph.toFixed(2)} is nearly as strong: the noise makes "events" this big in both directions`);
    if (why.length) add(1, "uniqueness", "Signal uniqueness (model-shift)", shift.ms1 <= 0 ? "fail" : "flag", why.join("; "), v);
    else add(1, "uniqueness", "Signal uniqueness (model-shift)", "pass", `the transit stands out from every other phase by more than the red noise allows${shift.fred > 1.5 ? `, though the noise is ${shift.fred.toFixed(1)}× white at this time scale` : ""}`, v);
  }

  if (!periodic) add(1, "snr", "SNR growth", "na", "how the SNR builds over transits: a periodic signal only");
  else if (N < 2) add(1, "snr", "SNR growth", "not-run", "fewer than 2 transits");
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
  } else if (periodic) add(1, "period", "Period consistency", "not-run", "fewer than 2 transits");
  else add(1, "period", "Period consistency", "na", input.kind === "single" ? "one transit: there's no period to check (the alias and shape checks bound it instead)" : "two dips: the alias check lists the periods they allow");

  // Aliases.
  let duoAliases: number[] = [];
  const minCovP = input.kind === "single" ? minPeriodFromCoverage(input.times![0], coverage, dur) : 0;
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
    let aliases = recAliases ?? duotransitAliases(t1, t2, dur, coverage, 1, 2000);
    const T14 = shape?.T14 ?? dur;
    const fitDur = M && R && !recAliases ? aliases.filter((p) => centralDuration(p, M, R, Math.sqrt(D)) * 1.3 >= T14) : aliases;
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
  if (!ephem && ztfPeriod) ephem = ztfPeriod;

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
    if (!groups.length) add(1, "depth", "Depth stability", input.kind === "single" ? "na" : "not-run", input.kind === "single" ? "one transit: nothing to compare its depth with (the pipeline and detrending checks test it instead)" : "transits in only one sector");
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
  let oddEven: { diff: number; err: number } | undefined;
  if (periodic && N >= 2) {
    const odd = measured.filter((r) => ((r.n % 2) + 2) % 2 === 1), even = measured.filter((r) => ((r.n % 2) + 2) % 2 === 0);
    if (!odd.length || !even.length) add(2, "oddeven", "Odd/even depths", "not-run", "transits of only one parity have data");
    else {
      const o = combine(odd.map((r) => r.m!)), e = combine(even.map((r) => r.m!));
      oddEven = { diff: o.depth - e.depth, err: Math.hypot(o.err, e.err) };
      const sig = Math.abs(o.depth - e.depth) / Math.hypot(o.err, e.err);
      const v = `odd ${ppt(o.depth)} ± ${r3(o.err * 1000)}, even ${ppt(e.depth)} ± ${r3(e.err * 1000)} (${sig.toFixed(1)}σ)`;
      if (sig > 3 && Math.abs(o.depth - e.depth) > 0.1 * D) add(2, "oddeven", "Odd/even depths", "fail", `alternate transits differ by ${sig.toFixed(1)}σ: two different eclipses, an eclipsing binary at ${(2 * P).toFixed(4)} d`, v);
      else add(2, "oddeven", "Odd/even depths", "pass", "alternate transits agree within 3σ", v);
    }
    // Secondary eclipse at phase 0.5, and anywhere else (eccentric orbits).
    // On the pulsation-cleaned light curves where they exist (a phase curve isn't an eclipse).
    const at = (ph: number) => combine(epochs(P, T0 + ph * P, from, to).flatMap(({ t }) => { const p = partAt(primary, t, dur); const c = p && cleaned.get(p); const m = p && (c ? measureEvent(c.flat, t, dur, c.cadence, c.beta) : measureEvent(p.flat, t, dur, p.cadence, p.beta)); return m && m.coverage >= 0.5 ? [m] : []; }));
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
    // A deeper dip in most orbits (2+), not one deep transit of another body that lands at this phase.
    const repeatsAt = (ph: number) => {
      const ms_ = epochs(P, T0 + ph * P, from, to).flatMap(({ t }) => { const p = partAt(primary, t, dur); const m = p && measureEvent(p.flat, t, dur, p.cadence, p.beta); return m && m.coverage >= 0.5 ? [m] : []; });
      const deep = ms_.filter((m) => m.depth > 1.5 * D && m.snr > 3).length;
      return deep >= 2 && deep >= ms_.length / 2;
    };
    // In units of the red noise the model-shift test measured (F_red), where it ran.
    const fred = shift?.fred ?? 1;
    sec.snr /= fred; worst.snr /= fred;
    const v = `phase 0.5: ${Number.isFinite(sec.depth) ? `${ppt(sec.depth)} (${sec.snr.toFixed(1)}σ)` : "no data"}${worst.snr ? `; deepest elsewhere: phase ${worst.ph.toFixed(2)}, ${ppt(worst.depth)} (${worst.snr.toFixed(1)}σ)` : ""}${fred > 1 ? `; σ include red noise (×${fred.toFixed(2)})` : ""}`;
    if (!Number.isFinite(sec.depth)) add(2, "secondary", "Secondary eclipse", "not-run", "no data at phase 0.5");
    else if (sec.snr > 3 && sec.depth > 0.1 * D) add(2, "secondary", "Secondary eclipse", "fail", `a ${sec.snr.toFixed(1)}σ eclipse at phase 0.5, ${Math.round((sec.depth / D) * 100)}% of the transit depth: too bright to be a planet's occultation`, v);
    else if (worst.snr > 4 && worst.depth > 1.5 * D && repeatsAt(worst.ph)) add(2, "secondary", "Secondary eclipse", "fail", `a deeper eclipse at phase ${worst.ph.toFixed(2)} (${ppt(worst.depth)}, ${(worst.depth / D).toFixed(1)}× the transit): an eclipsing binary on an eccentric orbit, and this signal is its secondary eclipse`, v);
    else if (worst.snr > 4 && worst.depth > 0.1 * D) add(2, "secondary", "Secondary eclipse", "flag", `a ${worst.snr.toFixed(1)}σ dip at phase ${worst.ph.toFixed(2)}: a secondary eclipse on an eccentric orbit?`, v);
    else add(2, "secondary", "Secondary eclipse", "pass", sec.snr > 3 ? "a shallow occultation at phase 0.5 (under 10% of the depth): consistent with a hot planet's thermal emission" : "no secondary eclipse at phase 0.5 or elsewhere", v);
  } else {
    add(2, "oddeven", "Odd/even depths", "na", input.kind === "single" ? "one transit: there are no alternate transits to compare" : "two dips: each could be the odd or the even one, and the depth stability check compares them");
    // No phase to look at: the deepest other dip anywhere in the data (the single-event scan).
    if (!lone) add(2, "secondary", "Secondary eclipse", "not-run", "the single-event scan didn't run");
    else {
      const o = lone.other, red = o.snr / lone.fred;
      const v = `deepest other dip: BTJD ${o.t.toFixed(2)}, ${ppt(o.depth)} (${red.toFixed(1)}σ red); limit for an eclipse anywhere in ${lone.days.toFixed(0)} d of data: ${ppt(lone.limit)} (3σ red)`;
      if (red > lone.fa && o.depth > 1.5 * D) add(2, "secondary", "Secondary eclipse", "fail", `a deeper eclipse at BTJD ${o.t.toFixed(2)} (${ppt(o.depth)}, ${(o.depth / D).toFixed(1)}× this dip): the star eclipses, and this dip is most likely its secondary eclipse`, v);
      else if (red > lone.fa && o.depth > 0.1 * D) add(2, "secondary", "Secondary eclipse", "flag", `another significant dip at BTJD ${o.t.toFixed(2)} (${Math.round((o.depth / D) * 100)}% of the depth): a secondary eclipse of a binary, or a second transit`, v);
      else add(2, "secondary", "Secondary eclipse", "info", `no other eclipse-like dip deeper than ${ppt(lone.limit)} anywhere in the data (a binary's secondary under ${Math.round((lone.limit / D) * 100)}% of the depth, or one in a gap, isn't excluded)`, v);
    }
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

  let pShape: number | undefined;
  if (!periodic) {
    // The transit shape gives a/R★ per unit period, the catalog density fixes a/R★: so a period
    // (circular orbit; the photo-eccentric effect makes it uncertain by ~2x either way).
    const minP = Math.max(minCovP, minPdur ?? 0);
    if (!shape || !rho) add(2, "density", "Period from the transit shape", "not-run", !shape ? "no shape fit" : "no catalog density");
    else if (!(totalSnr >= 15) || shape.T12 < 1.5 * Math.min(...measured.map((r) => r.part!.cadence))) add(2, "density", "Period from the transit shape", "not-run", `ingress not resolved (SNR ${totalSnr.toFixed(1)}, ingress ${hours(shape.T12)})`);
    else {
      pShape = periodFromShape(shape, rho);
      if (pShape === undefined) add(2, "density", "Period from the transit shape", "not-run", "the fitted shape has no flat bottom, so the impact parameter is unconstrained");
      else {
        const v = `P ≈ ${r3(pShape)} d (range ~${r3(pShape / 2)}-${r3(pShape * 2)} d for modest eccentricity) from T14 ${hours(shape.T14)}, ingress ${hours(shape.T12)} and ρ★ ${r3(rho)} ρ☉; the data allow P > ${r3(minP)} d`;
        if (pShape * 2 < minP) add(2, "density", "Period from the transit shape", "flag", `the shape wants P ≈ ${r3(pShape)} d, but a period that short would have shown another transit: an eccentric orbit seen near periastron, a larger (blended) host, or a wrong stellar density`, v);
        else add(2, "density", "Period from the transit shape", "pass", `the transit's shape on this star implies P ≈ ${r3(pShape)} d, consistent with the data showing no other transit`, v);
      }
    }
  } else if (!shape) add(2, "density", "Stellar density", "not-run", "no shape fit");
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
      } else add(2, "variability", "Variability at the transit period", isVariable(ls) ? "info" : "pass", (isVariable(ls) ? "the star varies (out of transit)" : "no variability above 0.5 ppt out of transit (smaller pulsations are handled by the pulsation test)") + hot, v);
    } catch (e) { add(2, "variability", "Variability at the transit period", "not-run", (e as Error).message.slice(0, 80)); }
  }

  // Pulsation removal: the transit measured again on the cleaned sectors (fitted above).
  if (!N) add(2, "pulsation", "Pulsation removal", "not-run", "no transit with data");
  else if (!cleaned.size) add(2, "pulsation", "Pulsation removal", "not-run", "time budget used up");
  else {
    const parts = [...cleaned.keys()];
    const before = combine(measured.filter((r) => parts.includes(r.part!)).map((r) => r.m!));
    const after = combine(measured.filter((r) => parts.includes(r.part!)).flatMap((r) => { const c = cleaned.get(r.part!)!; const m = measureEvent(c.flat, r.t, dur, c.cadence, c.beta); return m && m.coverage >= 0.5 ? [m] : []; }));
    // The same signal is fitted in each sector: keep the strongest of each period (within 0.5%).
    const pulsations = [...removedAll].sort((a, b) => b.amplitude - a.amplitude).filter((x, i, all) => all.findIndex((y) => Math.abs(y.period / x.period - 1) < 0.005) === i);
    const hot = star?.teff && star.teff > 6800 && star.teff < 10_000;
    const list = pulsations.slice(0, 5).map((x) => `${r3(x.period * 24)} h (${r3(x.amplitude * 1000)} ppt)`).join(", ");
    const v = `${pulsations.length} periodic signal${pulsations.length === 1 ? "" : "s"} removed${list ? `: ${list}` : ""}; transit ${ppt(before.depth)} (SNR ${before.snr.toFixed(1)}) → ${ppt(after.depth)} (SNR ${after.snr.toFixed(1)}), ${parts.length} sector${parts.length === 1 ? "" : "s"}`;
    const harm = periodic ? harmonicOf(P, pulsations) : null;
    if (!pulsations.length) add(2, "pulsation", "Pulsation removal", "pass", `no significant pulsation or rotation signal to remove${hot ? " (unusual for a star this hot)" : ""}`, v);
    else if (!(after.snr >= 3) || after.depth < 0.5 * before.depth) add(2, "pulsation", "Pulsation removal", "fail", "with the star's own variability subtracted, the dip is gone: it was made by pulsation or rotation, not a transit", v);
    else if (harm && (harm.relation === "is 2×" || harm.relation === "equals") && harm.pulsation.amplitude < 0.2 * D && M && R) {
      // A phase curve, not pulsation: ellipsoidal variation at P/2 (tides raised by the companion)
      // or reflection/beaming at P. Ellipsoidal amplitude ≈ α (M2/M1)(R★/a)³, α ≈ 1.3 in TESS's band.
      const aR = Math.cbrt((6.674e-11 * M * 1.989e30 * (P * 86400) ** 2) / (4 * Math.PI ** 2)) / (R * 6.957e8);
      if (harm.relation === "is 2×") {
        const m2 = (harm.pulsation.amplitude / (1.3 * aR ** -3)) * M;
        add(2, "pulsation", "Pulsation removal", m2 < 0.075 ? "pass" : "flag", m2 < 0.075
          ? `a ${r3(harm.pulsation.amplitude * 1e6)} ppm signal at P/2 is ellipsoidal variation: the companion's tides on the star imply ~${r3(m2 * 1047.6)} M_J, substellar (a photometric mass, ±50%); the transit survives its removal`
          : `ellipsoidal variation at P/2 of ${r3(harm.pulsation.amplitude * 1e6)} ppm implies a ~${r3(m2)} M☉ companion: a star`, v);
      } else add(2, "pulsation", "Pulsation removal", "info", `a ${r3(harm.pulsation.amplitude * 1e6)} ppm signal at the orbital period: reflected light, Doppler beaming or spots; the transit survives its removal`, v);
    }
    else if (harm) add(2, "pulsation", "Pulsation removal", "flag", `the transit period ${harm.relation} a pulsation period (${r3(harm.pulsation.period)} d): the dips may be pulsation folded at that period`, v);
    else if (Math.abs(after.depth / before.depth - 1) > 0.25) add(2, "pulsation", "Pulsation removal", "flag", `the depth changes by ${Math.round(Math.abs(after.depth / before.depth - 1) * 100)}% once the pulsations are removed: they distort it`, v);
    else add(2, "pulsation", "Pulsation removal", "pass", "the transit survives subtracting the star's pulsations, at the same depth", v);
  }

  // Archival radial velocities: Gaia DR3's epoch RVs (summary) and APOGEE's visits.
  const apogee = await apogeeP;
  let kMaxKms: number | undefined;
  {
    // Without a period, the shortest one allowed: K only shrinks for longer ones (said in the text).
    const Pk = ephem?.period ?? (periodic ? P : duoAliases.length ? Math.min(...duoAliases) : Math.max(minCovP, minPdur ?? 0) || NaN);
    const kStellar = M && Number.isFinite(Pk) ? rvSemiAmplitude(Pk, 0.08 * 333_000, M) / 1000 : undefined;
    const lines: string[] = [], vals: string[] = [];
    let status: VetStatus | null = null;
    const gl = gaiaRvLimit(gaia.v?.rv);
    const orb = gaia.v?.orbit;
    if (orb?.k1 && orb.period && M && orbitIsCompanion(orb)) {
      // Gaia's own orbit at the transit period: a radial-velocity mass for the transiting companion.
      const m2 = minMassFromK(orb.k1, orb.period, M);
      vals.push(`Gaia ${orb.type} orbit: P ${r3(orb.period)} d, K1 ${r3(orb.k1)} km/s → M sin i ≈ ${r3(m2 * 1047.6)} M_J`);
      lines.push(`Gaia DR3 measured the star's reflex motion at the transit period: the companion's minimum mass is ${r3(m2 * 1047.6)} M_J (${m2 * 1047.6 < 13 ? "a planet" : "a brown dwarf"}), below any star's`);
      status = "pass";
    }
    if (gl) {
      vals.push(`Gaia: ${gaia.v!.rv!.epochs} epochs, p(constant) ${gaia.v!.rv!.pvalue?.toPrecision(2) ?? "?"}, robust amplitude ${r3(gaia.v!.rv!.amplitude!)} km/s → K < ${r3(gl.kMax)} km/s`);
      kMaxKms = gl.kMax;
      if (gl.variable && status !== "pass") {
        // Variable, but is it a star's worth of variation? K ≳ amplitude / 2.
        if (kStellar !== undefined && gl.kMax < kStellar) { lines.push(`Gaia sees the RV vary, but by less than a 0.08 M☉ companion at this period would cause (K < ${r3(gl.kMax)} vs ${r3(kStellar)} km/s): a massive planet or brown dwarf, or line-profile noise`); status = "info"; }
        else { lines.push("Gaia sees the star's radial velocity vary (χ² p ≤ 0.01, renormalised GoF > 4) by as much as a stellar companion would: a spectroscopic binary"); status = "flag"; }
      }
    }
    if (apogee.v && apogee.v.visits.length >= 3 && Number.isFinite(Pk)) {
      const jit = Math.max(0.05, (apogee.v.vsini ?? 0) / 50);
      const precise = ephem?.errT0 !== undefined && ephem.errP !== undefined && Math.hypot(ephem.errT0, ephem.errP * Math.abs((apogee.v.visits[0].mjd - 56999.5 - ephem.t0) / Pk)) < 0.05 * Pk;
      const k = fitK(apogee.v.visits.map((x) => ({ t: x.mjd - 56999.5, rv: x.rv, err: x.err })), Pk, precise ? ephem!.t0 : undefined, jit);
      if (k) {
        const lim = Math.abs(k.k) + 2 * k.err;
        vals.push(`APOGEE: ${apogee.v.visits.length} visits, K = ${r3(k.k)} ± ${r3(k.err)} km/s at P ${r3(Pk)} d${precise ? " (phase from the ephemeris)" : " (phase free)"}`);
        kMaxKms = Math.min(kMaxKms ?? Infinity, lim);
        if (Math.abs(k.k) > 3 * k.err && Math.abs(k.k) > 1) { lines.push(`APOGEE's RVs swing by K ≈ ${r3(Math.abs(k.k))} km/s at the transit period: a stellar-mass companion`); status = "fail"; }
      } else vals.push(`APOGEE: ${apogee.v.visits.length} visits (too few to fit)`);
    } else if (apogee.v?.vscatter !== undefined) vals.push(`APOGEE: RV scatter ${r3(apogee.v.vscatter)} km/s`);
    if (!vals.length) add(2, "archivalrv", "Archival radial velocities", "not-run", `no archival RVs: ${gaia.v ? "Gaia DR3 has no RV time series for the star (too faint or too hot for RVS)" : `Gaia unavailable (${gaia.err})`}; ${apogee.v ? "APOGEE has the star but too few visits" : apogee.err ? `APOGEE unavailable (${apogee.err})` : "not in APOGEE DR17"}`);
    else if (status) add(2, "archivalrv", "Archival radial velocities", status, lines.join("; "), vals.join(" · "));
    else if (kMaxKms !== undefined && kStellar !== undefined) {
      const mMax = 0.08 * (kMaxKms / kStellar);
      if (!periodic && !ephem) {
        // K ∝ P^(-1/3): a stellar companion is excluded up to the period where its K drops to the limit.
        const pMax = Pk * (kStellar / kMaxKms) ** 3;
        add(2, "archivalrv", "Archival radial velocities", kMaxKms < kStellar && pMax >= 1000 ? "pass" : "info",
          kMaxKms < kStellar ? `K < ${r3(kMaxKms)} km/s rules out a stellar (≥ 0.08 M☉) companion on the target for P up to ~${r3(Math.min(pMax, 99_999))} d${pMax >= 1000 ? ", i.e. any period this transit allows that Gaia's 34-month baseline could see" : `; the transit allows longer periods (P > ${r3(Pk)} d)`}` : `the archival RVs allow K up to ${r3(kMaxKms)} km/s: even at the shortest allowed period (${r3(Pk)} d) a stellar companion isn't excluded`, vals.join(" · "));
      } else add(2, "archivalrv", "Archival radial velocities", kMaxKms < kStellar ? "pass" : "info",
        kMaxKms < kStellar ? `no RV variation big enough for a star: K < ${r3(kMaxKms)} km/s rules out a companion above ~${r3(mMax * 1047.6)} M_J (${r3(mMax)} M☉) on the target at this period` : `the archival RVs allow K up to ${r3(kMaxKms)} km/s: companions up to ~${r3(mMax)} M☉ on the target aren't excluded`, vals.join(" · "));
    } else add(2, "archivalrv", "Archival radial velocities", "info", !M ? "archival RVs found but no stellar mass to turn them into a companion mass limit" : kMaxKms === undefined ? "archival RVs found, but too few to bound the amplitude" : "archival RVs found but no period bound to turn them into a companion mass limit", vals.join(" · "));
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
  // Difference imaging on TESScut cutouts: which star does the light go missing from?
  const gcone = await gaiaConeP;
  // Stars that could be the source: Gaia within 2.5′ (TIC as the fallback), the target first.
  const tgtTmag = star?.tmag ?? 10;
  const others: GaiaNeighbour[] = gcone.v ? gcone.v.filter((g) => g.sep > 1.5 || Math.abs(g.tmag - tgtTmag) > 1.5) : [];
  const capableOf = (tmag: number) => { const fr = 10 ** (-0.4 * (tmag - tgtTmag)); return (D * (1 + fr)) / fr <= 1; };
  const pixStars: PixStar[] = [{ id: "target", label: `TIC ${input.tic} (target)`, ra: pos.ra, dec: pos.dec, tmag: tgtTmag },
    ...others.filter((g) => g.sep <= 120 && (capableOf(g.tmag) || g.tmag < tgtTmag + 4)).slice(0, 60).map((g) => ({ id: g.source, label: `Gaia ${g.source} (${g.sep.toFixed(0)}″, T ${g.tmag.toFixed(1)})`, ra: g.ra, dec: g.dec, tmag: g.tmag }))];
  let pixels: VetPixels | undefined;
  let pixCombined: ReturnType<typeof combineSectors> | null = null;
  {
    const cuts = await cutoutsP;
    const errs = cuts.flatMap((c) => (c.err ? [`s${c.sector}: ${c.err}`] : []));
    const dur14 = shape?.T14 ?? dur;
    const secs: SectorPixels[] = [];
    for (const c of cuts) {
      if (!c.v) continue;
      const times = periodic ? epochs(P, T0, c.v.t[0], c.v.t[c.v.t.length - 1]).map((e) => e.t) : (input.times ?? []);
      const img = differenceImage(c.v, times, dur14);
      if (img) secs.push(testSector(img, pixStars));
    }
    if (!pixSectors.length) add(3, "diffimage", "Difference imaging", "not-run", "no sector with a transit to cut out");
    else if (!secs.length) add(3, "diffimage", "Difference imaging", "not-run", errs.length ? `TESScut cutouts unavailable (${errs[0]})` : "the transit's cutout has too little clean data around it to build a difference image");
    else {
      pixCombined = combineSectors(secs);
      const det = Math.hypot(...secs.map((x) => x.detection));
      const show = secs.reduce((b, x) => (x.detection > b.detection ? x : b));
      const pc = pixCombined, best = pc.best;
      const tgt = pc.stars.find((x) => x.id === "target");
      const excluded = pc.stars.filter((x) => x.id !== "target" && x.dchi2 > 9);
      const rivals = pc.stars.filter((x) => x.id !== "target" && x.dchi2 <= 9);
      const v = `${secs.map((x) => `s${x.sector}: ${x.transits} transits, source ${x.detection.toFixed(1)}σ`).join("; ")}${pc.offset ? `; source ${Math.hypot(pc.offset.e, pc.offset.n).toFixed(1)} ± ${pc.offset.err.toFixed(1)}″ from the target` : ""}`;
      let verdict: string;
      if (det < 3 || !best) {
        verdict = `no source visible in the pixels (${det.toFixed(1)}σ): the transit is too shallow for TESS's full-frame images`;
        add(3, "diffimage", "Difference imaging", "not-run", `ran on ${secs.length} sector${secs.length === 1 ? "" : "s"}, but ${verdict}; it can't say which star dims`, v);
      } else if (best.id !== "target" && tgt && tgt.dchi2 > 9) {
        verdict = `the light goes missing from ${best.label}, not the target (Δχ² ${tgt.dchi2.toFixed(0)})`;
        add(3, "diffimage", "Difference imaging", "fail", `${verdict}: a nearby eclipsing star`, v);
      } else if (pc.unlisted > 25 && pc.offset && Math.hypot(pc.offset.e, pc.offset.n) > 3 * pc.offset.err + 5) {
        verdict = `the source sits ${Math.hypot(pc.offset.e, pc.offset.n).toFixed(0)}″ from the target where no catalogued star fits`;
        add(3, "diffimage", "Difference imaging", "flag", `${verdict} (Δχ² ${pc.unlisted.toFixed(0)}): an uncatalogued source, or a PSF mismatch`, v);
      } else {
        verdict = `source consistent with the target; ${excluded.length} of ${pc.stars.length - 1} nearby star${pc.stars.length === 2 ? "" : "s"} ruled out`;
        add(3, "diffimage", "Difference imaging", rivals.length ? "flag" : "pass", rivals.length ? `the target fits, but so ${rivals.length === 1 ? "does" : "do"} ${rivals.slice(0, 3).map((x) => x.label).join(", ")} (within Δχ² 9): too close to separate in 21″ pixels` : `the light goes missing from the target; every other star that could make the dip is ruled out (Δχ² > 9)`, v);
      }
      pixels = { sector: show.sector, detection: show.detection, ...show.image, verdict };
    }
  }

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

  // Nearby sources: every star within 2′ bright enough to make the dip if it eclipsed (Gaia DR3,
  // which resolves ~1″; the TIC if Gaia didn't answer), less those the pixels or centroids exclude.
  const nbWeights: { id: string; label: string; sep: number; tmag: number; weight: number; radius?: number; mass?: number; teff?: number }[] = [];
  {
    const nb = await nbrP;
    // Gaia neighbours carry a size (colour + parallax), so the statistical test can ask whether each could make a transit this long.
    const list = gcone.v ? others.map((g) => ({ id: g.source, label: `Gaia ${g.source}`, sep: g.sep, tmag: g.tmag, ...starFromGaia(g.g, g.bpRp, g.parallax) })) : nb.v ? nb.v.filter((n) => n.tic !== input.tic).map((n) => ({ id: `TIC ${n.tic}`, label: `TIC ${n.tic}`, sep: n.sep, tmag: n.tmag })) : null;
    if (!list) add(3, "neighbours", "Nearby sources", "not-run", `Gaia (${gcone.err}) and TIC (${nb.err}) cone searches failed`);
    else if (star?.tmag === undefined) add(3, "neighbours", "Nearby sources", "not-run", "no TESS magnitude for the target");
    else {
      const pixOut = new Map((pixCombined?.stars ?? []).map((x) => [x.id, x.dchi2]));
      const tgtD = pixOut.get("target") ?? 0;
      const capable = list.filter((n) => n.sep <= 120 && capableOf(n.tmag)).map((n) => {
        const fr = 10 ** (-0.4 * (n.tmag - star.tmag!)), need = (D * (1 + fr)) / fr;
        const dp = pixOut.get(n.id);
        // Evidence against each star relative to the target: pixels where they ran, else the centroid bound.
        const weight = dp !== undefined ? Math.exp(-Math.max(-50, Math.min(50, (dp - tgtD) / 2))) : exclArcsec !== undefined && n.sep > exclArcsec ? Math.exp(-0.5 * (n.sep / Math.max(1, exclArcsec / 3)) ** 2) : 1;
        return { ...n, need, weight, byPixels: dp !== undefined && dp - tgtD > 9 };
      }).sort((a, b) => a.sep - b.sep);
      nbWeights.push(...capable.map((n) => { const x = n as typeof n & { radius?: number; mass?: number; teff?: number }; return { id: x.id, label: x.label, sep: x.sep, tmag: x.tmag, weight: x.weight, radius: x.radius, mass: x.mass, teff: x.teff }; }));
      const open = capable.filter((n) => !n.byPixels && (exclArcsec === undefined || n.sep <= exclArcsec));
      const close = open.filter((n) => n.sep <= 63);
      const src = gcone.v ? "Gaia DR3" : "TIC";
      const v = `${capable.length} of ${list.length} ${src} stars within 2′ could cause a ${ppt(D)} dip if eclipsed${capable.length ? `: ${capable.slice(0, 4).map((n) => `${n.label} at ${n.sep.toFixed(0)}″, T ${n.tmag.toFixed(1)} (needs a ${Math.round(n.need * 100)}% eclipse${n.byPixels ? ", ruled out by pixels" : ""})`).join("; ")}` : ""}`;
      const ruled = capable.length - open.length;
      if (!capable.length) add(3, "neighbours", "Nearby sources", "pass", `no star within 2′ is bright enough to make this dip, even fully eclipsed (${src}, complete to G ≈ 21)`, v);
      else if (close.length) add(3, "neighbours", "Nearby sources", "flag", `${close.length} star${close.length === 1 ? "" : "s"} within 1′ (3 TESS pixels) could make the dip and ${ruled ? `the pixel and centroid tests rule out the other ${ruled}` : "neither the pixels nor the centroids rule them out"}: needs seeing-limited photometry of the neighbours on a transit night`, v);
      else add(3, "neighbours", "Nearby sources", "pass", ruled ? `the pixel and centroid tests rule out ${ruled} of them; the rest are over 1′ away` : "the ones that could are over 1′ away", v);
    }
  }

  // Unresolved companions: what Gaia can't see is what high-resolution imaging would look for.
  {
    const g = gaia.v, dpc = star?.distance ?? (g?.parallax && g.parallax > 0 ? 1000 / g.parallax : undefined);
    const close = gcone.v?.filter((x) => x.sep > 0.3 && x.sep < 4 && x.source !== g?.source) ?? [];
    const imaging = exo.v?.imaging ?? [];
    const v = [g ? `RUWE ${g.ruwe?.toFixed(2) ?? "?"}` : "", close.length ? `${close.length} Gaia source${close.length === 1 ? "" : "s"} within 4″: ${close.map((x) => `${x.sep.toFixed(1)}″ ΔG ${(x.g - (g?.g ?? x.g)).toFixed(1)}`).join(", ")}` : "no Gaia source within 4″", imaging.length ? `${imaging.length} high-resolution image${imaging.length === 1 ? "" : "s"} on ExoFOP` : ""].filter(Boolean).join(" · ");
    const au = (as: number) => (dpc ? ` (${Math.round(as * dpc)} au at ${Math.round(dpc)} pc)` : "");
    if (!g && !gcone.v) add(3, "unresolved", "Unresolved companions", "not-run", "Gaia unavailable", v);
    else if (close.some((x) => capableOf(x.tmag))) add(3, "unresolved", "Unresolved companions", "flag", `a Gaia source ${close.filter((x) => capableOf(x.tmag))[0].sep.toFixed(1)}″ away is blended with the target in every TESS pixel and bright enough to make the dip`, v);
    else if (imaging.length) add(3, "unresolved", "Unresolved companions", "pass", `Gaia resolves nothing that could make the dip within 4″, and high-resolution imaging is on ExoFOP (${imaging.slice(0, 2).map((i) => `${i.telescope}${i.contrast ? ` ${i.contrast}` : ""}`).join("; ")})`, v);
    else add(3, "unresolved", "Unresolved companions", "not-run", `Gaia sees no companion beyond ~1″${au(1)}${(g?.ruwe ?? 2) < 1.4 ? `, and RUWE ${g!.ruwe!.toFixed(2)} disfavours bright ones at ~0.1-1″` : ""}; closer than ~0.5-1″${au(0.5)} only speckle/AO imaging can look (the statistical validation below allows for them)`, v);
  }

  // ZTF: a second photometric system in g and r, for transits deep enough on stars faint enough.
  {
    const g = gaia.v?.g ?? (star?.tmag !== undefined ? star.tmag + 0.4 : undefined);
    if (ztfPeriod || ephSource.includes("ZTF")) add(3, "ztf", "Ground photometry (ZTF archive)", "info", "ZTF picked the period (Period recovery, Stage 1), so it isn't an independent check here: its depth at that period is in that check");
    else if (!periodic || !ephem) add(3, "ztf", "Ground photometry (ZTF archive)", periodic ? "not-run" : "na", periodic ? "needs an ephemeris" : "folds ZTF on an ephemeris: none yet without a period");
    else if ((g === undefined || g < 12.5 || pos.dec < -30) && D >= 3e-3 && groundP) {
      // ZTF can't see the star (too bright, or too far south): ASAS-SN/ATLAS instead, one depth over all cameras.
      const gr = await groundP;
      const name = `Ground photometry (${gr.v?.surveys.join(" + ") || "ASAS-SN/ATLAS"})`;
      const pts = (gr.v?.pts ?? []).map((x) => ({ ...x, band: "g" as const }));
      const dz = pts.length ? ztfDepths(pts, ephem.period, ephem.t0, shape?.T14 ?? dur).g : null;
      const why0 = g !== undefined && g < 12.5 ? `the star (G ${g.toFixed(1)}) saturates ZTF` : "ZTF doesn't reach dec < −30°";
      const v = dz ? `${pts.length} points: ${ppt(dz.depth)} ± ${r3(dz.err * 1000)} ppt (${dz.inTransit} in transit)` : `${pts.length} points`;
      if (gr.err || !gr.v?.pts.length) add(3, "ztf", name, "not-run", `${why0}, and ${gr.err ?? gr.v?.notes.join("; ") ?? "no ground photometry"}`, v);
      else if (!dz) add(3, "ztf", name, "not-run", "too few ground points fall in transit", v);
      else if (dz.depth / dz.err >= 3) add(3, "ztf", name, Math.abs(dz.depth - D) / dz.err < 3 ? "pass" : "flag", Math.abs(dz.depth - D) / dz.err < 3 ? "ground photometry sees the transit at the TESS depth: on the target, independently of TESS" : "ground photometry sees a dip at a different depth than TESS: dilution differs, so a neighbour may contribute", v);
      else if ((D - dz.depth) / dz.err > 3) add(3, "ztf", name, "fail", "ground photometry of the target shows no dip where TESS predicts one: the eclipse is on another star blended in TESS's 21″ pixels", v);
      else add(3, "ztf", name, "info", "ground photometry can't tell either way at this depth", v);
    }
    else if (g === undefined || g < 12.5) add(3, "ztf", "Ground photometry (ZTF archive)", "not-run", `the star (G ${g?.toFixed(1) ?? "?"}) saturates ZTF (G < 12.5)`);
    else if (D < 3e-3) add(3, "ztf", "Ground photometry (ZTF archive)", "not-run", `${ppt(D)} is too shallow for ZTF's ~1-2% per-point precision`);
    else if (Date.now() > deadline - 25_000) add(3, "ztf", "Ground photometry (ZTF archive)", "not-run", "time budget used up");
    else {
      try {
        const early = ztfP ? await ztfP : undefined;
        if (early?.err) throw new Error(early.err);
        const pts = early?.v ?? await ztfLightCurve(pos.ra, pos.dec, signal);
        const dz = ztfDepths(pts, ephem.period, ephem.t0, shape?.T14 ?? dur);
        const bands = (["g", "r"] as const).flatMap((b) => (dz[b] ? [{ b, ...dz[b]! }] : []));
        const v = `${pts.length} ZTF points; ${bands.map((x) => `${x.b}: ${ppt(x.depth)} ± ${r3(x.err * 1000)} (${x.inTransit} in transit)`).join("; ") || "too few in transit"}`;
        const seen = bands.filter((x) => x.depth / x.err >= 3);
        if (!bands.length) add(3, "ztf", "Ground photometry (ZTF archive)", "not-run", "too few ZTF points fall in transit", v);
        else if (bands.length === 2 && seen.length && Math.abs(bands[0].depth - bands[1].depth) / Math.hypot(bands[0].err, bands[1].err) > 3 && Math.abs(bands[0].depth / bands[1].depth - 1) > 0.3)
          add(3, "ztf", "Ground photometry (ZTF archive)", "flag", "the depth differs between g and r: a chromatic dip, the mark of a blend of stars of different colours", v);
        else if (seen.length) add(3, "ztf", "Ground photometry (ZTF archive)", seen.every((x) => Math.abs(x.depth - D) / Math.hypot(x.err, 1e-9) < 3) ? "pass" : "flag", seen.every((x) => Math.abs(x.depth - D) / x.err < 3) ? "ZTF sees the transit at the TESS depth, in ZTF's 1″ seeing-limited images: on the target, independently of TESS" : "ZTF sees a dip, but at a different depth than TESS: dilution differs, so a neighbour may contribute", v);
        else if (bands.every((x) => (D - x.depth) / x.err > 3)) add(3, "ztf", "Ground photometry (ZTF archive)", "fail", "ZTF's seeing-limited photometry of the target shows no dip where TESS predicts one: the eclipse is on another star blended in TESS's 21″ pixels", v);
        else add(3, "ztf", "Ground photometry (ZTF archive)", "info", "ZTF can't tell either way at this depth", v);
      } catch (e) { add(3, "ztf", "Ground photometry (ZTF archive)", "not-run", `ZTF unavailable (${(e as Error).message.slice(0, 80)})`); }
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

  // Kepler/K2: the star's light curves from years before TESS, searched at this period with free phase
  // (the same test as "measured at its period in other seasons", noise floor from null searches).
  // Seen there, the transit is confirmed by another telescope with 4″ pixels, and the two missions
  // together pin the period over the whole gap.
  {
    const name = "Kepler/K2 archive";
    const kk = await kkP;
    const curves = kk.v?.curves ?? [];
    const v = curves.length ? `${curves.length} light curve${curves.length === 1 ? "" : "s"}: ${[...new Set(curves.map((c) => `${c.mission} ${c.pipeline === c.mission ? "" : `${c.pipeline} `}${c.mission === "Kepler" ? "Q" : "C"}${c.segment}`))].join(", ")}` : (kk.v?.notes ?? []).join("; ").slice(0, 160);
    if (kk.err) add(3, "missions", name, "not-run", `Kepler/K2 lookup failed (${kk.err})`);
    else if (!curves.length) add(3, "missions", name, "na", "neither Kepler nor K2 observed the star", v);
    else if (!periodic || !ephem) add(3, "missions", name, "not-run", "needs a period to fold the Kepler/K2 data on", v);
    else if (Date.now() > deadline - 20_000) add(3, "missions", name, "not-run", "time budget used up", v);
    else {
      const T14 = shape?.T14 ?? dur;
      const fc = forcedCheck(curves.map((c) => ({ time: c.t, flux: c.f, quality: new Float64Array(c.t.length) })), { period: ephem.period, duration: T14, depth: D });
      const fv = `${v} · at P ${fc.period} d: ${ppt(fc.depth)} ± ${r3(fc.err * 1000)} ppt (SNR ${fc.snr.toFixed(1)}, ${fc.transits} transits)`;
      if (fc.result === "recovered" || fc.result === "weak") {
        const sameDepth = Math.abs(fc.depth - D) < 3 * Math.hypot(fc.err, 0.1 * D);
        // One whole number of orbits between the missions: the period over the whole baseline.
        let linked = "";
        if (fc.t0 !== undefined && fc.result === "recovered") {
          const gap = ephem.t0 - fc.t0, n = Math.round(gap / ephem.period);
          const errP = ephem.errP ?? ephem.period * 1e-4;
          if (n > 0 && Math.abs(gap) * errP / ephem.period ** 2 < 0.25) {
            const Pl = gap / n, errPl = Math.hypot(ephem.errT0 ?? T14 / 10, T14 / 2 / Math.max(fc.snr, 1)) / n;
            if (Math.abs(Pl - ephem.period) < 3 * Math.hypot(errP, errPl)) {
              linked = `; ${n} orbits link it to TESS: P = ${Pl.toFixed(6)} ± ${r3(errPl)} d`;
              ephem = { ...ephem, period: Pl, errP: errPl, source: `${ephem.source}, linked to Kepler/K2 over ${n} orbits` };
            }
          }
        }
        if (fc.result === "weak") add(3, "missions", name, "info", `a dip at this period in the Kepler/K2 data, but too weak to count${linked}`, fv);
        else add(3, "missions", name, sameDepth ? "pass" : "flag", sameDepth ? `the transit is in the Kepler/K2 data years before TESS, at the same depth: a second telescope, with 4″ pixels to TESS's 21″${linked}` : `Kepler/K2 sees the transit, but at a different depth: dilution differs between the missions, so a neighbour may contribute${linked}`, fv);
      } else if (fc.result === "absent") add(3, "missions", name, "flag", "Kepler/K2 watched the star at this period and saw no transit: the period is wrong, the signal is on a neighbour Kepler/K2's smaller pixels separate, or it started after", fv);
      else add(3, "missions", name, "info", "Kepler/K2 can't tell either way at this depth", fv);
    }
  }

  // Statistical validation: how likely each false-positive scenario is, given everything above.
  let fppOut: VetReport["fpp"];
  // Without a period, the calculation assumes one: the shape's estimate, else the shortest allowed.
  const pFpp = periodic ? P : ephem?.period ?? (duoAliases.length ? Math.min(...duoAliases) : Math.max(posterior?.median ?? pShape ?? 0, minCovP, minPdur ?? 0) || undefined);
  if ((periodic && N < 3) || !shape || !pFpp) add(3, "fpp", "False-positive probability", "not-run", !shape ? "no transit shape" : !pFpp ? "no period or period bound to assume" : "fewer than 3 transits");
  else if (!M || !R || !star?.teff || star.tmag === undefined) add(3, "fpp", "False-positive probability", "not-run", "needs the star's mass, radius, Teff and Tmag");
  else if (Date.now() > deadline - 15_000) add(3, "fpp", "False-positive probability", "not-run", "time budget used up");
  else {
    try {
      const noise = Math.max(median(primary.map((p) => p.beta)), shift?.fred ?? lone?.fred ?? 1);
      const binned = (center: number, times = epochs(P, center, from, to).map((e) => e.t)): FppData | undefined => {
        const pts = stack(times.flatMap((t) => { const part = partAt(primary, t, dur); return part ? [{ t, part }] : []; }), Math.max(2.5 * shape!.T14, 0.1));
        if (pts.dt.length < 20) return undefined;
        const width = Math.max(cadenceOf(primary[0].flat.t), shape!.T14 / 25), reach = Math.max(2.5 * shape!.T14, 0.1);
        const nb = Math.ceil((2 * reach) / width), sum = new Float64Array(nb), cnt = new Float64Array(nb), sw = new Float64Array(nb);
        for (let i = 0; i < pts.dt.length; i++) { const k = Math.floor((pts.dt[i] + reach) / width); if (k >= 0 && k < nb) { sum[k] += pts.f[i]; cnt[k]++; sw[k] += pts.sg[i] ** 2; } }
        const keep = [...cnt.keys()].filter((k) => cnt[k] >= 3);
        return { dt: Float64Array.from(keep, (k) => -reach + (k + 0.5) * width), f: Float64Array.from(keep, (k) => sum[k] / cnt[k]), err: Float64Array.from(keep, (k) => (noise * Math.sqrt(sw[k] / cnt[k])) / Math.sqrt(cnt[k])) };
      };
      const primaryData = periodic ? binned(T0) : binned(NaN, eventTimes0);
      if (!primaryData) throw new Error("too few points around the transit");
      const bg = gcone.v ? others.filter((g) => g.sep <= 120) : [];
      const res = falsePositiveProbability({
        P: pFpp, T14: shape.T14, depth: D, primary: primaryData, secondary: periodic ? binned(T0 + P / 2) : undefined, oddEven,
        star: { radius: R, mass: M, teff: star.teff, tmag: star.tmag, distance: star.distance },
        kMaxKms, neighbours: nbWeights, background: { count: bg.length, radiusArcsec: 120, tmags: bg.map((g) => g.tmag) }, seed: Number(input.tic) % 2 ** 31,
      });
      fppOut = { fpp: res.fpp, nfpp: res.nfpp, scenarios: res.scenarios.slice(0, 8).map(({ id, label, prob }) => ({ id, label, prob })), notes: res.notes };
      const pc = (x: number) => (x < 0.001 ? "< 0.1%" : `${(x * 100).toPrecision(2)}%`);
      const v = `FPP ${pc(res.fpp)}, NFPP ${pc(res.nfpp)}; most likely: ${res.scenarios.slice(0, 3).map((x) => `${x.label} ${pc(x.prob)}`).join(", ")}`;
      const tail = ` (an approximate TRICERATOPS-style calculation${periodic ? "" : `, assuming P ≈ ${r3(pFpp)} d${posterior ? " (the most probable period)" : ""} as TRICERATOPS does for single transits`}: run TRICERATOPS with a contrast curve before claiming validation)`;
      if (res.nfpp > 0.5 || (res.fpp > 0.95 && comb.snr >= 15)) add(3, "fpp", "False-positive probability", "fail", `${res.nfpp > 0.5 ? "a nearby star is the most likely source" : "a false positive is far more likely than a planet"}${tail}`, v);
      else if (res.fpp < 0.015 && res.nfpp < 0.001) add(3, "fpp", "False-positive probability", "pass", `low enough for statistical validation by TRICERATOPS's thresholds (FPP < 1.5%, NFPP < 0.1%)${tail}`, v);
      else add(3, "fpp", "False-positive probability", "flag", `${res.fpp < 0.5 && res.nfpp < 0.001 ? "a likely planet, but not validated" : res.nfpp > 0.1 ? "a nearby false positive is plausible" : "a false positive is about as likely as a planet"}${tail}`, v);
    } catch (e) { add(3, "fpp", "False-positive probability", "not-run", (e as Error).message.slice(0, 100)); }
  }

  // ── Stage 4: follow-up observations (recommended, never run here) ──
  const rejected = checks.some((c) => c.status === "fail");
  const nTransits = periodic ? N : rows.filter((r) => r.m && r.coverage >= 0.5).length;
  // The period for RV estimates: the ephemeris, else the shortest allowed alias, else the lower bound.
  const minCovSingle = input.kind === "single" ? minPeriodFromCoverage(input.times![0], coverage, dur) : 0;
  const Pf = ephem?.period ?? (duoAliases.length ? Math.min(...duoAliases) : Math.max(minPdur ?? 0, minCovSingle) || undefined);
  let next: VetReport["next"];
  if (ephem && (periodic || input.kind === "duo" || ztfPeriod)) {
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

  return finish({ events: rows.map(stripRow), ephemeris: ephem, next, sectors, lightCurves: lcs.length, transits: nTransits, gated: !!(known || gateFail), pixels, fpp: fppOut });
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
/** Period at which the transit's shape (a/R★ per unit period) matches the catalog density: circular
 *  orbit; the photo-eccentric effect makes it uncertain by ~2x either way. */
function periodFromShape(shape: ShapeFit, rho: number) {
  const at = (Pt: number) => densityFromTransit(Pt, shape.depth, shape.T14, shape.T12)?.rho;
  let lo = Math.max(2.2 * shape.T14, 0.2), hi = 20_000;
  if (at(lo) === undefined) return undefined;
  for (let k = 0; k < 60; k++) { const mid = Math.sqrt(lo * hi), r = at(mid); if (r === undefined || r > rho) hi = mid; else lo = mid; }
  return Math.sqrt(lo * hi);
}

/** ASAS-SN and (with a token) ATLAS points in ZTF's shape, which surveys gave any, and why the others didn't. */
async function groundPhot(ra: number, dec: number, signal: AbortSignal): Promise<{ pts: ZtfPoint[]; surveys: string[]; notes: string[] }> {
  const runs: [string, Promise<GroundPhot[]>][] = [["ASAS-SN", asassnLightCurve(ra, dec, signal)]];
  if (atlasConfigured()) runs.push(["ATLAS", atlasLightCurve(ra, dec, signal, { budgetMs: 90_000 })]);
  const got = await Promise.allSettled(runs.map(([, p]) => p));
  const groups = got.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  const notes = got.flatMap((r, i) => (r.status === "rejected" ? [`${runs[i][0]} unavailable (${String((r.reason as Error)?.message ?? r.reason).slice(0, 60)})`] : r.value.length ? [] : [`${runs[i][0]} has no source at the star`]));
  if (!atlasConfigured()) notes.push("ATLAS not used (needs an ATLAS_API_TOKEN)");
  return { pts: toZtfPoints(groups), surveys: [...new Set(groups.map((g) => g.survey))], notes };
}

/** A Kepler or K2 light curve, prepared like a TESS one (cleaned, 30-min binned: Kepler's long cadence). */
type MissionPart = { label: string; raw: Series; flat: Series; cadence: number; beta: number };
function missionPart(c: MissionCurve): MissionPart | null {
  const raw = trimGaps(binSeries(cleanSeries(c.t, c.f, new Float64Array(c.t.length)), 0.5 / 24));
  if (raw.t.length < 50) return null;
  return { label: `${c.mission === "Kepler" ? "Q" : "C"}${c.segment}`, raw, flat: raw, cadence: cadenceOf(raw.t), beta: 1 };
}

function partAt<T extends { flat: Series }>(parts: T[], t: number, duration: number) {
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
