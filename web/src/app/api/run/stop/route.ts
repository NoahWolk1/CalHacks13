import { stopLiveRun } from "@/lib/server/liveRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST {runId} → stop a live-backend run (SpacetimeDB or Convex). Works across serverless instances
// (flags the run row, which the orchestrator polls) and aborts immediately when this process runs it.
export async function POST(req: Request) {
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  return Response.json({ stopped: runId ? await stopLiveRun(runId) : false });
}
