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
}

export const SPAWN_LIMITS = { maxDepth: 2, maxPerRun: 4 };

const PALETTE = ["#e879f9", "#c084fc", "#fb923c", "#facc15", "#a3e635", "#2dd4bf", "#60a5fa", "#f87171"];

const GeneratedSchema = z.object({
  decision: z.enum(["reuse", "create"]),
  reuse_id: z.string(),
  name: z.string(),
  description: z.string(),
  tools: z.array(z.enum(["search", "scrape", "http_get"])),
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
  const g = await generate(spec.prompt, roster);
  if (!g) return null;

  const existing = g.decision === "reuse" ? registry.getWorker(g.reuse_id) : undefined;
  if (existing) return { kind: "reuse", worker: existing };

  const name = g.name.trim().slice(0, LIMITS.name) || "Custom Agent";
  const tools: ToolPrimitive[] = [...new Set<ToolPrimitive>([...g.tools, "geocode", "llm"])];
  return {
    kind: "new",
    config: {
      id: freshId(name, registry),
      name,
      description: g.description.trim().slice(0, LIMITS.description) || spec.prompt.slice(0, LIMITS.description),
      vehicle: g.vehicle,
      color: HEX_COLOR.test(g.color) ? g.color : PALETTE[name.length % PALETTE.length],
      tools,
      dataSources: g.data_sources.slice(0, 5),
      coverage: g.coverage || "Global",
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
