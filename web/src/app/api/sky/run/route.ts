import { parseCone } from "@/lib/sky/geom";
import { runSkyAgents } from "@/lib/sky/run";
import { cleanQuestion, skySummary } from "@/lib/sky/summary";
import { skyObserver } from "@/lib/sky/observer";
import type { SkyEvent } from "@/lib/sky/types";
import { liveStore } from "@/lib/server/liveRun";
import { decideLlm } from "@/lib/server/llmQuota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST {ra, dec, radius, question?} (degrees; an optional question turns the summary into a cited answer). Streams NDJSON SkyEvents: "results" as soon as every sky agent
// has answered (or failed), then "summary" (null without a key or over the hourly Claude cap).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const cone = parseCone(body);
  const question = cleanQuestion((body as { question?: unknown } | null)?.question);
  if (!cone) return Response.json({ error: "body must be {ra, dec, radius} in degrees" }, { status: 400 });

  const ctl = new AbortController();
  req.signal.addEventListener("abort", () => ctl.abort());
  const enc = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: SkyEvent) => {
        if (ctl.signal.aborted) return;
        try { controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* closed */ }
      };
      try {
        const { objects, sources } = await runSkyAgents(cone, ctl.signal);
        send({ type: "results", cone, objects, sources, ms: Date.now() - t0 });
        if (!objects.length) {
          send({ type: "summary", summary: null, note: "Nothing found in this region, so there is nothing to summarise.", ms: Date.now() - t0 });
          return;
        }
        // Same hourly Claude caps as /api/run (per IP + global).
        const decision = await decideLlm(req, liveStore());
        if (!decision.llm) {
          send({ type: "summary", summary: null, note: decision.limited ? "Hourly Claude limit reached: showing raw results." : "No Claude key configured: showing raw results.", ms: Date.now() - t0 });
          send({ type: "observer", observer: null, note: decision.limited ? "Hourly Claude limit reached: Observer skipped." : "No Claude key configured: Observer skipped.", ms: Date.now() - t0 });
          return;
        }
        // Observer agent (Claude vision on a DSS2 cutout) runs alongside the summary, under the same reservation.
        const observing = skyObserver(cone, objects, ctl.signal)
          .then((observer) => send({ type: "observer", observer, ms: Date.now() - t0 }))
          .catch((e: Error) => {
            console.warn("[sky] observer failed:", e.message);
            send({ type: "observer", observer: null, note: "Observer failed: no visual observations this run.", ms: Date.now() - t0 });
          });
        try {
          send({ type: "summary", summary: await skySummary(cone, objects, sources, ctl.signal, question), ms: Date.now() - t0 });
        } catch (e) {
          console.warn("[sky] summary failed:", (e as Error).message);
          send({ type: "summary", summary: null, note: "Claude summary failed: showing raw results.", ms: Date.now() - t0 });
        }
        await observing;
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        try { controller.close(); } catch { /* closed */ }
      }
    },
    cancel() { ctl.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
