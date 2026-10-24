"use client";
import type { RunEvent } from "@/lib/types";
import { useStore } from "./store";

let current: AbortController | null = null;
const listeners = new Set<(e: RunEvent) => void>();

/** Subscribe to raw run events (the map's fleet simulation listens here). */
export function onRunEvent(fn: (e: RunEvent) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export async function loadCatalog() {
  const r = await fetch("/api/agents").then((r) => r.json());
  useStore.getState().set({ agents: r.agents, profiles: r.profiles, llm: r.llm });
}

export function stopRun() {
  current?.abort();
  current = null;
  useStore.getState().set({ running: false });
}

export async function startRun() {
  const s = useStore.getState();
  if (!s.region) return;
  stopRun();
  s.resetRun();
  useStore.getState().set({ running: true, runStartedAt: Date.now(), rightTab: "agents" });
  const ctl = (current = new AbortController());
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: s.mode, profileId: s.profileId, region: s.region, question: s.mode === "ask" ? s.question : undefined }),
      signal: ctl.signal,
    });
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
        const ev = JSON.parse(line.slice(6)) as RunEvent;
        useStore.getState().apply(ev);
        listeners.forEach((fn) => fn(ev));
      }
    }
  } catch (e) {
    if (!ctl.signal.aborted) useStore.getState().set({ error: (e as Error).message });
  } finally {
    if (current === ctl) useStore.getState().set({ running: false });
  }
}
