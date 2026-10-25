"use client";
// Headless (Convex fallback backend): subscribes to the current mission's event log in Convex and
// feeds it through useRunFeed → dispatchRunEvent. SpacetimeDB mode uses <SpacetimeRunSync>.
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useStore } from "@/lib/client/store";
import { isFreshRun } from "@/lib/client/runClient";
import { useOpenRunFromUrl, useRunFeed } from "@/lib/client/useRunFeed";

export default function ConvexRunSync() {
  const runId = useStore((s) => s.runId);
  useOpenRunFromUrl();
  return runId ? <RunFeed key={runId} runId={runId} /> : null;
}

function RunFeed({ runId }: { runId: string }) {
  const fresh = isFreshRun(runId);
  const run = useQuery(api.runs.get, fresh ? "skip" : { runId });
  const [ready, setReady] = useState(fresh);
  const [cursor, setCursor] = useState(-1);
  const events = useQuery(api.events.since, ready ? { runId, afterSeq: cursor } : "skip");
  useRunFeed(fresh, run, events, ready, setReady, setCursor);
  return null;
}
