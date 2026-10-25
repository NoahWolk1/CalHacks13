// GeoSwarm's live shared mission state on SpacetimeDB.
//
// The orchestrator (our Next.js server) is the only writer: it creates a run, appends every
// RunEvent in seq order, and finishes it. Browsers connect anonymously and only subscribe
// (`SELECT * FROM events WHERE run_id = '…'`, `SELECT * FROM runs`), so the map, agent panel and
// mission history on every device update the moment a reducer commits.
//
// Auth: every write reducer checks ctx.sender against the private `writers` table. `init` seeds it
// with the database owner (whoever ran `spacetime publish`); the owner then allowlists the Next
// server's identity with `add_writer` (see web/README.md). Anonymous browser identities are not
// in the table, so they can read public tables but every write reducer rejects them.
import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from "spacetimedb/server";

const runs = table(
  { name: "runs", public: true },
  {
    run_id: t.string().primaryKey(),
    mode: t.string(), // "ask" | "insights"
    profile_id: t.string(),
    question: t.option(t.string()),
    region_json: t.string(), // Region (GeoJSON polygon + bbox + center)
    label: t.option(t.string()),
    status: t.string(), // "running" | "done" | "error"
    started_at_ms: t.f64(),
    duration_ms: t.option(t.f64()),
    llm: t.bool(),
    finding_count: t.u32(),
    insight_count: t.u32(),
    error: t.option(t.string()),
    stop_requested: t.bool(), // set by /api/run/stop; the orchestrator polls it (works across serverless instances)
    next_seq: t.u32(), // append_events only accepts the next contiguous seq, so the log is gap-free and ordered
  },
);

// Append-only event log per run; seq is assigned by the server in emit order.
const events = table(
  { name: "events", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    run_id: t.string().index("btree"),
    seq: t.u32(),
    type: t.string(),
    event_json: t.string(), // RunEvent (heterogeneous union, so stored as JSON)
  },
);

// Denormalized findings so they can be queried directly (by run, by agent, by category).
const findings = table(
  { name: "findings", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    run_id: t.string().index("btree"),
    finding_id: t.string(),
    worker_id: t.string(),
    category: t.string(),
    claim: t.string(),
    confidence: t.f64(),
    severity: t.option(t.f64()),
    source_type: t.string(),
    source_url: t.option(t.string()),
    geometry_json: t.string(),
  },
);

// Private: one row per Claude-powered run, for the per-IP / global hourly caps.
// ip_hash is a salted sha256 of the client IP; raw IPs are never stored.
const llm_usage = table(
  { name: "llm_usage" },
  {
    id: t.u64().primaryKey().autoInc(),
    ip_hash: t.string().index("btree"),
    at_ms: t.f64(),
  },
);

// Private: identities (hex) allowed to call write reducers.
const writers = table(
  { name: "writers" },
  {
    identity_hex: t.string().primaryKey(),
  },
);

const spacetimedb = schema({ runs, events, findings, llm_usage, writers });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const WINDOW_MS = 60 * 60 * 1000;
const nowMs = (ctx: Ctx) => Number(ctx.timestamp.microsSinceUnixEpoch / 1000n);
const opt = (s: string) => (s ? s : undefined);

function requireWriter(ctx: Ctx) {
  if (!ctx.db.writers.identity_hex.find(ctx.sender.toHexString())) throw new SenderError("not authorized");
}

function getRun(ctx: Ctx, run_id: string) {
  const run = ctx.db.runs.run_id.find(run_id);
  if (!run) throw new SenderError("unknown run");
  return run;
}

export const init = spacetimedb.init((ctx) => {
  ctx.db.writers.insert({ identity_hex: ctx.sender.toHexString() });
});

/** Allowlist another writer identity (e.g. the Next server's). Only existing writers may call it. */
export const add_writer = spacetimedb.reducer({ identity_hex: t.string() }, (ctx, { identity_hex }) => {
  requireWriter(ctx);
  const hex = identity_hex.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new SenderError("identity_hex must be 64 hex chars");
  if (!ctx.db.writers.identity_hex.find(hex)) ctx.db.writers.insert({ identity_hex: hex });
});

export const remove_writer = spacetimedb.reducer({ identity_hex: t.string() }, (ctx, { identity_hex }) => {
  requireWriter(ctx);
  ctx.db.writers.identity_hex.delete(identity_hex.toLowerCase().replace(/^0x/, ""));
});

/** Empty strings mean "none" for the optional text args (keeps the HTTP JSON args flat). */
export const create_run = spacetimedb.reducer(
  { run_id: t.string(), mode: t.string(), profile_id: t.string(), question: t.string(), region_json: t.string(), label: t.string(), llm: t.bool() },
  (ctx, a) => {
    requireWriter(ctx);
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(a.run_id)) throw new SenderError("bad run_id");
    if (ctx.db.runs.run_id.find(a.run_id)) throw new SenderError("run exists");
    ctx.db.runs.insert({
      run_id: a.run_id, mode: a.mode, profile_id: a.profile_id, question: opt(a.question), region_json: a.region_json,
      label: opt(a.label), status: "running", started_at_ms: nowMs(ctx), duration_ms: undefined, llm: a.llm,
      finding_count: 0, insight_count: 0, error: undefined, stop_requested: false, next_seq: 0,
    });
  },
);

const EventIn = t.object("EventIn", { seq: t.u32(), event_json: t.string() });

/**
 * Batch-append RunEvents (the server flushes every ~100ms). Enforces seq order: already-stored
 * seqs are skipped (an idempotent retry), a gap rejects the whole batch. Also maintains the run
 * summary and the findings table, all in one transaction.
 */
export const append_events = spacetimedb.reducer({ run_id: t.string(), events: t.array(EventIn) }, (ctx, { run_id, events: batch }) => {
  requireWriter(ctx);
  const run = { ...getRun(ctx, run_id) };
  for (const { seq, event_json } of batch) {
    if (seq < run.next_seq) continue;
    if (seq > run.next_seq) throw new SenderError(`seq gap: expected ${run.next_seq}, got ${seq}`);
    run.next_seq = seq + 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ev: any;
    try { ev = JSON.parse(event_json); } catch { throw new SenderError(`event ${seq} is not JSON`); }
    ctx.db.events.insert({ id: 0n, run_id, seq, type: String(ev?.type ?? "unknown"), event_json });
    switch (ev?.type) {
      case "region_labeled":
        if (typeof ev.label === "string") run.label = ev.label;
        break;
      case "routed": // an "auto" run row takes the profile the orchestrator routed to
        if (typeof ev.profileId === "string") run.profile_id = ev.profileId;
        break;
      case "finding": {
        const f = ev.finding ?? {};
        run.finding_count++;
        ctx.db.findings.insert({
          id: 0n, run_id, finding_id: String(f.id ?? ""), worker_id: String(f.worker_id ?? ""), category: String(f.category ?? ""),
          claim: String(f.claim ?? ""), confidence: Number(f.confidence ?? 0), severity: typeof f.severity === "number" ? f.severity : undefined,
          source_type: String(f.source_type ?? ""), source_url: typeof f.source_url === "string" ? f.source_url : undefined,
          geometry_json: JSON.stringify(f.geometry ?? null),
        });
        break;
      }
      case "insight":
        run.insight_count++;
        break;
      case "run_done":
        run.status = "done";
        if (typeof ev.durationMs === "number") run.duration_ms = ev.durationMs;
        break;
      case "error":
        run.status = "error";
        run.error = String(ev.message ?? "error");
        break;
    }
  }
  ctx.db.runs.run_id.update(run);
});

/** duration_ms < 0 and error "" mean "none". No-op unless the run is still running. */
export const finish_run = spacetimedb.reducer(
  { run_id: t.string(), status: t.string(), duration_ms: t.f64(), error: t.string() },
  (ctx, { run_id, status, duration_ms, error }) => {
    requireWriter(ctx);
    if (status !== "done" && status !== "error") throw new SenderError("bad status");
    const run = getRun(ctx, run_id);
    if (run.status !== "running") return;
    ctx.db.runs.run_id.update({ ...run, status, duration_ms: duration_ms >= 0 ? duration_ms : run.duration_ms, error: opt(error) ?? run.error });
  },
);

/** Ask the orchestrator (whichever server instance runs it) to stop; it polls stop_requested. Fails if not running. */
export const request_stop = spacetimedb.reducer({ run_id: t.string() }, (ctx, { run_id }) => {
  requireWriter(ctx);
  const run = getRun(ctx, run_id);
  if (run.status !== "running") throw new SenderError("not running");
  ctx.db.runs.run_id.update({ ...run, stop_requested: true });
});

/**
 * Hourly caps on Claude-powered runs, shared across every serverless instance. A reducer is one
 * serializable transaction, so check + record is atomic. Over a cap it throws "llm_cap:global"
 * or "llm_cap:ip" (reducers return no value; the caller reads the error text).
 */
export const reserve_llm = spacetimedb.reducer({ ip_hash: t.string(), per_ip: t.u32(), global: t.u32() }, (ctx, { ip_hash, per_ip, global }) => {
  requireWriter(ctx);
  const now = nowMs(ctx);
  const since = now - WINDOW_MS;
  let globalUsed = 0;
  for (const r of [...ctx.db.llm_usage.iter()]) {
    if (r.at_ms < since) ctx.db.llm_usage.id.delete(r.id); // prune aged-out rows
    else globalUsed++;
  }
  if (globalUsed >= global) throw new SenderError("llm_cap:global");
  let ipUsed = 0;
  for (const r of ctx.db.llm_usage.ip_hash.filter(ip_hash)) if (r.at_ms >= since) ipUsed++;
  if (ipUsed >= per_ip) throw new SenderError("llm_cap:ip");
  ctx.db.llm_usage.insert({ id: 0n, ip_hash, at_ms: now });
});
