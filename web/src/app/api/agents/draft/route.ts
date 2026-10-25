import { AdvancedSpecSchema, draftAgent } from "@/lib/agents/factory";
import { toConfig } from "@/lib/agents/registry";
import { llm } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prompt (+ optional advanced requirements) → a draft agent config for the Hub to preview (or the existing agent that already covers it). Saves nothing.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const prompt = String(body?.prompt ?? "").trim();
  const adv = body?.advanced == null ? undefined : AdvancedSpecSchema.safeParse(body.advanced);
  if (adv && !adv.success) return Response.json({ error: adv.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  if (!prompt) return Response.json({ error: "Describe the agent you need." }, { status: 400 });
  if (prompt.length > 1000) return Response.json({ error: "Keep the description under 1000 characters." }, { status: 400 });
  if (!llm()) return Response.json({ error: "Creating agents needs ANTHROPIC_API_KEY." }, { status: 503 });
  try {
    const draft = await draftAgent({ prompt, createdBy: "user", depth: 0, advanced: adv?.data });
    if (!draft) return Response.json({ error: "Creating agents needs ANTHROPIC_API_KEY." }, { status: 503 });
    return Response.json(draft.kind === "reuse" ? { kind: "reuse", agent: toConfig(draft.worker) } : { kind: "new", agent: draft.config });
  } catch (e) {
    return Response.json({ error: `Couldn't generate an agent: ${(e as Error).message.slice(0, 160)}` }, { status: 502 });
  }
}
