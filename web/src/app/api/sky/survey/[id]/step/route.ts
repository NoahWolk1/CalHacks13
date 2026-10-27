import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { validSurveyId } from "@/lib/sky/surveyStore";
import { originOf, stepAndChain, stepKey } from "@/lib/server/skySurvey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // a step works for STEP_BUDGET_MS (230 s) in after(), then chains the next

// POST (internal: x-survey-key required): runs one step of the survey in the background.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validSurveyId(id)) return Response.json({ error: "bad survey id" }, { status: 400 });
  const got = Buffer.from(req.headers.get("x-survey-key") ?? ""), want = Buffer.from(stepKey(id));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: "forbidden" }, { status: 403 });
  const origin = originOf(req);
  after(() => stepAndChain(origin, id).then(() => undefined));
  return Response.json({ started: true }, { status: 202 });
}
