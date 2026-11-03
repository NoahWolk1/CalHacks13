// For a long-running server (a VM, your own machine; not serverless): resumes deep surveys and planet
// sweeps whose background chains broke (a restart, a deploy, a crash) without waiting for someone to open
// their page, which is otherwise what restarts them. On at startup and every few minutes with SKY_WATCHDOG=1.
import { readdir, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIST_ALL, surveyStore } from "@/lib/sky/surveyStore";
import { ticProducts } from "@/lib/sky/lightcurves";
import { VET_BUDGET_MS } from "@/lib/sky/vetReport";
import { vetStore } from "@/lib/sky/vetStore";
import { checkWatch, readWatch, seedSweep, watchPath, writeWatch } from "@/lib/sky/watchlist";
import { advanceSweepNow, kickStep } from "./skySurvey";
import { vetOffThread } from "./vetPool";

const EVERY_MS = 2 * 60_000;
/** As in GET /api/sky/survey/:id: a running survey untouched this long has lost its chain. */
const SURVEY_STALE_MS = 90_000;
/** Tiles report to their sweep after every step (~4 min) and vets when they end: an advance is due. */
const SWEEP_STALE_MS = 3 * 60_000;
/** The watchlist (watchlist.ts) is looked at this often; each star itself only every WATCH_EVERY_MS. */
const WATCH_RUN_MS = 6 * 3600_000;

export async function resumeStale(origin: string) {
  const store = surveyStore(), now = Date.now();
  for (const s of await store.list(LIST_ALL)) {
    if (s.status !== "running") continue;
    // A sweep's advance restarts its stalled tiles and vets itself.
    if (s.sweep) { if (now - s.updatedAt > SWEEP_STALE_MS) await advanceSweepNow(origin, s.id); continue; }
    if (s.sweepId) continue;
    const row = await store.get(s.id);
    if (row && row.leaseUntil < now && now - row.summary.updatedAt > SURVEY_STALE_MS) await kickStep(origin, s.id);
  }
}

/** Adds finished sweeps' viable finds to the watchlist, then looks up the stars that are due and vets
 *  again those TESS has new sectors of. Saved after every star, so a restart loses at most one. */
export async function runWatchlist() {
  const store = surveyStore(), path = watchPath(), w = await readWatch(path);
  let changed = false;
  for (const s of await store.list(LIST_ALL)) {
    if (!s.sweep || s.status === "running" || w.seeded.includes(s.id)) continue;
    const row = await store.get(s.id);
    if (row && seedSweep(w, row.summary, row.objects)) changed = true;
  }
  if (changed) await writeWatch(w, path);
  let looked = 0, vetted = 0;
  // One star per call, saved in between.
  for (let i = 0; i < 40; i++) {
    const r = await checkWatch(w, {
      maxLooks: 1,
      sectorsOf: async (tic) => (await ticProducts(tic, AbortSignal.timeout(60_000))).map((p) => p.sector),
      vet: async (input) => {
        const report = await vetOffThread(input, AbortSignal.timeout(VET_BUDGET_MS + 60_000), VET_BUDGET_MS);
        await vetStore().save(report).catch((e) => console.warn(`[watch] saving the vet of TIC ${input.tic} failed: ${(e as Error).message}`));
        return report;
      },
      log: (t) => console.warn(`[watch] ${t}`),
    });
    if (!r.looked) break;
    looked += r.looked; vetted += r.vetted;
    await writeWatch(w, path);
  }
  if (looked) console.log(`[watch] looked up ${looked} star${looked === 1 ? "" : "s"}, vetted ${vetted} again`);
}

/** Half-written files left by a process killed mid-write (a restart): write-then-rename never finished. */
export async function removeStaleTmp(dirs: string[], olderThanMs = 60 * 60_000) {
  for (const dir of dirs) {
    for (const f of await readdir(dir).catch(() => [] as string[])) {
      if (!f.endsWith(".tmp")) continue;
      const st = await stat(join(dir, f)).catch(() => null);
      if (st && Date.now() - st.mtimeMs > olderThanMs) await unlink(join(dir, f)).catch(() => {});
    }
  }
}

export function startSkyWatchdog(origin: string) {
  const root = process.env.SKY_SURVEY_DIR || join(tmpdir(), "coordinate-sky-surveys");
  const dirs = [root, join(root, "watch"), join(process.cwd(), ".cache", "http")];
  const run = () => Promise.all([resumeStale(origin), removeStaleTmp(dirs)]).catch((e) => console.warn(`[watchdog] ${(e as Error).message}`));
  setTimeout(run, 20_000).unref();
  setInterval(run, EVERY_MS).unref();
  // Never two at once: a run with several re-vets can outlast the interval.
  let watching = false;
  const watch = () => {
    if (watching) return;
    watching = true;
    runWatchlist().catch((e) => console.warn(`[watch] ${(e as Error).message}`)).finally(() => { watching = false; });
  };
  setTimeout(watch, 5 * 60_000).unref();
  setInterval(watch, WATCH_RUN_MS).unref();
  console.log(`[watchdog] resuming stalled surveys and sweeps every ${EVERY_MS / 60_000} min via ${origin}; watchlist every ${WATCH_RUN_MS / 3600_000} h`);
}
