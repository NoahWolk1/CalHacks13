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
import { simbadTap, tidyName } from "./simbad";
import type { Cone, SkyObject } from "./types";

export type FieldStar = { tic: string; name: string; otype: string; ra: number; dec: number; vmag?: number };
export type LcProduct = { tic: string; pipeline: "SPOC" | "TESS-SPOC" | "QLP"; sector: number; cadence: number; uri: string; ra?: number; dec?: number;
  /** Time range the file covers (BTJD), when the inventory has it. */
  tmin?: number; tmax?: number };
export type LightCurve = { tic: string; pipeline: LcProduct["pipeline"]; sector: number; time: Float64Array; flux: Float64Array; quality: Float64Array; tessmag?: number; teff?: number; radius?: number; logg?: number;
  camera?: number; ccd?: number;
  /** SPOC's estimate of the fraction of aperture flux that is the target's (PDCSAP is already corrected for the rest). */
  crowdsap?: number;
  /** Flux-weighted centroid (pixels: SPOC MOM_CENTR1/2, QLP SAP_X/SAP_Y), for the centroid-shift test. */
  cx?: Float64Array; cy?: Float64Array;
  /** QLP's small- and large-aperture fluxes, for the aperture-dependence test. */
  small?: Float64Array; large?: Float64Array };

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
const LC_COLUMNS = "obs_collection,provenance_name,target_name,sequence_number,t_exptime,dataURL,s_ra,s_dec,t_min,t_max";
/** MJD - 56999.5 = BTJD (BJD - 2457000; the half-day is JD vs MJD, the barycentric correction is minutes). */
const MJD_TO_BTJD = 56999.5;

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
export function spocBoxRequest(c: Cone, page = 1): RequestInit {
  const box = coneBox(c);
  return mastForm({
    service: "Mast.Caom.Filtered", format: "json", pagesize: 5000, page,
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
    if (typeof r.t_min === "number" && typeof r.t_max === "number") { p.tmin = r.t_min - MJD_TO_BTJD; p.tmax = r.t_max - MJD_TO_BTJD; }
    out.push(p);
  }
  return out;
}

export function fieldStarsQuery(c: Cone, cap = FIELD_CAP, vmax = FIELD_VMAX) {
  return `SELECT TOP ${cap} b.main_id, b.otype, b.ra, b.dec, f.V AS vmag, i.id AS tic, f.V + 0 AS rank `
    + `FROM basic AS b JOIN allfluxes AS f ON f.oidref = b.oid JOIN ident AS i ON i.oidref = b.oid `
    + `WHERE CONTAINS(POINT('ICRS', b.ra, b.dec), CIRCLE('ICRS', ${adqlNum(c.ra)}, ${adqlNum(c.dec)}, ${adqlNum(c.radius)})) = 1 `
    + `AND f.V < ${vmax} AND i.id LIKE 'TIC %' ORDER BY rank`;
}

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

/** A star's light curves for a multi-sector search: up to `k` sectors from one pipeline (the one with
 *  the most sectors, better pipeline on ties), from the densest run of nearby sectors so the stitched
 *  baseline stays short enough to search finely. The rest are held out: the Follow-up agent re-tests
 *  signals on sectors the search never saw. */
export function sectorsFor(products: LcProduct[], tic: string, k: number): { use: LcProduct[]; heldOut: LcProduct[] } {
  const mine = products.filter((p) => p.tic === tic);
  const by = new Map<LcProduct["pipeline"], Map<number, LcProduct>>();
  for (const p of mine) {
    const m = by.get(p.pipeline) ?? new Map<number, LcProduct>();
    if (!m.has(p.sector)) m.set(p.sector, p);
    by.set(p.pipeline, m);
  }
  const pipes = [...by].sort((a, b) => b[1].size - a[1].size || RANK[a[0]] - RANK[b[0]]);
  if (!pipes.length) return { use: [], heldOut: [] };
  const list = [...pipes[0][1].values()].sort((a, b) => a.sector - b.sector);
  // Densest window of at most k sectors spanning <= SECTOR_SPAN sector numbers, latest on ties.
  let best: LcProduct[] = [];
  for (let i = 0; i < list.length; i++) {
    const w = list.filter((p) => p.sector >= list[i].sector && p.sector - list[i].sector < SECTOR_SPAN).slice(0, k);
    if (w.length >= best.length) best = w;
  }
  // Held out: other sectors of the same pipeline first (same systematics), then other pipelines'
  // sectors (not the ones in use: the same photons reduced differently aren't independent).
  const sectors = new Set(best.map((p) => p.sector));
  const other = pipes.slice(1).flatMap(([, m]) => [...m.values()]).filter((p) => !sectors.has(p.sector)).sort((a, b) => b.sector - a.sector);
  const heldOut = [...list.filter((p) => !sectors.has(p.sector)).reverse(), ...other.filter((p, i, a) => a.findIndex((q) => q.sector === p.sector) === i)];
  return { use: best, heldOut };
}

/** Stitched sectors span at most this many sector numbers (~5 x 27 d), so the BLS grid stays affordable. */
export const SECTOR_SPAN = 5;

export const mastDownloadUrl = (uri: string) => `https://mast.stsci.edu/api/v0.1/Download/file?uri=${encodeURIComponent(uri)}`;

/** CAOM by TIC id (target_name): every TESS light curve of one star, SPOC and FFI pipelines both. */
export function ticProductsRequest(tic: string): RequestInit {
  return mastForm({
    service: "Mast.Caom.Filtered", format: "json", pagesize: 2000, page: 1,
    params: {
      columns: LC_COLUMNS,
      filters: [
        { paramName: "obs_collection", values: ["TESS", "HLSP"] },
        { paramName: "dataproduct_type", values: ["timeseries"] },
        { paramName: "target_name", values: [tic] },
      ],
    },
  });
}

export async function ticProducts(tic: string, signal: AbortSignal): Promise<LcProduct[]> {
  return parseLcProducts(await getJson(MAST_API, { init: ticProductsRequest(tic), timeoutMs: 20_000, signal, retries: 1 })).filter((p) => p.tic === tic);
}

/** Light-curve columns from a SPOC / TESS-SPOC (PDCSAP_FLUX) or QLP (KSPSAP_FLUX) FITS file. */
export function parseLightCurve(buf: ArrayBuffer, product: Pick<LcProduct, "tic" | "pipeline" | "sector">): LightCurve {
  const hdus = readHdus(buf);
  const lc = hdus.find((h) => h.header.EXTNAME === "LIGHTCURVE") ?? hdus[1];
  if (!lc) throw new Error("no LIGHTCURVE extension");
  // QLP renamed its detrended flux KSPSAP_FLUX -> DET_FLUX in later sectors (DET_FLUX in sector 104, 2026).
  const cols = product.pipeline === "QLP" ? ["KSPSAP_FLUX", "DET_FLUX"] : ["PDCSAP_FLUX"];
  const cent = product.pipeline === "QLP" ? ["SAP_X", "SAP_Y"] : ["MOM_CENTR1", "MOM_CENTR2"];
  const apert = ["KSPSAP_FLUX_SML", "KSPSAP_FLUX_LAG", "DET_FLUX_SML", "DET_FLUX_LAG"];
  const tab = readTable(buf, lc, ["TIME", ...cols, "QUALITY", ...cent, ...(product.pipeline === "QLP" ? apert : [])]);
  const fluxCol = cols.find((c) => tab.columns[c]);
  if (!tab.columns.TIME || !fluxCol) throw new Error(`light curve lacks TIME/${cols.join(" or ")}`);
  const h0 = hdus[0].header;
  const pos = (v: unknown) => (typeof v === "number" && v > 0 ? v : undefined);
  const c = tab.columns, fl = fluxCol === "DET_FLUX" ? "DET_FLUX" : "KSPSAP_FLUX";
  return {
    tic: product.tic, pipeline: product.pipeline, sector: product.sector,
    time: c.TIME, flux: c[fluxCol], quality: c.QUALITY ?? new Float64Array(tab.rows),
    tessmag: pos(h0.TESSMAG), teff: pos(h0.TEFF), radius: pos(h0.RADIUS), logg: pos(h0.LOGG),
    camera: pos(h0.CAMERA ?? lc.header.CAMERA), ccd: pos(h0.CCD ?? lc.header.CCD), crowdsap: pos(lc.header.CROWDSAP),
    ...(c[cent[0]] && c[cent[1]] ? { cx: c[cent[0]], cy: c[cent[1]] } : {}),
    ...(c[`${fl}_SML`] && c[`${fl}_LAG`] ? { small: c[`${fl}_SML`], large: c[`${fl}_LAG`] } : {}),
  };
}

export async function fetchLightCurve(product: LcProduct, signal: AbortSignal, timeoutMs = LC_TIMEOUT_MS): Promise<LightCurve> {
  return parseLightCurve(await getBuffer(mastDownloadUrl(product.uri), { timeoutMs, signal }), product);
}

export type FieldInventory = { stars: FieldStar[]; products: LcProduct[]; simbad: boolean };

async function enrich(c: Cone, signal: AbortSignal): Promise<{ stars: FieldStar[]; hlsp: LcProduct[] }> {
  const stars = parseFieldStars(await simbadTap(fieldStarsQuery(c), { timeoutMs: ENRICH_TIMEOUT_MS, signal }));
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

// ── deep-survey inventory: every light curve the field has, not a quick sample ──

/** Deep surveys go fainter and take every SIMBAD star with a TIC id (and every SPOC target). */
export const SURVEY_VMAX = 13.5;
export const SURVEY_STAR_CAP = 2000;
const SURVEY_PAGES = 6;
const HLSP_CHUNK = 80;

/** The full inventory for a deep survey: all SPOC pages, SIMBAD stars to V 13.5, and their FFI light
 *  curves (by TIC id in chunks, a few at a time). Slower than fieldInventory (tens of seconds for a
 *  large cone) but complete; failures of the enrichment leave the SPOC targets. */
export async function surveyInventory(c: Cone, signal: AbortSignal): Promise<FieldInventory & { notes: string[] }> {
  const notes: string[] = [];
  const spoc: LcProduct[] = [];
  for (let page = 1; page <= SURVEY_PAGES; page++) {
    const rows = parseLcProducts(await getJson(MAST_API, { init: spocBoxRequest(c, page), timeoutMs: 30_000, signal, retries: 1 }));
    spoc.push(...rows);
    if (rows.length < 4000) break; // last page (5000 rows a page, some filtered out in parsing)
    if (page === SURVEY_PAGES) notes.push(`SPOC inventory stopped at ${SURVEY_PAGES} pages`);
  }
  let stars: FieldStar[] = [];
  const hlsp: LcProduct[] = [];
  try {
    stars = parseFieldStars(await simbadTap(fieldStarsQuery(c, SURVEY_STAR_CAP, SURVEY_VMAX), { timeoutMs: 45_000, signal }));
    if (stars.length >= SURVEY_STAR_CAP) notes.push(`SIMBAD star list capped at ${SURVEY_STAR_CAP} stars`);
    const chunks: string[][] = [];
    for (let i = 0; i < stars.length; i += HLSP_CHUNK) chunks.push(stars.slice(i, i + HLSP_CHUNK).map((s) => s.tic));
    let next = 0, failed = 0;
    await Promise.all(Array.from({ length: Math.min(3, chunks.length) }, async () => {
      while (next < chunks.length) {
        const chunk = chunks[next++];
        try { hlsp.push(...parseLcProducts(await getJson(MAST_API, { init: hlspRequest(chunk), timeoutMs: 20_000, signal, retries: 1 }))); }
        catch { failed++; }
      }
    }));
    if (failed) notes.push(`${failed} of ${chunks.length} full-frame-image lookups failed`);
  } catch (e) {
    notes.push(`SIMBAD star list failed (${(e as Error).message.slice(0, 80)}): SPOC 2-min targets only`);
  }
  const products = [...spoc.filter((p) => p.ra === undefined || p.dec === undefined || separation(c.ra, c.dec, p.ra, p.dec) <= c.radius), ...hlsp];
  return { stars: mergeStars(c, stars, products), products, simbad: stars.length > 0, notes };
}

/** Every sector of a star, best pipeline per sector (SPOC > TESS-SPOC > QLP), grouped into seasons of
 *  up to `per` sectors spanning fewer than SECTOR_SPAN sector numbers, latest season first. Each season
 *  is searched on its own; a signal seen in several seasons is independently confirmed. */
export function seasonsFor(products: LcProduct[], tic: string, per = 4): LcProduct[][] {
  const best = new Map<number, LcProduct>();
  for (const p of products) {
    if (p.tic !== tic) continue;
    const b = best.get(p.sector);
    if (!b || RANK[p.pipeline] < RANK[b.pipeline]) best.set(p.sector, p);
  }
  const list = [...best.values()].sort((a, b) => a.sector - b.sector);
  const out: LcProduct[][] = [];
  for (const p of list) {
    const cur = out[out.length - 1];
    if (cur && cur.length < per && p.sector - cur[0].sector < SECTOR_SPAN) cur.push(p);
    else out.push([p]);
  }
  return out.reverse();
}
