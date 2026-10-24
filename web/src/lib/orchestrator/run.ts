// The orchestrator loop (README §3a): plan → dispatch → cross-reference → re-dispatch → synthesize.
// Emits RunEvents as it goes; the API route streams them to the map over SSE.

import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Finding, Insight, PlanStep, RunEvent, RunRequest, Worker, WorkerTask } from "@/lib/types";
import { allWorkers, getWorker, toConfig } from "@/lib/agents/registry";
import { requestSpawn } from "@/lib/agents/factory";
import { getProfile } from "./profiles";
import { crossReference, redispatchTargets, type Link } from "./crossref";
import { llm, MODEL } from "@/lib/llm";
import { getJson, sleep } from "@/lib/http";
import { regionAreaKm2, touchesSF } from "@/lib/geo";

const ORCH = "orchestrator";
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export async function runOrchestrator(req: RunRequest, emit: (e: RunEvent) => void, signal: AbortSignal) {
  const t0 = Date.now();
  const profile = getProfile(req.profileId);
  const region = req.region;
  const client = llm();
  const findings: Finding[] = [];
  let fid = 0;
  const think = (text: string) => emit({ type: "thought", agentId: ORCH, text });

  emit({ type: "run_started", runId: crypto.randomUUID(), mode: req.mode, profileId: profile.id, region, question: req.question, llm: !!client });

  // ── 0. Where are we? ──────────────────────────────────────────────────────
  region.label = await reverseGeocode(region.center).catch(() => undefined);
  if (region.label) emit({ type: "region_labeled", label: region.label });
  think(`Area: ${region.label ?? "unnamed area"} · ${regionAreaKm2(region).toFixed(2)} km²${touchesSF(region) ? " · SF city feeds available" : ""}`);

  // ── 1. Plan ───────────────────────────────────────────────────────────────
  const workers = allWorkers();
  let steps: PlanStep[];
  let rationale: string;
  let gaps: string[] = [];
  if (client && req.mode === "ask" && req.question) {
    think("Planning which agents this question needs…");
    try {
      ({ steps, rationale, gaps } = await llmPlan(req, workers));
    } catch (e) {
      think(`Planner fell back to heuristics (${(e as Error).message.slice(0, 80)})`);
      ({ steps, rationale } = heuristicPlan(req, workers));
    }
  } else {
    ({ steps, rationale } = heuristicPlan(req, workers));
  }
  // Drop SF-only agents outside SF rather than dispatching them to do nothing.
  steps = steps.filter((s) => getWorker(s.agentId) && (getWorker(s.agentId)!.coverage !== "San Francisco" || touchesSF(region)));
  for (const extra of req.includeAgents ?? []) if (!steps.some((s) => s.agentId === extra) && getWorker(extra)) steps.push({ agentId: extra, reason: "Added by you" });
  emit({ type: "plan", steps, rationale });
  think(rationale);

  // ── 1b. Capability gaps → ask the factory to spawn an agent (teammate's module) ──
  let spawned = 0;
  for (const need of gaps) {
    emit({ type: "agent_gap", need, parentId: ORCH });
    const w = await requestSpawn({ prompt: need, createdBy: ORCH, depth: 1 }, spawned).catch(() => null);
    if (w) {
      spawned++;
      emit({ type: "agent_spawned", agent: toConfig(w), parentId: ORCH });
      steps.push({ agentId: w.id, reason: `Spawned to cover: ${need}` });
    }
  }

  // ── 2. Dispatch ───────────────────────────────────────────────────────────
  const dispatch = async (w: Worker, task: WorkerTask, delayMs = 0) => {
    const dispatchId = `${w.id}#${Math.random().toString(36).slice(2, 7)}`;
    emit({ type: "agent_status", agentId: w.id, status: "queued", dispatchId, focus: task.focus, targets: task.targets });
    await sleep(delayMs);
    emit({ type: "agent_status", agentId: w.id, status: "deploying", dispatchId, focus: task.focus, targets: task.targets });
    await sleep(700); // let the vehicle visibly travel in before results land
    emit({ type: "agent_status", agentId: w.id, status: "scanning", dispatchId });
    let n = 0;
    try {
      await w.run({
        task,
        signal,
        log: (text) => emit({ type: "agent_log", agentId: w.id, text }),
        emit: (f) => {
          const finding: Finding = { ...f, id: `F${++fid}`, worker_id: w.id };
          findings.push(finding);
          n++;
          emit({ type: "finding", finding, dispatchId });
        },
      });
      emit({ type: "agent_status", agentId: w.id, status: "done", dispatchId, detail: `${n} finding${n === 1 ? "" : "s"}` });
    } catch (e) {
      if (signal.aborted) return;
      emit({ type: "agent_status", agentId: w.id, status: "error", dispatchId, detail: (e as Error).message.slice(0, 140) });
    }
  };

  const baseTask: WorkerTask = { region, question: req.question };
  await Promise.all(steps.map((s, i) => dispatch(getWorker(s.agentId)!, { ...baseTask, focus: s.focus }, i * 250)));
  if (signal.aborted) return;
  think(`First sweep complete: ${findings.length} findings from ${steps.length} agents. Cross-referencing…`);

  // ── 3. Re-dispatch: send the terrain drone to inspect the specific parcels that matter ──
  const targets = redispatchTargets(findings);
  const terrain = getWorker("terrain-elevation");
  if (terrain && targets.length && profile.id !== "storefront") {
    think(`Re-dispatching ${terrain.name} to measure ground elevation at ${targets.length} permitted parcels.`);
    await dispatch(terrain, { ...baseTask, targets, focus: `Check elevation at ${targets.length} permitted parcels` });
  }

  // ── 4. Cross-reference → insights ─────────────────────────────────────────
  const links = crossReference(findings);
  let insights: Insight[] = [];
  if (client && findings.length) {
    think("Connecting findings across agents…");
    try {
      insights = await llmInsights(req, findings, links);
    } catch (e) {
      think(`Insight synthesis fell back to rules (${(e as Error).message.slice(0, 80)})`);
    }
  }
  if (!insights.length) insights = links.map((l, i) => ({ ...l, id: `I${i + 1}` }));
  for (const ins of insights) { emit({ type: "insight", insight: ins }); await sleep(250); }

  // ── 5. Answer (Ask mode) ──────────────────────────────────────────────────
  if (req.mode === "ask" && req.question) {
    if (client) {
      try { await llmAnswer(req, findings, insights, (t) => emit({ type: "answer_delta", text: t })); }
      catch (e) { emit({ type: "answer_delta", text: fallbackAnswer(findings, insights) + `\n\n_(LLM error: ${(e as Error).message.slice(0, 100)})_` }); }
    } else emit({ type: "answer_delta", text: fallbackAnswer(findings, insights) });
  }

  emit({ type: "run_done", durationMs: Date.now() - t0 });
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function reverseGeocode([lng, lat]: [number, number]) {
  const r = await getJson<{ address?: Record<string, string> }>(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=16`, { timeoutMs: 6000 });
  const a = r.address ?? {};
  const local = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.city_district ?? a.road;
  const city = a.city ?? a.town ?? a.village ?? a.county;
  return [local, city].filter(Boolean).join(", ") || undefined;
}

const KEYWORDS: Record<string, RegExp> = {
  "fema-flood": /flood|water|storm|rain|surge|sea|insur|hazard|risk|safe|build|develop/i,
  "terrain-elevation": /flood|sea.?level|elevation|low|surge|climate|risk|build/i,
  "sf-permits": /build|construct|develop|permit|housing|units|project|new|zoning|invest/i,
  "sf-311": /noise|complain|clean|safe|crime|encamp|street|homeless|condition|foot|flood/i,
  "osm-places": /shop|store|cafe|coffee|restaurant|business|competit|amenit|school|transit|park|retail|open/i,
  "usgs-seismic": /quake|earthquake|seismic|fault|shak|risk|hazard|safe|insur/i,
  "live-conditions": /now|current|today|alert|fire|smoke|air|weather|heat|situation/i,
  "local-news": /news|happen|recent|story|event|council|protest|situation|why/i,
  "census-demographics": /income|demograph|people|who|live|rent|population|customer|afford/i,
};

function heuristicPlan(req: RunRequest, workers: Worker[]): { steps: PlanStep[]; rationale: string } {
  const profile = getProfile(req.profileId);
  if (req.mode === "insights" || !req.question) {
    return {
      steps: profile.defaultAgents.filter((id) => workers.some((w) => w.id === id)).map((id) => ({ agentId: id, reason: `Core ${profile.name} survey` })),
      rationale: `Insights mode: sending the full ${profile.name} survey team and looking for findings that combine.`,
    };
  }
  const q = req.question;
  let steps = workers.filter((w) => KEYWORDS[w.id]?.test(q)).map((w) => ({ agentId: w.id, reason: `Question mentions ${q.match(KEYWORDS[w.id])?.[0]}` }));
  if (steps.length < 2) steps = profile.defaultAgents.slice(0, 4).map((id) => ({ agentId: id, reason: `${profile.name} default` }));
  return { steps, rationale: `Matched the question to ${steps.length} agents.` };
}

const PlanSchema = z.object({
  rationale: z.string(),
  steps: z.array(z.object({ agentId: z.string(), reason: z.string(), focus: z.string() })),
  gaps: z.array(z.string()),
});

async function llmPlan(req: RunRequest, workers: Worker[]) {
  const profile = getProfile(req.profileId);
  const roster = workers.map((w) => `- ${w.id} | ${w.name} | coverage: ${w.coverage} | ${w.description}`).join("\n");
  const res = await llm()!.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(PlanSchema) },
    ...FALLBACK,
    system: `You are the "${profile.name}" orchestrator of a geospatial multi-agent system. ${profile.domainPrompt}\n\nPick ONLY the worker agents needed to answer the user's question about the selected map area (usually 2–5). For each, give a one-sentence reason and an optional narrower focus (empty string if none). In "gaps", list any data the question needs that NO agent below can provide, phrased as a one-line spec for a new agent (e.g. "scrape Yelp reviews for cafés in the area"); usually empty. "rationale" is one sentence a user will read.\n\nAvailable agents:\n${roster}`,
    messages: [{ role: "user", content: `Area: ${req.region.label ?? "unknown"} (${touchesSF(req.region) ? "inside San Francisco" : "outside San Francisco"}).\nQuestion: ${req.question}` }],
  });
  const out = res.parsed_output;
  if (!out) throw new Error(`planner returned no parse (${res.stop_reason})`);
  return {
    steps: out.steps.filter((s) => workers.some((w) => w.id === s.agentId)).map((s) => ({ ...s, focus: s.focus || undefined })),
    rationale: out.rationale,
    gaps: out.gaps.slice(0, 2),
  };
}

function compactFindings(findings: Finding[], max = 140) {
  // Highest-severity first; keep the prompt bounded.
  return [...findings].sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0)).slice(0, max)
    .map((f) => `[${f.id}] (${f.worker_id}, ${f.source_type}${f.observed_at ? `, ${f.observed_at}` : ""}, conf ${f.confidence}) ${f.claim}`).join("\n");
}

const InsightSchema = z.object({
  insights: z.array(z.object({
    title: z.string(),
    body: z.string(),
    kind: z.enum(["risk", "opportunity", "conflict", "note"]),
    severity: z.number(),
    findingIds: z.array(z.string()),
  })),
});

async function llmInsights(req: RunRequest, findings: Finding[], links: Link[]): Promise<Insight[]> {
  const profile = getProfile(req.profileId);
  const res = await llm()!.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium", format: betaZodOutputFormat(InsightSchema) },
    ...FALLBACK,
    system: `You are the "${profile.name}" orchestrator. ${profile.domainPrompt}\n\nYou receive findings from several independent agents about one map area, plus candidate connections computed by spatial joins. Produce 3–6 insights that COMBINE findings from different agents into something none could say alone: risks, opportunities, and conflicts (where sources disagree, say which you trust and why, using recency and source authority). Don't restate single findings. Each insight cites the finding ids it rests on (use the exact [F#] ids). Title ≤ 12 words; body 1–3 sentences with concrete numbers/addresses. severity 0–1. Never invent facts not in the findings.`,
    messages: [{
      role: "user",
      content: `Area: ${req.region.label ?? "unknown"}\n${req.question ? `User question: ${req.question}\n` : "Mode: open-ended insights\n"}\nFINDINGS\n${compactFindings(findings)}\n\nCANDIDATE CONNECTIONS (spatial joins)\n${links.map((l) => `- ${l.title}: ${l.body} [${l.findingIds.join(", ")}]`).join("\n") || "(none)"}`,
    }],
  });
  const valid = new Set(findings.map((f) => f.id));
  return (res.parsed_output?.insights ?? []).map((i, n) => ({
    ...i, id: `I${n + 1}`, severity: Math.max(0, Math.min(1, i.severity)),
    findingIds: i.findingIds.map((x) => x.replace(/[[\]]/g, "")).filter((x) => valid.has(x)),
  }));
}

async function llmAnswer(req: RunRequest, findings: Finding[], insights: Insight[], onText: (t: string) => void) {
  const profile = getProfile(req.profileId);
  const stream = llm()!.beta.messages.stream({
    model: MODEL,
    max_tokens: 6000,
    output_config: { effort: "medium" },
    ...FALLBACK,
    system: `You are the "${profile.name}" orchestrator. ${profile.domainPrompt}\n\nAnswer the user's question about the selected area in ≤180 words of markdown: lead with a direct verdict, then 2–4 short bullets of evidence. Cite findings inline as [F12]. Be honest about gaps and data limits (e.g. coverage, data age). No preamble.`,
    messages: [{
      role: "user",
      content: `Area: ${req.region.label ?? "unknown"}\nQuestion: ${req.question}\n\nINSIGHTS\n${insights.map((i) => `- (${i.kind}) ${i.title}: ${i.body} [${i.findingIds.join(", ")}]`).join("\n")}\n\nFINDINGS\n${compactFindings(findings, 100)}`,
    }],
  });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") onText(ev.delta.text);
  }
}

function fallbackAnswer(findings: Finding[], insights: Insight[]) {
  const top = insights.slice(0, 3).map((i) => `- **${i.title}**: ${i.body} ${i.findingIds.slice(0, 3).map((x) => `[${x}]`).join("")}`).join("\n");
  const areaLevel = findings.filter((f) => f.props?.areaLevel).slice(0, 4).map((f) => `- ${f.claim} [${f.id}]`).join("\n");
  return `**${findings.length} findings collected.**${top ? `\n\n${top}` : ""}${areaLevel ? `\n\n${areaLevel}` : ""}\n\n_Set ANTHROPIC_API_KEY for a reasoned answer from the orchestrator._`;
}
