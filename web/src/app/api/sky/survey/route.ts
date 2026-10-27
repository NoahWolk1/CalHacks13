import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { parseCone } from "@/lib/sky/geom";
import { newSummary } from "@/lib/sky/survey";
import { surveyStore } from "@/lib/sky/surveyStore";
import { decideLlm } from "@/lib/server/llmQuota";
import { liveStore } from "@/lib/server/liveRun";
import { kickStep, MAX_RUNNING, originOf } from "@/lib/server/skySurvey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST {ra, dec, radius}: starts a deep survey (every star, every sector, in the background) and
// returns {id} at once; GET /api/sky/survey/:id shows its progress. GET: recent surveys.
export async function POST(req: Request) {
  const cone = parseCone(await req.json().catch(() => null));
  if (!cone) return Response.json({ error: "body must be {ra, dec, radius} in degrees" }, { status: 400 });
  const store = surveyStore();
  const running = (await store.list(100)).filter((s) => s.status === "running");
  if (running.length >= MAX_RUNNING) {
    return Response.json({ error: `${running.length} surveys are already running; open one of them or try again when one finishes`, running: running.map((s) => s.id) }, { status: 429 });
  }
  // One Claude reservation per survey (the Strategist's plan and reviews), same caps as the other runs.
  const { llm } = await decideLlm(req, liveStore());
  const id = randomBytes(9).toString("base64url");
  await store.create(newSummary(id, cone, llm));
  const origin = originOf(req);
  after(() => kickStep(origin, id));
  return Response.json({ id, backend: store.name });
}

export async function GET() {
  return Response.json({ surveys: await surveyStore().list(20) });
}
