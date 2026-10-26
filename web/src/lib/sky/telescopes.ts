// Telescope Archive agent: which real telescope observations MAST (STScI) holds in the cone, one
// result per mission (HST, JWST, TESS, ...), with counts, instruments, filters and the latest date.
// MAST's CAOM position search is slow on a cold query: measured 2026-10-26, 26 s for a 0.2° cone
// returning 4 rows and over 90 s for 3°, so the cost is the position search itself, not the cone
// size or row count. It is cached server-side afterwards (~1 s). So the fetch keeps running in the
// background past our deadline: the route streams its result late if it lands during the run
// (see pendingMast), and it fills the HTTP cache for the next run. The TESS light-curve inventory
// (lightcurves.ts, by TIC id: fast) is what the agent reports when this is still searching.
import { after } from "next/server";
import { getJson } from "@/lib/http";
import type { Cone, SkyObject } from "./types";

export const MAST_API = "https://mast.stsci.edu/api/v0/invoke";
/** Missions worth summarising (skips HLSP/HLA high-level products, which duplicate these). */
export const MAST_MISSIONS = ["HST", "JWST", "TESS", "Kepler", "K2", "GALEX", "SWIFT", "IUE", "FUSE", "SPITZER_SHA", "PS1"];
const COLUMNS = "obs_collection,instrument_name,filters,target_name,proposal_id,t_min,obs_id,s_ra,s_dec,wavelength_region";
export const MAST_PAGE = 20_000;
export const MAST_CAP = 10;
/** Shorter than the other sources' 15 s: the "results" event waits for every agent, and a cold MAST
 *  query (20-35 s) would otherwise hold back SIMBAD/Exoplanet results that arrive in ~1-2 s. */
export const MAST_DEADLINE_MS = 4_000;

const LABEL: Record<string, string> = { SPITZER_SHA: "Spitzer", PS1: "Pan-STARRS1", SWIFT: "Swift" };
const missionLabel = (m: string) => LABEL[m] ?? m;

export function mastRequest(c: Cone): RequestInit {
  const request = {
    service: "Mast.Caom.Filtered.Position",
    format: "json",
    pagesize: MAST_PAGE,
    page: 1,
    params: {
      columns: COLUMNS,
      filters: [{ paramName: "obs_collection", values: MAST_MISSIONS }],
      position: `${c.ra.toFixed(5)}, ${c.dec.toFixed(5)}, ${c.radius.toFixed(5)}`,
    },
  };
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ request: JSON.stringify(request) }).toString(),
  };
}

/** MAST portal search for this cone (the portal accepts "ra dec" text plus a radius). */
export const mastPortalUrl = (ra: number, dec: number, radiusDeg?: number) =>
  `https://mast.stsci.edu/portal/Mashup/Clients/Mast/Portal.html?searchQuery=${encodeURIComponent(`${ra.toFixed(5)} ${dec.toFixed(5)}${radiusDeg ? ` r=${(radiusDeg * 60).toFixed(1)}m` : ""}`)}`;

/** MJD to YYYY-MM-DD. */
export const mjdToDate = (mjd: number) => new Date((mjd - 40587) * 86_400_000).toISOString().slice(0, 10);

type Row = { obs_collection?: unknown; instrument_name?: unknown; filters?: unknown; target_name?: unknown; proposal_id?: unknown; t_min?: unknown; obs_id?: unknown; s_ra?: unknown; s_dec?: unknown; wavelength_region?: unknown };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
function top(counts: Map<string, number>, n: number) {
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, n);
}
const bump = (m: Map<string, number>, k: string) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };
// Generic or placeholder target names that say nothing about what was observed.
const BORING_TARGET = /^(tess ffi|any|none|unknown|n\/a|null|parallel.*|.*-?ffi|(post-saa-)?dark|bias|flat.*|o\d+|.*_plan_.*|tungsten|deuterium|.*calib.*|wavecal|internal|earth-.*|intflat|list-\d+|par-target|sky|background.*)$/i;

/** Groups MAST CAOM rows by mission into one SkyObject each (most observations first). */
export function parseMast(json: unknown, c: Cone, cap = MAST_CAP): SkyObject[] {
  const j = json as { status?: string; data?: Row[]; paging?: { rowsTotal?: number } } | null;
  if (!j || !Array.isArray(j.data)) throw new Error(j?.status ? `MAST status ${j.status}` : "unexpected MAST response");
  type Acc = { n: number; inst: Map<string, number>; filt: Map<string, number>; wave: Map<string, number>; targ: Map<string, number>; prop: Map<string, number>; latest: number; latestRow: Row | null; latestNamed: boolean };
  const by = new Map<string, Acc>();
  for (const r of j.data) {
    const m = str(r.obs_collection);
    if (!m) continue;
    const a = by.get(m) ?? { n: 0, inst: new Map(), filt: new Map(), wave: new Map(), targ: new Map(), prop: new Map(), latest: -Infinity, latestRow: null, latestNamed: false };
    by.set(m, a);
    a.n++;
    bump(a.inst, str(r.instrument_name));
    for (const f of str(r.filters).split(";").map((s) => s.trim()).filter(Boolean)) bump(a.filt, f);
    for (const w of str(r.wavelength_region).toLowerCase().split(";")) bump(a.wave, w.trim());
    const t = m === "TESS" && /^\d+$/.test(str(r.target_name)) ? `TIC ${str(r.target_name)}` : str(r.target_name);
    const named = !!t && !BORING_TARGET.test(t);
    if (named) bump(a.targ, t);
    const p = str(r.proposal_id);
    if (p && p !== "N/A") bump(a.prop, p);
    // Latest observation of a named target (calibration frames only when there is nothing else).
    if (typeof r.t_min === "number" && Number.isFinite(r.t_min) && (named ? !a.latestNamed || r.t_min > a.latest : !a.latestNamed && r.t_min > a.latest)) {
      a.latest = r.t_min; a.latestRow = r; a.latestNamed = named;
    }
  }
  const truncated = (j.paging?.rowsTotal ?? 0) > j.data.length;
  return [...by].sort((x, y) => y[1].n - x[1].n).slice(0, cap).map(([mission, a]) => {
    const props: Record<string, string | number> = {};
    props.observations = truncated ? `${a.n}+` : a.n;
    const fmt = (m: Map<string, number>, n: number) => top(m, n).map(([k, v]) => `${k} (${v})`).join(", ");
    if (a.inst.size) props.instruments = fmt(a.inst, 4);
    if (a.filt.size) props.filters = fmt(a.filt, 5);
    if (a.wave.size) props.wavelength = top(a.wave, 3).map(([k]) => k).join(", ");
    const lr = a.latestRow;
    if (lr && Number.isFinite(a.latest)) props["latest observation"] = `${mjdToDate(a.latest)} (${str(lr.obs_id) || "n/a"}${str(lr.target_name) ? `, ${str(lr.target_name)}` : ""})`;
    if (a.targ.size) props["notable targets"] = top(a.targ, 4).map(([k]) => k).join(", ");
    if (a.prop.size) props["proposal ids"] = top(a.prop, 4).map(([k]) => k).join(", ");
    const ra = typeof lr?.s_ra === "number" ? lr.s_ra : c.ra, dec = typeof lr?.s_dec === "number" ? lr.s_dec : c.dec;
    const name = missionLabel(mission);
    return {
      id: "", name: `${name} archive`, type: `${name} observations`, category: "observation", ra, dec, source: "telescopes",
      url: mastPortalUrl(c.ra, c.dec, c.radius), props,
    } satisfies SkyObject;
  });
}

// One CAOM search per cone at a time: the agent races it against its deadline, and the route picks
// up the same promise later to stream a late result (getJson only caches finished calls).
const pending = new Map<string, { at: number; p: Promise<unknown>; value?: unknown }>();
const coneKey = (c: Cone) => `${c.ra.toFixed(5)},${c.dec.toFixed(5)},${c.radius.toFixed(5)}`;

/** Starts (or joins) the CAOM search for this cone. It runs on with its own 60 s timeout, unaffected
 *  by the run's abort signal, so a cold query still completes and warms the cache. */
export function pendingMast(c: Cone): Promise<unknown> {
  const key = coneKey(c);
  const hit = pending.get(key);
  if (hit && Date.now() - hit.at < 90_000) return hit.p;
  for (const [k, v] of pending) if (Date.now() - v.at > 90_000) pending.delete(k);
  const p = getJson(MAST_API, { init: mastRequest(c), timeoutMs: 60_000, retries: 0 });
  p.catch((e: Error) => console.warn(`[sky] MAST background fetch failed: ${e.message}`));
  // On Vercel the function would be frozen once the response ends, killing the background fetch
  // before it fills the cache: after() keeps it alive (within maxDuration). Outside a request
  // (unit tests) after() throws, and there's nothing to keep alive anyway.
  try { after(p.then(() => {}, () => {})); } catch { /* not in a request scope */ }
  const entry: { at: number; p: Promise<unknown>; value?: unknown } = { at: Date.now(), p };
  // A failed search is forgotten so the next run tries again.
  p.then((v) => { entry.value = v; }, () => { if (pending.get(key) === entry) pending.delete(key); });
  pending.set(key, entry);
  return p;
}

/** Cold MAST queries outlive our deadline: race the search against it (the search keeps going). */
export async function fetchMast(c: Cone, signal: AbortSignal, deadlineMs: number): Promise<SkyObject[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const json = await Promise.race([
    pendingMast(c),
    new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error(`MAST still searching after ${Math.round(deadlineMs / 1000)}s (cold query); results are cached for the next run`)), deadlineMs);
      signal.addEventListener("abort", () => rej(new Error("aborted")), { once: true });
    }),
  ]).finally(() => clearTimeout(timer));
  return parseMast(json, c);
}

/** The CAOM result for this cone if a search has already finished (no waiting, no new search), else null. */
export function settledMast(c: Cone): SkyObject[] | null {
  const v = pending.get(coneKey(c))?.value;
  if (v === undefined) return null;
  try { return parseMast(v, c); } catch { return null; }
}
