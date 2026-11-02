import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { validSurveyId } from "@/lib/sky/surveyStore";
import { originOf, vetKey, vetSweepFind } from "@/lib/server/skySurvey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // vetting's budget is 240 s (vetReport.ts)

// POST ?vet=<key> (internal: x-survey-key required): runs one of a sweep's vets (sweep.vets) in the background.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const key = new URL(req.url).searchParams.get("vet") ?? "";
  if (!validSurveyId(id) || !/^v\d{1,6}$/.test(key)) return Response.json({ error: "bad sweep or vet id" }, { status: 400 });
  const got = Buffer.from(req.headers.get("x-survey-key") ?? ""), want = Buffer.from(vetKey(id, key));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return Response.json({ error: "forbidden" }, { status: 403 });
  const origin = originOf(req);
  after(() => vetSweepFind(origin, id, key));
  return Response.json({ started: true }, { status: 202 });
}
