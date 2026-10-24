import { allWorkers, toConfig } from "@/lib/agents/registry";
import { PROFILES } from "@/lib/orchestrator/profiles";
import { llm } from "@/lib/llm";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ agents: allWorkers().map(toConfig), profiles: PROFILES, llm: !!llm() });
}
