// Chaining deep-survey steps (src/lib/sky/survey.ts) across serverless invocations: each step runs in
// after() and, when work is left, POSTs the next step to this same deployment. The step endpoint
// only accepts calls carrying a key derived from a server secret, so outsiders can't drive surveys.
// If a chain breaks (a crash, a deploy), the next viewer's GET finds the lease expired and restarts it.
import { createHmac, randomBytes } from "node:crypto";
import { runSurveyStep, type StepResult } from "@/lib/sky/survey";
import { surveyStore } from "@/lib/sky/surveyStore";
import { advanceSweep, recordSweepVet, type SweepResult } from "@/lib/sky/sweep";
import { VET_BUDGET_MS } from "@/lib/sky/vetReport";
import { vetOffThread } from "@/lib/server/vetPool";
import { sameFind, vetGaps } from "@/lib/sky/vetShared";
import { vetStore } from "@/lib/sky/vetStore";

/** Server-only secret for step keys: SKY_SURVEY_SECRET, else another server secret, else a per-process one. */
const g = globalThis as unknown as { __skySurveySecret?: string };
function secret() {
  return process.env.SKY_SURVEY_SECRET || process.env.SPACETIME_TOKEN || process.env.ANTHROPIC_API_KEY || (g.__skySurveySecret ??= randomBytes(32).toString("hex"));
}

export const stepKey = (id: string) => createHmac("sha256", secret()).update(`sky-survey-step:${id}`).digest("hex");
export const newOwner = () => randomBytes(9).toString("base64url");

/** Concurrent surveys allowed on this deployment (each one keeps a function busy). */
export const MAX_RUNNING = Number(process.env.SKY_SURVEY_MAX_RUNNING) || 3;

/** Fires the next step; the step route answers 202 at once and works in after(). */
export async function kickStep(origin: string, id: string) {
  try {
    const res = await fetch(`${origin}/api/sky/survey/${encodeURIComponent(id)}/step`, {
      method: "POST", headers: { "x-survey-key": stepKey(id) }, signal: AbortSignal.timeout(15_000), cache: "no-store",
    });
    if (!res.ok && res.status !== 409) console.warn(`[survey] ${id}: next step answered ${res.status}`);
  } catch (e) {
    console.warn(`[survey] ${id}: could not start the next step: ${(e as Error).message}`);
  }
}

/** One step, then the next one if work is left. */
export async function stepAndChain(origin: string, id: string): Promise<StepResult> {
  let r: StepResult;
  try {
    r = await runSurveyStep(surveyStore(), id, newOwner());
  } catch (e) {
    // A failed step (store or network trouble) leaves the survey running: the next step retries.
    console.warn(`[survey] ${id}: step failed: ${(e as Error).message}`);
    r = "continue";
  }
  if (r === "continue") await kickStep(origin, id);
  // A sweep tile reports every step to its sweep: spend against the cap, and the next tile when it's done.
  const sweepId = await surveyStore().get(id).then((row) => row?.summary.sweepId, () => undefined);
  if (sweepId) await advanceSweepNow(origin, sweepId);
  // A step that could do nothing (budget too short) leaves the chain to the stale-survey restart in
  // GET /api/sky/survey/:id instead of spinning.
  if (r === "idle") console.warn(`[survey] ${id}: a step searched no season; not chaining`);
  return r;
}

/** Origin for self-calls: the request's own (works locally and on the deployment that served it), or
 *  SKY_INTERNAL_ORIGIN behind a proxy that would refuse them (a password-protected server). */
export const originOf = (req: Request) => process.env.SKY_INTERNAL_ORIGIN || new URL(req.url).origin;

/** Advances a planet sweep (sweep.ts), retrying a few times while another advance or vet holds it. */
export async function advanceSweepNow(origin: string, id: string): Promise<SweepResult> {
  const opts = { start: (surveyId: string) => kickStep(origin, surveyId), vet: (findId: string) => kickVet(origin, id, findId), maxRunning: MAX_RUNNING };
  try {
    let r = await advanceSweep(surveyStore(), id, newOwner(), opts);
    // Busy: another advance or a vet's result holds the sweep for a moment. A skipped advance leaves a
    // tile or vet slot empty until the next one, so wait a little longer before giving up.
    for (let i = 0; r === "busy" && i < 4; i++) {
      await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
      r = await advanceSweep(surveyStore(), id, newOwner(), opts);
    }
    return r;
  } catch (e) {
    console.warn(`[sweep] ${id}: advance failed: ${(e as Error).message}`);
    return "continue";
  }
}

export const vetKey = (id: string, key: string) => stepKey(`${id}/vet/${key}`);

/** Starts one of a sweep's vets (key "v3": sweep.vets); the vet route answers 202 at once and works in after(). */
async function kickVet(origin: string, id: string, key: string) {
  try {
    const res = await fetch(`${origin}/api/sky/sweep/${encodeURIComponent(id)}/vet?vet=${encodeURIComponent(key)}`, {
      method: "POST", headers: { "x-survey-key": vetKey(id, key) }, signal: AbortSignal.timeout(15_000), cache: "no-store",
    });
    if (!res.ok) console.warn(`[sweep] ${id}: vetting ${key} answered ${res.status}`);
  } catch (e) {
    console.warn(`[sweep] ${id}: could not start vetting ${key}: ${(e as Error).message}`);
  }
}

/** Runs one of a sweep's vets (or reuses a saved report on the same signal), saves the report where
 *  the find cards look for it, records the tier on the sweep and lets the sweep go on. */
export async function vetSweepFind(origin: string, id: string, key: string) {
  const t0 = Date.now();
  let r: Parameters<typeof recordSweepVet>[4];
  try {
    const vet = (await surveyStore().get(id))?.summary.sweep?.vets?.[key], input = vet?.input;
    if (!input) throw new Error("unknown vet");
    // A re-vet runs afresh: the saved report is the one with gaps.
    const saved = vet.revets ? undefined : (await vetStore().byTic([input.tic])).filter((v) => sameFind(v.report.input, input)).sort((a, b) => b.savedAt - a.savedAt)[0];
    const report = saved?.report ?? await vetOffThread(input, AbortSignal.timeout(VET_BUDGET_MS + 60_000), VET_BUDGET_MS);
    if (!saved) await vetStore().save(report).catch((e) => console.warn(`[sweep] ${id}: saving the vet report failed: ${(e as Error).message}`));
    r = { tier: report.tier, reason: report.tierReason, gaps: vetGaps(report), ms: saved ? 0 : Date.now() - t0 };
  } catch (e) {
    console.warn(`[sweep] ${id}: vetting ${key} failed: ${(e as Error).message}`);
    r = { error: (e as Error).message.slice(0, 160), ms: Date.now() - t0 };
  }
  try {
    await recordSweepVet(surveyStore(), id, newOwner(), key, r);
  } catch (e) {
    console.warn(`[sweep] ${id}: recording vet ${key} failed: ${(e as Error).message}`);
  }
  await advanceSweepNow(origin, id);
}
