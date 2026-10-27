import { surveyStore, validSurveyId } from "@/lib/sky/surveyStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST: stops a running survey. The working step sees it at its next save and ends; results so far stay.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validSurveyId(id)) return Response.json({ error: "bad survey id" }, { status: 400 });
  return Response.json({ stopped: await surveyStore().stop(id) });
}
