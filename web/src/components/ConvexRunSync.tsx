"use client";
// Headless: subscribes to the current mission's event log in Convex and feeds each new event
// through dispatchRunEvent (store + map fleet). Works for the launcher, a second device on a
// shared `/?run=<id>` link, and replays of finished missions.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Region, RunEvent, RunMode } from "@/lib/types";
import { useStore } from "@/lib/client/store";
import { dispatchRunEvent, isFreshRun, openRun, setRunUrl } from "@/lib/client/runClient";

const REPLAY_STEP_MS = 50;
const REPLAY_TICKS = 160; // a finished mission replays in ~8s regardless of size

export default function ConvexRunSync() {
  const runId = useStore((s) => s.runId);
  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("run");
    if (id) openRun(id);
  }, []);
  return runId ? <RunFeed key={runId} runId={runId} /> : null;
}

function RunFeed({ runId }: { runId: string }) {
  const fresh = isFreshRun(runId);
  const run = useQuery(api.runs.get, fresh ? "skip" : { runId });
  const [ready, setReady] = useState(fresh);
  const [cursor, setCursor] = useState(-1);
  const events = useQuery(api.events.since, ready ? { runId, afterSeq: cursor } : "skip");

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
  }, [fresh, run, ready]);

  useEffect(() => {
    if (!events?.length) return;
    let last = applied.current;
    for (const { seq, event } of events) {
      if (seq <= last) continue;
      last = seq;
      const ev = event as RunEvent;
      queue.current.push({ ev, stagger: replay.current });
    }
    if (replay.current) chunk.current = Math.max(1, Math.ceil(queue.current.length / REPLAY_TICKS));
    if (last === applied.current) return;
    applied.current = last;
    // Only the backlog present when we joined is staggered; later events stream in live.
    if (run?.status === "running") replay.current = false;
    setCursor(last);
    pump();
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
