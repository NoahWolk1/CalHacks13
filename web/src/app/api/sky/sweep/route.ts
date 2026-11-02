import { randomBytes } from "node:crypto";
import { after } from "next/server";
import { newSweep } from "@/lib/sky/sweep";
import { SWEEP_BUDGET, SWEEP_MAX_RADIUS } from "@/lib/sky/sweepGrid";
import { surveyStore } from "@/lib/sky/surveyStore";
import { decideLlm } from "@/lib/server/llmQuota";
import { liveStore } from "@/lib/server/liveRun";
import { advanceSweepNow, originOf } from "@/lib/server/skySurvey";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST {ra, dec, radius, budgetUsd}: starts a planet sweep (lib/sky/sweep.ts) over a region of up to the
// whole sky (radius 180°) and returns {id} at once; GET /api/sky/sweep/:id shows its progress.
export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const ra = Number(b?.ra), dec = Number(b?.dec), radius = Number(b?.radius), budgetUsd = Number(b?.budgetUsd);
  if (![ra, dec, radius, budgetUsd].every(Number.isFinite) || dec < -90 || dec > 90 || radius <= 0)
    return Response.json({ error: "body must be {ra, dec, radius, budgetUsd} (degrees, USD)" }, { status: 400 });
  if (budgetUsd < SWEEP_BUDGET.min || budgetUsd > SWEEP_BUDGET.max)
    return Response.json({ error: `budget must be $${SWEEP_BUDGET.min}–$${SWEEP_BUDGET.max}` }, { status: 400 });
  const region = { ra: ((ra % 360) + 360) % 360, dec, radius: Math.min(SWEEP_MAX_RADIUS, radius) };
  // One Claude reservation per sweep (its tiles' reviews and the final one), same caps as the other runs.
  const { llm } = await decideLlm(req, liveStore());
  const id = randomBytes(9).toString("base64url");
  const summary = newSweep(id, region, budgetUsd, llm);
  await surveyStore().create(summary);
  const origin = originOf(req);
  after(() => advanceSweepNow(origin, id).then(() => undefined));
  return Response.json({ id, tiles: summary.sweep!.tiles.length });
}
