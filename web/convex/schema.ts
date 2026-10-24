// Convex is GeoSwarm's live shared mission state. The orchestrator (Next.js server) writes
// every RunEvent here; any browser holding the run id subscribes and replays them.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  runs: defineTable({
    mode: v.string(), // "ask" | "insights"
    profileId: v.string(),
    question: v.optional(v.string()),
    region: v.any(), // Region (GeoJSON polygon + bbox)
    label: v.optional(v.string()),
    status: v.union(v.literal("running"), v.literal("done"), v.literal("error")),
    startedAt: v.number(),
    durationMs: v.optional(v.number()),
    llm: v.boolean(),
    findingCount: v.optional(v.number()),
    insightCount: v.optional(v.number()),
    error: v.optional(v.string()),
  }).index("by_startedAt", ["startedAt"]),

  // Append-only event log per run; seq is assigned by the server in emit order.
  events: defineTable({
    runId: v.id("runs"),
    seq: v.number(),
    type: v.string(),
    event: v.any(), // RunEvent
  }).index("by_run_seq", ["runId", "seq"]),

  // Denormalized findings so they can be queried directly (by run, by agent, by category).
  findings: defineTable({
    runId: v.id("runs"),
    findingId: v.string(),
    workerId: v.string(),
    category: v.string(),
    claim: v.string(),
    confidence: v.number(),
    severity: v.optional(v.number()),
    sourceType: v.string(),
    sourceUrl: v.optional(v.string()),
    geometry: v.any(),
  })
    .index("by_run", ["runId"])
    .index("by_run_worker", ["runId", "workerId"])
    .index("by_run_category", ["runId", "category"]),
});
