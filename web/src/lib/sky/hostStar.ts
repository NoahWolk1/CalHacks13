// Catalog lookups for vetting one star (vetReport.ts, Stage 0 and the neighbour bookkeeping in Stage 3):
//  - TESS Input Catalog v8.2 (MAST): Teff, radius, mass, logg, density, Tmag, distance, Gaia id
//  - Gaia DR3 (VizieR I/355): RUWE and the non-single-star flag (multiplicity)
//  - ExoFOP: TOIs, confirmed planets, other names (KOI/K2), known stellar companions, and the
//    follow-up already on file (imaging, spectroscopy, ground photometry)
//  - ExoFOP's community TOI (CTOI) table, with periods: one ~2 MB CSV, cached per process
//  - the TESS eclipsing-binary catalog (Prša et al. 2022): its own site at Villanova (kept current,
//    with eclipse depths and phases), VizieR J/ApJS/258/16 as the fallback
//  - NASA Exoplanet Archive KOIs (only in the Kepler field)
//  - TIC stars around the target (blend bookkeeping)
// Each lookup throws on failure; the caller records the check as "not run" rather than passed.
import { getJson, getText } from "@/lib/http";
import { EXO_TAP } from "./exoplanets";
import { adqlNum } from "./geom";
import { MAST_API } from "./telescopes";
import { BTJD, JD_MIN, type KnownSignal } from "./vetting";
import { VIZIER_TAP } from "./vsx";

export type HostStar = {
  tic: string; ra: number; dec: number;
  teff?: number; radius?: number; mass?: number; logg?: number;
  /** Solar units. */
  rho?: number; tmag?: number; distance?: number; lumclass?: string; gaia?: string; eRadius?: number;
};
export type GaiaFlags = { ruwe?: number; nss?: number; variable?: string; gmag?: number };
export type ExofopTarget = {
  tois: string[]; planets: string[]; names: string[];
  companions: { sep?: number; dmag?: number; band?: string }[];
  imaging: { telescope: string; type: string; date: string; contrast: string }[];
  spectra: number; photometry: number; contamination?: number;
};
export type Ctoi = { name: string; period?: number; epoch?: number; depthPpm?: number; durationH?: number; disposition: string };
/** t0 in BTJD; depth (fraction) and phase of the primary and, when found, the secondary eclipse. */
export type TessEb = { period: number; t0: number; morph?: number; depth?: number; secPhase?: number; secDepth?: number };
export type Koi = { name: string; period?: number; disposition: string };
export type TicNeighbour = { tic: string; tmag: number; sep: number /* arcsec */ };

const mast = (request: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ request: JSON.stringify(request) }).toString(),
});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const vizier = (query: string, signal: AbortSignal, timeoutMs = 15_000) =>
  getJson<{ metadata?: { name: string }[]; data?: unknown[][] }>(`${VIZIER_TAP}?${new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "json", QUERY: query })}`, { timeoutMs, signal, retries: 1 })
    .then((t) => {
      if (!t?.metadata || !Array.isArray(t.data)) throw new Error("unexpected VizieR response");
      const col = Object.fromEntries(t.metadata.map((m, i) => [m.name, i]));
      return t.data.map((r) => Object.fromEntries(Object.entries(col).map(([k, i]) => [k, r[i]])) as Record<string, unknown>);
    });

export async function ticStar(tic: string, signal: AbortSignal): Promise<HostStar> {
  const j = await getJson<{ data?: Record<string, unknown>[] }>(MAST_API, {
    init: mast({ service: "Mast.Catalogs.Filtered.Tic", format: "json", params: { columns: "*", filters: [{ paramName: "ID", values: [tic] }] } }),
    timeoutMs: 15_000, signal, retries: 1,
  });
  const r = j?.data?.[0];
  if (!r || typeof r.ra !== "number" || typeof r.dec !== "number") throw new Error(`TIC ${tic} not in the TESS Input Catalog`);
  const pos = (v: unknown) => { const n = num(v); return n !== undefined && n > 0 ? n : undefined; };
  return {
    tic, ra: r.ra, dec: r.dec, teff: pos(r.Teff), radius: pos(r.rad), mass: pos(r.mass), logg: pos(r.logg), rho: pos(r.rho), tmag: num(r.Tmag),
    distance: pos(r.d), lumclass: typeof r.lumclass === "string" ? r.lumclass : undefined, gaia: r.GAIA ? String(r.GAIA) : undefined, eRadius: pos(r.e_rad),
  };
}

/** A star's radius (R☉) from its TESS magnitude, distance and Teff, when the TIC has none (it lists no
 *  radius for many very bright and evolved stars): luminosity from the absolute T magnitude, with a
 *  blackbody correction for the share of the light in the TESS band (600-1000 nm) relative to the Sun,
 *  then R = √L (5772/Teff)². No extinction correction, so it's a lower limit: fine for telling a giant
 *  (tens of R☉) from a dwarf, not a precise radius. */
export function radiusFromLuminosity(tmag: number, distancePc: number, teff: number): number | undefined {
  if (!(distancePc > 0) || !(teff > 2000 && teff < 50_000) || !Number.isFinite(tmag)) return undefined;
  const M_T_SUN = 4.3;
  const absT = tmag - 5 * Math.log10(distancePc / 10);
  const bandShare = (T: number) => {
    // Fraction of σT⁴ emitted between 600 and 1000 nm (Planck, midpoint sum over 40 steps).
    let s = 0;
    for (let i = 0; i < 40; i++) {
      const lam = (600 + (i + 0.5) * 10) * 1e-9;
      s += (1 / lam ** 5 / (Math.exp(1.4388e-2 / (lam * T)) - 1)) * 10e-9;
    }
    return (s * 2 * Math.PI * 6.626e-34 * 2.998e8 ** 2) / (5.670e-8 * T ** 4);
  };
  const L = 10 ** (-0.4 * (absT - M_T_SUN)) * (bandShare(5772) / bandShare(teff));
  return Math.sqrt(L) * (5772 / teff) ** 2;
}

/** TIC stars within `arcmin` of a position (the target included), brightest first. */
export async function ticNeighbours(ra: number, dec: number, arcmin: number, signal: AbortSignal): Promise<TicNeighbour[]> {
  const j = await getJson<{ data?: Record<string, unknown>[] }>(MAST_API, {
    init: mast({ service: "Mast.Catalogs.Tic.Cone", format: "json", pagesize: 2000, params: { ra, dec, radius: arcmin / 60 } }),
    timeoutMs: 15_000, signal, retries: 1,
  });
  if (!Array.isArray(j?.data)) throw new Error("unexpected TIC cone response");
  return j.data.flatMap((r) => (typeof r.Tmag === "number" && typeof r.dstArcSec === "number" && r.objType !== "EXTENDED"
    ? [{ tic: String(r.ID), tmag: r.Tmag, sep: r.dstArcSec }] : [])).sort((a, b) => a.tmag - b.tmag);
}

/** Gaia DR3 RUWE and non-single-star flag. TIC 8.2 carries DR2 ids, the same as DR3's for nearly every star. */
export async function gaiaFlags(sourceId: string, signal: AbortSignal): Promise<GaiaFlags | null> {
  if (!/^\d{6,20}$/.test(sourceId)) return null;
  const rows = await vizier(`SELECT TOP 1 RUWE, NSS, VarFlag, Gmag FROM "I/355/gaiadr3" WHERE Source = ${sourceId}`, signal);
  const r = rows[0];
  return r ? { ruwe: num(r.RUWE), nss: num(r.NSS), variable: typeof r.VarFlag === "string" ? r.VarFlag : undefined, gmag: num(r.Gmag) } : null;
}

export async function exofopTarget(tic: string, signal: AbortSignal): Promise<ExofopTarget> {
  const d = await getJson<Record<string, unknown>>(`https://exofop.ipac.caltech.edu/tess/target.php?id=${tic}&json`, { timeoutMs: 15_000, signal, retries: 1 });
  if (!d || typeof d !== "object" || !d.basic_info) throw new Error("unexpected ExoFOP response");
  const basic = d.basic_info as Record<string, string>;
  const list = (k: string) => (Array.isArray(d[k]) ? (d[k] as Record<string, unknown>[]) : []);
  const split = (s?: string) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  return {
    tois: [...new Set(list("tois").map((t) => String(t.toi ?? "")).filter(Boolean))],
    planets: split(basic.confirmed_planets),
    names: split(basic.star_names),
    companions: list("stellar_companions").map((c) => ({ sep: num(c.sep), dmag: num(c.dmag), band: typeof c.filt === "string" ? c.filt : undefined })),
    imaging: list("imaging").map((i) => ({ telescope: `${i.itel ?? ""} ${i.iinst ?? ""}`.trim(), type: String(i.itype ?? ""), date: String(i.idate ?? ""), contrast: String(i.icont ?? "") })),
    spectra: list("spectroscopy").length,
    photometry: list("time_series").length,
    contamination: num(basic.tic_contamination_ratio),
  };
}

// ── CTOIs ───────────────────────────────────────────────────────────────────

/** Splits one CSV line (quoted fields may hold commas and "" escapes). */
export function csvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseCtois(csv: string): Map<string, Ctoi[]> {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const head = csvLine(lines[0] ?? "");
  const at = (name: string) => head.indexOf(name);
  const [iTic, iCtoi, iP, iE, iDepth, iDur, iUser, iTfop] = ["TIC ID", "CTOI", "Period (days)", "Transit Epoch (BJD)", "Depth ppm", "Duration (hrs)", "User Disposition", "TFOPWG Disposition"].map(at);
  if (iTic < 0 || iCtoi < 0) throw new Error("unexpected CTOI table");
  const out = new Map<string, Ctoi[]>();
  for (const l of lines.slice(1)) {
    const f = csvLine(l);
    const tic = f[iTic]?.trim();
    if (!tic) continue;
    const epoch = num(f[iE]);
    const c: Ctoi = { name: `CTOI ${f[iCtoi]}`, period: num(f[iP]), epoch: epoch && epoch > JD_MIN ? epoch - BTJD : epoch, depthPpm: num(f[iDepth]), durationH: num(f[iDur]), disposition: (f[iTfop] || f[iUser] || "").trim() };
    out.set(tic, [...(out.get(tic) ?? []), c]);
  }
  return out;
}

const g = globalThis as unknown as { __ctois?: { at: number; p: Promise<Map<string, Ctoi[]>> } };
const CTOI_TTL_MS = 6 * 3600_000;

export async function ctoisFor(tic: string, signal: AbortSignal): Promise<Ctoi[]> {
  if (!g.__ctois || Date.now() - g.__ctois.at > CTOI_TTL_MS) {
    const p = getText("https://exofop.ipac.caltech.edu/tess/download_ctoi.php?sort=ctoi&output=csv", { timeoutMs: 30_000, signal, retries: 1 }).then(parseCtois);
    g.__ctois = { at: Date.now(), p };
    p.catch(() => { if (g.__ctois?.p === p) g.__ctois = undefined; });
  }
  return (await g.__ctois.p).get(tic) ?? [];
}

/** Community TOIs on these stars, as known signals (masked before searching, matched to the finds).
 *  One cached download of ExoFOP's CTOI table covers every star. */
export async function ctoiSignals(stars: { tic: string; ra: number; dec: number }[], signal: AbortSignal): Promise<KnownSignal[]> {
  const out: KnownSignal[] = [];
  for (const s of stars) {
    for (const c of await ctoisFor(s.tic, signal)) {
      if (!c.period || !(c.period > 0)) continue;
      out.push({ tic: s.tic, name: c.name, period: c.period, ra: s.ra, dec: s.dec, kind: "toi", disposition: c.disposition || "community TOI",
        ...(c.epoch !== undefined && c.epoch > 0 && c.durationH ? { t0: c.epoch, duration: c.durationH / 24 } : {}) });
    }
  }
  return out;
}

// ── binaries and KOIs ───────────────────────────────────────────────────────

const TESS_EBS = "https://tessebs.villanova.edu";

/** The star's entry in the TESS eclipsing-binary catalog, if any: the catalog's own site first
 *  (VizieR is at CDS, which goes down), VizieR's copy (sectors 1-26) when the site fails. */
export async function tessEb(tic: string, signal: AbortSignal): Promise<TessEb | null> {
  try {
    return parseTessEbPage(await getText(`${TESS_EBS}/${tic.padStart(10, "0")}`, { timeoutMs: 12_000, signal, retries: 1 }));
  } catch (site) {
    try {
      const rows = await vizier(`SELECT TOP 1 Per, BJD0, Morph FROM "J/ApJS/258/16/tess-ebs" WHERE TIC = ${Number(tic)}`, signal);
      const r = rows[0];
      const P = num(r?.Per), t0 = num(r?.BJD0);
      // BJD0 there is BJD - 2457000 already (values ~1400-2000).
      return r && P ? { period: P, t0: t0 ?? NaN, morph: num(r.Morph) } : null;
    } catch (viz) {
      throw new Error(`Villanova: ${(site as Error).message.slice(0, 60)}; VizieR: ${(viz as Error).message.slice(0, 60)}`);
    }
  }
}

/** A star's page on the Villanova site: signal rows (in catalog?, t0, σt0, P, σP, morphology, date),
 *  then the eclipse fits (polyfit: wp, ws, dp, ds, φp, φs; then the 2-Gaussian fit). A star that isn't
 *  in the catalog gets a page with no rows. Null when no signal is marked as in the catalog. */
export function parseTessEbPage(html: string): TessEb | null {
  if (!/<title>\s*TIC \d+ details/.test(html)) throw new Error("unexpected TESS EB page");
  const tables = html.split(/<table class="details-table">/).slice(1);
  const cells = (t: string) => [...t.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
  const sigTable = tables.find((t) => /In catalog\?/.test(t));
  if (!sigTable) return null;
  const sig = cells(sigTable);
  for (let i = 0; i + 6 < sig.length; i += 8) {
    if (sig[i + 1] !== "True") continue;
    const P = num(sig[i + 4]), t0 = num(sig[i + 2]);
    if (!P) continue;
    const fit = tables.find((t) => /Polyfit width of the primary/.test(t));
    const f = fit ? cells(fit) : [];
    const pick = (a: string | undefined, b: string | undefined) => num(a) ?? num(b);
    // Polyfit columns 0-5, 2-Gaussian 6-11: depth p/s at 2/3 (8/9), phase p/s at 4/5 (10/11).
    const depth = pick(f[2], f[8]), secDepth = pick(f[3], f[9]), phP = pick(f[4], f[10]), phS = pick(f[5], f[11]);
    const secPhase = phS !== undefined ? (((phS - (phP ?? 0)) % 1) + 1) % 1 : undefined;
    return { period: P, t0: t0 ?? NaN, morph: num(sig[i + 6]), depth, secDepth, secPhase };
  }
  return null;
}

/** Roughly the Kepler field: KOIs exist nowhere else. */
export const inKeplerField = (ra: number, dec: number) => ra > 279 && ra < 302 && dec > 36 && dec < 53;

export async function koisNear(ra: number, dec: number, signal: AbortSignal, arcsec = 10): Promise<Koi[]> {
  const r = arcsec / 3600, dra = r / Math.cos((dec * Math.PI) / 180);
  // The cumulative table has no spatial index (contains() fails there): a box.
  const q = `select kepoi_name,koi_disposition,koi_period from cumulative where ra between ${adqlNum(ra - dra)} and ${adqlNum(ra + dra)} and dec between ${adqlNum(dec - r)} and ${adqlNum(dec + r)}`;
  const rows = await getJson<Record<string, unknown>[]>(EXO_TAP, {
    init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ query: q, format: "json" }).toString() },
    timeoutMs: 15_000, signal, retries: 1,
  });
  if (!Array.isArray(rows)) throw new Error("unexpected KOI response");
  return rows.map((k) => ({ name: String(k.kepoi_name), period: num(k.koi_period), disposition: String(k.koi_disposition ?? "") }));
}
