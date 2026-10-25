import Anthropic from "@anthropic-ai/sdk";

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
