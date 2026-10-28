// Runs the sky agents for one cone in parallel; each source times out and fails on its own.
import { getJson } from "@/lib/http";
import { EXO_TAP, exoRequest, parseExoplanets } from "./exoplanets";
import { BODIES, bodyObject, HORIZONS_API, horizonsUrl, parseHorizons } from "./horizons";
import { gaiaBright } from "./archives";
import { parseSimbad, SIMBAD_TAP, simbadQuery, simbadTap } from "./simbad";
import { fieldInventory, inventoryObject } from "./lightcurves";
import { fetchMast, MAST_API, MAST_DEADLINE_MS } from "./telescopes";
import type { Cone, SkyObject, SkySourceId, SkySourceReport } from "./types";

export const SOURCE_TIMEOUT_MS = 15_000;
const PREFIX: Record<SkySourceId, string> = { simbad: "S", exoplanets: "X", horizons: "J", telescopes: "T", lightcurves: "C" };

/** A source returns its objects, optionally with a note on partial results. */
type Source = { id: SkySourceId; label: string; endpoint: string; run: (c: Cone, signal: AbortSignal) => Promise<SkyObject[] | { objects: SkyObject[]; note: string }> };

/** Telescope Archive: the TESS light-curve inventory (by TIC id, ~1-2 s) plus MAST's full
 *  per-mission summary when the CAOM search beats its deadline. When it doesn't (cold query), the
 *  inventory is reported on its own and the route streams the full summary later if it lands. */
export async function telescopes(c: Cone, signal: AbortSignal): Promise<SkyObject[] | { objects: SkyObject[]; note: string }> {
  const [inv, full] = await Promise.allSettled([fieldInventory(c, signal).then((i) => inventoryObject(c, i)), fetchMast(c, signal, MAST_DEADLINE_MS)]);
  const lc = inv.status === "fulfilled" && inv.value ? [inv.value] : [];
  if (full.status === "fulfilled") return [...lc, ...full.value];
  const why = (full.reason as Error).message;
  if (!lc.length) {
    if (inv.status === "rejected") throw new Error(`${why}; TESS inventory failed: ${(inv.reason as Error).message}`);
    throw new Error(why);
  }
  return { objects: lc, note: `TESS light curves only so far: ${why}` };
}

/** SIMBAD (CDS, or its CfA mirror). If neither answers in time, the cone's bright stars come from
 *  Gaia DR3 at ESA instead, so the run still has its stars (without SIMBAD's galaxies, nebulae and names). */
export async function simbad(c: Cone, signal: AbortSignal): Promise<SkyObject[] | { objects: SkyObject[]; note: string }> {
  try {
    return parseSimbad(await simbadTap(simbadQuery(c), { timeoutMs: SOURCE_TIMEOUT_MS - 7_000, signal }));
  } catch (e) {
    if (signal.aborted) throw e;
    const why = (e as Error).message;
    const stars = await gaiaBright(c.ra, c.dec, c.radius, signal).catch((g: Error) => { throw new Error(`${why}; Gaia fallback failed: ${g.message}`); });
    const objects: SkyObject[] = stars.map((s) => ({
      id: "", name: `Gaia DR3 ${s.source}`, type: "Star", category: "star", ra: s.ra, dec: s.dec, source: "simbad",
      url: `https://sky.esa.int/esasky/?target=${s.ra.toFixed(5)}%20${s.dec.toFixed(5)}&fov=0.1`,
      props: { "Gaia G mag": +s.g.toFixed(2), ...(s.bpRp !== undefined ? { "BP-RP": +s.bpRp.toFixed(2) } : {}), ...(s.parallax !== undefined && s.parallax > 0.5 ? { "parallax (mas)": +s.parallax.toFixed(3), "distance (ly)": Math.round(3261.56 / s.parallax) } : {}) },
    }));
    return { objects, note: `${why}. Showing the brightest stars from Gaia DR3 (ESA) instead` };
  }
}

export const SOURCES: Source[] = [
  { id: "simbad", label: "SIMBAD (CDS)", endpoint: SIMBAD_TAP, run: simbad },
  { id: "exoplanets", label: "NASA Exoplanet Archive", endpoint: EXO_TAP, run: async (c, signal) => parseExoplanets(await getJson(EXO_TAP, { init: exoRequest(c), timeoutMs: SOURCE_TIMEOUT_MS, signal, retries: 1 })) },
  {
    id: "horizons", label: "JPL Horizons", endpoint: HORIZONS_API,
    run: async (c, signal) => {
      const now = new Date();
      const rows = await Promise.allSettled(BODIES.map(async (b) =>
        bodyObject(b, parseHorizons(await getJson(horizonsUrl(b.id, now), { timeoutMs: SOURCE_TIMEOUT_MS, signal, retries: 1 })), c)));
      if (rows.every((r) => r.status === "rejected")) throw (rows[0] as PromiseRejectedResult).reason;
      return rows.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
    },
  },
  { id: "telescopes", label: "MAST telescope archive", endpoint: MAST_API, run: telescopes },
];

/** Assigns citation ids per source (S1.., X1.., J1.., T1..) in the order each source returned them. */
export function assignIds(bySource: { id: SkySourceId; objects: SkyObject[] }[]): SkyObject[] {
  return bySource.flatMap(({ id, objects }) => objects.map((o, i) => ({ ...o, id: `${PREFIX[id]}${i + 1}` })));
}

export async function runSkyAgents(c: Cone, signal: AbortSignal, sources: Source[] = SOURCES) {
  const results = await Promise.all(sources.map(async (s) => {
    const t0 = Date.now();
    const ctl = new AbortController();
    const onAbort = () => ctl.abort();
    signal.addEventListener("abort", onAbort);
    // Hard per-source deadline (getJson's timeout is per attempt; this bounds retries too).
    const timer = setTimeout(() => ctl.abort(), SOURCE_TIMEOUT_MS + 2_000);
    try {
      const out = await s.run(c, ctl.signal);
      const { objects, note } = Array.isArray(out) ? { objects: out, note: undefined } : out;
      const report: SkySourceReport = { source: s.id, label: s.label, endpoint: s.endpoint, status: objects.length ? "ok" : "empty", count: objects.length, ms: Date.now() - t0, ...(note ? { note: note.slice(0, 200) } : {}) };
      return { report, objects };
    } catch (e) {
      const msg = ctl.signal.aborted && !signal.aborted ? `timed out after ${Math.round((Date.now() - t0) / 1000)}s` : (e as Error).message;
      console.warn(`[sky] ${s.id} failed: ${msg}`);
      return { report: { source: s.id, label: s.label, endpoint: s.endpoint, status: "error", count: 0, ms: Date.now() - t0, error: msg.slice(0, 160) } as SkySourceReport, objects: [] as SkyObject[] };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }));
  return {
    objects: assignIds(results.map((r) => ({ id: r.report.source, objects: r.objects }))),
    sources: results.map((r) => r.report),
  };
}
