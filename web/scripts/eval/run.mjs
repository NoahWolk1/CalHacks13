// Coordinate eval battery: submits cases to the dev server, reads events from SpacetimeDB, tags + LLM-judges each run.
// usage: node run.mjs [--cases cases.json] [--only id1,id2] [--out results/<label>] [--concurrency 2] [--timeout 150] [--no-judge] [--label name]
//        node run.mjs --report results/<label>     (re-render report.md from saved case JSONs)
// env: APP (default http://localhost:3005), WEB_DIR (default: ../.. from this script, else ~/CalHacks13/web)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : (argv[i + 1] ?? true); };
const flag = (k) => argv.includes(`--${k}`);

const WEB = process.env.WEB_DIR || [resolve(HERE, "../.."), "/Users/noahwolk/CalHacks13/web"].find((p) => existsSync(join(p, "node_modules/@anthropic-ai/sdk")));
const APP = process.env.APP || "http://localhost:3005";
const ST = "https://maincloud.spacetimedb.com", DB = "geoswarm";
const TIMEOUT = Number(arg("timeout", 150)) * 1000, CONC = Number(arg("concurrency", 2));
const SLOW_MS = 90_000;

// ── env (no printing) ──
for (const line of readFileSync(join(WEB, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m || process.env[m[1]]) continue;
  process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const sql = async (q) => {
  const r = await fetch(`${ST}/v1/database/${DB}/sql`, { method: "POST", body: q }); const t = await r.text();
  if (!r.ok) throw new Error(t.slice(0, 200)); return JSON.parse(t)[0].rows;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const regionOf = (b) => {
  const ring = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]];
  return { kind: "box", polygon: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }, bbox: b, center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] };
};
const areaKm2 = (b) => ((b[2] - b[0]) * 111.32 * Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180)) * ((b[3] - b[1]) * 110.57);

// ── run one case ──
async function runCase(c) {
  const t0 = Date.now();
  const res = await fetch(`${APP}/api/run`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: c.mode, profileId: c.profileId || "auto", region: regionOf(c.bbox), question: c.mode === "ask" ? c.question : undefined }) });
  const { runId } = await res.json();
  let status = "running", timedOut = false;
  while (Date.now() - t0 < TIMEOUT) {
    await sleep(2000);
    try { status = (await sql(`SELECT status FROM runs WHERE run_id = '${runId}'`))[0]?.[0] ?? status; } catch { /* transient */ }
    if (status !== "running") break;
  }
  if (status === "running") {
    timedOut = true;
    await fetch(`${APP}/api/run/stop`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId }) }).catch(() => {});
    await sleep(3000);
  }
  const wall = Date.now() - t0;
  const events = (await sql(`SELECT seq, type, event_json FROM events WHERE run_id = '${runId}'`)).sort((a, b) => a[0] - b[0]).map((r) => JSON.parse(r[2]));
  return summarize(c, runId, events, { wall, timedOut, status });
}

function summarize(c, runId, ev, { wall, timedOut, status }) {
  const routed = ev.find((e) => e.type === "routed");
  const plan = ev.find((e) => e.type === "plan");
  const names = {};
  const spawned = ev.filter((e) => e.type === "agent_spawned").map((e) => { names[e.agent.id] = e.agent.name; return { id: e.agent.id, name: e.agent.name, tools: e.agent.tools }; });
  const gaps = ev.filter((e) => e.type === "agent_gap").map((e) => e.need);
  const findings = ev.filter((e) => e.type === "finding").map((e) => ({ ...e.finding, dispatchId: e.dispatchId }));
  const dispatches = {};
  for (const e of ev.filter((e) => e.type === "agent_status")) {
    const d = (dispatches[e.dispatchId] ??= { agentId: e.agentId, focus: e.focus, status: e.status, detail: "", findings: 0 });
    d.status = e.status; if (e.detail) d.detail = e.detail; if (e.focus) d.focus = e.focus;
  }
  for (const f of findings) if (dispatches[f.dispatchId]) dispatches[f.dispatchId].findings++;
  const byAgent = {};
  for (const f of findings) byAgent[f.worker_id] = (byAgent[f.worker_id] || 0) + 1;
  const perAgentDispatch = {};
  for (const d of Object.values(dispatches)) perAgentDispatch[d.agentId] = (perAgentDispatch[d.agentId] || 0) + 1;
  const redispatches = Object.values(dispatches).filter((d, i, all) => all.findIndex((x) => x.agentId === d.agentId) !== i)
    .map((d) => ({ agentId: d.agentId, focus: (d.focus || "").slice(0, 160), status: d.status, findings: d.findings }));
  const agentErrors = Object.values(dispatches).filter((d) => d.status === "error").map((d) => ({ agentId: d.agentId, detail: d.detail }));
  const thoughts = ev.filter((e) => e.type === "thought").map((e) => e.text);
  const insights = ev.filter((e) => e.type === "insight").map((e) => e.insight);
  const answer = ev.filter((e) => e.type === "answer_delta").map((e) => e.text).join("");
  const done = ev.find((e) => e.type === "run_done");
  const errors = ev.filter((e) => e.type === "error").map((e) => e.message);
  const label = ev.find((e) => e.type === "region_labeled")?.label;

  const tags = [];
  if (!findings.length) tags.push("NO_FINDINGS");
  const spawnFailedThought = thoughts.some((t) => /Couldn't create an agent|No agent created/i.test(t));
  const spawnedNoFind = spawned.filter((s) => !byAgent[s.id]);
  if (spawnFailedThought || spawnedNoFind.length) tags.push("SPAWN_FAILED");
  if (timedOut || agentErrors.some((e) => /timed out/i.test(e.detail))) tags.push("AGENT_TIMEOUT");
  if (timedOut) tags.push("RUN_TIMEOUT");
  if (routed && c.okRoutes && !c.okRoutes.includes(routed.profileId)) tags.push("BAD_ROUTE");
  const text = c.mode === "ask" ? answer : insights.map((i) => `${i.title}. ${i.body}`).join("\n");
  const idRe = /\bunresolved\b|\b(?:node|way|relation)\/\d+|\bQ\d{5,}\b|\b(?:taxon|usage|species)?[Kk]ey[:=\s]+\d{4,}|\bid[:=\s#]+\d{5,}/;
  if (idRe.test(text) || findings.filter((f) => idRe.test(f.claim)).length >= 3) tags.push("UNRESOLVED_IDS");
  if (/\b(cannot|can't|can ?not|unable to|impossible to|no way to) (be )?(determine|tell|say|answer|confirm|estimate|count)|\bnot (possible|enough data) to (determine|tell|answer)|\bno (data|findings) (on|about|for)\b|\bdon't (have|show)\b.{0,40}\b(data|count|figure)/i.test(text)) tags.push("CANT_TELL");
  const durationMs = done?.durationMs ?? wall;
  if (durationMs > SLOW_MS || timedOut) tags.push("SLOW");
  if (errors.length) tags.push("RUN_ERROR");
  if (c.mode === "ask" && !answer.trim()) tags.push("NO_ANSWER");

  return {
    id: c.id, mode: c.mode, question: c.question, place: c.place, bbox: c.bbox, areaKm2: Math.round(areaKm2(c.bbox) * 100) / 100,
    runId, status, timedOut, durationMs, label,
    routed: routed ? { profileId: routed.profileId, reason: routed.reason, auto: routed.auto } : null,
    plan: plan ? plan.steps.map((s) => ({ agentId: s.agentId, focus: s.focus, reason: s.reason })) : [],
    planRationale: plan?.rationale, gaps,
    spawned: spawned.map((s) => ({ ...s, findings: byAgent[s.id] || 0 })),
    dispatches: Object.values(dispatches).map((d) => ({ ...d, name: names[d.agentId] })), redispatches, agentErrors,
    findingsCount: findings.length, findingsByAgent: byAgent,
    insights: insights.map((i) => ({ title: i.title, body: i.body, kind: i.kind })),
    answer, errors, tags, thoughts,
    findingsSample: findings.slice(0, 80).map((f) => ({ id: f.id, worker: f.worker_id, claim: f.claim.slice(0, 260), src: f.source_type })),
  };
}

// ── LLM judge ──
let anthropic;
async function judge(r) {
  if (!anthropic) { const req = createRequire(join(WEB, "package.json")); const A = req("@anthropic-ai/sdk"); anthropic = new (A.default || A)({ apiKey: process.env.ANTHROPIC_API_KEY }); }
  const out = r.mode === "ask" ? r.answer : r.insights.map((i) => `- [${i.kind}] ${i.title}: ${i.body}`).join("\n");
  const prompt = `You grade one run of "Coordinate", an app where a user draws a box on a map and an orchestrator routes to a profile (general = Area Researcher, site-risk = Site Risk Analyst, storefront = Storefront Scout, disaster = Disaster Response), dispatches data agents, and writes an answer (Ask mode) or 3-5 insights (Insights mode) from their findings.

CASE
Mode: ${r.mode}
Question: ${r.question ?? "(none: open-ended insights about the area)"}
Place (ground truth, not shown to the app): ${r.place}; box ${JSON.stringify(r.bbox)} (~${r.areaKm2} km2)
Routed to: ${r.routed?.profileId} (${r.routed?.reason})
Plan: ${r.plan.map((p) => p.agentId).join(", ")}${r.spawned.length ? `\nGenerated agents: ${r.spawned.map((s) => `${s.name} (${s.findings} findings)`).join("; ")}` : ""}
Agent errors: ${r.agentErrors.map((e) => `${e.agentId}: ${e.detail}`).join("; ") || "none"}
Findings: ${r.findingsCount} total, by agent ${JSON.stringify(r.findingsByAgent)}
FINDINGS SAMPLE (first 80)
${r.findingsSample.map((f) => `[${f.id}] (${f.worker}) ${f.claim}`).join("\n") || "(none)"}

OUTPUT SHOWN TO USER
${out || "(empty)"}

RUBRIC (integers)
- answered: 0-2. 2 = directly answers the actual question with specifics (numbers, names); 1 = partial/hedged/generic; 0 = does not answer. For Insights mode: 2 = insights are specific, non-trivial and about this place.
- grounded: 0-2. 2 = claims trace to the findings above (citations match); 1 = mixed; 0 = mostly unsupported or contradicts findings.
- honest: 0-1. 1 = clear about gaps, data age and coverage limits where relevant (or none needed); 0 = overclaims or hides that data is missing/irrelevant for this place.
- routing: 0-1. 1 = profile and agent plan are sensible for the question and place (e.g. not SF-only agents for Lagos).
- focus: 0-1. 1 = no irrelevant filler (e.g. hazards when asked about history, SF data for non-SF places).
Also give: failure_class = short snake_case label for the MAIN problem (or "none"), and note = one sentence explaining the biggest problem.
Return ONLY JSON: {"answered":n,"grounded":n,"honest":n,"routing":n,"focus":n,"failure_class":"...","note":"..."}`;
  for (let i = 0; i < 3; i++) {
    try {
      const msg = await anthropic.beta.messages.create({ model: "claude-opus-5-5", max_tokens: 2000, output_config: { effort: "low" }, messages: [{ role: "user", content: prompt }] });
      const t = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const j = JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
      j.total = ["answered", "grounded", "honest", "routing", "focus"].reduce((s, k) => s + (Number(j[k]) || 0), 0);
      return j;
    } catch (e) { if (i === 2) return { error: String(e.message).slice(0, 200), total: null }; await sleep(3000); }
  }
}

// ── report ──
function report(dir) {
  const rs = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "meta.json").map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
  const meta = existsSync(join(dir, "meta.json")) ? JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")) : {};
  const order = JSON.parse(readFileSync(meta.casesFile || join(HERE, "cases.json"), "utf8")).map((c) => c.id);
  rs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const scored = rs.filter((r) => r.judge?.total != null);
  const avg = scored.length ? (scored.reduce((s, r) => s + r.judge.total, 0) / scored.length).toFixed(2) : "n/a";
  const tagCounts = {}; for (const r of rs) for (const t of r.tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
  const classes = {}; for (const r of scored) { const k = r.judge.failure_class || "none"; (classes[k] ??= []).push(r.id); }
  const L = [];
  L.push(`# Eval ${meta.label || ""}`, "", `commit ${meta.commit || "?"} · started ${meta.started || "?"} · ${rs.length} cases · avg judge score **${avg} / 7**`, "");
  L.push(`Tags: ${Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`, "");
  L.push("| case | mode | route | plan / spawned | findings | dur s | A G H R F | total | tags | judge note |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rs) {
    const j = r.judge || {};
    const sp = r.spawned.length ? ` +gen: ${r.spawned.map((s) => `${s.name}(${s.findings})`).join(", ")}` : "";
    L.push(`| ${r.id} | ${r.mode} | ${r.routed?.profileId ?? "-"} | ${r.plan.map((p) => p.agentId).join(", ")}${sp} | ${r.findingsCount} | ${Math.round(r.durationMs / 1000)} | ${[j.answered, j.grounded, j.honest, j.routing, j.focus].join(" ")} | ${j.total ?? "-"} | ${r.tags.join(" ")} | ${(j.note || j.error || "").replace(/\|/g, "/")} |`);
  }
  L.push("", "## Judge failure classes", "");
  for (const [k, ids] of Object.entries(classes).sort((a, b) => b[1].length - a[1].length)) L.push(`- **${k}** (${ids.length}): ${ids.join(", ")}`);
  writeFileSync(join(dir, "report.md"), L.join("\n") + "\n");
  console.log(L.slice(0, 5).join("\n")); console.log(`report: ${join(dir, "report.md")}`);
}

// ── main ──
if (arg("report")) { report(resolve(arg("report"))); process.exit(0); }
const casesFile = resolve(arg("cases", join(HERE, "cases.json")));
let cases = JSON.parse(readFileSync(casesFile, "utf8"));
const only = arg("only"); if (only) cases = cases.filter((c) => String(only).split(",").includes(c.id));
const label = arg("label", new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19));
const out = resolve(arg("out", join(HERE, "results", label))); mkdirSync(out, { recursive: true });
let commit = "?"; try { commit = execSync(`git -C ${WEB} log -1 --format=%h`).toString().trim() + (execSync(`git -C ${WEB} status --porcelain`).toString().trim() ? "+dirty" : ""); } catch {}
writeFileSync(join(out, "meta.json"), JSON.stringify({ label, commit, started: new Date().toISOString(), casesFile, app: APP }, null, 2));
// Storefront-ish cases (paid Apify / Bright Data agents) run one at a time.
let sfRunning = 0;
const queue = [...cases];
async function worker() {
  while (queue.length) {
    let i = queue.findIndex((c) => !c.storefront || sfRunning === 0); if (i < 0) { await sleep(1000); continue; }
    const c = queue.splice(i, 1)[0]; if (c.storefront) sfRunning++;
    const t = Date.now(); process.stdout.write(`▶ ${c.id}\n`);
    let r;
    try { r = await runCase(c); } catch (e) { r = { id: c.id, mode: c.mode, question: c.question, place: c.place, bbox: c.bbox, tags: ["HARNESS_ERROR"], errors: [String(e.message)], plan: [], spawned: [], findingsCount: 0, durationMs: Date.now() - t, insights: [], answer: "", findingsSample: [], agentErrors: [], findingsByAgent: {} }; }
    finally { if (c.storefront) sfRunning--; }
    if (!flag("no-judge") && !r.tags.includes("HARNESS_ERROR")) r.judge = await judge(r);
    writeFileSync(join(out, `${c.id}.json`), JSON.stringify(r, null, 2));
    console.log(`✔ ${c.id} ${Math.round(r.durationMs / 1000)}s route=${r.routed?.profileId} findings=${r.findingsCount} score=${r.judge?.total ?? "-"} tags=${r.tags.join(",")}`);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
report(out);
