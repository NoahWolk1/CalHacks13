import type { RunEvent, RunRequest } from "@/lib/types";
import { runOrchestrator } from "@/lib/orchestrator/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST a RunRequest → text/event-stream of RunEvents.
export async function POST(req: Request) {
  const body = (await req.json()) as RunRequest;
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
        await runOrchestrator(body, send, ctl.signal);
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        try { controller.close(); } catch { /* closed */ }
      }
    },
    cancel() { ctl.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
