// Kepler (2009-2013) and K2 (2014-2018) light curves of a TESS star: extra transits and a ~10-year
// baseline for the ephemeris. Everything by id, never by a CAOM cone (those hang for 30-60 s):
//  - ids: the KIC from the star's TIC row; the EPIC from the Exoplanet Archive's k2targets table, raced
//    against a CAOM RA/Dec box limited to the K2 collection (~0.4 s, measured 2026-10-29: the archive's
//    TAP was answering 502 that day). Only near the ecliptic, where K2 pointed.
//  - files: one CAOM query by target_name (kplr/ktwo + zero-padded id) for the K2 campaigns and their
//    K2SFF / EVEREST HLSPs; Kepler's per-quarter files come from the star's archive directory listing
//    (~0.4 s; CAOM only has one tarball row per star, and its product list takes ~15 s cold).
// Time: Kepler/K2 TIME is BKJD (BJD - 2454833, read from BJDREFI/F), converted to BTJD (BJD - 2457000).
import { getBuffer, getJson, getText } from "@/lib/http";
import { adqlNum, separation } from "./geom";
import { EXO_TAP } from "./exoplanets";
import { readHdus, readTable } from "./fits";
import { mastDownloadUrl } from "./lightcurves";
import { MAST_API } from "./telescopes";
import { BTJD } from "./vetting";

export type MissionCurve = {
  mission: "Kepler" | "K2"; pipeline: KkPipeline;
  /** Kepler quarter or K2 campaign. */
  segment: number;
  /** Seconds (from the file's TIMEDEL: 1765 s long cadence, 59 s short). */
  cadence: number;
  /** BTJD, quality-masked, finite only. */
  t: Float64Array;
  /** Normalized to median 1. */
  f: Float64Array;
  uri: string;
};
export type KkPipeline = "Kepler" | "K2" | "K2SFF" | "EVEREST";
export type KkIds = { kic?: string; epic?: string };
/** One light-curve file. `part` is the file's own label (Q6, c102: campaigns 9-11 came in two parts). */
export type KkProduct = { mission: "Kepler" | "K2"; pipeline: KkPipeline; id: string; segment: number; part: string; cadence: number; uri: string };

/** BKJD reference (BJDREFI + BJDREFF in every Kepler/K2 file), used when a header lacks it. */
export const BKJD = 2454833;
export const KK_MAX_FILES = 8;
export const KK_FILE_TIMEOUT_MS = 20_000;
/** K2 fields were centred on the ecliptic (~14° across): no EPIC lookup further out than this. */
const K2_MAX_BETA = 20;
const MATCH_ARCSEC = 3;

export const kplrName = (kic: string) => `kplr${kic.padStart(9, "0")}`;
export const ktwoName = (epic: string) => `ktwo${epic.padStart(9, "0")}`;

/** CAOM target_name -> mission and id ("kplr011904151" -> Kepler 11904151). */
export function parseTargetName(name: string): { mission: "Kepler" | "K2"; id: string } | null {
  const m = /^(kplr|ktwo)0*(\d+)$/.exec(name.trim());
  return m ? { mission: m[1] === "kplr" ? "Kepler" : "K2", id: m[2] } : null;
}

/** File time (days since BJDREFI + BJDREFF) to BTJD. */
export const toBtjd = (time: number, bjdrefi = BKJD, bjdreff = 0) => time + (bjdrefi - BTJD) + bjdreff;

/** Ecliptic latitude (degrees) of a J2000 position. */
export function eclipticLat(ra: number, dec: number): number {
  const r = Math.PI / 180, eps = 23.4392911 * r;
  return Math.asin(Math.sin(dec * r) * Math.cos(eps) - Math.cos(dec * r) * Math.sin(eps) * Math.sin(ra * r)) / r;
}

// Long-cadence file timestamps are the same for every star in a quarter. Q4 has two: stars on module 3
// (which failed in January 2010) got a shorter Q4 file. Unknown stamps are read from the header instead.
export const KEPLER_LC_QUARTERS: Record<string, number> = {
  "2009131105131": 0, "2009166043257": 1, "2009259160929": 2, "2009350155506": 3, "2010078095331": 4, "2010009091648": 4,
  "2010174085026": 5, "2010265121752": 6, "2010355172524": 7, "2011073133259": 8, "2011177032512": 9, "2011271113734": 10,
  "2012004120508": 11, "2012088054726": 12, "2012179063303": 13, "2012277125453": 14, "2013011073258": 15, "2013098041711": 16,
  "2013131215648": 17,
};

/** SAP_QUALITY bits dropped (Kepler Archive Manual table 2-3): attitude tweak, safe mode, coarse point,
 *  Earth point, desaturation, manual exclude, collateral cosmic ray, no fine point, no data, and K2's
 *  (possible) thruster firings. Measured on Kepler-10 Q7 and K2-289 C2: the kept flags' points scatter
 *  like unflagged ones (K2's 16384 marks a third of C2 and is fine); impulsive outliers (1024) are kept,
 *  since a transit can trip them. PDCSAP is NaN on most of the dropped cadences anyway. */
export const KEPLER_BAD_BITS = 1 | 2 | 4 | 8 | 32 | 256 | 2048 | 32768 | 65536 | 524288 | 1048576;
/** EVEREST's own QUALITY bits 23-24 (1-based): flagged by the K2 pipeline, NaN. Bit 25 (outliers) is
 *  kept: EVEREST's sigma clipping can catch in-transit points. */
const EVEREST_BAD_BITS = KEPLER_BAD_BITS | 4194304 | 8388608;

const mastForm = (request: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ request: JSON.stringify(request) }).toString(),
});
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined);
const msg = (e: unknown) => ((e as Error)?.message ?? String(e)).slice(0, 100);

// ── ids ─────────────────────────────────────────────────────────────────────

/** RA/Dec box around a position, as an ADQL condition (RA wrapped at 0/360). */
function boxAdql(ra: number, dec: number, arcsec: number): string {
  const r = arcsec / 3600, dra = Math.min(180, r / Math.max(0.01, Math.cos((dec * Math.PI) / 180)));
  const lo = ra - dra, hi = ra + dra;
  const raCond = lo < 0 ? `(ra >= ${adqlNum(lo + 360)} or ra <= ${adqlNum(hi)})`
    : hi > 360 ? `(ra >= ${adqlNum(lo)} or ra <= ${adqlNum(hi - 360)})`
    : `ra between ${adqlNum(lo)} and ${adqlNum(hi)}`;
  return `${raCond} and dec between ${adqlNum(dec - r)} and ${adqlNum(dec + r)}`;
}

type EpicRow = { epic: string; ra: number; dec: number; twomass?: string };

/** The nearest EPIC row within MATCH_ARCSEC, or the one whose 2MASS id is the TIC's. */
export function pickEpic(rows: EpicRow[], ra: number, dec: number, twomass?: string): string | undefined {
  const tm = twomass?.replace(/^2MASS\s*J?/i, "");
  const same = tm ? rows.find((r) => r.twomass?.replace(/^2MASS\s*J?/i, "") === tm) : undefined;
  if (same) return same.epic;
  const near = rows.map((r) => ({ r, sep: separation(ra, dec, r.ra, r.dec) * 3600 })).filter((x) => x.sep <= MATCH_ARCSEC).sort((a, b) => a.sep - b.sep);
  return near[0]?.r.epic;
}

async function epicFromArchive(ra: number, dec: number, signal: AbortSignal): Promise<EpicRow[]> {
  // contains() fails on k2targets (no spatial index column): a box. POST: Cloudflare blocks ADQL in a GET URL.
  const q = `select epic_number,tm_name,ra,dec from k2targets where ${boxAdql(ra, dec, 2 * MATCH_ARCSEC)}`;
  const rows = await getJson<Record<string, unknown>[]>(EXO_TAP, {
    init: { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ query: q, format: "json" }).toString() },
    timeoutMs: 10_000, signal, retries: 1,
  });
  if (!Array.isArray(rows)) throw new Error("unexpected k2targets response");
  return rows.flatMap((r) => (num(r.epic_number) && num(r.ra) !== undefined && num(r.dec) !== undefined
    ? [{ epic: String(num(r.epic_number)), ra: num(r.ra)!, dec: num(r.dec)!, twomass: typeof r.tm_name === "string" ? r.tm_name : undefined }] : []));
}

/** K2 observations in a small RA/Dec box (CAOM limited to the K2 collection answers in under 2 s). */
async function epicFromCaom(ra: number, dec: number, signal: AbortSignal): Promise<EpicRow[]> {
  const r = (2 * MATCH_ARCSEC) / 3600, dra = r / Math.max(0.01, Math.cos((dec * Math.PI) / 180));
  const j = await getJson<{ data?: Record<string, unknown>[] }>(MAST_API, {
    init: mastForm({ service: "Mast.Caom.Filtered", format: "json", pagesize: 50, page: 1, params: { columns: "target_name,s_ra,s_dec", filters: [
      { paramName: "obs_collection", values: ["K2"] },
      { paramName: "s_ra", values: [{ min: +(ra - dra).toFixed(6), max: +(ra + dra).toFixed(6) }] },
      { paramName: "s_dec", values: [{ min: +(dec - r).toFixed(6), max: +(dec + r).toFixed(6) }] },
    ] } }),
    timeoutMs: 8_000, signal, retries: 0,
  });
  if (!Array.isArray(j?.data)) throw new Error("unexpected CAOM response");
  return j.data.flatMap((d) => {
    const t = parseTargetName(String(d.target_name ?? ""));
    return t?.mission === "K2" && typeof d.s_ra === "number" && typeof d.s_dec === "number" ? [{ epic: t.id, ra: d.s_ra, dec: d.s_dec }] : [];
  });
}

/** KIC (from the TIC row) and EPIC (near the ecliptic only) of a TIC star. Ids already known are kept
 *  and not looked up. Lookup failures go to `notes`; throws only when every lookup failed. */
export async function keplerK2Ids(star: { tic: string; ra: number; dec: number } & KkIds, signal: AbortSignal, notes: string[] = []): Promise<KkIds> {
  const ids: KkIds = { ...(star.kic ? { kic: star.kic } : {}), ...(star.epic ? { epic: star.epic } : {}) };
  const wantEpic = !ids.epic && Math.abs(eclipticLat(star.ra, star.dec)) < K2_MAX_BETA;
  let tried = 0, failed = 0;
  // The TIC row is wanted for the EPIC match too (its 2MASS id), so ask even when the KIC is known.
  const tic = (!ids.kic || wantEpic) ? getJson<{ data?: Record<string, unknown>[] }>(MAST_API, {
    init: mastForm({ service: "Mast.Catalogs.Filtered.Tic", format: "json", params: { columns: "ID,KIC,TWOMASS", filters: [{ paramName: "ID", values: [star.tic] }] } }),
    timeoutMs: 10_000, signal, retries: 1,
  }).then((j) => j?.data?.[0] ?? null) : Promise.resolve(null);
  // Both EPIC sources at once: the first to list a star in the box wins; an empty answer waits for the other.
  const sources = wantEpic ? [epicFromArchive(star.ra, star.dec, signal), epicFromCaom(star.ra, star.dec, signal)] : [];
  const epicRows = wantEpic
    ? Promise.any(sources.map((p) => p.then((r) => (r.length ? r : Promise.reject(new Error("none in the box"))))))
      .catch(async (e) => { if ((await Promise.allSettled(sources)).some((s) => s.status === "fulfilled")) return [] as EpicRow[]; throw e; })
    : Promise.resolve(null);
  epicRows.catch(() => {});
  let twomass: string | undefined;
  if (!ids.kic || wantEpic) {
    tried++;
    try {
      const row = await tic;
      if (num(row?.KIC)) ids.kic ??= String(num(row!.KIC));
      if (typeof row?.TWOMASS === "string") twomass = row.TWOMASS;
    } catch (e) { failed++; notes.push(`TIC row (for the KIC) failed: ${msg(e)}`); }
  }
  if (wantEpic) {
    tried++;
    try {
      const epic = pickEpic((await epicRows) ?? [], star.ra, star.dec, twomass);
      if (epic) ids.epic = epic;
    } catch (e) {
      failed++;
      const errs = e instanceof AggregateError ? e.errors.map(msg).join("; ") : msg(e);
      notes.push(`EPIC lookup failed (Exoplanet Archive k2targets and MAST K2): ${errs}`);
    }
  }
  if (tried && failed === tried && !ids.kic && !ids.epic) throw new Error(`Kepler/K2 id lookups failed: ${notes.join(" | ")}`);
  return ids;
}

// ── products ────────────────────────────────────────────────────────────────

/** Campaign number from a K2 file label: c02 -> 2, c102 -> 10 (campaigns 9-11 were split into two parts). */
export function campaignOf(part: string): number {
  const n = Number(part.replace(/^c/i, ""));
  return n >= 91 ? Math.floor(n / 10) : n;
}

/** CAOM rows (target_name query) -> K2 mission and K2SFF / EVEREST files; Kepler rows are tarballs, skipped. */
export function parseKkCaom(json: unknown): KkProduct[] {
  const j = json as { status?: string; data?: Record<string, unknown>[] } | null;
  if (!j || !Array.isArray(j.data)) throw new Error(j?.status ? `MAST status ${j.status}` : "unexpected MAST response");
  const out: KkProduct[] = [];
  for (const r of j.data) {
    const t = parseTargetName(String(r.target_name ?? ""));
    const uri = typeof r.dataURL === "string" ? r.dataURL : "";
    const prov = String(r.provenance_name ?? "");
    if (t?.mission !== "K2" || !/\.fits$/.test(uri)) continue;
    const pipeline: KkPipeline | undefined = prov === "K2" ? "K2" : prov === "K2SFF" ? "K2SFF" : prov === "EVEREST" ? "EVEREST" : undefined;
    const m = /-(c\d+)[_.]/.exec(uri.split("/").pop() ?? "");
    if (!pipeline || !m) continue;
    const seq = num(r.sequence_number);
    out.push({ mission: "K2", pipeline, id: t.id, segment: seq && seq > 0 ? seq : campaignOf(m[1]), part: m[1], cadence: num(r.t_exptime) ?? 1800, uri });
  }
  return out;
}

/** A Kepler star's archive directory listing -> its per-quarter files (llc long, slc short cadence). */
export function parseKeplerListing(html: string, kic: string): KkProduct[] {
  const k9 = kic.padStart(9, "0"), dir = `missions/kepler/lightcurves/${k9.slice(0, 4)}/${k9}`;
  const files = new Set([...html.matchAll(new RegExp(`kplr${k9}-(\\d{13})_(llc|slc)\\.fits`, "g"))].map((m) => m[0]));
  return [...files].sort().map((f) => {
    const [, stamp, kind] = /-(\d{13})_(llc|slc)/.exec(f)!;
    const q = kind === "llc" ? KEPLER_LC_QUARTERS[stamp] : undefined;
    return { mission: "Kepler" as const, pipeline: "Kepler" as const, id: kic, segment: q ?? -1, part: q !== undefined ? `Q${q}` : stamp, cadence: kind === "llc" ? 1800 : 60, uri: `mast:KEPLER/url/${dir}/${f}` };
  });
}

/** Mast.Caom.Products rows of a Kepler observation -> per-quarter files (the listing's fallback; slow cold). */
export function parseKeplerCaomProducts(json: unknown, kic: string): KkProduct[] {
  const j = json as { data?: Record<string, unknown>[] } | null;
  if (!j || !Array.isArray(j.data)) throw new Error("unexpected MAST products response");
  return j.data.flatMap((r) => {
    const uri = String(r.dataURI ?? ""), m = /_(llc|slc)\.fits$/.exec(uri);
    if (!m) return [];
    const q = /- Q(\d+)/.exec(String(r.description ?? ""));
    const seg = q ? Number(q[1]) : -1;
    return [{ mission: "Kepler" as const, pipeline: "Kepler" as const, id: kic, segment: seg, part: seg >= 0 ? `Q${seg}` : uri.split("/").pop()!, cadence: m[1] === "llc" ? 1800 : 60, uri }];
  });
}

/** Every Kepler / K2 light-curve file of the star (mission and K2 HLSPs). One CAOM query by
 *  target_name, and the Kepler directory listing alongside it. Throws only when every request failed. */
export async function keplerK2Products(ids: KkIds, signal: AbortSignal, notes: string[] = []): Promise<KkProduct[]> {
  const names = [...(ids.kic ? [kplrName(ids.kic)] : []), ...(ids.epic ? [ktwoName(ids.epic)] : [])];
  if (!names.length) return [];
  const caom = getJson(MAST_API, {
    init: mastForm({ service: "Mast.Caom.Filtered", format: "json", pagesize: 500, page: 1, params: {
      columns: "obsid,obs_collection,provenance_name,target_name,sequence_number,t_exptime,dataURL",
      filters: [
        { paramName: "obs_collection", values: [...(ids.kic ? ["Kepler"] : []), ...(ids.epic ? ["K2", "HLSP"] : [])] },
        { paramName: "dataproduct_type", values: ["timeseries"] },
        // Only the pipelines read here (bright stars carry many other HLSPs, which slow MAST down).
        { paramName: "provenance_name", values: [...(ids.kic ? ["Kepler"] : []), ...(ids.epic ? ["K2", "K2SFF", "EVEREST"] : [])] },
        { paramName: "target_name", values: names },
      ],
    } }),
    timeoutMs: 15_000, signal, retries: 1,
  }) as Promise<{ data?: Record<string, unknown>[] }>;
  caom.catch(() => {});
  const out: KkProduct[] = [];
  let tried = 0, failed = 0;
  if (ids.kic) {
    tried++;
    const k9 = ids.kic.padStart(9, "0");
    try {
      out.push(...parseKeplerListing(await getText(`https://archive.stsci.edu/missions/kepler/lightcurves/${k9.slice(0, 4)}/${k9}/`, { timeoutMs: 10_000, signal, retries: 1 }), ids.kic));
    } catch (e) {
      // 404: the star has no Kepler light curves. Anything else: CAOM's product list for its long-cadence observation.
      if (!/^404 /.test(msg(e))) {
        try {
          const obs = (await caom).data?.find((r) => r.obs_collection === "Kepler" && r.t_exptime === 1800);
          if (obs) out.push(...parseKeplerCaomProducts(await getJson(MAST_API, { init: mastForm({ service: "Mast.Caom.Products", format: "json", pagesize: 500, page: 1, params: { obsid: String(obs.obsid) } }), timeoutMs: 25_000, signal, retries: 0 }), ids.kic));
        } catch (e2) { failed++; notes.push(`Kepler file list failed: ${msg(e)}; CAOM products: ${msg(e2)}`); }
      }
    }
  }
  if (ids.epic) {
    tried++;
    try { out.push(...parseKkCaom(await caom)); }
    catch (e) { failed++; notes.push(`K2 file list (MAST CAOM) failed: ${msg(e)}`); }
  }
  if (tried && failed === tried) throw new Error(`Kepler/K2 file lists failed: ${notes.join(" | ")}`);
  return out;
}

// ── choosing files ──────────────────────────────────────────────────────────

/** K2: the roll-corrected HLSPs first. K2SFF (Vanderburg & Johnson 2014: C0-C19, ~3 MB) over EVEREST
 *  (Luger+ 2016-18: C0-C13 mostly, ~13 MB a file, as it carries pixel data); the mission PDCSAP keeps
 *  the 6-hour thruster sawtooth and is the last resort. */
const K2_RANK: Record<KkPipeline, number> = { K2SFF: 0, EVEREST: 1, K2: 2, Kepler: 3 };

/** Which files to read, at most `maxFiles` segments: each a list of alternatives, best first (a failed
 *  download falls through to the next). K2 campaigns first (rarely more than two or three per star), then
 *  Kepler quarters spread evenly over the mission (Q0, 10 days of commissioning, only if nothing else fits).
 *  Short cadence only for a segment with no long cadence. */
export function chooseKkFiles(products: KkProduct[], maxFiles = KK_MAX_FILES): KkProduct[][] {
  const groups = new Map<string, KkProduct[]>();
  for (const p of products) {
    const key = `${p.mission}:${p.mission === "K2" ? p.part : p.segment >= 0 ? `Q${p.segment}` : p.uri}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const rank = (a: KkProduct, b: KkProduct) => Number(a.cadence <= 120) - Number(b.cadence <= 120) || K2_RANK[a.pipeline] - K2_RANK[b.pipeline];
  const all = [...groups.values()].map((g) => {
    const lc = g.filter((p) => p.cadence > 120);
    return (lc.length ? lc : g).sort(rank);
  });
  // Kepler short-cadence files without a known quarter (monthly) only when the star has no long cadence at all.
  const kepLc = all.filter((g) => g[0].mission === "Kepler" && g[0].cadence > 120);
  const kepler = (kepLc.length ? kepLc : all.filter((g) => g[0].mission === "Kepler")).sort((a, b) => a[0].uri.localeCompare(b[0].uri));
  const k2 = all.filter((g) => g[0].mission === "K2").sort((a, b) => a[0].segment - b[0].segment || a[0].part.localeCompare(b[0].part));
  const pick = k2.slice(0, maxFiles);
  const room = maxFiles - pick.length;
  if (room > 0 && kepler.length) {
    const pool = kepler.length > room ? kepler.filter((g) => g[0].segment !== 0) : kepler;
    if (pool.length <= room) pick.push(...pool);
    else if (room === 1) pick.push(pool[pool.length - 1]);
    else {
      const idx = new Set(Array.from({ length: room }, (_, i) => Math.round((i * (pool.length - 1)) / (room - 1))));
      pick.push(...[...idx].map((i) => pool[i]));
    }
  }
  return pick;
}

// ── reading files ───────────────────────────────────────────────────────────

/** One Kepler / K2 / K2SFF / EVEREST light-curve FITS file -> BTJD times and median-normalized flux. */
export function parseKkFits(buf: ArrayBuffer, product: Pick<KkProduct, "mission" | "pipeline" | "segment" | "uri">): MissionCurve {
  const hdus = readHdus(buf);
  const ext = { K2SFF: "BESTAPER", EVEREST: "ARRAYS", K2: "LIGHTCURVE", Kepler: "LIGHTCURVE" }[product.pipeline];
  const hdu = hdus.find((h) => String(h.header.EXTNAME ?? "").trim() === ext) ?? hdus[1];
  if (!hdu) throw new Error(`no ${ext} extension`);
  const [tc, fc, qc] = product.pipeline === "K2SFF" ? ["T", "FCOR", "MOVING"] : product.pipeline === "EVEREST" ? ["TIME", "FLUX", "QUALITY"] : ["TIME", "PDCSAP_FLUX", "SAP_QUALITY"];
  const tab = readTable(buf, hdu, [tc, fc, qc]);
  const time = tab.columns[tc], flux = tab.columns[fc], qual = tab.columns[qc];
  if (!time || !flux) throw new Error(`light curve lacks ${tc}/${fc}`);
  const h = hdu.header, h0 = hdus[0].header;
  const refi = num(h.BJDREFI) ?? num(h0.BJDREFI) ?? BKJD, reff = num(h.BJDREFF) ?? num(h0.BJDREFF) ?? 0;
  // K2SFF's MOVING marks thruster firings (0/1); the others are bit masks.
  const bad = product.pipeline === "K2SFF" ? 1 : product.pipeline === "EVEREST" ? EVEREST_BAD_BITS : KEPLER_BAD_BITS;
  const keep: number[] = [];
  for (let i = 0; i < tab.rows; i++) {
    if (Number.isFinite(time[i]) && Number.isFinite(flux[i]) && flux[i] > 0 && !(qual && (qual[i] & bad))) keep.push(i);
  }
  if (!keep.length) throw new Error("no good cadences");
  const sorted = keep.map((i) => flux[i]).sort((a, b) => a - b);
  const med = sorted[sorted.length >> 1];
  const t = new Float64Array(keep.length), f = new Float64Array(keep.length);
  keep.forEach((i, k) => { t[k] = toBtjd(time[i], refi, reff); f[k] = flux[i] / med; });
  const seg = num(h0.QUARTER) ?? num(h0.CAMPAIGN) ?? product.segment;
  const dt = num(h.TIMEDEL) ?? num(h0.TIMEDEL);
  return { mission: product.mission, pipeline: product.pipeline, segment: seg, cadence: dt ? Math.round(dt * 86400) : 0, t, f, uri: product.uri };
}

/** Kepler and K2 light curves of a TIC star: ids, file list, then up to `maxFiles` downloads (3 at a
 *  time, each with its own timeout, a failed K2SFF file falling back to EVEREST, then PDCSAP). Partial
 *  failures go to `notes`; throws only when something failed and no curve came back. A star never
 *  observed by Kepler or K2 returns no curves and a note. */
export async function keplerK2Curves(
  star: { tic: string; ra: number; dec: number } & KkIds,
  signal: AbortSignal,
  opts: { maxFiles?: number; timeoutMs?: number } = {},
): Promise<{ curves: MissionCurve[]; ids: KkIds; notes: string[] }> {
  const notes: string[] = [];
  const ids = await keplerK2Ids(star, signal, notes);
  if (!ids.kic && !ids.epic) {
    notes.push("no KIC or EPIC id: not a Kepler / K2 target");
    return { curves: [], ids, notes };
  }
  const products = await keplerK2Products(ids, signal, notes);
  const plan = chooseKkFiles(products, opts.maxFiles ?? KK_MAX_FILES);
  if (!plan.length) {
    notes.push(`no Kepler / K2 light curves on MAST for ${[ids.kic && `KIC ${ids.kic}`, ids.epic && `EPIC ${ids.epic}`].filter(Boolean).join(", ")}`);
    return { curves: [], ids, notes };
  }
  const total = chooseKkFiles(products, Infinity).length;
  if (total > plan.length) notes.push(`read ${plan.length} of ${total} Kepler/K2 segments (maxFiles)`);
  const curves: MissionCurve[] = [];
  let next = 0, failures = 0;
  await Promise.all(Array.from({ length: Math.min(3, plan.length) }, async () => {
    while (next < plan.length && !signal.aborted) {
      const alts = plan[next++];
      for (const p of alts) {
        try {
          curves.push(parseKkFits(await getBuffer(mastDownloadUrl(p.uri), { timeoutMs: opts.timeoutMs ?? KK_FILE_TIMEOUT_MS, signal }), p));
          break;
        } catch (e) {
          if (signal.aborted) return;
          failures++;
          notes.push(`${p.mission} ${p.pipeline} ${p.part}: ${msg(e)}`);
        }
      }
    }
  }));
  if (signal.aborted && !curves.length) throw new Error("aborted");
  if (!curves.length && failures) throw new Error(`no Kepler/K2 light curve could be read: ${notes.join(" | ")}`);
  curves.sort((a, b) => a.t[0] - b.t[0]);
  return { curves, ids, notes };
}
