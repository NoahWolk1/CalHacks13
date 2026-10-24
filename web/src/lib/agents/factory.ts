// ─────────────────────────────────────────────────────────────────────────────
// AGENT CREATION: owned by a teammate. Intentionally a stub.
//
// Contract the rest of the app relies on:
//   createAgent(spec) → a Worker (AgentConfig + run()) built only from the allowed
//   ToolPrimitives, emitting Findings in the shared schema. Call registerWorker(w)
//   from ./registry so the planner/hub can see it.
//
// The orchestrator already calls requestSpawn() when it detects a capability gap
// (it emits an "agent_gap" event). Once createAgent is implemented, return the new
// Worker from requestSpawn and the orchestrator will dispatch it mid-run and emit
// "agent_spawned" with the parent's id. Guardrails (README §3c) are enforced here.
// ─────────────────────────────────────────────────────────────────────────────

import type { Worker } from "@/lib/types";

export interface AgentSpec {
  /** Plain-English description, e.g. "scrape the listings at <url> and pin each address". */
  prompt: string;
  createdBy: string; // "user" or parent agent id
  depth: number;
}

export const SPAWN_LIMITS = { maxDepth: 2, maxPerRun: 4 };

export async function createAgent(_spec: AgentSpec): Promise<Worker | null> {
  return null; // TODO(teammate): LLM fills an AgentConfig from the prompt + build run() from primitives.
}

export async function requestSpawn(spec: AgentSpec, spawnedSoFar: number): Promise<Worker | null> {
  if (spec.depth > SPAWN_LIMITS.maxDepth || spawnedSoFar >= SPAWN_LIMITS.maxPerRun) return null;
  return createAgent(spec);
}
