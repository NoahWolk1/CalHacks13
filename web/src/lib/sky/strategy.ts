// Strategist agent: decides where in the field something new can still be found, and how to look.
// Searching the brightest 2-min targets one sector at a time mostly re-finds what TESS's own pipeline
// already found, so the Strategist ranks every star with a light curve by discovery potential and
// gives each pick a playbook (types.ts: multi-planet, long-period, deep-search, census). A heuristic
// score always produces a plan; with Claude available, Claude reviews the ranked pool and picks and
// justifies the targets (unknown TIC ids are dropped and the plan is filled from the heuristic).
// After the first pass, the Strategist reviews the results and chooses follow-up actions for the
// Follow-up agent: re-test a signal on a held-out sector, or extend a star's search with more sectors.
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { FALLBACK, llm, MODEL, logUsage } from "@/lib/llm";
import { separation } from "./geom";
import { sectorsFor, type FieldStar, type LcProduct } from "./lightcurves";
import { LABEL as OTYPE_LABEL } from "./simbad";
import type { KnownSignal } from "./vetting";
import { VARIABLE_OTYPES, vsxEntry, type VsxStar } from "./vsx";
import type { Cone, Playbook, SkyObject } from "./types";

/** Sectors stitched per playbook (more sectors: longer periods and higher SNR, more download time). */
export const PLAYBOOK_SECTORS: Record<Playbook, number> = { "multi-planet": 3, "long-period": 4, "deep-search": 2, census: 1 };
export const PLAYBOOK_LABEL: Record<Playbook, string> = { "multi-planet": "Multi-planet search", "long-period": "Long-period search", "deep-search": "Deep search", census: "Variability census" };

/** What the Strategist knows about one star before any light curve is downloaded. */
export type Prospect = {
  star: FieldStar;
  pipelines: string[];
  sectors: number; // sectors available in the best pipeline
  spoc: boolean; // has a 2-min SPOC light curve (searched by TESS's own pipeline)
  known: KnownSignal[]; // confirmed planets / TOIs on this star
  catalogued?: string; // already a catalogued variable (SIMBAD type or VSX entry)
  sep: number; // degrees from the cone centre
  score: number;
  playbook: Playbook;
  reason: string;
};

const SELF_DEG = 3 / 3600;

export function prospects(c: Cone, stars: FieldStar[], products: LcProduct[], known: KnownSignal[], vsx: VsxStar[]): Prospect[] {
  const byTic = new Map<string, LcProduct[]>();
  for (const p of products) byTic.set(p.tic, [...(byTic.get(p.tic) ?? []), p]);
  return stars.flatMap((star) => {
    const mine = byTic.get(star.tic);
    if (!mine?.length) return [];
    const { use, heldOut } = sectorsFor(mine, star.tic, 99);
    const sectors = use.length + heldOut.filter((p) => p.pipeline === use[0]?.pipeline).length;
    const spoc = mine.some((p) => p.pipeline === "SPOC");
    const k = known.filter((s) => s.tic === star.tic || separation(s.ra, s.dec, star.ra, star.dec) <= SELF_DEG);
    const v = vsxEntry(star, vsx);
    const catalogued = v ? `VSX ${v.name} (${v.type})` : VARIABLE_OTYPES.has(star.otype) ? `SIMBAD ${OTYPE_LABEL[star.otype] ?? star.otype}` : undefined;
    // Discovery potential, roughly: systems with a planet often have more; many sectors reach long
    // periods; FFI-only stars never went through SPOC's search; brighter stars give cleaner light curves.
    let score = 0;
    const why: string[] = [];
    let playbook: Playbook = "census";
    if (k.length) { score += 4; playbook = "multi-planet"; why.push(`hosts ${k.map((x) => x.name).join(", ")}: mask them and look for siblings`); }
    if (sectors >= 3) { score += 2 + Math.min(2, (sectors - 3) / 3); if (playbook === "census") playbook = "long-period"; why.push(`${sectors} sectors: long periods reachable`); }
    if (!spoc) { score += 1.5; if (playbook === "census") playbook = "deep-search"; why.push("full-frame images only: never searched by SPOC's 2-min pipeline"); }
    score += star.vmag === undefined ? 0.5 : Math.max(0, Math.min(2, (12.5 - star.vmag) / 3));
    if (catalogued) { score -= 1; why.push(`already catalogued variable (${catalogued})`); }
    if (playbook === "census") why.push("single-sector check for uncatalogued variability");
    return [{ star, pipelines: [...new Set(mine.map((p) => p.pipeline))], sectors, spoc, known: k, catalogued, sep: separation(c.ra, c.dec, star.ra, star.dec), score, playbook, reason: why.join("; ") }];
  }).sort((a, b) => b.score - a.score || a.sep - b.sep);
}

export type PlanPick = { prospect: Prospect; playbook: Playbook; why: string };

/** Top `n` by score, no playbook taking more than ~60% of the slots while others are waiting. */
export function heuristicPlan(pool: Prospect[], n: number): PlanPick[] {
  const cap = Math.max(1, Math.ceil(n * 0.6));
  const taken = new Map<Playbook, number>();
  const out: PlanPick[] = [], rest: Prospect[] = [];
  for (const p of pool) {
    if (out.length >= n) break;
    if ((taken.get(p.playbook) ?? 0) >= cap) { rest.push(p); continue; }
    taken.set(p.playbook, (taken.get(p.playbook) ?? 0) + 1);
    out.push({ prospect: p, playbook: p.playbook, why: p.reason });
  }
  for (const p of rest) { if (out.length >= n) break; out.push({ prospect: p, playbook: p.playbook, why: p.reason }); }
  return out;
}

export function heuristicStrategy(picks: PlanPick[]) {
  const n = (b: Playbook) => picks.filter((p) => p.playbook === b).length;
  const parts = (["multi-planet", "long-period", "deep-search", "census"] as Playbook[]).flatMap((b) => (n(b) ? [`${n(b)} ${PLAYBOOK_LABEL[b].toLowerCase()}`] : []));
  return `Ranked the field's stars by where something new can still hide (known-planet hosts, many sectors, stars outside TESS's 2-min program) and planned ${parts.join(", ")}.`;
}

// ── Claude: plan ────────────────────────────────────────────────────────────

const PlanSchema = z.object({
  strategy: z.string(),
  targets: z.array(z.object({ tic: z.string(), playbook: z.enum(["multi-planet", "long-period", "deep-search", "census"]), why: z.string() })),
});

export function prospectTable(pool: Prospect[]) {
  return pool.map((p) => [
    `TIC ${p.star.tic}`, p.star.name.startsWith("TIC ") ? "" : p.star.name, p.star.vmag !== undefined ? `V=${p.star.vmag.toFixed(1)}` : "V=?",
    p.star.otype ? `type=${OTYPE_LABEL[p.star.otype] ?? p.star.otype}` : "", `sectors=${p.sectors}`, `pipelines=${p.pipelines.join("+")}`,
    p.spoc ? "2-min target" : "FFI only", p.known.length ? `known: ${p.known.map((k) => `${k.name} P=${k.period.toFixed(3)}d${k.disposition ? ` (${k.disposition})` : ""}`).join(", ")}` : "",
    p.catalogued ? `catalogued variable: ${p.catalogued}` : "", `heuristic=${p.score.toFixed(1)}`,
  ].filter(Boolean).join(" | ")).join("\n");
}

const PLAN_SYSTEM = `You are the Strategist of a team of astronomy agents searching real TESS light curves for things no catalog lists yet. You choose which stars to analyse and with which playbook, given a budget. Playbooks:
- multi-planet: star hosts a known planet or TOI. Its known transits are masked, then an iterative Box Least Squares search looks for additional planets (multi-planet systems are common; extra planets are often below the discovery threshold of the first search).
- long-period: up to 4 sectors stitched, so planets with periods of 10-60 days show two or more transits; plus a single-transit search.
- deep-search: 2 sectors of a star with only full-frame-image light curves (no 2-min data), so TESS's SPOC transit search never ran on it.
- census: one sector; the value is in variability: a periodic variable or eclipsing binary absent from AAVSO VSX and SIMBAD is a new catalog entry.
Every target also gets a Lomb-Scargle variability search and a single-transit search. Reason about where discoveries are still likely: well-studied bright stars with many papers are mined out; known-planet hosts, long baselines and fainter FFI-only stars are not. Catalogued eclipsing binaries are poor transit targets. Prefer a mix that makes the most of the budget. Use only TIC ids from the table. "strategy" is 2-3 plain sentences on the overall approach for this field; each "why" is at most 20 words.`;

export async function claudePlan(c: Cone, pool: Prospect[], n: number, signal: AbortSignal): Promise<{ picks: PlanPick[]; strategy: string }> {
  const res = await llm()!.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: "low", format: betaZodOutputFormat(PlanSchema) },
    ...FALLBACK,
    system: PLAN_SYSTEM,
    messages: [{ role: "user", content: `FIELD: RA ${c.ra.toFixed(3)}°, Dec ${c.dec.toFixed(3)}°, radius ${c.radius.toFixed(2)}°. BUDGET: ${n} stars.\n\nCANDIDATE STARS (ranked by a heuristic)\n${prospectTable(pool)}` }],
  }, { signal });
  logUsage("sky:plan", MODEL, res.usage);
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = PlanSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("plan did not match schema");
  return { picks: acceptPlan(pool, parsed.data.targets, n), strategy: parsed.data.strategy.trim() };
}

/** Keeps Claude's picks that name a star in the pool (a multi-planet playbook needs a known planet to
 *  mask), then fills up to `n` from the heuristic ranking. */
export function acceptPlan(pool: Prospect[], targets: { tic: string; playbook: Playbook; why: string }[], n: number): PlanPick[] {
  const byTic = new Map(pool.map((p) => [p.star.tic, p]));
  const out: PlanPick[] = [];
  for (const t of targets) {
    const p = byTic.get(t.tic.replace(/^TIC\s*/i, "").trim());
    if (!p || out.some((o) => o.prospect === p) || out.length >= n) continue;
    out.push({ prospect: p, playbook: t.playbook === "multi-planet" && !p.known.length ? p.playbook : t.playbook, why: t.why.trim() });
  }
  for (const h of heuristicPlan(pool, n)) { if (out.length >= n) break; if (!out.some((o) => o.prospect === h.prospect)) out.push(h); }
  return out;
}

// ── review: follow-up actions ───────────────────────────────────────────────

/** recheck: re-run the search on a held-out sector at the signal's period (independent confirmation).
 *  extend: download more sectors of the star and search again (a single dip may turn periodic; a weak
 *  signal gains SNR). */
export type FollowAction = { id: string; action: "recheck" | "extend"; why: string };

/** Results worth following up: anything new, with what can be done for it. */
export type Followable = { object: SkyObject; canRecheck: boolean; canExtend: boolean };

/** Without Claude: re-check every periodic find that has a held-out sector, extend single dips and
 *  low-SNR finds where more sectors exist. Best-first, at most `max`. */
export function heuristicFollowups(items: Followable[], max: number): FollowAction[] {
  const out: FollowAction[] = [];
  for (const it of items) {
    const single = it.object.type.startsWith("Single");
    if (single && it.canExtend) out.push({ id: it.object.id, action: "extend", why: "a lone dip: more sectors may show it repeat" });
    else if (it.canRecheck) out.push({ id: it.object.id, action: "recheck", why: "independent test on a sector the search never saw" });
    else if (it.canExtend) out.push({ id: it.object.id, action: "extend", why: "more sectors to raise the signal-to-noise" });
  }
  return out.slice(0, max);
}

const ReviewSchema = z.object({
  notes: z.array(z.object({ ids: z.array(z.string()), text: z.string() })),
  actions: z.array(z.object({ id: z.string(), action: z.enum(["recheck", "extend"]), why: z.string() })),
});

const REVIEW_SYSTEM = `You are the Strategist reviewing what your team of agents found in real TESS light curves. Each result is a periodic transit signal or single dip (C ids, with the Vetter's verdict) or a variable star (V ids, with the Variable Census verdict). You can order follow-up tests, which run next within the remaining budget:
- recheck: re-run the search at the signal's period on a held-out sector the first search never saw (only where held-out sectors exist). A real signal reappears with a similar depth; a false alarm doesn't.
- extend: download more sectors of that star and search again (a single dip may repeat and give a period; a weak signal gains SNR).
Prioritise results that would be new if real: unvetted transit candidates, single dips, uncatalogued eclipsing binaries and variables. Don't spend tests on recovered known planets. In "notes", write 1-4 short lab-notebook observations (each at most 30 words) interpreting the results physically (e.g. implied planet size, whether the duration fits the star, what a period means), each citing the ids it is about. Never call anything a confirmed discovery.`;

export async function claudeReview(lines: string, items: Followable[], max: number, signal: AbortSignal): Promise<{ actions: FollowAction[]; notes: { ids: string[]; text: string }[] }> {
  const res = await llm()!.beta.messages.create({
    model: MODEL,
    max_tokens: 1500,
    output_config: { effort: "low", format: betaZodOutputFormat(ReviewSchema) },
    ...FALLBACK,
    system: REVIEW_SYSTEM,
    messages: [{ role: "user", content: `FOLLOW-UP BUDGET: at most ${max} actions.\nFOLLOW-UP OPTIONS\n${items.map((i) => `${i.object.id}: ${[i.canRecheck && "recheck", i.canExtend && "extend"].filter(Boolean).join(", ") || "none"}`).join("\n")}\n\nRESULTS\n${lines}` }],
  }, { signal });
  logUsage("sky:review", MODEL, res.usage);
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = ReviewSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("review did not match schema");
  const ok = new Map(items.map((i) => [i.object.id, i]));
  const valid = new Set(items.map((i) => i.object.id));
  const actions = parsed.data.actions.filter((a, i, all) => {
    const it = ok.get(a.id);
    return it && (a.action === "recheck" ? it.canRecheck : it.canExtend) && all.findIndex((b) => b.id === a.id) === i;
  }).slice(0, max);
  const notes = parsed.data.notes.map((n) => ({ ids: n.ids.filter((x) => valid.has(x)), text: n.text.trim() })).filter((n) => n.ids.length && n.text);
  return { actions, notes };
}

// ── deep surveys: milestone reviews ─────────────────────────────────────────

const SurveyReviewSchema = z.object({
  notes: z.array(z.object({ ids: z.array(z.string()), text: z.string() })),
  prioritize: z.array(z.object({ tic: z.string(), why: z.string() })),
});

const SURVEY_REVIEW_SYSTEM = `You are the Strategist of a deep survey: your team of agents is searching every TESS light curve of every star in one field, season by season (a season is a run of up to 4 nearby sectors searched together). You are shown the progress and the results so far: periodic transit signals and single dips (C ids, with the Vetter's verdict and in how many seasons they were seen), duotransit candidates (two lone dips on one star, with the orbital periods still allowed by when TESS was watching), and variable stars (V ids, with the Variable Census verdict).
In "notes", write 1-4 short lab-notebook observations (each at most 30 words) interpreting the most interesting results physically (implied size, whether a duration fits the star, what a period means, whether a signal seen in several seasons is now strong), each citing the ids it is about. Never call anything a confirmed discovery.
In "prioritize", name up to 5 TIC ids from the results whose remaining seasons should be searched next (stars where more data could confirm or reject a new find), with a short why. Leave it empty when nothing needs it.`;

export async function claudeSurveyReview(progress: string, lines: string, valid: Set<string>, tics: Set<string>, signal: AbortSignal) {
  const res = await llm()!.beta.messages.create({
    model: MODEL,
    max_tokens: 1500,
    output_config: { effort: "low", format: betaZodOutputFormat(SurveyReviewSchema) },
    ...FALLBACK,
    system: SURVEY_REVIEW_SYSTEM,
    messages: [{ role: "user", content: `PROGRESS\n${progress}\n\nRESULTS\n${lines}` }],
  }, { signal });
  logUsage("sky:survey-review", MODEL, res.usage);
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = SurveyReviewSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("review did not match schema");
  return {
    notes: parsed.data.notes.map((n) => ({ ids: n.ids.filter((x) => valid.has(x)), text: n.text.trim() })).filter((n) => n.ids.length && n.text),
    prioritize: parsed.data.prioritize.map((p) => ({ tic: p.tic.replace(/^TIC\s*/i, "").trim(), why: p.why.trim() })).filter((p) => tics.has(p.tic)).slice(0, 5),
  };
}
