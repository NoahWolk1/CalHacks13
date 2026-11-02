// Planet sweeps: a large region (up to the whole sky) searched for new planets as many deep surveys,
// one 3° tile at a time, until the region is done or the spend cap is reached.
//
// A sweep is a row in the survey store whose summary carries `sweep` (no schema of its own). Each tile
// runs as an ordinary deep survey (survey.ts) marked with the sweep's id, so it can be opened on its
// own. advanceSweep is called after every step of a tile (skySurvey.ts) and when the sweep is viewed:
// it reads the running tiles' spend and finds, stops them when the cap is reached, starts the next
// tiles, vets every transit find as soon as it shows up (one at a time, each in its own background call
// that reports back with recordSweepVet), and once nothing is left has Claude review the vetted finds together.
//
// Spend = Claude (token counts the API reports, priced in llm.ts) + compute, estimated from the time
// the tiles' steps ran at SKY_COMPUTE_USD_PER_HOUR (0 off Vercel: run locally, the cap is Claude only). Tiles with the deepest TESS coverage go first
// (near the ecliptic poles TESS watched for up to a year: long periods and small planets reachable).
import { randomBytes } from "node:crypto";
import { claudeSurveyReview } from "./strategy";
import { parseTileFindId, tileFindId, tileRegion } from "./sweepGrid";
import { newSummary, REVIEW_RESERVE_USD } from "./survey";
import { LIST_ALL, type SurveyStore } from "./surveyStore";
import { measureSpend } from "@/lib/llm";
import { VET_BUDGET_MS } from "./vetReport";
import { sameFind, vetInputFrom, type VetTier } from "./vetShared";
import { isNewFind, SKY_MAX_RADIUS, type Cone, type SkyNote, type SkyObject, type SurveySummary, type SweepState, type SweepTile, type SweepVet } from "./types";

/** Tiles searched at once by one sweep. */
export const SWEEP_CONCURRENCY = Number(process.env.SKY_SWEEP_CONCURRENCY) || 2;
/** Estimated cost of a step-hour: on Vercel, active CPU ($0.128/h) + 2 GB memory ($0.0212/h); run
 *  anywhere else (your own machine) compute is free, so the cap counts Claude only. */
const rate = process.env.SKY_COMPUTE_USD_PER_HOUR;
export const COMPUTE_USD_PER_HOUR = rate !== undefined && Number.isFinite(+rate) ? +rate : process.env.VERCEL ? 0.15 : 0;
const MAX_NOTES = 80;
/** Kept finds across all tiles, in tile order: a 10-tile sweep makes ~1,200 (the old 400 dropped every
 *  tile after the third, unvetted). A find is ~3 KB of the sweep row. */
const MAX_FINDS = 5000;
/** A running tile untouched this long has lost its step chain (as in GET /api/sky/survey/:id). */
const TILE_STALE_MS = 90_000;
/** Finds vetted at once by one sweep: mostly downloads (~1-4 min each), so they barely slow the searches. */
const VET_CONCURRENCY = Number(process.env.SKY_SWEEP_VET_CONCURRENCY) || 2;
/** A viable find whose vet couldn't reach a service is vetted again this long after (up to REVETS times). */
const REVET_AFTER_MS = 60 * 60_000;
const REVETS = 2;
/** A viable find vetted with gaps, or a vet that failed outright (a restart killed it twice), is run again. */
const owesRevet = (v: SweepVet) => (v.revets ?? 0) < REVETS
  && (v.status === "error" || (v.status === "done" && ["A", "B", "C"].includes(v.tier ?? "") && !(v.gaps && !v.gaps.length)));
/** Vetting order: the likeliest planets first (a period, then two transits, then lone dips), strongest first. */
const KIND_RANK = { periodic: 0, duo: 1, single: 2 };
/** A vet still "running" after this long lost its call (the server stopped): retried once, then given up. */
const VET_STALE_MS = VET_BUDGET_MS + 120_000;
/** Best first; finds not vetted (yet) sit between the candidates and the rejected. */
export const TIER_RANK: Record<VetTier | "none", number> = { A: 0, B: 1, C: 2, none: 3, K: 4, X: 5 };

/** The vet of this find: same tile, same signal. */
export function vetOf(vets: Record<string, SweepVet> | undefined, o: SkyObject): [string, SweepVet] | undefined {
  const input = vetInputFrom(o), at = parseTileFindId(o.id);
  if (!input || !at) return undefined;
  return Object.entries(vets ?? {}).find(([, v]) => v.input && v.tile === at.tile && sameFind(v.input, input));
}

/** A find's vetting state on the find itself, for the page: props.vet is the tier, or vetting / queued /
 *  failed; props.vetted the tier's reason. */
function withVet(vets: Record<string, SweepVet>, o: SkyObject): SkyObject {
  if (!vetInputFrom(o)) return o;
  const v = vetOf(vets, o)?.[1];
  const props = { ...o.props };
  delete props.vet; delete props.vetted;
  if (!v) return { ...o, props: { ...props, vet: "queued" } };
  if (v.status === "done") return { ...o, props: { ...props, vet: v.tier!, vetted: `tier ${v.tier}: ${v.reason}` } };
  return { ...o, props: { ...props, vet: v.status === "running" ? "vetting" : "failed", ...(v.reason ? { vetted: v.reason } : {}) } };
}

export const computeUsd = (fnMs: number) => (fnMs / 3_600_000) * COMPUTE_USD_PER_HOUR;

export function newSweep(id: string, region: Cone, budgetUsd: number, llm: boolean): SurveySummary {
  const tiles: SweepTile[] = tileRegion(region).map((cone) => ({ cone, status: "pending" }));
  const sweep: SweepState = { budgetUsd, tiles, reviewUsd: 0, claudeUsd: 0, computeUsd: 0 };
  return { ...newSummary(id, region, llm), planned: true, sweep };
}

export const spentUsd = (s: SweepState) => s.claudeUsd + s.reviewUsd + s.computeUsd;

export type SweepResult = "continue" | "done" | "busy" | "stopped" | "missing" | "idle";

/**
 * Brings a sweep up to date: refreshes its running tiles, enforces the cap, starts tiles, and finishes it.
 * `start` creates nothing itself; it kicks the new tile survey's first step. `running` counts the
 * deployment's running surveys (outside this sweep's tiles too), against `maxRunning`.
 */
export async function advanceSweep(store: SurveyStore, id: string, owner: string, opts: {
  start: (surveyId: string) => Promise<void>; maxRunning: number; signal?: AbortSignal;
  /** Starts vetting one find in the background (without it, finds aren't vetted). */
  vet?: (key: string) => Promise<void>;
}): Promise<SweepResult> {
  if (!(await store.lease(id, owner, Date.now() + 90_000))) return "busy";
  try {
    const row = await store.get(id);
    if (!row?.summary.sweep) return "missing";
    let summary = row.summary;
    const sweep: SweepState = { ...summary.sweep!, tiles: summary.sweep!.tiles.map((t) => ({ ...t })), vets: { ...summary.sweep!.vets } };
    const vets = sweep.vets!;
    let notes = row.notes;
    const note = (n: SkyNote) => { notes = [...notes, n].slice(-MAX_NOTES); };
    const finds = new Map<string, SkyObject>(row.objects.map((o) => [o.id, o]));

    // Running tiles: spend, progress and finds so far.
    for (const [i, t] of sweep.tiles.entries()) {
      if (t.status !== "running" || !t.surveyId) continue;
      const child = await store.get(t.surveyId);
      if (!child) { t.status = "error"; continue; }
      const c = child.summary;
      // Its step chain broke (the server stopped or slept): start it again.
      if (c.status === "running" && child.leaseUntil < Date.now() && Date.now() - c.updatedAt > TILE_STALE_MS) await opts.start(t.surveyId);
      Object.assign(t, { status: c.status, finds: c.finds, stars: c.stars, seasons: c.seasons, done: c.seasonsDone + c.seasonsFailed, usd: c.usd ?? 0, fnMs: c.fnMs ?? 0 });
      for (const k of [...finds.keys()]) if (parseTileFindId(k)?.tile === i) finds.delete(k);
      for (const o of child.objects.filter(isNewFind)) finds.set(tileFindId(i, o.id), { ...o, id: tileFindId(i, o.id), props: { ...o.props, tile: `T${i + 1}`, survey: t.surveyId } });
      if (c.status !== "running") note({ agent: "strategist", text: `T${i + 1} (RA ${t.cone.ra.toFixed(1)}°, Dec ${t.cone.dec.toFixed(1)}°) ${c.status}: ${c.seasonsDone} seasons of ${c.stars} stars, ${c.finds} new find${c.finds === 1 ? "" : "s"}.` });
    }
    const tally = () => {
      sweep.claudeUsd = sweep.tiles.reduce((k, t) => k + (t.usd ?? 0), 0);
      sweep.computeUsd = computeUsd(sweep.tiles.reduce((k, t) => k + (t.fnMs ?? 0), 0) + (sweep.vetMs ?? 0));
    };
    tally();

    const live = () => sweep.tiles.filter((t) => t.status === "running");
    if (summary.status === "running" && !sweep.budgetHit && spentUsd(sweep) >= sweep.budgetUsd) {
      sweep.budgetHit = true;
      for (const t of live()) { await store.stop(t.surveyId!).catch(() => false); t.status = "stopped"; }
      note({ agent: "strategist", text: `Budget of $${sweep.budgetUsd.toFixed(2)} reached ($${spentUsd(sweep).toFixed(2)} spent): no more tiles.` });
    }

    // Start tiles while there is room and budget.
    let idle = false;
    if (summary.status === "running" && !sweep.budgetHit) {
      const others = (await store.list(LIST_ALL)).filter((s) => s.status === "running" && !s.sweep && s.sweepId !== id).length;
      while (live().length < SWEEP_CONCURRENCY && others + live().length < opts.maxRunning) {
        const i = sweep.tiles.findIndex((t) => t.status === "pending");
        if (i < 0) break;
        const remaining = sweep.budgetUsd - spentUsd(sweep);
        if (remaining <= 0) break;
        const surveyId = randomBytes(9).toString("base64url");
        // Each running tile may spend its share of what's left on Claude; compute is checked here, every step.
        await store.create(newSummary(surveyId, sweep.tiles[i].cone, summary.llm, { sweepId: id, usdCap: remaining / SWEEP_CONCURRENCY }));
        sweep.tiles[i] = { ...sweep.tiles[i], status: "running", surveyId };
        await opts.start(surveyId);
      }
      idle = !live().length && sweep.tiles.some((t) => t.status === "pending");
    }

    let objects = [...finds.values()].sort((a, b) => parseTileFindId(a.id)!.tile - parseTileFindId(b.id)!.tile).slice(0, MAX_FINDS);

    // Vet every transit find as it shows up, running tiles' too, while the budget covers one more vet's
    // compute (free off Vercel, so a sweep run on your own machine vets everything).
    const kicks: string[] = [];
    const vetCost = computeUsd(VET_BUDGET_MS);
    const canVet = !!opts.vet && summary.status === "running" && (vetCost === 0 || spentUsd(sweep) + vetCost <= sweep.budgetUsd);
    const vettable = objects.filter((o) => vetInputFrom(o)).sort((a, b) => {
      const x = vetInputFrom(a)!, y = vetInputFrom(b)!;
      return KIND_RANK[x.kind] - KIND_RANK[y.kind] || (y.snr ?? 0) - (x.snr ?? 0);
    });
    for (const [fid, v] of Object.entries(vets)) {
      if (v.status !== "running" || Date.now() - v.startedAt <= VET_STALE_MS) continue;
      if (canVet && v.tries < 2) { vets[fid] = { ...v, startedAt: Date.now(), tries: v.tries + 1 }; kicks.push(fid); }
      else vets[fid] = { ...v, status: "error", reason: "vetting didn't finish", finishedAt: Date.now() };
    }
    for (const o of canVet ? vettable : []) {
      if (Object.values(vets).filter((v) => v.status === "running").length >= VET_CONCURRENCY) break;
      if (vetOf(vets, o)) continue;
      const key = `v${Object.keys(vets).length + 1}`;
      vets[key] = { status: "running", startedAt: Date.now(), tries: 1, tile: parseTileFindId(o.id)!.tile, input: vetInputFrom(o)!, findId: o.id };
      kicks.push(key);
    }
    // Then viable finds vetted while an archive was down (or before gaps were recorded): again, with fresh
    // downloads. Only finds still there: a running tile drops and merges finds as it goes.
    const current = new Set(objects.flatMap((o) => vetOf(vets, o)?.[0] ?? []));
    for (const [key, v] of Object.entries(vets)) {
      if (!canVet || Object.values(vets).filter((x) => x.status === "running").length >= VET_CONCURRENCY) break;
      if (!current.has(key) || !owesRevet(v) || Date.now() - (v.finishedAt ?? 0) < REVET_AFTER_MS) continue;
      vets[key] = { ...v, status: "running", startedAt: Date.now(), tries: 1, revets: (v.revets ?? 0) + 1 };
      kicks.push(key);
    }
    const vetsLeft = Object.values(vets).some((v) => v.status === "running") || (canVet && (vettable.some((o) => !vetOf(vets, o)) || [...current].some((k) => owesRevet(vets[k]))));
    objects = objects.map((o) => withVet(vets, o));

    const finished = !live().length && (sweep.budgetHit || !sweep.tiles.some((t) => t.status === "pending")) && !vetsLeft;
    if (finished && summary.status === "running") {
      const newFinds = objects.filter(isNewFind);
      const tierOf = (o: SkyObject) => vetOf(vets, o)?.[1].tier;
      const vetted = newFinds.filter((o) => tierOf(o));
      // Rejected (X) and already-catalogued (K) finds aren't worth Claude's attention.
      const forReview = newFinds.filter((o) => !["X", "K"].includes(tierOf(o) ?? "")).sort((a, b) => TIER_RANK[tierOf(a) ?? "none"] - TIER_RANK[tierOf(b) ?? "none"]);
      const remaining = sweep.budgetUsd - spentUsd(sweep);
      if (summary.llm && forReview.length && remaining >= REVIEW_RESERVE_USD) {
        const lines = forReview.slice(0, 60).map((o) => `[${o.id}] ${o.name}: ${o.type}${tierOf(o) ? ` · vetted tier ${tierOf(o)} (${vetOf(vets, o)![1].reason})` : ""} · ${Object.entries(o.props).filter(([k]) => !["light curve", "status", "playbook", "survey"].includes(k)).map(([k, v]) => `${k}=${v}`).join("; ")}`).join("\n");
        const done = sweep.tiles.filter((t) => t.status === "done").length;
        try {
          const vetLine = vetted.length ? ` Transit finds were vetted automatically (tier A passed every check, B passed with open items, C ambiguous); ${newFinds.length - forReview.length} rejected or already catalogued are left out.` : "";
          const r = await measureSpend(() => claudeSurveyReview(`Planet sweep finished: ${done} of ${sweep.tiles.length} tiles of ${SKY_MAX_RADIUS}° searched completely.${vetLine} Results from all tiles together; rank what deserves follow-up first.`,
            lines, new Set(objects.map((o) => o.id)), new Set(), opts.signal ?? AbortSignal.timeout(45_000)), (usd) => { sweep.reviewUsd += usd; });
          r.notes.forEach((n, i) => note({ agent: "strategist", text: i ? n.text : `[sweep review] ${n.text}`, ids: n.ids }));
        } catch (e) {
          note({ agent: "strategist", text: `[sweep review] Claude review failed (${(e as Error).message.slice(0, 60)})` });
        }
      }
      const searched = sweep.tiles.filter((t) => t.status === "done").length;
      const tiers = (["A", "B", "C", "K", "X"] as const).map((t) => [t, vetted.filter((o) => tierOf(o) === t).length] as const).filter(([, n]) => n);
      const vetText = vetted.length ? ` (${vetted.length} vetted: ${tiers.map(([t, n]) => `${n} tier ${t}`).join(", ")})` : "";
      note({ agent: "strategist", text: `Sweep finished: ${searched} of ${sweep.tiles.length} tiles searched, ${newFinds.length} new find${newFinds.length === 1 ? "" : "s"}${vetText}, $${spentUsd(sweep).toFixed(2)} spent of $${sweep.budgetUsd.toFixed(2)}.` });
      summary = { ...summary, status: "done", finishedAt: Date.now() };
    }

    const sum = (k: "stars" | "seasons" | "done") => sweep.tiles.reduce((n, t) => n + (t[k] ?? 0), 0);
    summary = {
      ...summary, sweep, updatedAt: Date.now(), usd: sweep.claudeUsd + sweep.reviewUsd,
      stars: sum("stars"), seasons: sum("seasons"), seasonsDone: sum("done"),
      finds: objects.filter(isNewFind).length, candidates: objects.filter((o) => /^Unvetted/.test(o.type)).length,
    };
    const status = await store.save(id, owner, { summary, notes, objects }, []);
    if (status === "stopped") return "stopped";
    for (const key of kicks) await opts.vet!(key);
    return summary.status === "done" ? "done" : idle ? "idle" : "continue";
  } finally {
    await store.release(id, owner).catch(() => {});
  }
}

/** A vetting run ended (vetSweepFind in skySurvey.ts): its tier goes on the find and in the notebook.
 *  Waits for the lease (an advance may hold it); false if the sweep is gone or no longer running. */
export async function recordSweepVet(store: SurveyStore, id: string, owner: string, key: string,
  r: { tier?: VetTier; reason?: string; error?: string; gaps?: string[]; ms: number }): Promise<boolean> {
  for (let i = 0; !(await store.lease(id, owner, Date.now() + 60_000)); i++) {
    if (i >= 15) return false;
    await new Promise((res) => setTimeout(res, 2000));
  }
  try {
    const row = await store.get(id);
    const prev = row?.summary.sweep?.vets?.[key];
    if (!row || !prev || row.summary.status !== "running") return false;
    const sweep = row.summary.sweep!;
    // A re-vet that errors keeps the earlier verdict.
    const vet: SweepVet = r.tier ? { ...prev, status: "done", tier: r.tier, reason: r.reason, gaps: r.gaps ?? [], finishedAt: Date.now() }
      : prev.revets && prev.tier ? { ...prev, status: "done", finishedAt: Date.now() } : { ...prev, status: "error", reason: r.error, finishedAt: Date.now() };
    const vets = { ...sweep.vets, [key]: vet };
    const objects = row.objects.map((o) => withVet(vets, o));
    const o = objects.find((x) => vetOf(vets, x)?.[0] === key);
    const name = `TIC ${prev.input.tic}`;
    const again = prev.revets ? "again (an archive was unreachable the first time)" : "";
    const gapText = r.gaps?.length ? ` Not reached: ${r.gaps.join(", ")}.` : "";
    const text = r.tier ? `Vetted ${name}${again && ` ${again}`}: tier ${r.tier}, ${r.reason}.${gapText}` : `Vetting ${name}${again && ` ${again}`} failed (${(r.error ?? "").slice(0, 80)}).`;
    const notes = [...row.notes, { agent: "vetting" as const, text, ...(o ? { ids: [o.id] } : {}) }].slice(-MAX_NOTES);
    const summary = { ...row.summary, updatedAt: Date.now(), sweep: { ...sweep, vets, vetMs: (sweep.vetMs ?? 0) + r.ms } };
    return (await store.save(id, owner, { summary, notes, objects }, [])) === "running";
  } finally {
    await store.release(id, owner).catch(() => {});
  }
}

/** Stops a sweep and its running tiles. */
export async function stopSweep(store: SurveyStore, id: string) {
  const row = await store.get(id);
  if (!row?.summary.sweep) return false;
  await Promise.all(row.summary.sweep.tiles.filter((t) => t.status === "running" && t.surveyId).map((t) => store.stop(t.surveyId!).catch(() => false)));
  return store.stop(id);
}
