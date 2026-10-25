import { stopConvexRun } from "@/lib/server/convexRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST {runId} → stop a Convex-mode run. Works across serverless instances (sets runs.stopRequested,
// which the orchestrator polls) and aborts immediately when this process is the one running it.
export async function POST(req: Request) {
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  return Response.json({ stopped: runId ? await stopConvexRun(runId) : false });
}
