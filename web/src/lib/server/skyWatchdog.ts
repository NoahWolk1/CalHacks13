// For a long-running server (a VM, your own machine; not serverless): resumes deep surveys and planet
// sweeps whose background chains broke (a restart, a deploy, a crash) without waiting for someone to open
// their page, which is otherwise what restarts them. On at startup and every few minutes with SKY_WATCHDOG=1.
import { readdir, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIST_ALL, surveyStore } from "@/lib/sky/surveyStore";
import { advanceSweepNow, kickStep } from "./skySurvey";

const EVERY_MS = 2 * 60_000;
/** As in GET /api/sky/survey/:id: a running survey untouched this long has lost its chain. */
const SURVEY_STALE_MS = 90_000;
/** Tiles report to their sweep after every step (~4 min) and vets when they end: an advance is due. */
const SWEEP_STALE_MS = 3 * 60_000;

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
  const dirs = [process.env.SKY_SURVEY_DIR || join(tmpdir(), "coordinate-sky-surveys"), join(process.cwd(), ".cache", "http")];
  const run = () => Promise.all([resumeStale(origin), removeStaleTmp(dirs)]).catch((e) => console.warn(`[watchdog] ${(e as Error).message}`));
  setTimeout(run, 20_000).unref();
  setInterval(run, EVERY_MS).unref();
  console.log(`[watchdog] resuming stalled surveys and sweeps every ${EVERY_MS / 60_000} min via ${origin}`);
}
