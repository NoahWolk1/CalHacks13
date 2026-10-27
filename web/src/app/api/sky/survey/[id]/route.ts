import { after } from "next/server";
import { starRows } from "@/lib/sky/survey";
import { surveyStore, validSurveyId } from "@/lib/sky/surveyStore";
import { kickStep, originOf } from "@/lib/server/skySurvey";
import type { SurveyView } from "@/lib/sky/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A running survey nobody has touched for this long has lost its step chain. */
const STALE_MS = 90_000;

// GET: the survey's progress, notebook, finds and per-star rows. Restarts a broken step chain.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validSurveyId(id)) return Response.json({ error: "bad survey id" }, { status: 400 });
  const store = surveyStore();
  const row = await store.get(id);
  if (!row) return Response.json({ error: "unknown survey" }, { status: 404 });
  const now = Date.now();
  if (row.summary.status === "running" && row.leaseUntil < now && now - row.summary.updatedAt > STALE_MS) {
    const origin = originOf(req);
    after(() => kickStep(origin, id));
  }
  const view: SurveyView = { survey: row.summary, notes: row.notes, objects: row.objects, stars: starRows(await store.stars(id)), backend: store.name };
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
