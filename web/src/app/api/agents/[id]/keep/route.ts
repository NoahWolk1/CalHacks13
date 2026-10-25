import { registry } from "@/lib/agents/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep an agent spawned mid-run: it moves into the saved library.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = registry.keepAgent(id);
  return agent ? Response.json({ agent }) : Response.json({ error: `No spawned agent ${id} (it may have been lost on a server restart)` }, { status: 404 });
}
