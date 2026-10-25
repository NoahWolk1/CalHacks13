import { draftAgent } from "@/lib/agents/factory";
import { toConfig } from "@/lib/agents/registry";
import { llm } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prompt → a draft agent config for the Hub to preview (or the existing agent that already covers it). Saves nothing.
export async function POST(req: Request) {
  const prompt = String((await req.json().catch(() => null))?.prompt ?? "").trim();
  if (!prompt) return Response.json({ error: "Describe the agent you need." }, { status: 400 });
  if (prompt.length > 1000) return Response.json({ error: "Keep the description under 1000 characters." }, { status: 400 });
  if (!llm()) return Response.json({ error: "Creating agents needs ANTHROPIC_API_KEY." }, { status: 503 });
  try {
    const draft = await draftAgent({ prompt, createdBy: "user", depth: 0 });
    if (!draft) return Response.json({ error: "Creating agents needs ANTHROPIC_API_KEY." }, { status: 503 });
    return Response.json(draft.kind === "reuse" ? { kind: "reuse", agent: toConfig(draft.worker) } : { kind: "new", agent: draft.config });
  } catch (e) {
    return Response.json({ error: `Couldn't generate an agent: ${(e as Error).message.slice(0, 160)}` }, { status: 502 });
  }
}
