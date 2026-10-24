import { query } from "./_generated/server";
import { v } from "convex/values";

/** Findings for a run, optionally narrowed to one agent or category. */
export const byRun = query({
  args: { runId: v.id("runs"), workerId: v.optional(v.string()), category: v.optional(v.string()) },
  handler: async (ctx, { runId, workerId, category }) => {
    if (workerId) return ctx.db.query("findings").withIndex("by_run_worker", (q) => q.eq("runId", runId).eq("workerId", workerId)).collect();
    if (category) return ctx.db.query("findings").withIndex("by_run_category", (q) => q.eq("runId", runId).eq("category", category)).collect();
    return ctx.db.query("findings").withIndex("by_run", (q) => q.eq("runId", runId)).collect();
  },
});

/** Finding counts per agent for a run ("who found what"). */
export const countsByAgent = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const rows = await ctx.db.query("findings").withIndex("by_run", (q) => q.eq("runId", runId)).collect();
    const out: Record<string, number> = {};
    for (const r of rows) out[r.workerId] = (out[r.workerId] ?? 0) + 1;
    return out;
  },
});
