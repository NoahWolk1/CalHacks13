import Anthropic from "@anthropic-ai/sdk";

// Claude powers the orchestrator's plan / cross-reference / synthesis steps.
// Without ANTHROPIC_API_KEY the orchestrator falls back to deterministic heuristics
// so the app still runs end-to-end.
export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

let client: Anthropic | null = null;
export function llm(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) return null;
  return (client ??= new Anthropic());
}
