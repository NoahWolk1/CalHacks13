import { after } from "next/server";
import { surveyStore, validSurveyId } from "@/lib/sky/surveyStore";
import { advanceSweepNow, originOf } from "@/lib/server/skySurvey";
import type { SweepView } from "@/lib/sky/types";
import { readWatch, withWatch } from "@/lib/sky/watchlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tiles report after every step (~4 min); a running sweep untouched this long has lost its chain. */
const STALE_MS = 6 * 60_000;

// GET: the sweep's tiles, spend, notebook and finds (with the watchlist's re-vets, once it's finished). Restarts a sweep whose tiles stopped reporting.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validSurveyId(id)) return Response.json({ error: "bad sweep id" }, { status: 400 });
  const row = await surveyStore().get(id);
  if (!row?.summary.sweep) return Response.json({ error: "unknown sweep" }, { status: 404 });
  const now = Date.now();
  if (row.summary.status === "running" && row.leaseUntil < now && now - row.summary.updatedAt > STALE_MS) {
    const origin = originOf(req);
    after(() => advanceSweepNow(origin, id).then(() => undefined));
  }
  // A finished sweep's finds carry their watch (re-vets on new TESS data); none while it runs.
  const { objects, notes } = row.summary.status === "running" ? row : withWatch(id, row.objects, row.notes, await readWatch());
  const view: SweepView = { sweep: row.summary, notes, objects };
  return Response.json(view, { headers: { "Cache-Control": "no-store" } });
}
