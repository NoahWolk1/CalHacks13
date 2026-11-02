// Worker-thread entry for the deep-survey search pool (server/searchPool.ts): one season's light curves
// in, the search (or its forced checks) out. Bundled to .worker/searchWorker.mjs by scripts/build-search-worker.mjs.
import { parentPort } from "node:worker_threads";
import { forcedChecks, searchLightCurves, type SeasonLcs } from "./seasonSearch";
import type { Ephemeris } from "./timeseries";
import type { TransitSignal } from "./types";

// A search (masks) or forced checks at other seasons' periods (targets).
parentPort!.on("message", (m: { id: number; lcs: SeasonLcs; masks?: Ephemeris[]; targets?: TransitSignal[] }) => {
  try {
    parentPort!.postMessage({ id: m.id, result: m.targets ? forcedChecks(m.lcs, m.targets) : searchLightCurves(m.lcs, m.masks ?? []) });
  } catch (e) {
    parentPort!.postMessage({ id: m.id, error: (e as Error).message });
  }
});
