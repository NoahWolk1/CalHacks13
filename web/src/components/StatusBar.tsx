"use client";

import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/client/store";
import { setCinematic } from "./MapView";

export function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Stat({ label, value, total, className = "" }: { label: string; value: number | string; total?: number; className?: string }) {
  return (
    <div className={`flex h-full items-center gap-1.5 border-l border-line px-3 ${className}`}>
      <span className="num text-[12px] text-fg1">{value}{total !== undefined && <span className="text-fg3">/{total}</span>}</span>
      {label && <span className="text-[12px] text-fg3">{label}</span>}
    </div>
  );
}

/** Live mission counters (elapsed ticks while running). Shared with the mobile sheet's peek row. */
export function useMissionStats() {
  const { running, runStartedAt, runDurationMs, agentState, findingOrder, findings, revealed, insights } = useStore();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  const sources = useMemo(() => new Set(findingOrder.map((id) => findings[id]?.source_type).filter(Boolean)).size, [findingOrder, findings]);
  const states = Object.values(agentState);
  return {
    running,
    done: !running && runDurationMs != null,
    elapsed: running && runStartedAt ? now - runStartedAt : runDurationMs ?? 0,
    active: states.filter((s) => s.status === "deploying" || s.status === "scanning").length,
    agents: states.length,
    shown: findingOrder.filter((id) => revealed[id]).length,
    total: findingOrder.length,
    sources,
    insights: insights.length,
  };
}

let cinematicOn = true;
/** Cinematic-camera toggle state shared by the status bar and the mobile sheet. */
export function useCinematic() {
  const [on, setOn] = useState(cinematicOn);
  return [on, () => { cinematicOn = !cinematicOn; setOn(cinematicOn); setCinematic(cinematicOn); }] as const;
}

export default function StatusBar() {
  const region = useStore((s) => s.region);
  const { running, done, elapsed, shown, total, sources, insights } = useMissionStats();
  const [cinematic, toggleCine] = useCinematic();

  if (!region) return null;

  // Narrow map strip: drop the secondary counters first (container queries on .gs-frame). Thresholds keep
  // the full bar clear of the attribution button in the strip's bottom-right corner.
  return (
    <div className="glass pointer-events-auto absolute bottom-3 left-3 z-20 flex h-[34px] w-max items-center whitespace-nowrap rounded-md max-lg:hidden">
      <div className={`flex h-full items-center gap-2 px-3 text-[12px] font-medium ${running ? "text-accent" : done ? "text-fg2" : "text-fg3"}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-accent" : done ? "bg-ok" : "bg-fg4"}`} />
        {running ? "Live" : done ? "Complete" : "Idle"}
      </div>
      <Stat label="" value={fmt(elapsed)} />
      <Stat label="findings" value={shown} total={total} />
      <Stat label="sources" value={sources} className="@max-[720px]:hidden" />
      <Stat label="insights" value={insights} className="@max-[630px]:hidden" />
      <button onClick={toggleCine} title="Toggle cinematic camera" aria-pressed={cinematic}
        className="flex h-full items-center gap-2 rounded-r-md border-l border-line px-3 text-[12px] text-fg3 transition-colors hover:text-fg1">
        <span className="@max-[530px]:hidden">Cinematic</span>
        <span className={`relative h-3.5 w-6 rounded-full transition-colors ${cinematic ? "bg-fg2" : "bg-line-strong"}`}>
          <span className={`absolute top-0.5 h-2.5 w-2.5 rounded-full bg-panel transition-[left] duration-150 ${cinematic ? "left-[12px]" : "left-0.5"}`} />
        </span>
      </button>
    </div>
  );
}
