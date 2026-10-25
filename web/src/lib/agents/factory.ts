// Agent creation: one path for both the Agent Hub (prompt-to-create) and agents spawning agents mid-run.
//
//   draftAgent(spec)  → one Claude call that either reuses a library agent (guardrail: check the library
//                       first) or drafts a new AgentConfig. Nothing is registered.
//   requestSpawn(...) → guardrails (depth, per-run cap), then draftAgent; a new agent is registered as
//                       temporary and returned for the orchestrator to dispatch immediately.
//
// Generated agents can only use the fixed tool primitives of ./runtime.ts (README §3c).

import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { AgentConfig, ToolPrimitive, Worker } from "@/lib/types";
import { llm, MODEL, FALLBACK } from "@/lib/llm";
import { registry as defaultRegistry, type Registry } from "./registry";
import { HEX_COLOR, LIMITS, VEHICLES } from "./library";

export interface AgentSpec {
  /** Plain-English description, e.g. "scrape the listings at <url> and pin each address". */
  prompt: string;
  createdBy: string; // "user" or parent agent id
  depth: number;
  /** Advanced create (Agent Hub): requirements the user spelled out. Set fields override the generator. */
  advanced?: AdvancedSpec;
}

export const GEN_TOOLS = ["search", "scrape", "http_get"] as const;

export const AdvancedSpecSchema = z.object({
  name: z.string().max(LIMITS.name).optional(),
  coverage: z.string().max(80).optional(),
  /** Sources, URLs or API endpoints the agent must use, one per entry. */
  dataSources: z.array(z.string().max(300)).max(8).optional(),
  /** Restrict the agent to these tools (geocode/llm are always on). Empty or missing: generator picks. */
  tools: z.array(z.enum(GEN_TOOLS)).optional(),
  /** What makes a finding worth pinning, and what to skip. */
  criteria: z.string().max(1000).optional(),
  /** What each finding should report (fields, units, dates). */
  output: z.string().max(1000).optional(),
  /** Anything else: constraints, rate limits, examples. */
  notes: z.string().max(1000).optional(),
  vehicle: z.enum(VEHICLES).optional(),
  color: z.string().regex(HEX_COLOR).optional(),
  /** Skip the library check and always draft a new agent. */
  forceNew: z.boolean().optional(),
});
export type AdvancedSpec = z.infer<typeof AdvancedSpecSchema>;

/** The user's advanced requirements as a block the generator reads after the request. */
export function requirementsText(a: AdvancedSpec | undefined) {
  if (!a) return "";
  const lines = [
    a.name?.trim() && `Name: ${a.name.trim()}`,
    a.coverage?.trim() && `Coverage: ${a.coverage.trim()}`,
    a.dataSources?.length && `Must use these sources (list them first in data_sources and name them in the prompt):\n${a.dataSources.map((d) => `  - ${d}`).join("\n")}`,
    a.tools?.length && `Allowed tools (use only these): ${a.tools.join(", ")}`,
    a.criteria?.trim() && `What makes a finding notable / what to skip:\n${a.criteria.trim()}`,
    a.output?.trim() && `Each finding should report:\n${a.output.trim()}`,
    a.notes?.trim() && `Other instructions:\n${a.notes.trim()}`,
    a.forceNew && "Always create a new agent; do not reuse.",
  ].filter(Boolean);
  return lines.length ? `\n\nUser requirements (follow exactly; fold them into the prompt brief):\n${lines.join("\n")}` : "";
}

export const SPAWN_LIMITS = { maxDepth: 2, maxPerRun: 4 };

const PALETTE = ["#e879f9", "#c084fc", "#fb923c", "#facc15", "#a3e635", "#2dd4bf", "#60a5fa", "#f87171"];

const GeneratedSchema = z.object({
  decision: z.enum(["reuse", "create"]),
  reuse_id: z.string(),
  name: z.string(),
  description: z.string(),
  tools: z.array(z.enum(GEN_TOOLS)),
  data_sources: z.array(z.string()),
  coverage: z.string(),
  vehicle: z.enum(VEHICLES),
  color: z.string(),
  prompt: z.string(),
});
export type Generated = z.infer<typeof GeneratedSchema>;

/** roster: one line per existing agent. Returns null when there is no LLM. */
export type Generate = (request: string, roster: string) => Promise<Generated | null>;

export interface FactoryDeps { registry: Registry; generate: Generate }

const llmGenerate: Generate = async (request, roster) => {
  const client = llm();
  if (!client) return null;
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(GeneratedSchema) },
    ...FALLBACK,
    system:
      "You design worker agents for a geospatial research system. A worker researches one kind of data about a map area and reports " +
      "mappable findings with sources. Given a request and the existing library, decide:\n" +
      '- "reuse": an existing agent already covers the request. Put its exact id in reuse_id (fill the other fields with empty values).\n' +
      '- "create": nothing fits. Leave reuse_id empty and design a new worker:\n' +
      "  name: 2-3 words, evocative (e.g. \"Inspection Scout\"). description: one line saying what data it gathers; the orchestrator reads it to decide relevance.\n" +
      "  tools: the subset it needs of search (web search), scrape (read a web page), http_get (call a public JSON API).\n" +
      "  data_sources: the specific public sources it should use (e.g. \"DataSF Restaurant Scores (Socrata API)\"). Prefer official open-data APIs that are free and need no key.\n" +
      "  coverage: where it works (\"San Francisco\", \"US\", \"Global\"). vehicle: drone, car, rover, satellite or boat (purely visual). color: a hex like #e879f9.\n" +
      "  prompt: the agent's brief, 3-6 sentences: what to find, which sources/endpoints to try first, how to filter to the area, and what makes a finding notable.",
    messages: [{ role: "user", content: `Request: ${request}\n\nExisting agents (id | name | coverage | description):\n${roster}` }],
  });
  if (!res.parsed_output) throw new Error(`agent generator returned no parse (${res.stop_reason})`);
  return res.parsed_output;
};

const defaultDeps = (): FactoryDeps => ({ registry: defaultRegistry, generate: llmGenerate });

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "agent";

function freshId(name: string, registry: Registry) {
  const base = `custom-${slug(name)}`;
  let id = base;
  for (let n = 2; registry.getWorker(id); n++) id = `${base}-${n}`;
  return id;
}

export type Draft = { kind: "reuse"; worker: Worker } | { kind: "new"; config: AgentConfig };

export async function draftAgent(spec: AgentSpec, deps: FactoryDeps = defaultDeps()): Promise<Draft | null> {
  const { registry, generate } = deps;
  const roster = registry.allWorkers().map((w) => `- ${w.id} | ${w.name} | ${w.coverage} | ${w.description}`).join("\n");
  const adv = spec.advanced ?? {};
  const g = await generate(spec.prompt + requirementsText(spec.advanced), roster);
  if (!g) return null;

  const existing = g.decision === "reuse" && !adv.forceNew ? registry.getWorker(g.reuse_id) : undefined;
  if (existing) return { kind: "reuse", worker: existing };

  const name = (adv.name?.trim() || g.name.trim()).slice(0, LIMITS.name) || "Custom Agent";
  const picked = adv.tools?.length ? adv.tools : g.tools;
  const tools: ToolPrimitive[] = [...new Set<ToolPrimitive>([...picked, "geocode", "llm"])];
  const userSources = (adv.dataSources ?? []).map((d) => d.trim()).filter(Boolean);
  const color = adv.color ?? g.color;
  return {
    kind: "new",
    config: {
      id: freshId(name, registry),
      name,
      description: g.description.trim().slice(0, LIMITS.description) || spec.prompt.slice(0, LIMITS.description),
      vehicle: adv.vehicle ?? g.vehicle,
      color: HEX_COLOR.test(color) ? color : PALETTE[name.length % PALETTE.length],
      tools,
      dataSources: [...new Set([...userSources, ...g.data_sources])].slice(0, Math.max(5, userSources.length)),
      coverage: adv.coverage?.trim() || g.coverage || "Global",
      builtin: false,
      prompt: g.prompt.trim() || spec.prompt,
      createdBy: spec.createdBy,
    },
  };
}

/** Mid-run spawn. Null when a guardrail says no, there's no LLM, or generation fails. */
export async function requestSpawn(spec: AgentSpec, spawnedSoFar: number, deps: FactoryDeps = defaultDeps()): Promise<{ worker: Worker; reused: boolean } | null> {
  if (spec.depth > SPAWN_LIMITS.maxDepth || spawnedSoFar >= SPAWN_LIMITS.maxPerRun) return null;
  const draft = await draftAgent(spec, deps);
  if (!draft) return null;
  if (draft.kind === "reuse") return { worker: draft.worker, reused: true };
  return { worker: deps.registry.registerTemporary(draft.config), reused: false };
}
