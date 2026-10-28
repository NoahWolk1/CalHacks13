import { runVetting } from "@/lib/sky/vetReport";
import { parseVetInput, type VetStreamEvent } from "@/lib/sky/vetShared";
import { validTic, vetStore } from "@/lib/sky/vetStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // vetting's budget is 200 s (vetReport.ts)

/** Each run downloads up to 18 light curves: a few at a time per instance. */
const MAX_RUNNING = Number(process.env.SKY_VET_MAX_RUNNING) || 4;
let running = 0;

// GET ?tic=1,2,3: saved reports on those stars ({vets: SavedVet[]}); the browser matches them to finds.
export async function GET(req: Request) {
  const tics = (new URL(req.url).searchParams.get("tic") ?? "").split(",").map((t) => t.trim()).filter(validTic).slice(0, 50);
  if (!tics.length) return Response.json({ error: "?tic=<TIC ids, comma-separated>" }, { status: 400 });
  try {
    return Response.json({ vets: await vetStore().byTic(tics) });
  } catch (e) {
    return Response.json({ vets: [], error: (e as Error).message.slice(0, 160) }, { status: 502 });
  }
}

// POST VetInput (+ force?: true to continue past a failed Stage 0 gate). Streams NDJSON
// VetStreamEvents: "progress", one "check" per check as it's decided, "events" (the individual-
// transit table), then "report" with the tier and everything above, then "saved" once the report is
// stored (a failed save is logged and never fails the run).
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const input = parseVetInput(body);
  if (!input) return Response.json({ error: "body must be a transit find: {tic, ra, dec, kind, duration, depth, period+t0 | times}" }, { status: 400 });
  if (running >= MAX_RUNNING) return Response.json({ error: "Several vetting runs are in progress; try again in a minute." }, { status: 429 });
  running++;
  const ctl = new AbortController();
  req.signal.addEventListener("abort", () => ctl.abort());
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: VetStreamEvent) => { if (!ctl.signal.aborted) try { controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* closed */ } };
      try {
        let report: Extract<VetStreamEvent, { type: "report" }>["report"] | null = null;
        await runVetting(input, ctl.signal, (e) => { if (e.type === "report") report = e.report; send(e); }, { force: (body as { force?: unknown }).force === true });
        if (report) {
          try { send({ type: "saved", saved: await vetStore().save(report) }); }
          catch (e) { console.warn("[sky] saving the vet report failed:", (e as Error).message); }
        }
      } catch (e) {
        console.warn("[sky] vetting failed:", (e as Error).message);
        send({ type: "error", message: `Vetting failed: ${(e as Error).message.slice(0, 160)}` });
      } finally {
        running--;
        try { controller.close(); } catch { /* closed */ }
      }
    },
    cancel() { ctl.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
