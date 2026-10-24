import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    mode: v.string(),
    profileId: v.string(),
    question: v.optional(v.string()),
    region: v.any(),
    llm: v.boolean(),
  },
  handler: async (ctx, args) =>
    ctx.db.insert("runs", { ...args, label: args.region?.label, status: "running", startedAt: Date.now() }),
});

export const finish = mutation({
  args: {
    runId: v.id("runs"),
    status: v.union(v.literal("done"), v.literal("error")),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { runId, ...rest }) => {
    const run = await ctx.db.get(runId);
    if (!run || run.status !== "running") return;
    await ctx.db.patch(runId, rest);
  },
});

/** Accepts any string (e.g. straight from a ?run= URL) and returns null for unknown ids. */
export const get = query({
  args: { runId: v.string() },
  handler: async (ctx, { runId }) => {
    const id = ctx.db.normalizeId("runs", runId);
    return id ? ctx.db.get(id) : null;
  },
});

/** Last N missions, newest first (history list). Region omitted to keep the payload small. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const runs = await ctx.db.query("runs").withIndex("by_startedAt").order("desc").take(Math.min(limit ?? 10, 50));
    return runs.map(({ region, ...r }) => ({ ...r, center: region?.center as [number, number] | undefined }));
  },
});
