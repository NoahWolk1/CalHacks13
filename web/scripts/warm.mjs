// Warm the on-disk HTTP cache (web/.cache/http) before judging: runs an Insights mission
// (profile site-risk) over every demo spot in src/lib/client/demoSpots.ts, one at a time.
// Usage: npm run warm            (dev server on :3005)
//        BASE_URL=http://localhost:3000 npm run warm
//        BASE_URL=https://<app>.vercel.app npm run warm   (prod; SpacetimeDB host/db come from /api/agents)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

const BASE = process.env.BASE_URL ?? "http://localhost:3005";
const PROFILE = process.env.PROFILE ?? "site-risk";
const RUN_TIMEOUT_MS = 240_000;

// Parse the spots straight out of the TS source so this never drifts from the UI.
const src = readFileSync(fileURLToPath(new URL("../src/lib/client/demoSpots.ts", import.meta.url)), "utf8");
const spots = [...src.matchAll(/\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)".*?box:\s*\[([^\]]+)\]/g)].map((m) => ({
  id: m[1], label: m[2], box: m[3].split(",").map(Number),
}));
if (!spots.length) throw new Error("no demo spots parsed from demoSpots.ts");

function regionForBox([minX, minY, maxX, maxY]) {
  const ring = [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]];
  return {
    kind: "box",
    polygon: { type: "Feature", properties: {}, bbox: [minX, minY, maxX, maxY], geometry: { type: "Polygon", coordinates: [ring] } },
    bbox: [minX, minY, maxX, maxY],
    center: [(minX + maxX) / 2, (minY + maxY) / 2],
  };
}

/** Reads an SSE body until run_done/error, yielding RunEvents. */
async function* sseEvents(res) {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of res.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
      if (data) yield JSON.parse(data);
    }
  }
}

/** Polls Convex for a run's events until run_done/error. */
async function* convexEvents(runId) {
  const url = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL || readEnvLocal("NEXT_PUBLIC_CONVEX_URL");
  if (!url) throw new Error("got a Convex runId but no NEXT_PUBLIC_CONVEX_URL to poll");
  const client = new ConvexHttpClient(url);
  let after = -1;
  for (;;) {
    const rows = await client.query(anyApi.events.since, { runId, afterSeq: after });
    for (const r of rows) { after = r.seq; yield r.event; }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

/** Polls SpacetimeDB's SQL endpoint (public `events` table) for a run's events until run_done/error. */
async function* spacetimeEvents(runId) {
  const { live } = await (await fetch(`${BASE}/api/agents`)).json();
  if (!live?.spacetime) throw new Error("got a SpacetimeDB runId but /api/agents reports no spacetime host/db");
  const url = `${live.spacetime.host}/v1/database/${live.spacetime.db}/sql`;
  let after = -1;
  for (;;) {
    const res = await fetch(url, { method: "POST", body: `SELECT seq, event_json FROM events WHERE run_id = '${runId}'` });
    const rows = (await res.json())[0].rows.filter(([seq]) => seq > after).sort((a, b) => a[0] - b[0]);
    for (const [seq, json] of rows) { if (seq !== after + 1) break; after = seq; yield JSON.parse(json); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function readEnvLocal(name) {
  try {
    const txt = readFileSync(fileURLToPath(new URL("../.env.local", import.meta.url)), "utf8");
    return txt.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim() ?? "";
  } catch { return ""; }
}

async function warm(spot) {
  const t0 = Date.now();
  const body = { mode: "insights", profileId: PROFILE, region: { ...regionForBox(spot.box), label: spot.label } };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), RUN_TIMEOUT_MS);
  const res = await fetch(`${BASE}/api/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const sse = (res.headers.get("content-type") ?? "").includes("text/event-stream");
  const started = sse ? null : await res.json();
  const backend = sse ? "sse" : started.backend ?? "convex";
  const events = sse ? sseEvents(res) : backend === "spacetime" ? spacetimeEvents(started.runId) : convexEvents(started.runId);

  const out = { mode: backend, findings: 0, insights: [], agents: {}, error: undefined };
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  try {
    for await (const e of events) {
      if (e.type === "finding") out.findings++;
      else if (e.type === "insight") out.insights.push(e.insight.title);
      else if (e.type === "agent_status" && (e.status === "done" || e.status === "error")) out.agents[e.agentId] = e.status === "error" ? `ERR ${e.detail ?? ""}` : e.detail ?? "done";
      else if (e.type === "error") { out.error = e.message; break; }
      if (e.type === "run_done" || e.type === "error" || Date.now() > deadline) break;
    }
    if (Date.now() > deadline) out.error = "warm script timed out";
  } finally {
    clearTimeout(timer);
    ctl.abort();
  }
  out.secs = ((Date.now() - t0) / 1000).toFixed(1);
  return out;
}

let failed = 0;
for (const spot of spots) {
  process.stdout.write(`\n▶ ${spot.id} (${spot.label})… `);
  try {
    const r = await warm(spot);
    console.log(`${r.secs}s via ${r.mode} — ${r.findings} findings, ${r.insights.length} insights${r.error ? ` — ERROR: ${r.error}` : ""}`);
    for (const [agent, status] of Object.entries(r.agents)) console.log(`    ${status.startsWith("ERR") ? "✗" : "✓"} ${agent}: ${status}`);
    for (const t of r.insights) console.log(`    • ${t}`);
    if (r.error) failed++;
  } catch (e) {
    failed++;
    console.log(`FAILED: ${e.message}`);
  }
}
console.log(`\nWarmed ${spots.length - failed}/${spots.length} spots. Disk cache: web/.cache/http/`);
process.exit(failed ? 1 : 0);
