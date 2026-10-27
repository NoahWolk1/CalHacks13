// Chaining deep-survey steps (src/lib/sky/survey.ts) across serverless invocations: each step runs in
// after() and, when work is left, POSTs the next step to this same deployment. The step endpoint
// only accepts calls carrying a key derived from a server secret, so outsiders can't drive surveys.
// If a chain breaks (a crash, a deploy), the next viewer's GET finds the lease expired and restarts it.
import { createHmac, randomBytes } from "node:crypto";
import { runSurveyStep, type StepResult } from "@/lib/sky/survey";
import { surveyStore } from "@/lib/sky/surveyStore";

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
  // A step that could do nothing (budget too short) leaves the chain to the stale-survey restart in
  // GET /api/sky/survey/:id instead of spinning.
  if (r === "idle") console.warn(`[survey] ${id}: a step searched no season; not chaining`);
  return r;
}

/** Origin for self-calls: the request's own (works locally and on the deployment that served it). */
export const originOf = (req: Request) => new URL(req.url).origin;
