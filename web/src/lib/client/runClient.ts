"use client";
import type { RunEvent } from "@/lib/types";
import { useStore } from "./store";

/** Convex is the shared mission state when configured; otherwise runs stream over SSE. */
export const convexEnabled = !!process.env.NEXT_PUBLIC_CONVEX_URL;

let current: AbortController | null = null;
/** Convex run this browser launched (only the launcher may recall agents). */
let ownRunId: string | null = null;
/** The run just launched here: its state is already on screen, so the feed skips hydrating from the run row. */
let freshRunId: string | null = null;
const listeners = new Set<(e: RunEvent) => void>();

/** Subscribe to raw run events (the map's fleet simulation listens here). */
export function onRunEvent(fn: (e: RunEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** The single path every RunEvent takes into the UI (SSE stream or Convex subscription). */
export function dispatchRunEvent(ev: RunEvent) {
  useStore.getState().apply(ev);
  listeners.forEach((fn) => fn(ev));
}

export const isOwnRun = (runId: string | null) => !!runId && runId === ownRunId;
export const isFreshRun = (runId: string | null) => !!runId && runId === freshRunId;

/** Watch / replay any mission by id (shared link or history). Its region + events load from Convex. */
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
  useStore.getState().set({ agents: r.agents, profiles: r.profiles, llm: r.llm });
}

export function stopRun() {
  current?.abort();
  current = null;
  const { runId, running } = useStore.getState();
  if (running && isOwnRun(runId)) {
    fetch("/api/run/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runId }) }).catch(() => {});
  }
  useStore.getState().set({ running: false });
}

export async function startRun() {
  const s = useStore.getState();
  if (!s.region) return;
  stopRun();
  s.resetRun();
  useStore.getState().set({ running: true, runStartedAt: Date.now(), rightTab: "agents", runId: null });
  const ctl = (current = new AbortController());
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: s.mode, profileId: s.profileId, region: s.region, question: s.mode === "ask" ? s.question : undefined }),
      signal: ctl.signal,
    });

    // Convex mode: the server answers with the run id; <ConvexRunSync> streams the events in.
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
