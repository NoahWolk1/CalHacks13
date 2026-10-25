"use client";
// Backend-agnostic half of the live run feed: given the run row and its ordered event log (from
// SpacetimeDB or Convex), hydrate a viewer's inputs and push each new event through
// dispatchRunEvent exactly once, in seq order. A finished (or joined-late) mission's backlog is
// staggered so it animates; later events stream in live.
import { useEffect, useRef } from "react";
import type { Region, RunEvent, RunMode } from "@/lib/types";
import { useStore } from "./store";
import { dispatchRunEvent, openRun, setRunUrl } from "./runClient";

const REPLAY_STEP_MS = 50;
const REPLAY_TICKS = 160; // a finished mission replays in ~8s regardless of size

/** The run-row fields the feed needs, normalized across backends. */
export type RunMeta = { region: unknown; profileId: string; mode: string; question?: string; status: string };
/** event may be a parsed RunEvent or its JSON (parsed lazily, once). */
export type FeedEvent = { seq: number; event: RunEvent | string };

/** Opens `/?run=<id>` on mount (shared links). */
export function useOpenRunFromUrl() {
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("run");
    if (id) openRun(id);
  }, []);
}

/**
 * `run`: undefined while loading, null if unknown. `ready`/`setReady` are owned by the caller so
 * it can gate its event query on them. Returns the last applied seq (Convex uses it as a cursor).
 */
export function useRunFeed(fresh: boolean, run: RunMeta | null | undefined, events: readonly FeedEvent[] | undefined, ready: boolean, setReady: (v: boolean) => void, onApplied?: (seq: number) => void) {
  const applied = useRef(-1);
  const replay = useRef(false); // stagger events so a finished (or joined-late) mission animates
  const queue = useRef<{ ev: RunEvent; stagger: boolean }[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chunk = useRef(1); // staggered events applied per tick (replay lasts ~REPLAY_TICKS ticks)

  const pump = () => {
    if (timer.current) return;
    while (queue.current.length && !queue.current[0].stagger) dispatchRunEvent(queue.current.shift()!.ev);
    if (!queue.current.length) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      for (let n = 0; n < chunk.current && queue.current.length; n++) dispatchRunEvent(queue.current.shift()!.ev);
      pump();
    }, REPLAY_STEP_MS);
  };
  useEffect(() => {
    pump();
    return () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Viewer (not the launcher): load the mission's inputs from the run row.
  useEffect(() => {
    if (fresh || run === undefined || ready) return;
    const st = useStore.getState();
    if (run === null) {
      st.set({ runId: null, error: "Mission not found" });
      setRunUrl(null);
      return;
    }
    st.resetRun();
    st.set({ region: run.region as Region, profileId: run.profileId, mode: run.mode as RunMode, question: run.question ?? "", rightTab: "agents" });
    replay.current = true;
    setReady(true);
  }, [fresh, run, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || !events?.length) return;
    let last = applied.current;
    const fresh: FeedEvent[] = [];
    for (const e of events) if (e.seq > last) fresh.push(e);
    fresh.sort((a, b) => a.seq - b.seq);
    for (const { seq, event } of fresh) {
      if (seq !== last + 1) break; // never apply past a gap; the missing seq arrives in a later update
      last = seq;
      let ev: RunEvent;
      try { ev = typeof event === "string" ? (JSON.parse(event) as RunEvent) : event; } catch { continue; }
      queue.current.push({ ev, stagger: replay.current });
    }
    if (replay.current) chunk.current = Math.max(1, Math.ceil(queue.current.length / REPLAY_TICKS));
    if (last === applied.current) return;
    applied.current = last;
    // Only the backlog present when we joined is staggered; later events stream in live.
    if (run?.status === "running") replay.current = false;
    onApplied?.(last);
    pump();
  }, [events, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
