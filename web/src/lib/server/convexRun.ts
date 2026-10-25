// Convex backend for the live mission state (fallback; SpacetimeDB is primary, see liveRun.ts).
// Used when LIVE_BACKEND=convex, or when SpacetimeDB isn't configured and NEXT_PUBLIC_CONVEX_URL is.
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { LiveStore } from "./liveRun";

export const convexUrl = () => process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "";

let client: ConvexHttpClient | null = null;
const convex = () => (client ??= new ConvexHttpClient(convexUrl()));

export const convexStore: LiveStore = {
  name: "convex",
  create: (body, llm) =>
    convex().mutation(api.runs.create, { mode: body.mode, profileId: body.profileId ?? "auto", question: body.question, region: body.region, llm }),
  append: async (runId, events) => { await convex().mutation(api.events.append, { runId: runId as Id<"runs">, events }); },
  stopRequested: (runId) => convex().query(api.runs.stopRequested, { runId: runId as Id<"runs"> }),
  requestStop: (runId) => convex().mutation(api.runs.requestStop, { runId }),
  reserveLlm: async (ipHash, perIp, global) => (await convex().mutation(api.llm.reserve, { ipHash, perIp, global })).allowed,
};
