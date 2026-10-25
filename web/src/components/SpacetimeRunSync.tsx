"use client";
// Headless (SpacetimeDB, the primary live backend): subscribes to
//   SELECT * FROM runs   WHERE run_id = '<id>'
//   SELECT * FROM events WHERE run_id = '<id>'
// and feeds each new event through useRunFeed → dispatchRunEvent (store + map fleet). Works for the
// launcher, a second device on a shared `/?run=<id>` link, and replays of finished missions.
import { useMemo, useState } from "react";
import { useTable } from "spacetimedb/react";
import { tables } from "@/spacetime_bindings";
import { useStore } from "@/lib/client/store";
import { isFreshRun } from "@/lib/client/runClient";
import { useOpenRunFromUrl, useRunFeed, type RunMeta } from "@/lib/client/useRunFeed";

export default function SpacetimeRunSync() {
  const runId = useStore((s) => s.runId);
  useOpenRunFromUrl();
  return runId ? <RunFeed key={runId} runId={runId} /> : null;
}

function parseRegion(json: string) {
  try { return JSON.parse(json); } catch { return null; }
}

function RunFeed({ runId }: { runId: string }) {
  const fresh = isFreshRun(runId);
  const [runRows, runReady] = useTable(tables.runs.where((r) => r.runId.eq(runId)));
  const [eventRows] = useTable(tables.events.where((r) => r.runId.eq(runId)));
  const [ready, setReady] = useState(fresh);

  const row = runRows[0];
  const run = useMemo<RunMeta | null | undefined>(() => {
    if (!runReady && !row) return undefined;
    if (!row) return null;
    return { region: parseRegion(row.regionJson), profileId: row.profileId, mode: row.mode, question: row.question, status: row.status };
  }, [runReady, row]);
  const events = useMemo(() => eventRows.map((r) => ({ seq: r.seq, event: r.eventJson })), [eventRows]);

  useRunFeed(fresh, fresh ? undefined : run, events, ready, setReady);
  return null;
}
