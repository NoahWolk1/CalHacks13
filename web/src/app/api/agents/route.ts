import { allWorkers, toConfig } from "@/lib/agents/registry";
import { PROFILES } from "@/lib/orchestrator/profiles";
import { llm } from "@/lib/llm";
import { liveClientConfig } from "@/lib/server/liveRun";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ agents: allWorkers().map(toConfig), profiles: PROFILES, llm: !!llm(), live: liveClientConfig() });
}
