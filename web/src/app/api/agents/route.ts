import { allWorkers, registry, toConfig } from "@/lib/agents/registry";
import { SavedAgentSchema } from "@/lib/agents/library";
import { PROFILES } from "@/lib/orchestrator/profiles";
import { llm } from "@/lib/llm";
import { missingEnv } from "@/lib/sponsors/keys";
import { liveClientConfig } from "@/lib/server/liveRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ agents: allWorkers().map((w) => {
    const needsKeys = missingEnv(w);
    return needsKeys.length ? { ...toConfig(w), needsKeys } : toConfig(w);
  }), profiles: PROFILES, llm: !!llm(), live: liveClientConfig() });
}

// Save an agent config (from the Hub's create flow) to the library.
export async function POST(req: Request) {
  const parsed = SavedAgentSchema.safeParse((await req.json().catch(() => null))?.agent);
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  return Response.json({ agent: toConfig(registry.saveAgent(parsed.data)) });
}
