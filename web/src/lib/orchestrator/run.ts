// The orchestrator loop (README §3a): plan → dispatch → cross-reference → re-dispatch → synthesize.
// Emits RunEvents as it goes; the API route streams them to the map over SSE.

import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { partialParse } from "@anthropic-ai/sdk/_vendor/partial-json-parser/parser";
import type { Finding, Insight, PlanStep, RunEvent, RunRequest, Worker, WorkerTask } from "@/lib/types";
import { allWorkers, getWorker, toConfig } from "@/lib/agents/registry";
import { requestSpawn } from "@/lib/agents/factory";
import { getProfile } from "./profiles";
import { crossReference, redispatchTargets, type Link } from "./crossref";
import { llm, MODEL } from "@/lib/llm";

const QUOTA_NOTE = "Claude quota reached for this hour — running in heuristic mode.";
import { getJson, sleep } from "@/lib/http";
import { regionAreaKm2, touchesSF, touchesUS } from "@/lib/geo";

const ORCH = "orchestrator";
const WORKER_TIMEOUT_MS = 30_000;
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export type RunOptions = {
  /** false forces heuristic mode (e.g. the hourly Claude quota is used up). Default: use Claude if a key is set. */
  llm?: boolean;
  /** The run was downgraded by the quota; say so in the log and the answer. */
  quotaLimited?: boolean;
};

export async function runOrchestrator(req: RunRequest, emitRaw: (e: RunEvent) => void, signal: AbortSignal, opts: RunOptions = {}) {
  const t0 = Date.now();
  // Once the user recalls the agents nothing more goes out (the caller ends the run for viewers).
  const emit = (e: RunEvent) => { if (!signal.aborted) emitRaw(e); };
  const profile = getProfile(req.profileId);
  const region = req.region;
  const client = opts.llm === false ? null : llm();
  const findings: Finding[] = [];
  let fid = 0;
  const think = (text: string) => emit({ type: "thought", agentId: ORCH, text });
  // Phase timings go to the server log (Vercel function logs), not the user-facing thoughts.
  const lap = (phase: string, since: number) => console.info(`[timing] ${phase} ${Date.now() - since}ms (t=${Date.now() - t0}ms)`);

  emit({ type: "run_started", runId: crypto.randomUUID(), mode: req.mode, profileId: profile.id, region, question: req.question, llm: !!client });
  if (opts.quotaLimited) think(QUOTA_NOTE);

  // ── 0. Where are we? ──────────────────────────────────────────────────────
  region.label = await reverseGeocode(region.center, regionAreaKm2(region)).catch(() => undefined);
  if (signal.aborted) return;
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
      const tp = Date.now();
      ({ steps, rationale, gaps } = await llmPlan(req, workers));
      lap("plan", tp);
    } catch (e) {
      think(`Planner fell back to heuristics (${(e as Error).message.slice(0, 80)})`);
      ({ steps, rationale } = heuristicPlan(req, workers));
    }
  } else {
    ({ steps, rationale } = heuristicPlan(req, workers));
  }
  if (signal.aborted) return;
  // Drop SF-only / US-only agents outside their coverage rather than dispatching them to do nothing
  // (or worse, to report "no FEMA flood zone" in London).
  const covered = (w: Worker) => (w.coverage !== "San Francisco" || touchesSF(region)) && (w.coverage !== "US" || touchesUS(region));
  const skipped = steps.filter((s) => getWorker(s.agentId) && !covered(getWorker(s.agentId)!));
  steps = steps.filter((s) => getWorker(s.agentId) && covered(getWorker(s.agentId)!));
  if (skipped.length) rationale += ` Skipping ${skipped.map((s) => getWorker(s.agentId)!.name).join(", ")}: no coverage here.`;
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
    if (signal.aborted) return;
    emit({ type: "agent_status", agentId: w.id, status: "scanning", dispatchId });
    let n = 0;
    // Hard per-worker timeout: one hung API can't stall the mission. The worker's own signal is
    // aborted too so its in-flight fetches stop; late findings after the timeout are dropped.
    const wctl = new AbortController();
    const onAbort = () => wctl.abort();
    signal.addEventListener("abort", onAbort);
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { timedOut = true; wctl.abort(); reject(new Error(`timed out after ${WORKER_TIMEOUT_MS / 1000}s`)); }, WORKER_TIMEOUT_MS);
    });
    try {
      await Promise.race([timeout, w.run({
        task,
        signal: wctl.signal,
        log: (text) => emit({ type: "agent_log", agentId: w.id, text }),
        emit: (f) => {
          if (timedOut) return;
          const finding: Finding = { ...f, id: `F${++fid}`, worker_id: w.id };
          findings.push(finding);
          n++;
          emit({ type: "finding", finding, dispatchId });
        },
      })]);
      emit({ type: "agent_status", agentId: w.id, status: "done", dispatchId, detail: `${n} finding${n === 1 ? "" : "s"}` });
    } catch (e) {
      if (signal.aborted) return;
      const detail = timedOut ? `timed out after ${WORKER_TIMEOUT_MS / 1000}s${n ? ` (${n} finding${n === 1 ? "" : "s"} kept)` : ""}` : (e as Error).message.slice(0, 140);
      if (timedOut) think(`${w.name} timed out; continuing without it.`);
      emit({ type: "agent_status", agentId: w.id, status: "error", dispatchId, detail });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  };

  const baseTask: WorkerTask = { region, question: req.question };
  const td = Date.now();
  await Promise.all(steps.map((s, i) => dispatch(getWorker(s.agentId)!, { ...baseTask, focus: s.focus }, i * 250)));
  if (signal.aborted) return;
  lap("sweep", td);
  think(`First sweep complete: ${findings.length} findings from ${steps.length} agents. Cross-referencing…`);

  // ── 3. Re-dispatch: send the terrain drone to inspect the specific parcels that matter ──
  const targets = redispatchTargets(findings);
  const terrain = getWorker("terrain-elevation");
  if (terrain && targets.length && profile.id !== "storefront") {
    think(`Re-dispatching ${terrain.name} to measure ground elevation at ${targets.length} permitted parcels.`);
    await dispatch(terrain, { ...baseTask, targets, focus: `Check elevation at ${targets.length} permitted parcels` });
    if (signal.aborted) return;
  }

  // ── 4 + 5. Cross-reference → insights, and (Ask mode) the answer, in parallel ──
  // The answer reasons over the findings + spatial-join links directly rather than waiting for
  // the insight synthesis, so the two Claude calls overlap (roughly halves the tail latency).
  const links = crossReference(findings);
  const asking = req.mode === "ask" && !!req.question;
  let streamed = 0;
  const insightsP = (async (): Promise<Insight[]> => {
    if (client && findings.length) {
      think("Connecting findings across agents…");
      const ti = Date.now();
      try { return await llmInsights(req, findings, links, (i) => { streamed++; emit({ type: "insight", insight: i }); }); }
      catch (e) { think(`Insight synthesis fell back to rules (${(e as Error).message.slice(0, 80)})`); }
      finally { lap("insights", ti); }
    }
    return [];
  })();
  // Claude's insights were emitted as they streamed; rule-based ones (no Claude, or it failed
  // before producing any) are revealed one by one.
  const insightsShown = insightsP.then(async (ins) => {
    if (streamed) return ins;
    const rules = links.map((l, i) => ({ ...l, id: `I${i + 1}` }));
    for (const i of rules) { if (signal.aborted) break; emit({ type: "insight", insight: i }); await sleep(250); }
    return ins.length ? ins : rules;
  });
  const answered = (async () => {
    if (!asking) return;
    if (!client) {
      emit({ type: "answer_delta", text: fallbackAnswer(findings, await insightsShown, opts.quotaLimited) });
      return;
    }
    const ta = Date.now();
    try { await llmAnswer(req, findings, links, (t) => emit({ type: "answer_delta", text: t })); }
    catch (e) { emit({ type: "answer_delta", text: fallbackAnswer(findings, await insightsShown) + `\n\n(LLM error: ${(e as Error).message.slice(0, 100)})` }); }
    finally { lap("answer", ta); }
  })();
  await Promise.all([insightsShown, answered]);

  lap("run", t0);
  emit({ type: "run_done", durationMs: Date.now() - t0 });
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function reverseGeocode([lng, lat]: [number, number], areaKm2: number) {
  // A whole-city selection shouldn't be named after the block at its centroid.
  const zoom = areaKm2 > 40 ? 10 : areaKm2 > 8 ? 13 : 16;
  const r = await getJson<{ address?: Record<string, string> }>(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=${zoom}`, { timeoutMs: 6000 });
  const a = r.address ?? {};
  const local = a.neighbourhood ?? a.suburb ?? a.quarter ?? a.city_district ?? a.road;
  const city = a.city ?? a.town ?? a.village ?? a.county;
  return [local, city].filter(Boolean).join(", ") || undefined;
}

// Leading \b so "know" doesn't match /now/, "current" doesn't match /rent/, "follow" doesn't match /low/.
const KEYWORDS: Record<string, RegExp> = {
  "fema-flood": /\b(flood|water|storm|rain|surge|sea\b|insur|hazard|risk|safe|build|develop)/i,
  "sf-stormwater": /\b(flood|storm|rain|water|creek|drain|sewer|risk|build|develop|insur)/i,
  "terrain-elevation": /\b(flood|sea.?level|elevation|low\b|low-?lying|surge|climate|risk|build)/i,
  "sf-permits": /\b(build|construct|develop|permit|housing|units|project|new\b|zoning|invest)/i,
  "sf-311": /\b(noise|complain|report|problem|clean|safe|crime|encamp|street|homeless|condition|foot|flood)/i,
  "osm-places": /\b(shop|store|cafe|café|coffee|restaurant|food|drink|bar\b|saturat|business|competit|amenit|school|hospital|facilit|transit|park|retail|open)/i,
  "usgs-seismic": /\b(quake|earthquake|seismic|fault|shak|risk|hazard|safe|insur)/i,
  "live-conditions": /\b(now|current|today|alert|fire|smoke|air\b|air quality|weather|heat|situation)/i,
  "local-news": /\b(news|happen|recent|story|event|council|protest|situation|why)/i,
  "census-demographics": /\b(income|demograph|people|who\b|live|rent|population|customer|afford)/i,
  "sentinel-imagery": /\b(satellite|imagery|image|photo|aerial|from (space|above)|sentinel|landsat|vegetation|green|land ?cover|space)/i,
  "orbit-passes": /\b(orbit|satellite pass|overpass|next (image|pass)|revisit|iss\b|space station|tle\b|space)/i,
  "nasa-eonet": /\b(fire|wildfire|smoke|burn|storm|hurricane|cyclone|volcan|landslide|disaster|natural event|nasa|flood)/i,
};

function heuristicPlan(req: RunRequest, workers: Worker[]): { steps: PlanStep[]; rationale: string } {
  const profile = getProfile(req.profileId);
  const core = profile.defaultAgents.filter((id) => workers.some((w) => w.id === id));
  if (req.mode === "insights" || !req.question) {
    return {
      steps: core.map((id) => ({ agentId: id, reason: `Core ${profile.name} survey` })),
      rationale: `Insights mode: sending the full ${profile.name} survey team and looking for findings that combine.`,
    };
  }
  const q = req.question;
  const steps = workers.filter((w) => KEYWORDS[w.id]?.test(q)).map((w) => ({ agentId: w.id, reason: `Question mentions "${q.match(KEYWORDS[w.id])?.[0]}"` }));
  const matched = steps.length;
  // Few keyword hits: top up with this orchestrator's core team so a vague question still gets a real survey.
  for (const id of core) {
    if (steps.length >= 4) break;
    if (!steps.some((s) => s.agentId === id)) steps.push({ agentId: id, reason: `${profile.name} core agent` });
  }
  return {
    steps,
    rationale: matched
      ? `Matched the question to ${matched} agent${matched === 1 ? "" : "s"}${steps.length > matched ? `, plus ${steps.length - matched} from the ${profile.name} core team` : ""}.`
      : `No specific keywords; sending the ${profile.name} core team.`,
  };
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

// Streams the structured output and hands each insight to onInsight as soon as its JSON object is
// complete (the next one has started), so cards land on the map while Claude is still writing.
async function llmInsights(req: RunRequest, findings: Finding[], links: Link[], onInsight: (i: Insight) => void): Promise<Insight[]> {
  const profile = getProfile(req.profileId);
  const stream = llm()!.beta.messages.stream({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "low", format: betaZodOutputFormat(InsightSchema) },
    ...FALLBACK,
    system: `You are the "${profile.name}" orchestrator. ${profile.domainPrompt}\n\nYou receive findings from several independent agents about one map area, plus candidate connections computed by spatial joins. Produce 3–5 insights that COMBINE findings from different agents into something none could say alone: risks, opportunities, and conflicts (where sources disagree, say which you trust and why, using recency and source authority). Don't restate single findings. Each insight cites the finding ids it rests on (use the exact [F#] ids). Title ≤ 12 words; body 1–2 sentences with concrete numbers/addresses. severity 0–1. Never invent facts not in the findings. Most important insight first.`,
    messages: [{
      role: "user",
      content: `Area: ${req.region.label ?? "unknown"}\n${req.question ? `User question: ${req.question}\n` : "Mode: open-ended insights\n"}\nFINDINGS\n${compactFindings(findings)}\n\nCANDIDATE CONNECTIONS (spatial joins)\n${links.map((l) => `- ${l.title}: ${l.body} [${l.findingIds.join(", ")}]`).join("\n") || "(none)"}`,
    }],
  });
  const valid = new Set(findings.map((f) => f.id));
  const out: Insight[] = [];
  const accept = (raw: unknown) => {
    const p = InsightSchema.shape.insights.element.safeParse(raw);
    if (!p.success) return;
    const ins: Insight = {
      ...p.data, id: `I${out.length + 1}`, severity: Math.max(0, Math.min(1, p.data.severity)),
      findingIds: p.data.findingIds.map((x) => x.replace(/[[\]]/g, "")).filter((x) => valid.has(x)),
    };
    out.push(ins);
    onInsight(ins);
  };
  // Text deltas concatenate across blocks (a mid-stream fallback continues the same JSON text).
  let json = "";
  let seen = 0;
  for await (const ev of stream) {
    if (ev.type !== "content_block_delta" || ev.delta.type !== "text_delta") continue;
    json += ev.delta.text;
    let items: unknown[] = [];
    try { items = ((partialParse(json) as { insights?: unknown[] })?.insights) ?? []; } catch { continue; }
    // Every element but the last is complete once a later one has begun.
    while (seen < items.length - 1) accept(items[seen++]);
  }
  const final = await stream.finalMessage();
  const all = final.parsed_output?.insights ?? [];
  while (seen < all.length) accept(all[seen++]);
  return out;
}

async function llmAnswer(req: RunRequest, findings: Finding[], links: Link[], onText: (t: string) => void) {
  const profile = getProfile(req.profileId);
  const stream = llm()!.beta.messages.stream({
    model: MODEL,
    max_tokens: 6000,
    output_config: { effort: "low" },
    ...FALLBACK,
    system: `You are the "${profile.name}" orchestrator. ${profile.domainPrompt}\n\nAnswer the user's question about the selected area in ≤180 words of markdown: lead with a direct verdict, then 2–4 short bullets of evidence. Cite findings inline as [F12]. Be honest about gaps and data limits (e.g. coverage, data age). No preamble.`,
    messages: [{
      role: "user",
      content: `Area: ${req.region.label ?? "unknown"}\nQuestion: ${req.question}\n\nFINDINGS\n${compactFindings(findings)}\n\nCANDIDATE CONNECTIONS (spatial joins between agents' findings)\n${links.map((l) => `- ${l.title}: ${l.body} [${l.findingIds.join(", ")}]`).join("\n") || "(none)"}`,
    }],
  });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") onText(ev.delta.text);
  }
}

function fallbackAnswer(findings: Finding[], insights: Insight[], quotaLimited = false) {
  // Plain text: the panel's mini-markdown renders **bold** and bullets, not _italics_.
  const note = quotaLimited ? QUOTA_NOTE : "Heuristic mode: set ANTHROPIC_API_KEY for a reasoned answer from the orchestrator.";
  if (!findings.length) return `**No findings came back for this area.** The agents that cover it had nothing to report; city feeds (permits, 311, storm flooding) only cover San Francisco.\n\n${note}`;
  const top = insights.slice(0, 3).map((i) => `- **${i.title}**: ${i.body} ${i.findingIds.slice(0, 3).map((x) => `[${x}]`).join("")}`).join("\n");
  const areaLevel = findings.filter((f) => f.props?.areaLevel).slice(0, 4);
  // No cross-agent insight: surface the most notable pinned findings instead.
  const notable = insights.length ? [] : findings.filter((f) => !f.props?.areaLevel && !f.props?.offRegion)
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0)).slice(0, 3);
  const list = [...areaLevel, ...notable].map((f) => `- ${f.claim} [${f.id}]`).join("\n");
  const agents = new Set(findings.map((f) => f.worker_id)).size;
  return `**${findings.length} findings from ${agents} agent${agents === 1 ? "" : "s"}.**${top ? `\n\n${top}` : ""}${list ? `\n\n${list}` : ""}\n\n${note}`;
}
