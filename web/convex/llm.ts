// Hourly caps on Claude-powered runs, shared across every serverless instance.
// reserve() is a Convex mutation, so check + record is one serializable transaction.
import { mutation } from "./_generated/server";
import { v } from "convex/values";

const WINDOW_MS = 60 * 60 * 1000;
const PRUNE_PER_CALL = 50;

export const reserve = mutation({
  args: { ipHash: v.string(), perIp: v.number(), global: v.number() },
  handler: async (ctx, { ipHash, perIp, global }) => {
    const now = Date.now();
    const since = now - WINDOW_MS;

    // Opportunistic cleanup of rows that have aged out of the window.
    const old = await ctx.db.query("llmUsage").withIndex("by_at", (q) => q.lt("at", since)).take(PRUNE_PER_CALL);
    for (const r of old) await ctx.db.delete(r._id);

    const globalUsed = (await ctx.db.query("llmUsage").withIndex("by_at", (q) => q.gte("at", since)).take(global)).length;
    if (globalUsed >= global) return { allowed: false, reason: "global" as const };
    const ipUsed = (await ctx.db.query("llmUsage").withIndex("by_ip_at", (q) => q.eq("ipHash", ipHash).gte("at", since)).take(perIp)).length;
    if (ipUsed >= perIp) return { allowed: false, reason: "ip" as const };

    await ctx.db.insert("llmUsage", { ipHash, at: now });
    return { allowed: true };
  },
});
