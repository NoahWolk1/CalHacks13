import Anthropic from "@anthropic-ai/sdk";
import { AsyncLocalStorage } from "node:async_hooks";

// Claude powers the orchestrator's plan / cross-reference / synthesis steps.
// Without ANTHROPIC_API_KEY the orchestrator falls back to deterministic heuristics
// so the app still runs end-to-end.
export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
/** Generated agents run many short tool-use turns; Sonnet keeps them fast. */
export const WORKER_MODEL = process.env.CLAUDE_WORKER_MODEL || "claude-sonnet-5-5";
/** Server-side refusal fallback, spread into every beta.messages call. */
export const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

let client: Anthropic | null = null;
export function llm(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  return (client ??= new Anthropic());
}

// Token usage and estimated cost, logged per call ([llm-usage]) and totalled per run ([llm-run]) in the server log.
// $ per million tokens (input, output, cache read); cache writes bill 1.25x input; web search $10 per 1,000.
const PRICES: Record<string, { in: number; out: number; read: number }> = {
  "claude-opus-5-5": { in: 4, out: 20, read: 0.2 },
  "claude-sonnet-5-5": { in: 2, out: 10, read: 0.2 },
};
type Usage = Pick<Anthropic.Beta.Messages.BetaUsage, "input_tokens" | "output_tokens"> & {
  cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number } | null;
};
type Tally = { name: string; calls: number; input: number; output: number; cacheRead: number; cacheWrite: number; searches: number; usd: number };
const runTally = new AsyncLocalStorage<Tally>();

export function logUsage(label: string, model: string, usage: Usage | null | undefined) {
  if (!usage) return;
  const p = PRICES[model];
  const cacheRead = usage.cache_read_input_tokens ?? 0, cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;
  const usd = p ? (usage.input_tokens * p.in + cacheWrite * p.in * 1.25 + cacheRead * p.read + usage.output_tokens * p.out) / 1e6 + searches * 0.01 : NaN;
  console.info(`[llm-usage] ${label} ${model} in=${usage.input_tokens} out=${usage.output_tokens} cache_read=${cacheRead} cache_write=${cacheWrite}${searches ? ` searches=${searches}` : ""} ~$${usd.toFixed(4)}`);
  const t = runTally.getStore();
  if (!t) return;
  t.calls++; t.input += usage.input_tokens; t.output += usage.output_tokens; t.cacheRead += cacheRead; t.cacheWrite += cacheWrite; t.searches += searches;
  if (Number.isFinite(usd)) t.usd += usd;
}

/** Runs fn with a usage tally; every logUsage inside (including concurrent agents) adds to it, logged once at the end. */
export async function withUsageTally<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t: Tally = { name, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0, usd: 0 };
  try {
    return await runTally.run(t, fn);
  } finally {
    if (t.calls) console.info(`[llm-run] ${name} calls=${t.calls} in=${t.input} out=${t.output} cache_read=${t.cacheRead} cache_write=${t.cacheWrite} searches=${t.searches} ~$${t.usd.toFixed(4)}`);
  }
}
