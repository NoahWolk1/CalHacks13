"use client";
import type { AgentConfig, RunEvent } from "@/lib/types";
import { useStore } from "./store";

/**
 * Which live backend holds the shared mission state (SpacetimeDB primary, Convex fallback, or SSE
 * with no shared state). The server decides (LIVE_BACKEND, see src/lib/server/liveRun.ts) and
 * reports it via /api/agents, so the browser always subscribes to the backend the server writes to.
 */
export type LiveConfig = { backend: "spacetime" | "convex" | "sse"; spacetime?: { host: string; db: string } };

let current: AbortController | null = null;
/** Live-backend run this browser launched (only the launcher may recall agents). */
let ownRunId: string | null = null;
/** The run just launched here: its state is already on screen, so the feed skips hydrating from the run row. */
let freshRunId: string | null = null;
const listeners = new Set<(e: RunEvent) => void>();

/** Subscribe to raw run events (the map's fleet simulation listens here). */
export function onRunEvent(fn: (e: RunEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** The single path every RunEvent takes into the UI (SSE stream or live-backend subscription). */
export function dispatchRunEvent(ev: RunEvent) {
  // A recalled (or failed) mission ends with agents still queued/scanning: settle them so the
  // panel stops spinning and the map parks their vehicles, for the launcher and every viewer.
  if (ev.type === "run_done" || ev.type === "error") {
    for (const [agentId, a] of Object.entries(useStore.getState().agentState)) {
      if (a.status === "queued" || a.status === "deploying" || a.status === "scanning") {
        dispatchRunEvent({ type: "agent_status", agentId, status: "done", dispatchId: "recall", detail: a.findings ? `recalled (${a.findings} kept)` : "recalled" });
      }
    }
  }
  useStore.getState().apply(ev);
  listeners.forEach((fn) => fn(ev));
}

export const isOwnRun = (runId: string | null) => !!runId && runId === ownRunId;
export const isFreshRun = (runId: string | null) => !!runId && runId === freshRunId;

/** Watch / replay any mission by id (shared link or history). Its region + events load from the live backend. */
export function openRun(runId: string) {
  current?.abort();
  current = null;
  freshRunId = null;
  useStore.getState().set({ runId, error: null });
  setRunUrl(runId);
}

/** Reflect the mission in the URL so it can be shared (`/?run=<id>`). */
export function setRunUrl(runId: string | null) {
  const url = new URL(window.location.href);
  if (runId) url.searchParams.set("run", runId); else url.searchParams.delete("run");
  window.history.replaceState(null, "", url);
}

export async function loadCatalog() {
  const r = await fetch("/api/agents").then((r) => r.json());
  useStore.getState().set({ agents: r.agents, profiles: r.profiles, llm: r.llm, live: (r.live as LiveConfig | undefined) ?? { backend: "sse" } });
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** Replace (or add) an agent config in the catalog. */
function upsertAgent(agent: AgentConfig) {
  const { agents, set } = useStore.getState();
  set({ agents: agents.some((a) => a.id === agent.id) ? agents.map((a) => (a.id === agent.id ? agent : a)) : [...agents, agent] });
}

/** Prompt → a draft config to preview, or the existing agent that already covers it. */
export function draftAgent(prompt: string) {
  return call<{ kind: "new" | "reuse"; agent: AgentConfig }>("/api/agents/draft", json({ prompt }));
}

export async function saveAgent(agent: AgentConfig) {
  const r = await call<{ agent: AgentConfig }>("/api/agents", json({ agent }));
  upsertAgent(r.agent);
  return r.agent;
}

export async function deleteAgent(id: string) {
  await call(`/api/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
  const { agents, set } = useStore.getState();
  set({ agents: agents.filter((a) => a.id !== id) });
}

/** After a run: keep a spawned agent (saved to the library) or discard it. */
export async function decideSpawned(id: string, keep: boolean) {
  if (keep) upsertAgent((await call<{ agent: AgentConfig }>(`/api/agents/${encodeURIComponent(id)}/keep`, { method: "POST" })).agent);
  else await call(`/api/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
  const { agentState, set } = useStore.getState();
  if (agentState[id]) set({ agentState: { ...agentState, [id]: { ...agentState[id], decision: keep ? "kept" : "discarded" } } });
}

export function stopRun() {
  current?.abort();
  current = null;
  const { runId, running, runStartedAt } = useStore.getState();
  if (running && isOwnRun(runId)) {
    fetch("/api/run/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) }).catch(() => {});
  }
  // SSE mode: the stream is gone, so no run_done will arrive; end the mission locally.
  if (running && !runId) dispatchRunEvent({ type: "run_done", durationMs: runStartedAt ? Date.now() - runStartedAt : 0 });
  useStore.getState().set({ running: false });
}

export async function startRun() {
  const s = useStore.getState();
  if (!s.region) return;
  stopRun();
  s.resetRun();
  useStore.getState().set({ running: true, runStartedAt: Date.now(), runId: null });
  const ctl = (current = new AbortController());
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: s.mode, profileId: s.profileId, region: s.region, question: s.mode === "ask" ? s.question : undefined }),
      signal: ctl.signal,
    });

    // Live mode: the server answers with the run id; <SpacetimeRunSync>/<ConvexRunSync> streams the events in.
    if (res.headers.get("content-type")?.includes("application/json")) {
      const { runId } = (await res.json()) as { runId: string };
      ownRunId = freshRunId = runId;
      useStore.getState().set({ runId });
      setRunUrl(runId);
      current = null;
      return;
    }

    // SSE fallback.
    if (!res.body) throw new Error("no stream");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (!line.startsWith("data: ")) continue;
        dispatchRunEvent(JSON.parse(line.slice(6)) as RunEvent);
      }
    }
    if (current === ctl) useStore.getState().set({ running: false });
  } catch (e) {
    if (!ctl.signal.aborted) useStore.getState().set({ error: (e as Error).message, running: false });
  } finally {
    if (current === ctl) current = null;
  }
}
