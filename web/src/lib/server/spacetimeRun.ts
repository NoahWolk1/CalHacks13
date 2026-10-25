// SpacetimeDB backend for the live mission state (primary; module in web/spacetime/src/index.ts).
//
// Serverless-friendly: no long-lived WebSocket. Each write is one HTTP reducer call
// (POST /v1/database/:db/call/:reducer) authenticated as the server's own identity
// (SPACETIME_TOKEN), which the module allowlists in its private `writers` table; the stop flag
// is polled with the SQL endpoint. Browsers subscribe over WebSocket anonymously (read-only).
//
// Env: SPACETIME_HOST (default https://maincloud.spacetimedb.com), SPACETIME_DB, SPACETIME_TOKEN.
// NEXT_PUBLIC_SPACETIME_HOST / NEXT_PUBLIC_SPACETIME_DB are accepted as fallbacks for host / db.
import { randomBytes } from "node:crypto";
import type { LiveStore } from "./liveRun";

const CALL_TIMEOUT_MS = 8000;

export function spacetimeConfig() {
  const db = process.env.SPACETIME_DB || process.env.NEXT_PUBLIC_SPACETIME_DB || "";
  const token = process.env.SPACETIME_TOKEN || "";
  const host = (process.env.SPACETIME_HOST || process.env.NEXT_PUBLIC_SPACETIME_HOST || "https://maincloud.spacetimedb.com").replace(/\/$/, "");
  return db && token ? { host, db, token } : null;
}

export class SpacetimeError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function post(path: string, body: string, contentType: string, timeoutMs: number) {
  const cfg = spacetimeConfig();
  if (!cfg) throw new Error("SpacetimeDB not configured");
  const res = await fetch(`${cfg.host}/v1/database/${encodeURIComponent(cfg.db)}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": contentType },
    body,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  const text = await res.text();
  // Reducer failures (SenderError) come back as non-2xx with the message as the body.
  if (!res.ok) throw new SpacetimeError(res.status, text.trim() || `HTTP ${res.status}`);
  return text;
}

/** Invokes a reducer; args are positional (SATS-JSON). */
export const callReducer = (reducer: string, args: unknown[], timeoutMs = CALL_TIMEOUT_MS) =>
  post(`call/${reducer}`, JSON.stringify(args), "application/json", timeoutMs);

/** Runs one SQL statement and returns its rows (each row is a positional array). */
export async function sql(query: string, timeoutMs = CALL_TIMEOUT_MS): Promise<unknown[][]> {
  const out = JSON.parse(await post("sql", query, "text/plain", timeoutMs)) as { rows: unknown[][] }[];
  return out[0]?.rows ?? [];
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

export const spacetimeStore: LiveStore = {
  name: "spacetime",
  async create(body, llm) {
    const runId = randomBytes(9).toString("base64url"); // 12 url-safe chars; unguessable enough for share links
    const region = body.region as { label?: string } | undefined;
    await callReducer("create_run", [runId, body.mode, body.profileId ?? "auto", body.question ?? "", JSON.stringify(body.region ?? null), region?.label ?? "", llm]);
    return runId;
  },
  async append(runId, batch) {
    await callReducer("append_events", [runId, batch.map(({ seq, event }) => ({ seq, event_json: JSON.stringify(event) }))]);
  },
  async stopRequested(runId) {
    const rows = await sql(`SELECT stop_requested FROM runs WHERE run_id = ${quote(runId)}`, 3000);
    return rows[0]?.[0] === true;
  },
  async requestStop(runId) {
    try { await callReducer("request_stop", [runId]); return true; }
    catch (e) { if (e instanceof SpacetimeError && /not running|unknown run/.test(e.message)) return false; throw e; }
  },
  async reserveLlm(ipHash, perIp, global) {
    try { await callReducer("reserve_llm", [ipHash, perIp, global], 3000); return true; }
    catch (e) { if (e instanceof SpacetimeError && e.message.includes("llm_cap:")) return false; throw e; }
  },
};
