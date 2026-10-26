// Real TESS light curves for the stars in a cone, without MAST's CAOM *position* search (20-90+ s
// cold, measured 2026-10-26, even for small cones). Two fast, indexed CAOM queries instead:
//  1. SPOC light curves (the TESS mission's 2-min targets) by an RA/Dec range filter: ~2-3 s for a
//     3° cone, no other service needed. Rows outside the circle are dropped here.
//  2. Optional enrichment, time-boxed: SIMBAD lists the cone's brighter stars with their TIC
//     cross-ids (names, V mag, object type), and CAOM filtered by target_name (~0.3 s) finds their
//     TESS-SPOC / QLP full-frame-image light curves, for stars that have no SPOC light curve.
//     (The same HLSPs by RA/Dec range take ~45 s: tens of thousands of rows.)
import { getBuffer, getJson } from "@/lib/http";
import { adqlNum, separation } from "./geom";
import { readHdus, readTable } from "./fits";
import { MAST_API, mastPortalUrl } from "./telescopes";
import { SIMBAD_TAP, tidyName } from "./simbad";
import type { Cone, SkyObject } from "./types";

export type FieldStar = { tic: string; name: string; otype: string; ra: number; dec: number; vmag?: number };
export type LcProduct = { tic: string; pipeline: "SPOC" | "TESS-SPOC" | "QLP"; sector: number; cadence: number; uri: string; ra?: number; dec?: number };
export type LightCurve = { tic: string; pipeline: LcProduct["pipeline"]; sector: number; time: Float64Array; flux: Float64Array; quality: Float64Array; tessmag?: number; teff?: number; radius?: number };

/** Stars brighter than this have SIMBAD TIC cross-ids and FFI light curves often enough to be worth it. */
export const FIELD_VMAX = 12.5;
export const FIELD_CAP = 80;
/** SIMBAD's latency swings from ~1 s to 10+ s; the SPOC inventory doesn't wait longer than this for it. */
export const ENRICH_TIMEOUT_MS = 8_000;
export const LC_TIMEOUT_MS = 10_000;
const PIPELINES = ["SPOC", "TESS-SPOC", "QLP"] as const;

const mastForm = (request: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ request: JSON.stringify(request) }).toString(),
});
const LC_COLUMNS = "obs_collection,provenance_name,target_name,sequence_number,t_exptime,dataURL,s_ra,s_dec";

/** RA/Dec ranges covering the cone (RA split in two across 0°, all RA near a pole). */
export function coneBox(c: Cone): { ra: { min: number; max: number }[]; dec: { min: number; max: number } } {
  const dec = { min: Math.max(-90, c.dec - c.radius), max: Math.min(90, c.dec + c.radius) };
  if (Math.abs(c.dec) + c.radius >= 89) return { ra: [{ min: 0, max: 360 }], dec };
  const half = c.radius / Math.cos(((Math.abs(c.dec) + c.radius) * Math.PI) / 180);
  if (half >= 180) return { ra: [{ min: 0, max: 360 }], dec };
  const lo = c.ra - half, hi = c.ra + half;
  if (lo < 0) return { ra: [{ min: 0, max: hi }, { min: lo + 360, max: 360 }], dec };
  if (hi > 360) return { ra: [{ min: lo, max: 360 }, { min: 0, max: hi - 360 }], dec };
  return { ra: [{ min: lo, max: hi }], dec };
}

/** CAOM: every TESS-mission (SPOC) light curve whose target lies in the cone's RA/Dec box. */
export function spocBoxRequest(c: Cone): RequestInit {
  const box = coneBox(c);
  return mastForm({
    service: "Mast.Caom.Filtered", format: "json", pagesize: 5000, page: 1,
    params: {
      columns: LC_COLUMNS,
      filters: [
        { paramName: "obs_collection", values: ["TESS"] },
        { paramName: "dataproduct_type", values: ["timeseries"] },
        { paramName: "s_ra", values: box.ra.map((r) => ({ min: +r.min.toFixed(5), max: +r.max.toFixed(5) })) },
        { paramName: "s_dec", values: [{ min: +box.dec.min.toFixed(5), max: +box.dec.max.toFixed(5) }] },
      ],
    },
  });
}

/** CAOM filtered by TIC id (target_name): the QLP / TESS-SPOC full-frame-image light curves. */
export function hlspRequest(tics: string[]): RequestInit {
  return mastForm({
    service: "Mast.Caom.Filtered", format: "json", pagesize: 2000, page: 1,
    params: {
      columns: LC_COLUMNS,
      filters: [
        { paramName: "obs_collection", values: ["HLSP"] },
        { paramName: "dataproduct_type", values: ["timeseries"] },
        { paramName: "provenance_name", values: ["TESS-SPOC", "QLP"] },
        { paramName: "target_name", values: tics },
      ],
    },
  });
}

export function parseLcProducts(json: unknown): LcProduct[] {
  const j = json as { status?: string; data?: Record<string, unknown>[] } | null;
  if (!j || !Array.isArray(j.data)) throw new Error(j?.status ? `MAST status ${j.status}` : "unexpected MAST response");
  const out: LcProduct[] = [];
  for (const r of j.data) {
    const uri = typeof r.dataURL === "string" ? r.dataURL : "";
    const pipeline = PIPELINES.find((p) => p === r.provenance_name);
    // Light-curve files only (SPOC 20 s "fast-lc" files are skipped: 120 s carries the same transits at 1/6 the size).
    if (!pipeline || !/(_lc|_llc)\.fits$/.test(uri) || /fast-lc/.test(uri)) continue;
    const p: LcProduct = { tic: String(r.target_name).replace(/^0+/, ""), pipeline, sector: Number(r.sequence_number) || 0, cadence: Number(r.t_exptime) || 0, uri };
    if (typeof r.s_ra === "number" && typeof r.s_dec === "number") { p.ra = r.s_ra; p.dec = r.s_dec; }
    out.push(p);
  }
  return out;
}

export function fieldStarsQuery(c: Cone, cap = FIELD_CAP) {
  return `SELECT TOP ${cap} b.main_id, b.otype, b.ra, b.dec, f.V AS vmag, i.id AS tic, f.V + 0 AS rank `
    + `FROM basic AS b JOIN allfluxes AS f ON f.oidref = b.oid JOIN ident AS i ON i.oidref = b.oid `
    + `WHERE CONTAINS(POINT('ICRS', b.ra, b.dec), CIRCLE('ICRS', ${adqlNum(c.ra)}, ${adqlNum(c.dec)}, ${adqlNum(c.radius)})) = 1 `
    + `AND f.V < ${FIELD_VMAX} AND i.id LIKE 'TIC %' ORDER BY rank`;
}

export const fieldStarsUrl = (c: Cone, cap = FIELD_CAP) =>
  `${SIMBAD_TAP}?${new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "json", QUERY: fieldStarsQuery(c, cap) })}`;

export function parseFieldStars(json: unknown): FieldStar[] {
  const t = json as { metadata?: { name: string }[]; data?: unknown[][] };
  if (!t?.metadata || !Array.isArray(t.data)) throw new Error("unexpected SIMBAD response");
  const col = Object.fromEntries(t.metadata.map((m, i) => [m.name, i]));
  const seen = new Set<string>();
  const out: FieldStar[] = [];
  for (const r of t.data) {
    const tic = String(r[col.tic] ?? "").replace(/^TIC\s+/, "").trim();
    const ra = r[col.ra], dec = r[col.dec], vmag = r[col.vmag];
    if (!/^\d+$/.test(tic) || seen.has(tic) || typeof ra !== "number" || typeof dec !== "number") continue;
    seen.add(tic);
    out.push({ tic, name: tidyName(String(r[col.main_id] ?? `TIC ${tic}`)), otype: String(r[col.otype] ?? "").trim(), ra, dec, ...(typeof vmag === "number" ? { vmag } : {}) });
  }
  return out;
}

/** Field stars: SIMBAD's (named) plus every SPOC target in the circle, by TIC id. */
export function mergeStars(c: Cone, simbad: FieldStar[], products: LcProduct[]): FieldStar[] {
  const out = new Map(simbad.map((s) => [s.tic, s]));
  for (const p of products) {
    if (out.has(p.tic) || p.ra === undefined || p.dec === undefined) continue;
    if (separation(c.ra, c.dec, p.ra, p.dec) > c.radius) continue;
    out.set(p.tic, { tic: p.tic, name: `TIC ${p.tic}`, otype: "", ra: p.ra, dec: p.dec });
  }
  return [...out.values()];
}

const RANK: Record<LcProduct["pipeline"], number> = { SPOC: 0, "TESS-SPOC": 1, QLP: 2 };

/** One light curve per star, best pipeline first (SPOC 2-min > TESS-SPOC > QLP), latest sector
 *  within a pipeline. SPOC targets first (they were picked for TESS's planet search), then nearest
 *  the cone centre. At most `cap` stars. */
export function pickLightCurves(c: Cone, stars: FieldStar[], products: LcProduct[], cap: number): { star: FieldStar; product: LcProduct }[] {
  const best = new Map<string, LcProduct>();
  for (const p of products) {
    const b = best.get(p.tic);
    if (!b || RANK[p.pipeline] < RANK[b.pipeline] || (RANK[p.pipeline] === RANK[b.pipeline] && p.sector > b.sector)) best.set(p.tic, p);
  }
  const sep = (s: FieldStar) => separation(c.ra, c.dec, s.ra, s.dec);
  return stars.flatMap((star) => (best.has(star.tic) ? [{ star, product: best.get(star.tic)! }] : []))
    .sort((a, b) => RANK[a.product.pipeline] - RANK[b.product.pipeline] || sep(a.star) - sep(b.star))
    .slice(0, cap);
}

export const mastDownloadUrl = (uri: string) => `https://mast.stsci.edu/api/v0.1/Download/file?uri=${encodeURIComponent(uri)}`;

/** Light-curve columns from a SPOC / TESS-SPOC (PDCSAP_FLUX) or QLP (KSPSAP_FLUX) FITS file. */
export function parseLightCurve(buf: ArrayBuffer, product: Pick<LcProduct, "tic" | "pipeline" | "sector">): LightCurve {
  const hdus = readHdus(buf);
  const lc = hdus.find((h) => h.header.EXTNAME === "LIGHTCURVE") ?? hdus[1];
  if (!lc) throw new Error("no LIGHTCURVE extension");
  const fluxCol = product.pipeline === "QLP" ? "KSPSAP_FLUX" : "PDCSAP_FLUX";
  const tab = readTable(buf, lc, ["TIME", fluxCol, "QUALITY"]);
  if (!tab.columns.TIME || !tab.columns[fluxCol]) throw new Error(`light curve lacks TIME/${fluxCol}`);
  const h0 = hdus[0].header;
  const pos = (v: unknown) => (typeof v === "number" && v > 0 ? v : undefined);
  return {
    tic: product.tic, pipeline: product.pipeline, sector: product.sector,
    time: tab.columns.TIME, flux: tab.columns[fluxCol], quality: tab.columns.QUALITY ?? new Float64Array(tab.rows),
    tessmag: pos(h0.TESSMAG), teff: pos(h0.TEFF), radius: pos(h0.RADIUS),
  };
}

export async function fetchLightCurve(product: LcProduct, signal: AbortSignal, timeoutMs = LC_TIMEOUT_MS): Promise<LightCurve> {
  return parseLightCurve(await getBuffer(mastDownloadUrl(product.uri), { timeoutMs, signal }), product);
}

export type FieldInventory = { stars: FieldStar[]; products: LcProduct[]; simbad: boolean };

async function enrich(c: Cone, signal: AbortSignal): Promise<{ stars: FieldStar[]; hlsp: LcProduct[] }> {
  const stars = parseFieldStars(await getJson(fieldStarsUrl(c), { timeoutMs: ENRICH_TIMEOUT_MS, signal, retries: 0 }));
  if (!stars.length) return { stars, hlsp: [] };
  const hlsp = parseLcProducts(await getJson(MAST_API, { init: hlspRequest(stars.map((s) => s.tic)), timeoutMs: 8_000, signal, retries: 1 }));
  return { stars, hlsp };
}

// The Telescope Archive agent and the analysis agents both need this inventory in the same run:
// share the in-flight lookup per cone instead of querying twice (getJson only caches finished calls).
const inflight = new Map<string, { at: number; p: Promise<FieldInventory> }>();

export function fieldInventory(c: Cone, signal: AbortSignal): Promise<FieldInventory> {
  const key = `${c.ra.toFixed(5)},${c.dec.toFixed(5)},${c.radius.toFixed(5)}`;
  const hit = inflight.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = (async () => {
    const enriching = enrich(c, signal);
    enriching.catch(() => {});
    const spoc = await getJson(MAST_API, { init: spocBoxRequest(c), timeoutMs: 12_000, signal, retries: 1 })
      .then(parseLcProducts)
      .catch((e: Error) => { console.warn(`[sky] SPOC light-curve inventory failed: ${e.message}`); return null; });
    // Enrichment gets at most ENRICH_TIMEOUT_MS more once SPOC is in (or is all we have if SPOC failed).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const extra = await Promise.race([enriching, new Promise<null>((r) => { timer = setTimeout(() => r(null), ENRICH_TIMEOUT_MS); })])
      .catch((e: Error) => { console.warn(`[sky] SIMBAD star enrichment failed: ${e.message}`); return null; })
      .finally(() => clearTimeout(timer));
    if (!spoc && !extra) throw new Error("MAST light-curve inventory and SIMBAD star list both failed");
    const products = [...(spoc ?? []).filter((p) => p.ra === undefined || p.dec === undefined || separation(c.ra, c.dec, p.ra, p.dec) <= c.radius), ...(extra?.hlsp ?? [])];
    return { stars: mergeStars(c, extra?.stars ?? [], products), products, simbad: !!extra };
  })();
  for (const [k, v] of inflight) if (Date.now() - v.at > 60_000) inflight.delete(k);
  inflight.set(key, { at: Date.now(), p });
  p.catch(() => inflight.delete(key));
  return p;
}

const PIPELINE_LABEL: Record<LcProduct["pipeline"], string> = { SPOC: "SPOC 2-min", "TESS-SPOC": "TESS-SPOC FFI", QLP: "QLP FFI" };

/** The Telescope Archive agent's fast answer: which TESS light curves exist for the cone's stars. */
export function inventoryObject(c: Cone, inv: FieldInventory): SkyObject | null {
  if (!inv.products.length) return null;
  const tics = new Set(inv.products.map((p) => p.tic));
  const sectors = [...new Set(inv.products.map((p) => p.sector))].sort((a, b) => a - b);
  const byPipe = new Map<string, number>();
  for (const p of inv.products) byPipe.set(PIPELINE_LABEL[p.pipeline], (byPipe.get(PIPELINE_LABEL[p.pipeline]) ?? 0) + 1);
  const named = inv.stars.filter((s) => tics.has(s.tic) && s.vmag !== undefined).slice(0, 4).map((s) => `${s.name} (TIC ${s.tic})`);
  const props: Record<string, string | number> = {
    "stars with light curves": tics.size,
    "light curves": inv.products.length,
    pipelines: [...byPipe].map(([k, v]) => `${k} (${v})`).join(", "),
    sectors: sectors.join(", "),
  };
  if (named.length) props["brightest targets"] = named.join(", ");
  if (!inv.simbad) props.note = "SIMBAD star list unavailable this run: SPOC 2-min targets only";
  return { id: "", name: "TESS light curves", type: "TESS photometry", category: "observation", ra: c.ra, dec: c.dec, source: "telescopes", url: mastPortalUrl(c.ra, c.dec, c.radius), props };
}
