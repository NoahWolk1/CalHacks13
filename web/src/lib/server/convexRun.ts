// Convex mode for /api/run: the orchestrator's RunEvents are persisted to Convex (batched every
// ~100ms, strictly ordered by seq) and every client watching the run subscribes reactively.
// Only used when NEXT_PUBLIC_CONVEX_URL / CONVEX_URL is set; otherwise /api/run streams SSE.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { RunEvent, RunRequest } from "@/lib/types";
import { runOrchestrator, type RunOptions } from "@/lib/orchestrator/run";
import { llm } from "@/lib/llm";

export const convexUrl = () => process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "";

let client: ConvexHttpClient | null = null;
const convex = () => (client ??= new ConvexHttpClient(convexUrl()));

// Survives Next's per-route module instances so /api/run/stop can reach the same map.
const g = globalThis as unknown as { __geoswarmRuns?: Map<string, AbortController> };
export const activeRuns = (g.__geoswarmRuns ??= new Map());

const FLUSH_MS = 100;
const CREATE_TIMEOUT_MS = 5000;

const STOP_POLL_MS = 1500;

/**
 * Creates the run row, starts the orchestrator in the background, and returns the Convex run id.
 * `background` receives the work promise: the route hands it to `after()` so Vercel keeps the
 * function alive (up to maxDuration) after the {runId} response is sent.
 */
export async function startConvexRun(body: RunRequest, background: (work: Promise<void>) => void = () => {}, opts: RunOptions = {}): Promise<string> {
  // Bounded so a hung (not just down) Convex backend still falls back to SSE quickly.
  let createTimer: ReturnType<typeof setTimeout> | undefined;
  const runId: Id<"runs"> = await Promise.race([
    convex().mutation(api.runs.create, {
      mode: body.mode, profileId: body.profileId, question: body.question, region: body.region, llm: opts.llm ?? !!llm(),
    }),
    new Promise<never>((_, reject) => { createTimer = setTimeout(() => reject(new Error(`runs.create timed out after ${CREATE_TIMEOUT_MS}ms`)), CREATE_TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(createTimer));
  const ctl = new AbortController();
  activeRuns.set(runId, ctl);

  let seq = 0;
  let buf: { seq: number; event: unknown }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let sawEnd = false;

  const flush = () => {
    timer = null;
    if (!buf.length) return chain;
    const batch = buf;
    buf = [];
    // Chained so batches land in order even if one mutation is slow.
    chain = chain.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await convex().mutation(api.events.append, { runId, events: batch }); return; }
        catch (e) { if (attempt === 2) console.error("[convex] append failed", (e as Error).message); else await new Promise((r) => setTimeout(r, 200)); }
      }
    });
    return chain;
  };
  const emit = (e: RunEvent) => {
    if (sawEnd) return;
    // The orchestrator mints its own id; the shared id is the Convex row id.
    const ev = e.type === "run_started" ? { ...e, runId } : e;
    if (ev.type === "run_done" || ev.type === "error") sawEnd = true;
    buf.push({ seq: seq++, event: ev });
    timer ??= setTimeout(flush, FLUSH_MS);
  };

  // /api/run/stop may land on a different serverless instance than this one, so it sets
  // runs.stopRequested and we poll it (the local activeRuns map still covers same-process stops).
  const stopPoll = setInterval(() => {
    convex().query(api.runs.stopRequested, { runId })
      .then((stop) => { if (stop) ctl.abort(); })
      .catch(() => { /* transient; next tick retries */ });
  }, STOP_POLL_MS);

  const t0 = Date.now();
  const work = (async () => {
    try {
      await runOrchestrator(body, emit, ctl.signal, opts);
    } catch (e) {
      emit({ type: "error", message: (e as Error).message });
    } finally {
      // Stopped runs end cleanly for every viewer.
      clearInterval(stopPoll);
      if (!sawEnd) emit({ type: "run_done", durationMs: Date.now() - t0 });
      if (timer) clearTimeout(timer);
      await flush();
      activeRuns.delete(runId);
    }
  })();
  background(work);

  return runId;
}

/** Stops a run whichever instance is executing it: aborts locally if it's ours, and flags the run row. */
export async function stopConvexRun(runId: string): Promise<boolean> {
  const ctl = activeRuns.get(runId);
  ctl?.abort();
  if (!convexUrl()) return !!ctl;
  try { return (await convex().mutation(api.runs.requestStop, { runId })) || !!ctl; }
  catch (e) { console.error("[convex] requestStop failed", (e as Error).message); return !!ctl; }
}
