// Archival data for vetting one star (vetReport.ts), the follow-up a researcher can do without a
// telescope:
//  - Gaia DR3 at the ESA archive (VizieR's copy as the fallback): astrometric and image-shape signs
//    of an unresolved companion (RUWE, IPD harmonic amplitude, multi-peak windows), the RV time
//    series summary (epochs, χ² p-value, robust amplitude: an RV upper limit at no cost), line
//    broadening, the non-single-star orbit and eclipsing-binary tables, the variability classifier,
//    FLAME / GSP-Phot stellar parameters, and every source around the star (Gaia resolves ~0.4-1″,
//    where the TIC inherits DR2 and drops faint stars)
//  - SDSS APOGEE DR17 visits: radial velocities per epoch, fitted for K at the transit ephemeris
//  - ZTF DR light curves (IRSA): a second photometric system in two colours, for deeper signals on
//    fainter stars (chromatic depth = a blend of differently coloured stars)
// Each lookup throws on failure, and the caller logs the check as "not run".
import { getJson, getText } from "@/lib/http";
import { VIZIER_TAP } from "./vsx";

export const GAIA_TAP = "https://gea.esac.esa.int/tap-server/tap/sync";
const SKYSERVER = "https://skyserver.sdss.org/dr17/SkyServerWS/SearchTools/SqlSearch";
const ZTF_LC = "https://irsa.ipac.caltech.edu/cgi-bin/ZTF/nph_light_curves";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
type Row = Record<string, unknown>;

/** JSON with integers past 2^53 (Gaia source ids) quoted, so they survive JSON.parse as strings. */
export const parseBigJson = (text: string): unknown => JSON.parse(text.replace(/([[,:]\s*)(-?\d{16,})(?=\s*[,\]}])/g, '$1"$2"'));

async function tap(url: string, query: string, signal: AbortSignal, timeoutMs = 20_000): Promise<Row[]> {
  const t = parseBigJson(await getText(`${url}?${new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "json", QUERY: query })}`, { timeoutMs, signal, retries: 1 })) as { metadata?: { name: string }[]; data?: unknown[][] };
  if (!t?.metadata || !Array.isArray(t.data)) throw new Error("unexpected TAP response");
  return t.data.map((r) => Object.fromEntries(t.metadata!.map((m, i) => [m.name, r[i]])));
}
const gaia = (q: string, signal: AbortSignal, timeoutMs?: number) => tap(GAIA_TAP, q, signal, timeoutMs);

// ── Gaia DR3 ────────────────────────────────────────────────────────────────

export type GaiaStar = {
  source: string; ruwe?: number; ipdHarmonic?: number; ipdMultiPeak?: number; nss?: number; varFlag?: string;
  g?: number; bpRp?: number; parallax?: number; pmra?: number; pmdec?: number;
  rv?: { value?: number; err?: number; epochs?: number; pvalue?: number; gof?: number; amplitude?: number; templateTeff?: number };
  vbroad?: number;
  /** FLAME / GSP-Phot. */
  ap?: { radius?: number; mass?: number; binaryProb?: number; vsini?: number };
  orbit?: { type: string; period?: number; ecc?: number; k1?: number };
  eb?: { period: number; ranking?: number };
  varClass?: { name: string; score?: number };
};

/** Gaia DR3 for one source (TIC 8.2 stores DR2 ids: mapped through dr2_neighbourhood when DR3 differs). */
export async function gaiaStar(sourceId: string, signal: AbortSignal): Promise<GaiaStar> {
  if (!/^\d{6,20}$/.test(sourceId)) throw new Error("no Gaia id");
  const cols = "source_id, ruwe, ipd_gof_harmonic_amplitude, ipd_frac_multi_peak, non_single_star, phot_variable_flag, phot_g_mean_mag, bp_rp, parallax, pmra, pmdec, radial_velocity, radial_velocity_error, rv_nb_transits, rv_chisq_pvalue, rv_renormalised_gof, rv_amplitude_robust, rv_template_teff, vbroad";
  let rows = await gaia(`SELECT ${cols} FROM gaiadr3.gaia_source WHERE source_id = ${sourceId}`, signal);
  if (!rows.length) {
    const m = await gaia(`SELECT TOP 1 dr3_source_id FROM gaiadr3.dr2_neighbourhood WHERE dr2_source_id = ${sourceId} ORDER BY angular_distance`, signal);
    const id = m[0]?.dr3_source_id;
    if (id === undefined) throw new Error("not in Gaia DR3");
    rows = await gaia(`SELECT ${cols} FROM gaiadr3.gaia_source WHERE source_id = ${id}`, signal);
  }
  const r = rows[0];
  if (!r) throw new Error("not in Gaia DR3");
  const id = String(r.source_id);
  const [ap, orb, eb, vc] = await Promise.all([
    gaia(`SELECT radius_flame, mass_flame, radius_gspphot, classprob_dsc_combmod_binarystar, vsini_esphs FROM gaiadr3.astrophysical_parameters WHERE source_id = ${id}`, signal).catch(() => []),
    r.non_single_star ? gaia(`SELECT TOP 3 nss_solution_type, period, eccentricity, semi_amplitude_primary FROM gaiadr3.nss_two_body_orbit WHERE source_id = ${id}`, signal).catch(() => []) : Promise.resolve([]),
    gaia(`SELECT frequency, global_ranking FROM gaiadr3.vari_eclipsing_binary WHERE source_id = ${id}`, signal).catch(() => []),
    gaia(`SELECT best_class_name, best_class_score FROM gaiadr3.vari_classifier_result WHERE source_id = ${id}`, signal).catch(() => []),
  ]);
  const a = ap[0], o = orb.find((x) => num(x.period)), e = eb[0], v = vc[0];
  return {
    source: id, ruwe: num(r.ruwe), ipdHarmonic: num(r.ipd_gof_harmonic_amplitude), ipdMultiPeak: num(r.ipd_frac_multi_peak), nss: num(r.non_single_star),
    varFlag: typeof r.phot_variable_flag === "string" ? r.phot_variable_flag : undefined,
    g: num(r.phot_g_mean_mag), bpRp: num(r.bp_rp), parallax: num(r.parallax), pmra: num(r.pmra), pmdec: num(r.pmdec),
    ...(num(r.rv_nb_transits) ? { rv: { value: num(r.radial_velocity), err: num(r.radial_velocity_error), epochs: num(r.rv_nb_transits), pvalue: num(r.rv_chisq_pvalue), gof: num(r.rv_renormalised_gof), amplitude: num(r.rv_amplitude_robust), templateTeff: num(r.rv_template_teff) } } : {}),
    vbroad: num(r.vbroad),
    ...(a ? { ap: { radius: num(a.radius_flame) ?? num(a.radius_gspphot), mass: num(a.mass_flame), binaryProb: num(a.classprob_dsc_combmod_binarystar), vsini: num(a.vsini_esphs) } } : {}),
    ...(o ? { orbit: { type: String(o.nss_solution_type), period: num(o.period), ecc: num(o.eccentricity), k1: num(o.semi_amplitude_primary) } } : {}),
    ...(e && num(e.frequency) ? { eb: { period: 1 / num(e.frequency)!, ranking: num(e.global_ranking) } } : {}),
    ...(v ? { varClass: { name: String(v.best_class_name), score: num(v.best_class_score) } } : {}),
  };
}

/** Gaia DR3 RUWE / NSS / variability / G from VizieR (the fallback when the ESA archive is down). */
export async function gaiaStarVizier(sourceId: string, signal: AbortSignal): Promise<GaiaStar> {
  if (!/^\d{6,20}$/.test(sourceId)) throw new Error("no Gaia id");
  const r = (await tap(VIZIER_TAP, `SELECT TOP 1 Source, RUWE, NSS, VarFlag, Gmag, "BP-RP", Plx, pmRA, pmDE, RV, e_RV FROM "I/355/gaiadr3" WHERE Source = ${sourceId}`, signal, 15_000))[0];
  if (!r) throw new Error("not in Gaia DR3");
  return { source: String(r.Source), ruwe: num(r.RUWE), nss: num(r.NSS), varFlag: typeof r.VarFlag === "string" ? r.VarFlag : undefined, g: num(r.Gmag), bpRp: num(r["BP-RP"]), parallax: num(r.Plx), pmra: num(r.pmRA), pmdec: num(r.pmDE), ...(num(r.RV) !== undefined ? { rv: { value: num(r.RV), err: num(r.e_RV) } } : {}) };
}

export type GaiaNeighbour = { source: string; ra: number; dec: number; g: number; bpRp?: number; sep: number; parallax?: number; ruwe?: number; tmag: number };

/** TESS magnitude from Gaia G and BP-RP (Stassun et al. 2019, eq. 1); G - 0.43 without a colour. */
export const tmagFromGaia = (g: number, bpRp?: number) => (bpRp === undefined ? g - 0.43 : g - 0.00522555 * bpRp ** 3 + 0.0891337 * bpRp ** 2 - 0.633923 * bpRp + 0.0324473);

/** Every Gaia DR3 source within `arcsec` (the target included), nearest first. */
export async function gaiaCone(ra: number, dec: number, arcsec: number, signal: AbortSignal): Promise<GaiaNeighbour[]> {
  const r = arcsec / 3600;
  const rows = await gaia(`SELECT TOP 3000 source_id, ra, dec, phot_g_mean_mag, bp_rp, parallax, ruwe, DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', ${ra}, ${dec})) * 3600 AS sep FROM gaiadr3.gaia_source WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra}, ${dec}, ${r})) AND phot_g_mean_mag IS NOT NULL ORDER BY sep`, signal, 30_000);
  return rows.flatMap((x) => {
    const g = num(x.phot_g_mean_mag), sep = num(x.sep), xr = num(x.ra), xd = num(x.dec);
    if (g === undefined || sep === undefined || xr === undefined || xd === undefined) return [];
    const bpRp = num(x.bp_rp);
    return [{ source: String(x.source_id), ra: xr, dec: xd, g, bpRp, sep, parallax: num(x.parallax), ruwe: num(x.ruwe), tmag: tmagFromGaia(g, bpRp) }];
  });
}

/** The brightest Gaia DR3 stars in a cone (degrees): stands in for SIMBAD's stars when CDS is down. */
export async function gaiaBright(ra: number, dec: number, radius: number, signal: AbortSignal, gMax = 9, cap = 50, timeoutMs = 6_000) {
  const rows = await gaia(`SELECT TOP ${cap} source_id, ra, dec, phot_g_mean_mag, bp_rp, parallax FROM gaiadr3.gaia_source WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra}, ${dec}, ${radius})) AND phot_g_mean_mag < ${gMax} ORDER BY phot_g_mean_mag`, signal, timeoutMs);
  return rows.flatMap((x) => {
    const g = num(x.phot_g_mean_mag), xr = num(x.ra), xd = num(x.dec);
    return g === undefined || xr === undefined || xd === undefined ? [] : [{ source: String(x.source_id), ra: xr, dec: xd, g, bpRp: num(x.bp_rp), parallax: num(x.parallax) }];
  });
}

/** Upper limit on an RV semi-amplitude (km/s) from Gaia's epoch summary: with ≥ 10 epochs at
 *  effectively random phases, the robust peak-to-peak amplitude is at least ~1.6K for a circular
 *  orbit, so K ≤ amplitude / 1.6 plus twice the per-epoch error. Null when there isn't enough. */
export function gaiaRvLimit(rv: GaiaStar["rv"]): { kMax: number; epochError: number; variable: boolean } | null {
  if (!rv?.epochs || rv.epochs < 10 || rv.amplitude === undefined || rv.err === undefined) return null;
  // radial_velocity_error = sqrt(π / 2N) σ_epoch (+ 0.11 km/s floor) for the median-combined bright stars.
  const epochError = Math.max(0.1, (rv.err - 0.11) * Math.sqrt((2 * rv.epochs) / Math.PI));
  const variable = (rv.pvalue ?? 1) <= 0.01 && (rv.gof ?? 0) > 4;
  return { kMax: rv.amplitude / 1.6 + 2 * epochError, epochError, variable };
}

// ── APOGEE ──────────────────────────────────────────────────────────────────

export type ApogeeVisit = { mjd: number; rv: number; err: number };
export type Apogee = { id: string; teff?: number; vsini?: number; vscatter?: number; visits: ApogeeVisit[] };

async function skyserver(cmd: string, signal: AbortSignal): Promise<Row[]> {
  const j = await getJson<unknown>(`${SKYSERVER}?${new URLSearchParams({ cmd, format: "json" })}`, { timeoutMs: 20_000, signal, retries: 1 });
  const t = Array.isArray(j) ? (j[0] as { Rows?: Row[] }) : null;
  if (!t || !Array.isArray(t.Rows)) throw new Error((j as { ErrorMessage?: string })?.ErrorMessage?.slice(0, 80) ?? "unexpected SkyServer response");
  return t.Rows;
}

/** The APOGEE DR17 star within 3″, with every visit's RV (null if APOGEE never observed it). */
export async function apogeeNear(ra: number, dec: number, signal: AbortSignal): Promise<Apogee | null> {
  const d = 3 / 3600, dr = d / Math.max(0.05, Math.cos((dec * Math.PI) / 180));
  const stars = await skyserver(`SELECT TOP 5 a.apogee_id, a.ra, a.dec, a.vscatter, a.nvisits, s.teff, s.vsini FROM apogeeStar a LEFT JOIN aspcapStar s ON a.apstar_id = s.apstar_id WHERE a.ra BETWEEN ${ra - dr} AND ${ra + dr} AND a.dec BETWEEN ${dec - d} AND ${dec + d}`, signal);
  const s = stars[0];
  if (!s || typeof s.apogee_id !== "string" || !/^[\w+.-]+$/.test(s.apogee_id)) return null;
  const visits = await skyserver(`SELECT mjd, vhelio, vrelerr, starflag FROM apogeeVisit WHERE apogee_id = '${s.apogee_id}'`, signal);
  const pos = (v: unknown) => { const n = num(v); return n !== undefined && n > -9000 ? n : undefined; };
  return {
    id: s.apogee_id, teff: pos(s.teff), vsini: pos(s.vsini), vscatter: pos(s.vscatter),
    visits: visits.flatMap((v) => { const mjd = num(v.mjd), rv = num(v.vhelio), err = num(v.vrelerr); return mjd && rv !== undefined && rv > -9000 && err !== undefined && err > 0 ? [{ mjd, rv, err }] : []; }),
  };
}

/** Least-squares circular-orbit K (km/s) at a fixed period. With a precise ephemeris the phase is
 *  fixed (v = γ − K sin φ, φ from T0: the star recedes after transit); otherwise sin and cos are
 *  both fitted and K = their hypotenuse. Errors include `jitter` in quadrature (rotation and
 *  pulsation move lines too). */
export function fitK(visits: { t: number; rv: number; err: number }[], P: number, t0?: number, jitter = 0): { k: number; err: number; chi2: number; dof: number } | null {
  const n = visits.length, fixed = t0 !== undefined;
  if (n < (fixed ? 3 : 4)) return null;
  const w = visits.map((v) => 1 / (v.err ** 2 + jitter ** 2));
  const ph = visits.map((v) => (2 * Math.PI * (v.t - (t0 ?? 0))) / P);
  const X = fixed ? [ph.map(() => 1), ph.map((p) => -Math.sin(p))] : [ph.map(() => 1), ph.map((p) => Math.sin(p)), ph.map((p) => Math.cos(p))];
  const m = X.length, A = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => X[i].reduce((k, x, q) => k + w[q] * x * X[j][q], 0)));
  const b = X.map((xi) => xi.reduce((k, x, q) => k + w[q] * x * visits[q].rv, 0));
  const inv = invert(A);
  if (!inv) return null;
  const a = inv.map((r) => r.reduce((k, v, j) => k + v * b[j], 0));
  const chi2 = visits.reduce((k, v, q) => k + w[q] * (v.rv - X.reduce((s, xi, i) => s + a[i] * xi[q], 0)) ** 2, 0);
  if (fixed) return { k: a[1], err: Math.sqrt(inv[1][1]), chi2, dof: n - 2 };
  const k = Math.hypot(a[1], a[2]);
  return { k, err: Math.sqrt((a[1] ** 2 * inv[1][1] + a[2] ** 2 * inv[2][2]) / Math.max(k * k, 1e-12)), chi2, dof: n - 3 };
}

function invert(A: number[][]): number[][] | null {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (!(Math.abs(M[p][c]) > 1e-15)) return null;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c]; for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r) => r.slice(n));
}

// ── ZTF ─────────────────────────────────────────────────────────────────────

export type ZtfPoint = { t: number; mag: number; err: number; band: "g" | "r"; oid: string };

/** ZTF DR light-curve points within 1.5″ (catflags 0 only), HJD converted to BTJD. */
export async function ztfLightCurve(ra: number, dec: number, signal: AbortSignal): Promise<ZtfPoint[]> {
  const csv = await getText(`${ZTF_LC}?${new URLSearchParams({ POS: `CIRCLE ${ra} ${dec} ${1.5 / 3600}`, BANDNAME: "g,r", FORMAT: "csv", BAD_CATFLAGS_MASK: "32768" })}`, { timeoutMs: 40_000, signal, retries: 1 });
  const lines = csv.trim().split("\n");
  const head = lines[0]?.split(",") ?? [];
  const ix = (k: string) => head.indexOf(k);
  const [it, im, ie, ic, ib, io] = ["hjd", "mag", "magerr", "catflags", "filtercode", "oid"].map(ix);
  if (it < 0 || im < 0) throw new Error("unexpected ZTF response");
  return lines.slice(1).flatMap((l) => {
    const c = l.split(","), t = Number(c[it]) - 2457000, mag = Number(c[im]), err = Number(c[ie]);
    const band = c[ib] === "zg" ? "g" : c[ib] === "zr" ? "r" : null;
    return band && Number(c[ic]) === 0 && Number.isFinite(t) && Number.isFinite(mag) && err > 0 ? [{ t, mag, err, band, oid: c[io] }] : [];
  });
}

/** Depth of a transit in ZTF data per band: points folded at the ephemeris, each field/CCD (oid)
 *  normalised to its own out-of-transit median, in-transit mean against the rest. */
export function ztfDepths(pts: ZtfPoint[], P: number, t0: number, T14: number) {
  const out: Record<"g" | "r", { depth: number; err: number; inTransit: number; points: number } | null> = { g: null, r: null };
  for (const band of ["g", "r"] as const) {
    const byOid = new Map<string, ZtfPoint[]>();
    for (const p of pts) if (p.band === band) byOid.set(p.oid, [...(byOid.get(p.oid) ?? []), p]);
    const inn: number[] = [], oot: number[] = [];
    for (const ps of byOid.values()) {
      const isIn = (t: number) => { const ph = (((t - t0) / P) % 1 + 1) % 1; return Math.min(ph, 1 - ph) * P < 0.4 * T14; };
      const base = ps.filter((p) => !isIn(p.t)).map((p) => p.mag).sort((a, b) => a - b);
      if (base.length < 20) continue;
      const m = base[base.length >> 1];
      for (const p of ps) (isIn(p.t) ? inn : oot).push(10 ** (-0.4 * (p.mag - m)));
    }
    if (inn.length < 5 || oot.length < 30) continue;
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const sorted = [...oot].sort((a, b) => a - b), med = sorted[sorted.length >> 1];
    const sd = 1.4826 * [...oot].map((x) => Math.abs(x - med)).sort((a, b) => a - b)[oot.length >> 1];
    out[band] = { depth: mean(oot) - mean(inn), err: sd * Math.sqrt(1 / inn.length + 1 / oot.length), inTransit: inn.length, points: inn.length + oot.length };
  }
  return out;
}

/** Minimum companion mass (M☉) from a primary's RV semi-amplitude: the mass function
 *  P K³ / 2πG = (M2 sin i)³ / (M1 + M2)², solved by iteration (circular orbit). */
export function minMassFromK(kKms: number, periodDays: number, m1Sun: number): number {
  const G = 6.674e-11, MSUN = 1.989e30;
  const f = (periodDays * 86400 * (kKms * 1000) ** 3) / (2 * Math.PI * G) / MSUN;
  let m = Math.cbrt(f * m1Sun * m1Sun);
  for (let i = 0; i < 50; i++) m = Math.cbrt(f * (m1Sun + m) ** 2);
  return m;
}
