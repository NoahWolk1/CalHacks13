// Convex mode for /api/run: the orchestrator's RunEvents are persisted to Convex (batched every
// ~100ms, strictly ordered by seq) and every client watching the run subscribes reactively.
// Only used when NEXT_PUBLIC_CONVEX_URL / CONVEX_URL is set; otherwise /api/run streams SSE.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { RunEvent, RunRequest } from "@/lib/types";
import { runOrchestrator } from "@/lib/orchestrator/run";
import { llm } from "@/lib/llm";

export const convexUrl = () => process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "";

let client: ConvexHttpClient | null = null;
const convex = () => (client ??= new ConvexHttpClient(convexUrl()));

// Survives Next's per-route module instances so /api/run/stop can reach the same map.
const g = globalThis as unknown as { __geoswarmRuns?: Map<string, AbortController> };
export const activeRuns = (g.__geoswarmRuns ??= new Map());

const FLUSH_MS = 100;

/** Creates the run row, starts the orchestrator in the background, and returns the Convex run id. */
export async function startConvexRun(body: RunRequest): Promise<string> {
  const runId: Id<"runs"> = await convex().mutation(api.runs.create, {
    mode: body.mode, profileId: body.profileId, question: body.question, region: body.region, llm: !!llm(),
  });
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

  const t0 = Date.now();
  void (async () => {
    try {
      await runOrchestrator(body, emit, ctl.signal);
    } catch (e) {
      emit({ type: "error", message: (e as Error).message });
    } finally {
      // Stopped runs end cleanly for every viewer.
      if (!sawEnd) emit({ type: "run_done", durationMs: Date.now() - t0 });
      if (timer) clearTimeout(timer);
      await flush();
      activeRuns.delete(runId);
    }
  })();

  return runId;
}
