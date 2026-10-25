// Runs the sky agents for one cone in parallel; each source times out and fails on its own.
import { getJson } from "@/lib/http";
import { EXO_TAP, exoRequest, parseExoplanets } from "./exoplanets";
import { BODIES, bodyObject, HORIZONS_API, horizonsUrl, parseHorizons } from "./horizons";
import { parseSimbad, SIMBAD_TAP, simbadUrl } from "./simbad";
import type { Cone, SkyObject, SkySourceId, SkySourceReport } from "./types";

export const SOURCE_TIMEOUT_MS = 15_000;
const PREFIX: Record<SkySourceId, string> = { simbad: "S", exoplanets: "X", horizons: "J" };

type Source = { id: SkySourceId; label: string; endpoint: string; run: (c: Cone, signal: AbortSignal) => Promise<SkyObject[]> };

export const SOURCES: Source[] = [
  { id: "simbad", label: "SIMBAD (CDS)", endpoint: SIMBAD_TAP, run: async (c, signal) => parseSimbad(await getJson(simbadUrl(c), { timeoutMs: SOURCE_TIMEOUT_MS, signal, retries: 1 })) },
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
];

/** Assigns citation ids per source (S1.., X1.., J1..) in the order each source returned them. */
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
      const objects = await s.run(c, ctl.signal);
      const report: SkySourceReport = { source: s.id, label: s.label, endpoint: s.endpoint, status: objects.length ? "ok" : "empty", count: objects.length, ms: Date.now() - t0 };
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
