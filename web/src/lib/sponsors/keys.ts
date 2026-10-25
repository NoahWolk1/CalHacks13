// Which sponsor-backed workers are usable right now. The planner should leave a worker out of its
// roster while missingEnv(w) is non-empty (the worker itself also logs "needs <KEY>" and returns).

import type { AgentConfig } from "@/lib/types";
import { brightDataMissing } from "./brightdata";
import { apifyToken } from "./apify";

const apify = (...extra: string[]) => () => [!apifyToken() && "APIFY_TOKEN", ...extra.filter((k) => !process.env[k]?.trim())].filter(Boolean) as string[];

const REQUIRES: Record<string, () => string[]> = {
  "apify-reviews": apify(),
  "apify-planning-notices": apify("APIFY_PLANNING_ACTOR"),
  "brightdata-rent": brightDataMissing.unlocker,
  "brightdata-pulse": brightDataMissing.serp,
  // Without a key the census worker only resolves the tract name and emits no finding.
  "census-demographics": () => (process.env.CENSUS_API_KEY?.trim() ? [] : ["CENSUS_API_KEY"]),
};

/** Env vars this agent still needs (empty when it can run). Unknown ids need nothing. */
export const missingEnv = (w: Pick<AgentConfig, "id">): string[] => REQUIRES[w.id]?.() ?? [];

/** Can run with the current env (no missing keys). Planners and survey teams only use these. */
export const hasKeys = (w: Pick<AgentConfig, "id">) => missingEnv(w).length === 0;

export const needsLog = (missing: string[]) => `needs ${missing.join(" + ")} (not set); skipping.`;
