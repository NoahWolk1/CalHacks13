import { randomBytes } from "node:crypto";
import { formatDec, formatRa, parseCone } from "@/lib/sky/geom";
import { missionRecorder, missionStore } from "@/lib/sky/missionStore";
import { runSkyAgents } from "@/lib/sky/run";
import { runAnalysis } from "@/lib/sky/analysis";
import { settledMast } from "@/lib/sky/telescopes";
import { cleanQuestion, skySummary } from "@/lib/sky/summary";
import { skyObserver } from "@/lib/sky/observer";
import type { MissionMeta, SkyAnalysis, SkyEvent, SkyObject } from "@/lib/sky/types";
import { liveStore } from "@/lib/server/liveRun";
import { decideLlm } from "@/lib/server/llmQuota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // the discovery pipeline's budget is 150 s (analysis.ts), plus summary

// POST {ra, dec, radius, question?} (degrees; an optional question turns the summary into a cited answer). Streams NDJSON SkyEvents: "results" as soon as every sky agent
// has answered (or failed); meanwhile the light-curve analysis agents stream "analysis-start" /
// "analysis-star" and finish with "analysis"; "archive" if MAST's cold full-archive search landed in
// the meantime; then "summary" (null without a key or over the hourly Claude cap), which covers it all.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const cone = parseCone(body);
  const question = cleanQuestion((body as { question?: unknown } | null)?.question);
  if (!cone) return Response.json({ error: "body must be {ra, dec, radius} in degrees" }, { status: 400 });

  const rawLabel = (body as { label?: unknown } | null)?.label;
  const label = typeof rawLabel === "string" && rawLabel.trim() ? rawLabel.trim().slice(0, 60) : `${formatRa(cone.ra)} ${formatDec(cone.dec)}, r ${+cone.radius.toFixed(3)}°`;

  const ctl = new AbortController();
  req.signal.addEventListener("abort", () => ctl.abort());
  const enc = new TextEncoder();
  const t0 = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const write = (e: SkyEvent) => {
        if (ctl.signal.aborted) return;
        try { controller.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* closed */ }
      };
      // Mission: the run is recorded as it streams, so /space?mission=<id> can follow or replay it.
      // Recording is best effort: a store that's down leaves the run unrecorded, not failed.
      const store = missionStore();
      const meta: MissionMeta = { id: randomBytes(9).toString("base64url"), cone, ...(question ? { question } : {}), label, createdAt: t0, updatedAt: t0, status: "running" };
      const recorder = await Promise.race([store.create(meta).then(() => missionRecorder(store, meta)), new Promise<null>((r) => setTimeout(() => r(null), 5_000))])
        .catch((e: Error) => { console.warn("[space] mission not recorded:", e.message); return null; });
      let failed = false;
      const send = (e: SkyEvent) => { if (e.type === "error") failed = true; recorder?.push(e); write(e); };
      if (recorder) write({ type: "mission", id: meta.id, ms: Date.now() - t0 });
      try {
        // Same hourly Claude caps as /api/run (per IP + global), decided up front: the Strategist plans
        // with Claude while the catalog agents are still answering.
        const deciding = decideLlm(req, liveStore());
        // Light-curve analysis runs alongside the catalog agents (it shares their TESS inventory lookup).
        const analysing: Promise<SkyAnalysis | null> = runAnalysis(cone, ctl.signal, send, t0, deciding.then((d) => d.llm, () => false))
          .then((analysis) => { send({ type: "analysis", analysis, ms: Date.now() - t0 }); return analysis; })
          .catch((e: Error) => {
            console.warn("[sky] analysis failed:", e.message);
            send({ type: "analysis", analysis: null, note: `Light-curve analysis failed: ${e.message.slice(0, 160)}`, ms: Date.now() - t0 });
            return null;
          });
        const { objects: found, sources } = await runSkyAgents(cone, ctl.signal);
        send({ type: "results", cone, objects: found, sources, ms: Date.now() - t0 });
        // The Observer starts while the light-curve agents are still working (it only looks at the catalog results).
        const decision = await deciding;
        const observing = found.length && decision.llm
          ? skyObserver(cone, found, ctl.signal)
            .then((observer) => send({ type: "observer", observer, ms: Date.now() - t0 }))
            .catch((e: Error) => {
              console.warn("[sky] observer failed:", e.message);
              send({ type: "observer", observer: null, note: "Observer failed: no visual observations this run.", ms: Date.now() - t0 });
            })
          : Promise.resolve();
        const analysis = await analysing;
        // MAST's full archive summary missed the agent's deadline but may have landed since: stream it.
        let objects: SkyObject[] = found;
        const tele = sources.find((s) => s.source === "telescopes");
        // Missions ESASky already covered (the fallback when MAST is slow) aren't repeated.
        const have = new Set(found.filter((o) => o.source === "telescopes").map((o) => o.name));
        const late = tele?.status !== "ok" || tele.note ? settledMast(cone)?.filter((o) => !have.has(o.name)) ?? null : null;
        if (late?.length) {
          const n = found.filter((o) => o.source === "telescopes").length;
          const extra = late.map((o, i) => ({ ...o, id: `T${n + i + 1}` }));
          objects = [...found, ...extra];
          send({ type: "archive", objects: extra, ms: Date.now() - t0 });
        }
        objects = [...objects, ...(analysis?.objects ?? [])];
        if (!objects.length) {
          send({ type: "summary", summary: null, note: "Nothing found in this region, so there is nothing to summarise.", ms: Date.now() - t0 });
          return;
        }
        const llmOk = decision;
        if (!llmOk.llm) {
          send({ type: "summary", summary: null, note: llmOk.limited ? "Hourly Claude limit reached: showing raw results." : "No Claude key configured: showing raw results.", ms: Date.now() - t0 });
          send({ type: "observer", observer: null, note: llmOk.limited ? "Hourly Claude limit reached: Observer skipped." : "No Claude key configured: Observer skipped.", ms: Date.now() - t0 });
          return;
        }
        try {
          send({ type: "summary", summary: await skySummary(cone, objects, sources, ctl.signal, question, analysis), ms: Date.now() - t0 });
        } catch (e) {
          console.warn("[sky] summary failed:", (e as Error).message);
          send({ type: "summary", summary: null, note: "Claude summary failed: showing raw results.", ms: Date.now() - t0 });
        }
        await observing;
      } catch (e) {
        send({ type: "error", message: (e as Error).message });
      } finally {
        await recorder?.finish(failed ? "error" : ctl.signal.aborted ? "stopped" : "done");
        try { controller.close(); } catch { /* closed */ }
      }
    },
    cancel() { ctl.abort(); },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
