import { registry } from "@/lib/agents/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Discard a spawned agent, or delete a saved custom one. Built-ins can't be deleted.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return registry.deleteAgent(id) ? Response.json({ ok: true }) : Response.json({ error: `No custom agent ${id}` }, { status: 404 });
}
