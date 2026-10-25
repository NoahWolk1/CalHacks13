// Live shared mission state for /api/run. The orchestrator's RunEvents are persisted to a live
// backend (batched every ~100ms, strictly ordered by seq) and every client watching the run
// subscribes. Backends: SpacetimeDB (primary, spacetimeRun.ts) or Convex (fallback, convexRun.ts).
// With neither configured (or LIVE_BACKEND=sse), /api/run streams SSE instead.
//
// Env: LIVE_BACKEND (or NEXT_PUBLIC_LIVE_BACKEND) = spacetime | convex | sse. Default: spacetime if
// SPACETIME_DB + SPACETIME_TOKEN are set, else convex if NEXT_PUBLIC_CONVEX_URL, else sse.
import type { RunEvent, RunRequest } from "@/lib/types";
import { runOrchestrator, type RunOptions } from "@/lib/orchestrator/run";
import { llm } from "@/lib/llm";
import { convexStore, convexUrl } from "./convexRun";
import { spacetimeConfig, spacetimeStore } from "./spacetimeRun";

export type LiveBackendName = "spacetime" | "convex" | "sse";

/** What a live backend must provide; both implementations mirror the same semantics. */
export interface LiveStore {
  name: Exclude<LiveBackendName, "sse">;
  /** Creates the run row (status running) and returns the shared run id. */
  create(body: RunRequest, llm: boolean): Promise<string>;
  /** Appends a contiguous, seq-ordered batch; retries of already-stored seqs must be no-ops. */
  append(runId: string, batch: { seq: number; event: RunEvent }[]): Promise<void>;
  stopRequested(runId: string): Promise<boolean>;
  /** Flags the run for stop; false if it is unknown or no longer running. */
  requestStop(runId: string): Promise<boolean>;
  /** Atomic per-IP + global hourly cap check-and-record. */
  reserveLlm(ipHash: string, perIp: number, global: number): Promise<boolean>;
}

export function liveBackend(): LiveBackendName {
  const want = (process.env.LIVE_BACKEND || process.env.NEXT_PUBLIC_LIVE_BACKEND || "").toLowerCase();
  const st = !!spacetimeConfig();
  const cv = !!convexUrl();
  if (want === "sse") return "sse";
  if (want === "spacetime") return st ? "spacetime" : "sse";
  if (want === "convex") return cv ? "convex" : "sse";
  return st ? "spacetime" : cv ? "convex" : "sse";
}

export function liveStore(): LiveStore | null {
  const b = liveBackend();
  return b === "spacetime" ? spacetimeStore : b === "convex" ? convexStore : null;
}

/** Public (non-secret) config the browser needs to subscribe; served by /api/agents. */
export function liveClientConfig() {
  const backend = liveBackend();
  const st = spacetimeConfig();
  return { backend, ...(backend === "spacetime" && st ? { spacetime: { host: st.host, db: st.db } } : {}) };
}

// Survives Next's per-route module instances so /api/run/stop can reach the same map.
const g = globalThis as unknown as { __geoswarmRuns?: Map<string, AbortController> };
export const activeRuns = (g.__geoswarmRuns ??= new Map());

const FLUSH_MS = 100;
const CREATE_TIMEOUT_MS = 5000;
const STOP_POLL_MS = 1500;

/**
 * Creates the run row, starts the orchestrator in the background, and returns the shared run id.
 * `background` receives the work promise: the route hands it to `after()` so Vercel keeps the
 * function alive (up to maxDuration) after the {runId} response is sent.
 */
export async function startLiveRun(store: LiveStore, body: RunRequest, background: (work: Promise<void>) => void = () => {}, opts: RunOptions = {}): Promise<string> {
  // Bounded so a hung (not just down) backend still falls back to SSE quickly.
  let createTimer: ReturnType<typeof setTimeout> | undefined;
  const runId = await Promise.race([
    store.create(body, opts.llm ?? !!llm()),
    new Promise<never>((_, reject) => { createTimer = setTimeout(() => reject(new Error(`create run timed out after ${CREATE_TIMEOUT_MS}ms`)), CREATE_TIMEOUT_MS); }),
  ]).finally(() => clearTimeout(createTimer));
  const ctl = new AbortController();
  activeRuns.set(runId, ctl);

  let seq = 0;
  let buf: { seq: number; event: RunEvent }[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let sawEnd = false;

  const flush = () => {
    timer = null;
    if (!buf.length) return chain;
    const batch = buf;
    buf = [];
    // Chained so batches land in order even if one write is slow.
    chain = chain.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await store.append(runId, batch); return; }
        catch (e) { if (attempt === 2) console.error(`[${store.name}] append failed`, (e as Error).message); else await new Promise((r) => setTimeout(r, 200)); }
      }
    });
    return chain;
  };
  const emit = (e: RunEvent) => {
    if (sawEnd) return;
    // The orchestrator mints its own id; the shared id is the backend's run id.
    const ev = e.type === "run_started" ? { ...e, runId } : e;
    if (ev.type === "run_done" || ev.type === "error") sawEnd = true;
    buf.push({ seq: seq++, event: ev });
    timer ??= setTimeout(flush, FLUSH_MS);
  };

  // /api/run/stop may land on a different serverless instance than this one, so it flags the run
  // row and we poll it (the local activeRuns map still covers same-process stops).
  const stopPoll = setInterval(() => {
    store.stopRequested(runId)
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
export async function stopLiveRun(runId: string): Promise<boolean> {
  const ctl = activeRuns.get(runId);
  ctl?.abort();
  const store = liveStore();
  if (!store) return !!ctl;
  try { return (await store.requestStop(runId)) || !!ctl; }
  catch (e) { console.error(`[${store.name}] requestStop failed`, (e as Error).message); return !!ctl; }
}
