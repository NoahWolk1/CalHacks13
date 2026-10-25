import { after } from "next/server";
import type { RunEvent, RunRequest } from "@/lib/types";
import { runOrchestrator } from "@/lib/orchestrator/run";
import { convexUrl, startConvexRun } from "@/lib/server/convexRun";
import { decideLlm } from "@/lib/server/llmQuota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Hobby max (Fluid compute); Pro allows up to 800

// POST a RunRequest.
// - Convex configured: returns {runId} immediately; events are written to Convex and clients subscribe.
// - Otherwise: text/event-stream of RunEvents (SSE fallback).
export async function POST(req: Request) {
  const body = (await req.json()) as RunRequest;
  // Hourly Claude caps (per IP + global); over the cap the run proceeds in heuristic mode.
  const decision = await decideLlm(req, convexUrl());
  const opts = { llm: decision.llm, quotaLimited: decision.limited };

  if (convexUrl()) {
    try {
      // after(): on Vercel the orchestrator keeps running after the response (waitUntil); locally a no-op wrapper.
      return Response.json({ runId: await startConvexRun(body, (work) => after(work), opts) });
    } catch (e) {
      console.error("[convex] could not start run, falling back to SSE:", (e as Error).message);
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
