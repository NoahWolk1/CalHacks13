// Vetter agent: decides what a detected transit signal most likely is. A signal is reported as an
// "unvetted candidate" only when it is not a known planet (NASA Exoplanet Archive) or TESS Object
// of Interest (the archive's TOI table, mirrored from ExoFOP) on the star *or on a neighbour close
// enough to leak light into its aperture*, and shows none of the usual eclipsing-binary or
// systematics signs. Surviving every check is still not a discovery: it needs follow-up (more
// sectors, ground photometry, radial velocities) before anyone calls it a planet.
// An eclipsing binary whose evidence comes from its own light curve, on a star no catalog lists as
// variable (SIMBAD types, AAVSO VSX), is reported as an uncatalogued eclipsing binary: a find too.
import { getJson } from "@/lib/http";
import { EXO_TAP } from "./exoplanets";
import { adqlNum, separation } from "./geom";
import { simbadTap } from "./simbad";
import type { BlsResult } from "./bls";
import type { LsResult } from "./lombscargle";
import type { FieldStar } from "./lightcurves";
import type { Cone } from "./types";
import { isEclipsingType, VARIABLE_OTYPES, vsxEntry, type VsxStar } from "./vsx";

/** A known periodic transit source: a confirmed planet or a TOI, with its host's position. */
export type KnownSignal = { tic: string; name: string; period: number; ra: number; dec: number; kind: "planet" | "toi"; disposition?: string;
  /** Transit ephemeris (TESS BTJD days, duration in days) when the archive has one: used to mask known planets. */
  t0?: number; duration?: number };
export type EbNeighbour = { name: string; otype: string; ra: number; dec: number };
/** Another analysed star's strongest BLS signal (for shared-period and contamination checks). */
export type FieldSignal = { tic: string; period: number; depth: number; ra: number; dec: number };

export type VerdictKind = "candidate" | "known-planet" | "known-toi" | "contamination" | "eclipsing-binary" | "new-eb" | "variability" | "systematic";
export type Verdict = { kind: VerdictKind; label: string; reasons: string[] };

/** SIMBAD object types that mean "eclipsing or ellipsoidal binary". */
export const EB_OTYPES = ["EB*", "EB?", "Al*", "bL*", "WU*", "El*"];
/** TESS pixels are 21″ and bright stars spread over several: a periodic signal on a star within
 *  this many arcmin can show up, diluted, in its neighbours' light curves. */
export const CONTAM_ARCMIN = 2.5;
/** Within this, a catalog entry is the star itself (SPOC-only stars carry no SIMBAD type of their own). */
const SELF_ARCMIN = 3 / 60;
const R_EARTH_PER_RSUN = 109.1;
/** Larger than ~2.5 Jupiter radii (28 Earth radii) is a star, not a planet. */
export const MAX_PLANET_REARTH = 28;
/** Odd/even depths differing by more than this fraction (and 3σ) mean two different eclipses. */
export const ODD_EVEN_MAX = 0.1;
/** A planet's occultation is a few percent of its transit depth at most (WASP-18 b: ~3%). */
export const SECONDARY_MAX = 0.1;
/** A transit can last longer than the circular-orbit maximum (eccentricity, radius errors), but not this much longer. */
export const DURATION_MAX_RATIO = 2.5;
/** BJD - 2457000: the TESS mission's time system (BTJD). */
export const BTJD = 2457000;

const DISPOSITION: Record<string, string> = { CP: "confirmed planet", KP: "known planet", PC: "planet candidate", APC: "ambiguous planet candidate", FP: "false positive", FA: "false alarm" };

/** True when two periods match directly or at a factor of 2 (BLS often locks onto P/2 or 2P). */
export function periodsMatch(a: number, b: number, tol = 0.01) {
  return [1, 2, 0.5].some((k) => Math.abs(a / (b * k) - 1) < tol);
}

/** Longest possible transit (days, central, circular orbit) for period P around a star of radius
 *  R (solar radii) and surface gravity logg (cgs), for a companion of relative radius k. */
export function maxTransitDuration(P: number, radiusSun: number, logg: number, k = 0) {
  const G = 6.674e-8, R = radiusSun * 6.957e10;
  const M = (10 ** logg * R * R) / G;
  const a = Math.cbrt((G * M * (P * 86400) ** 2) / (4 * Math.PI * Math.PI));
  const x = (R * (1 + k)) / a;
  return x >= 1 ? P / 2 : (P / Math.PI) * Math.asin(x);
}

export const impliedRadiusEarth = (depth: number, starRadiusSun?: number) =>
  starRadiusSun && depth > 0 ? Math.sqrt(depth) * starRadiusSun * R_EARTH_PER_RSUN : undefined;

const arcmin = (a: { ra: number; dec: number }, b: { ra: number; dec: number }) => separation(a.ra, a.dec, b.ra, b.dec) * 60;

export type VetContext = {
  star: Pick<FieldStar, "tic" | "ra" | "dec" | "otype">;
  starRadius?: number; // solar radii (from the light-curve header)
  logg?: number; // cgs (light-curve header), for the duration check
  /** AAVSO VSX variables in and around the field; undefined when the lookup failed. */
  vsx?: VsxStar[];
  known: KnownSignal[];
  neighbours: EbNeighbour[];
  ls?: LsResult;
  /** Strongest signals on the other analysed stars. */
  others: FieldSignal[];
  /** Cross-match sources that failed this run: a survivor can't be called new against them. */
  unchecked?: string[];
};

export type VetSignal = Pick<BlsResult, "period" | "depth" | "oddEven" | "oddEvenSigma" | "secondary" | "secondarySigma"> & { duration?: number };

export function vetSignal(sig: VetSignal, ctx: VetContext): Verdict {
  // Known planets / TOIs: on this star, or on a neighbour whose light leaks into this aperture.
  const m = ctx.known.filter((k) => periodsMatch(sig.period, k.period))
    .map((k) => ({ k, sep: arcmin(k, ctx.star), self: k.tic === ctx.star.tic || arcmin(k, ctx.star) <= SELF_ARCMIN }))
    .filter((x) => x.self || x.sep <= CONTAM_ARCMIN)
    .sort((a, b) => Number(b.self) - Number(a.self) || Number(b.k.kind === "planet") - Number(a.k.kind === "planet") || a.sep - b.sep)[0];
  if (m?.self) {
    if (m.k.kind === "planet") return { kind: "known-planet", label: `Known planet recovered: ${m.k.name}`, reasons: [`period matches ${m.k.name} (${m.k.period.toFixed(4)} d) in the NASA Exoplanet Archive`] };
    const disp = DISPOSITION[m.k.disposition ?? ""] ?? (m.k.disposition || "no disposition");
    return { kind: "known-toi", label: `Known TOI recovered: ${m.k.name} (${disp})`, reasons: [`period matches ${m.k.name} (${m.k.period.toFixed(4)} d) in the TOI list`] };
  }
  if (m) return { kind: "contamination", label: `Light from ${m.k.name}'s host, ${m.sep.toFixed(1)}′ away`, reasons: [`period matches ${m.k.kind === "planet" ? "known planet" : "TOI"} ${m.k.name} (${m.k.period.toFixed(4)} d) on TIC ${m.k.tic}, close enough to leak into this star's aperture`] };
  // The same signal, deeper, on an analysed neighbour: it's that star's.
  const src = ctx.others.find((o) => o.tic !== ctx.star.tic && periodsMatch(sig.period, o.period, 0.005) && o.depth > sig.depth && arcmin(o, ctx.star) <= CONTAM_ARCMIN);
  if (src) return { kind: "contamination", label: `Light from TIC ${src.tic}, ${arcmin(src, ctx.star).toFixed(1)}′ away`, reasons: [`TIC ${src.tic} shows the same period ${(src.depth / sig.depth).toFixed(1)}x deeper and is close enough to leak into this aperture`] };
  // A catalogued variable with this period: on the star itself, or a neighbour leaking in.
  const own = ctx.vsx ? vsxEntry(ctx.star, ctx.vsx) : undefined;
  const vNear = (ctx.vsx ?? []).filter((v) => v !== own && v.period && periodsMatch(sig.period, v.period, 0.01) && arcmin(v, ctx.star) <= CONTAM_ARCMIN)
    .sort((a, b) => arcmin(a, ctx.star) - arcmin(b, ctx.star))[0];
  if (vNear) return { kind: "contamination", label: `Light from ${vNear.name}, ${arcmin(vNear, ctx.star).toFixed(1)}′ away`, reasons: [`AAVSO VSX lists ${vNear.name} (${vNear.type}, P ${vNear.period!.toFixed(4)} d) at this period, close enough to leak into this aperture`] };

  // Dips at a multiple of a fast pulsation's period are the pulsation (×1 and ×2 are the binary checks below).
  if (ctx.ls && ctx.ls.fap < 1e-3 && ctx.ls.period < 1.5 && ctx.ls.amplitude > sig.depth / 3) {
    const k = sig.period / ctx.ls.period, n = Math.round(k);
    if (n >= 3 && n <= 6 && Math.abs(k / n - 1) < 0.01) return { kind: "variability", label: "Likely stellar variability", reasons: [`the period is ${n}x the star's ${ctx.ls.period.toFixed(4)} d variability (${(ctx.ls.amplitude * 1000).toFixed(2)} ppt): dips of the pulsation, not a transit`] };
  }
  const eb: string[] = [], blends: string[] = [];
  if (sig.oddEvenSigma > 3 && sig.oddEven > ODD_EVEN_MAX) eb.push(`odd and even transits differ in depth by ${(sig.oddEven * 100).toFixed(0)}% (${sig.oddEvenSigma.toFixed(1)}σ): an eclipsing binary at twice the period`);
  if (sig.secondarySigma > 3 && sig.depth > 0 && sig.secondary / sig.depth > SECONDARY_MAX) eb.push(`a ${sig.secondarySigma.toFixed(1)}σ secondary eclipse at phase 0.5, ${((sig.secondary / sig.depth) * 100).toFixed(0)}% of the primary depth`);
  const rp = impliedRadiusEarth(sig.depth, ctx.starRadius);
  if (sig.depth > 0.03) eb.push(`${(sig.depth * 100).toFixed(1)}% deep: too deep for a planet`);
  else if (rp && rp > MAX_PLANET_REARTH) eb.push(`implied companion radius ${rp.toFixed(0)} R⊕ is star-sized`);
  const near = ctx.neighbours.map((n) => ({ n, sep: arcmin(n, ctx.star) })).sort((a, b) => a.sep - b.sep);
  const self = near.find(({ sep }) => sep <= SELF_ARCMIN)?.n;
  const catalogued: string[] = [];
  if (EB_OTYPES.includes(ctx.star.otype) || self) catalogued.push(`SIMBAD already lists the star as an eclipsing/ellipsoidal binary (${self ? `${self.name}, ${self.otype}` : ctx.star.otype})`);
  if (own && isEclipsingType(own.type)) catalogued.push(`AAVSO VSX already lists it as ${own.name} (${own.type}${own.period ? `, P ${own.period.toFixed(4)} d` : ""})`);
  const blend = near.find(({ sep }) => sep > SELF_ARCMIN && sep < CONTAM_ARCMIN);
  if (blend) blends.push(`known eclipsing binary ${blend.n.name} is ${blend.sep.toFixed(2)}′ away and can leak into the TESS aperture`);
  if (sig.duration && ctx.starRadius && ctx.logg && sig.depth > 0) {
    const tmax = maxTransitDuration(sig.period, ctx.starRadius, ctx.logg, Math.sqrt(sig.depth));
    if (sig.duration > DURATION_MAX_RATIO * tmax && sig.duration - tmax > 1.5 / 24) blends.push(`the dip lasts ${(sig.duration * 24).toFixed(1)} h but a transit at this period can last at most ${(tmax * 24).toFixed(1)} h on this star: likely a background eclipsing binary blended in`);
  }
  if (ctx.ls && ctx.ls.fap < 1e-3 && periodsMatch(sig.period, ctx.ls.period, 0.02) && ctx.ls.amplitude > sig.depth / 3) eb.push("the star also varies smoothly at this period (ellipsoidal or contact binary)");
  if (catalogued.length || blends.length) return { kind: "eclipsing-binary", label: catalogued.length ? "Known eclipsing binary" : "Likely eclipsing binary or blend", reasons: [...catalogued, ...blends, ...eb] };
  const shared = ctx.others.filter((o) => o.tic !== ctx.star.tic && periodsMatch(sig.period, o.period, 0.005)).length;
  if (eb.length) {
    if (shared) return { kind: "eclipsing-binary", label: "Likely eclipsing binary or blend", reasons: [...eb, `the same period turns up on ${shared} other star${shared === 1 ? "" : "s"} in the field: one binary's light spread across several apertures`] };
    // Binary signs in its own light curve and no catalog lists it: a new eclipsing binary, if the
    // catalogs could be checked.
    const variable = VARIABLE_OTYPES.has(ctx.star.otype) || !!own;
    if (ctx.vsx && !variable) return { kind: "new-eb", label: "Uncatalogued eclipsing binary", reasons: [...eb, "not in AAVSO VSX or SIMBAD as a variable star"] };
    return { kind: "eclipsing-binary", label: "Likely eclipsing binary", reasons: own ? [...eb, `VSX lists the star as ${own.name} (${own.type})`] : eb };
  }

  if (shared) return { kind: "systematic", label: "Likely systematic (shared period)", reasons: [`the same period turns up on ${shared} other star${shared === 1 ? "" : "s"} in the field: instrumental, or one blended binary`] };

  const reasons = ["not a known planet or TOI on this star or a neighbour; passed odd/even, secondary-eclipse, depth and blend checks"];
  if (ctx.unchecked?.length) reasons.push(`not checked against ${ctx.unchecked.join(" or ")} (lookup failed): it may already be known`);
  return { kind: "candidate", label: "Unvetted transit candidate", reasons };
}

// ── cross-match lookups ─────────────────────────────────────────────────────

const tapPost = (query: string): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ query, format: "json" }).toString(),
});

/** Archive transit midpoint (BJD) and duration (hours) as a BTJD ephemeris, when both are there. */
const ephemeris = (mid: unknown, hours: unknown) =>
  typeof mid === "number" && typeof hours === "number" && mid > BTJD && hours > 0 ? { t0: mid - BTJD, duration: hours / 24 } : {};

/** The cone grown by the contamination radius: neighbours just outside can still leak in. */
const grown = (c: Cone): Cone => ({ ...c, radius: c.radius + CONTAM_ARCMIN / 60 });

/** Confirmed planets with hosts in (or just around) the cone. (Planets without a period are dropped
 *  here, not in ADQL: "and pl_orbper is not null" made the same query 23 s instead of 1.6 s.) */
export async function knownPlanetsNear(c: Cone, signal: AbortSignal): Promise<KnownSignal[]> {
  const g = grown(c);
  const rows = await getJson<Record<string, unknown>[]>(EXO_TAP, {
    init: tapPost(`select pl_name,tic_id,pl_orbper,pl_tranmid,pl_trandur,ra,dec from pscomppars where contains(point('icrs',ra,dec),circle('icrs',${adqlNum(g.ra)},${adqlNum(g.dec)},${adqlNum(g.radius)}))=1`),
    timeoutMs: 12_000, signal, retries: 1,
  });
  if (!Array.isArray(rows)) throw new Error("unexpected Exoplanet Archive response");
  return rows.flatMap((r) => (typeof r.pl_orbper === "number" && typeof r.ra === "number" && typeof r.dec === "number"
    ? [{ tic: String(r.tic_id ?? "").replace(/^TIC\s+/, ""), name: String(r.pl_name), period: r.pl_orbper, ra: r.ra, dec: r.dec, kind: "planet" as const, ...ephemeris(r.pl_tranmid, r.pl_trandur) }] : []));
}

/** TOIs in (or just around) the cone. The TOI table has no spatial index (ADQL contains() fails
 *  there), so it's an RA/Dec box, trimmed to the circle here. */
export function toiQuery(c: Cone) {
  const g = grown(c);
  const dra = Math.abs(g.dec) + g.radius >= 89 ? 180 : g.radius / Math.cos(((Math.abs(g.dec) + g.radius) * Math.PI) / 180);
  const lo = g.ra - dra, hi = g.ra + dra;
  const raCond = dra >= 180 ? "1=1" : lo < 0 ? `(ra >= ${adqlNum(lo + 360)} or ra <= ${adqlNum(hi)})` : hi > 360 ? `(ra >= ${adqlNum(lo)} or ra <= ${adqlNum(hi - 360)})` : `ra between ${adqlNum(lo)} and ${adqlNum(hi)}`;
  return `select toi,tid,tfopwg_disp,pl_orbper,pl_tranmid,pl_trandurh,ra,dec from toi where ${raCond} and dec between ${adqlNum(g.dec - g.radius)} and ${adqlNum(g.dec + g.radius)}`;
}

export async function toisNear(c: Cone, signal: AbortSignal): Promise<KnownSignal[]> {
  const g = grown(c);
  const rows = await getJson<Record<string, unknown>[]>(EXO_TAP, { init: tapPost(toiQuery(c)), timeoutMs: 12_000, signal, retries: 1 });
  if (!Array.isArray(rows)) throw new Error("unexpected TOI table response");
  return rows.flatMap((r) => (typeof r.pl_orbper === "number" && typeof r.ra === "number" && typeof r.dec === "number" && separation(g.ra, g.dec, r.ra, r.dec) <= g.radius
    ? [{ tic: String(r.tid), name: `TOI-${r.toi}`, period: r.pl_orbper, ra: r.ra, dec: r.dec, kind: "toi" as const, disposition: typeof r.tfopwg_disp === "string" ? r.tfopwg_disp : "", ...ephemeris(r.pl_tranmid, r.pl_trandurh) }] : []));
}

/** Known eclipsing/ellipsoidal binaries in (and just around) the cone, from SIMBAD. */
export async function ebNeighbours(c: Cone, signal: AbortSignal): Promise<EbNeighbour[]> {
  const g = grown(c);
  const q = `SELECT TOP 2000 main_id, otype, ra, dec FROM basic WHERE CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${adqlNum(g.ra)}, ${adqlNum(g.dec)}, ${adqlNum(g.radius)})) = 1 `
    + `AND otype IN (${EB_OTYPES.map((t) => `'${t}'`).join(",")})`;
  const t = await simbadTap(q, { timeoutMs: 12_000, signal });
  const col = Object.fromEntries(t.metadata!.map((m, i) => [m.name, i]));
  return t.data!.flatMap((r) => (typeof r[col.ra] === "number" && typeof r[col.dec] === "number"
    ? [{ name: String(r[col.main_id]).trim(), otype: String(r[col.otype]).trim(), ra: r[col.ra] as number, dec: r[col.dec] as number }] : []));
}
