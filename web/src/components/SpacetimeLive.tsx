"use client";
// SpacetimeDB live layer: one anonymous, read-only WebSocket connection per tab (browsers never
// write; only the Next server's allowlisted identity can call reducers). Mounted client-side only
// (next/dynamic, ssr:false) when /api/agents reports backend "spacetime".
import { useMemo } from "react";
import { SpacetimeDBProvider, useTable } from "spacetimedb/react";
import { DbConnection, tables } from "@/spacetime_bindings";
import SpacetimeRunSync from "./SpacetimeRunSync";
import MissionHistory, { type RecentRun } from "./MissionHistory";

/** http(s) → ws(s); a local server (127.0.0.1) is rewritten to the page's host so a phone on the LAN can watch. */
function wsUri(raw: string) {
  const u = new URL(raw);
  const host = window.location.hostname;
  if ((u.hostname === "127.0.0.1" || u.hostname === "localhost") && host !== "localhost" && host !== "127.0.0.1") u.hostname = host;
  u.protocol = u.protocol === "https:" || u.protocol === "wss:" ? "wss:" : "ws:";
  return u.toString().replace(/\/$/, "");
}

function SpacetimeMissionHistory() {
  const [rows, ready] = useTable(tables.runs);
  // Auto-routed runs: the row says "auto" unless the module copies the `routed` event onto it
  // (append_events does since the routing change), so also read the routed events themselves.
  const [routedRows] = useTable(tables.events.where((r) => r.type.eq("routed")));
  const routedTo = useMemo(() => {
    const m = new Map<string, { profileId: string; auto: boolean }>();
    for (const e of routedRows) {
      try { m.set(e.runId, JSON.parse(e.eventJson) as { profileId: string; auto: boolean }); } catch { /* skip */ }
    }
    return m;
  }, [routedRows]);
  const recent = useMemo<RecentRun[] | undefined>(() => {
    if (!ready && !rows.length) return undefined;
    return [...rows].sort((a, b) => b.startedAtMs - a.startedAtMs).slice(0, 10).map((r) => ({
      id: r.runId, label: r.label, status: r.status, startedAt: r.startedAtMs, profileId: routedTo.get(r.runId)?.profileId ?? r.profileId,
      // Read "auto" off the routed event: once append_events copies the routed profile onto the row, the row alone can't tell.
      auto: routedTo.get(r.runId)?.auto ?? r.profileId === "auto", mode: r.mode, question: r.question, findingCount: r.findingCount,
    }));
  }, [rows, ready, routedTo]);
  return <MissionHistory backend="SpacetimeDB" recent={recent} />;
}

export default function SpacetimeLive({ host, db }: { host: string; db: string }) {
  const builder = useMemo(() => DbConnection.builder().withUri(wsUri(host)).withDatabaseName(db).withAutomaticReconnect(), [host, db]);
  return (
    <SpacetimeDBProvider connectionBuilder={builder}>
      <SpacetimeRunSync />
      <SpacetimeMissionHistory />
    </SpacetimeDBProvider>
  );
}
