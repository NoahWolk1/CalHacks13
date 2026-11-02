import { stopSweep } from "@/lib/sky/sweep";
import { surveyStore, validSurveyId } from "@/lib/sky/surveyStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: stops the sweep and its running tiles (what they found so far stays).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validSurveyId(id)) return Response.json({ error: "bad sweep id" }, { status: 400 });
  return Response.json({ stopped: await stopSweep(surveyStore(), id) });
}
