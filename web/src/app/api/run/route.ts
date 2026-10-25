import { after } from "next/server";
import type { RunEvent, RunRequest } from "@/lib/types";
import { runOrchestrator } from "@/lib/orchestrator/run";
import { liveStore, startLiveRun } from "@/lib/server/liveRun";
import { decideLlm } from "@/lib/server/llmQuota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Hobby max (Fluid compute); Pro allows up to 800

// POST a RunRequest.
// - Live backend (SpacetimeDB, or Convex fallback): returns {runId} immediately; events are written
//   to the backend and every client subscribes. See src/lib/server/liveRun.ts.
// - Otherwise: text/event-stream of RunEvents (SSE fallback).
export async function POST(req: Request) {
  const body = (await req.json()) as RunRequest;
  // Hourly Claude caps (per IP + global); over the cap the run proceeds in heuristic mode.
  const store = liveStore();
  const decision = await decideLlm(req, store);
  const opts = { llm: decision.llm, quotaLimited: decision.limited };

  if (store) {
    try {
      // after(): on Vercel the orchestrator keeps running after the response (waitUntil); locally a no-op wrapper.
      return Response.json({ runId: await startLiveRun(store, body, (work) => after(work), opts), backend: store.name });
    } catch (e) {
      console.error(`[${store.name}] could not start run, falling back to SSE:`, (e as Error).message);
    }
  }

  const ctl = new AbortController();
  req.signal.addEventListener("abort", () => ctl.abort());
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: RunEvent) => {
        if (ctl.signal.aborted) return;
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ }
      };
      try {
        await runOrchestrator(body, send, ctl.signal, opts);
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        try { controller.close(); } catch { /* closed */ }
      }
    },
    cancel() { ctl.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
