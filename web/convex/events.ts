import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Batch-append RunEvents (the server flushes every ~100ms). Also maintains run summary + findings table. */
export const append = mutation({
  args: { runId: v.id("runs"), events: v.array(v.object({ seq: v.number(), event: v.any() })) },
  handler: async (ctx, { runId, events }) => {
    const run = await ctx.db.get(runId);
    if (!run) throw new Error("unknown run");
    let findingCount = run.findingCount ?? 0;
    let insightCount = run.insightCount ?? 0;
    const patch: Record<string, unknown> = {};
    for (const { seq, event } of events) {
      await ctx.db.insert("events", { runId, seq, type: String(event?.type ?? "unknown"), event });
      switch (event?.type) {
        case "region_labeled":
          patch.label = event.label;
          break;
        case "routed": // an "auto" run row takes the profile the orchestrator routed to
          patch.profileId = event.profileId;
          break;
        case "finding": {
          const f = event.finding;
          findingCount++;
          await ctx.db.insert("findings", {
            runId, findingId: f.id, workerId: f.worker_id, category: f.category, claim: f.claim,
            confidence: f.confidence, severity: f.severity, sourceType: f.source_type, sourceUrl: f.source_url, geometry: f.geometry,
          });
          break;
        }
        case "insight":
          insightCount++;
          break;
        case "run_done":
          patch.status = "done";
          patch.durationMs = event.durationMs;
          break;
        case "error":
          patch.status = "error";
          patch.error = event.message;
          break;
      }
    }
    await ctx.db.patch(runId, { ...patch, findingCount, insightCount });
  },
});

/** Events after a given seq, in order. Clients subscribe with a reactive useQuery. */
export const since = query({
  args: { runId: v.string(), afterSeq: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const runId = ctx.db.normalizeId("runs", args.runId);
    if (!runId) return [];
    const afterSeq = args.afterSeq;
    const rows = await ctx.db
      .query("events")
      .withIndex("by_run_seq", (q) => q.eq("runId", runId).gt("seq", afterSeq ?? -1))
      .order("asc")
      .take(2000);
    return rows.map((r) => ({ seq: r.seq, event: r.event }));
  },
});
