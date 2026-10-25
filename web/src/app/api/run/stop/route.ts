import { activeRuns } from "@/lib/server/convexRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST {runId} → abort a Convex-mode run that this server process is executing.
export async function POST(req: Request) {
  const { runId } = (await req.json().catch(() => ({}))) as { runId?: string };
  const ctl = runId ? activeRuns.get(runId) : undefined;
  ctl?.abort();
  return Response.json({ stopped: !!ctl });
}
