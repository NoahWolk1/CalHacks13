// Runs deep-survey season searches on worker threads, so a server with many cores searches many seasons
// at once (Node runs JavaScript on one thread: without this, one core does every search and the web
// requests wait behind it). On with SKY_SEARCH_THREADS=<n> and the worker bundle built (npm run build);
// otherwise, or if a worker fails to start, seasons are searched inline as before.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { forcedChecks, searchLightCurves, type SeasonLcs, type SeasonSearch } from "@/lib/sky/seasonSearch";
import type { Ephemeris } from "@/lib/sky/timeseries";
import type { ForcedCheck, TransitSignal } from "@/lib/sky/types";

const THREADS = Number(process.env.SKY_SEARCH_THREADS) || 0;
const WORKER_FILE = join(process.cwd(), ".worker", "searchWorker.mjs");

/** A season search (masks) or its forced checks (targets). */
type Job = { masks: Ephemeris[] } | { targets: TransitSignal[] };
type Task = { id: number; lcs: SeasonLcs; job: Job; resolve: (r: never) => void; reject: (e: Error) => void };
type Slot = { worker: Worker; task?: Task };

const g = globalThis as unknown as { __skySearchPool?: { slots: Slot[]; queue: Task[] } | null };
let nextId = 1, warned = false;

function spawn(pool: { slots: Slot[]; queue: Task[] }): Slot {
  const slot: Slot = { worker: new Worker(WORKER_FILE) };
  slot.worker.on("message", (m: { id: number; result?: unknown; error?: string }) => {
    const t = slot.task;
    slot.task = undefined;
    if (t?.id === m.id) { if (m.error) t.reject(new Error(m.error)); else t.resolve(m.result as never); }
    pump(pool);
  });
  // A crashed worker fails its season (searched inline instead) and is replaced.
  slot.worker.on("error", (e) => {
    const t = slot.task;
    slot.task = undefined;
    t?.reject(Object.assign(e, { crashed: true }));
    pool.slots[pool.slots.indexOf(slot)] = spawn(pool);
    pump(pool);
  });
  slot.worker.unref();
  return slot;
}

function pump(pool: { slots: Slot[]; queue: Task[] }) {
  for (const slot of pool.slots) {
    if (slot.task || !pool.queue.length) continue;
    const t = pool.queue.shift()!;
    slot.task = t;
    slot.worker.postMessage({ id: t.id, lcs: t.lcs.map((l) => ({ time: l.time, flux: l.flux, quality: l.quality })), ...t.job });
  }
}

function pool() {
  if (g.__skySearchPool !== undefined) return g.__skySearchPool;
  if (!THREADS || !existsSync(WORKER_FILE)) return (g.__skySearchPool = null);
  const p = { slots: [] as Slot[], queue: [] as Task[] };
  try {
    for (let i = 0; i < THREADS; i++) p.slots.push(spawn(p));
  } catch (e) {
    console.warn(`[search] worker threads unavailable (${(e as Error).message}): searching inline`);
    return (g.__skySearchPool = null);
  }
  console.log(`[search] ${THREADS} search threads`);
  return (g.__skySearchPool = p);
}

/** A job on a worker thread when the pool is on (inline otherwise, or if the thread crashes). */
async function onThread<T>(lcs: SeasonLcs, job: Job, inline: () => T): Promise<T> {
  const p = pool();
  if (!p) return inline();
  try {
    return await new Promise<T>((resolve, reject) => {
      p.queue.push({ id: nextId++, lcs, job, resolve: resolve as (r: never) => void, reject });
      pump(p);
    });
  } catch (e) {
    // An analysis error (a light curve too short, say) would only fail again inline: only a crashed thread falls back.
    if (!(e as { crashed?: boolean }).crashed) throw e;
    if (!warned) console.warn(`[search] a search thread failed (${(e as Error).message.slice(0, 120)}): searching inline (further failures not logged)`);
    warned = true;
    return inline();
  }
}

/** One season's search. */
export const searchSeasonLcs = (lcs: SeasonLcs, masks: Ephemeris[]): Promise<SeasonSearch> => onThread(lcs, { masks }, () => searchLightCurves(lcs, masks));

/** One season's forced checks at other seasons' periods. */
export const forcedChecksLcs = (lcs: SeasonLcs, targets: TransitSignal[]): Promise<ForcedCheck[]> =>
  targets.length ? onThread(lcs, { targets }, () => forcedChecks(lcs, targets)) : Promise.resolve([]);

/** Seasons in flight per survey worth keeping: enough to keep every thread busy while others download. */
export const searchThreads = () => (pool() ? THREADS : 0);
