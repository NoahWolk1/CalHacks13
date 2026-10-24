"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Video, VideoOff } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { setCinematic } from "./MapView";

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Stat({ label, value, total, accent }: { label: string; value: number | string; total?: number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className={`font-mono text-[13px] tabular-nums ${accent ? "text-teal-200" : "text-slate-100"}`}>
        {value}{total !== undefined && <span className="text-slate-500">/{total}</span>}
      </span>
      <span className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
    </div>
  );
}

export default function StatusBar() {
  const { region, running, runStartedAt, runDurationMs, agentState, findingOrder, findings, revealed, insights } = useStore();
  const [now, setNow] = useState(() => Date.now());
  const [cinematic, setCine] = useState(true);

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  const sources = useMemo(() => new Set(findingOrder.map((id) => findings[id]?.source_type).filter(Boolean)).size, [findingOrder, findings]);

  if (!region) return null;

  const states = Object.values(agentState);
  const active = states.filter((s) => s.status === "deploying" || s.status === "scanning").length;
  const shown = findingOrder.filter((id) => revealed[id]).length;
  const elapsed = running && runStartedAt ? now - runStartedAt : runDurationMs ?? 0;
  const done = !running && runDurationMs != null;

  const toggleCine = () => { const v = !cinematic; setCine(v); setCinematic(v); };

  const stats = [
    <Stat key="t" label="Elapsed" value={fmt(elapsed)} accent={running} />,
    <Stat key="a" label="Agents" value={active} total={states.length} />,
    <Stat key="f" label="Findings" value={shown} total={findingOrder.length} />,
    <Stat key="s" label="Sources" value={sources} />,
    <Stat key="i" label="Insights" value={insights.length} accent={insights.length > 0} />,
  ];

  return (
    <div className="glass pointer-events-auto absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-4 rounded-full py-2 pl-4 pr-2">
      <div className="flex w-[78px] items-center gap-2">
        {running ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-rose-500" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px] shadow-rose-500" />
            </span>
            <span className="font-mono text-[11px] font-semibold tracking-[0.18em] text-rose-300">LIVE</span>
          </>
        ) : (
          <>
            <span className={`h-2 w-2 rounded-full ${done ? "bg-emerald-400" : "bg-slate-500"}`} />
            <span className={`font-mono text-[11px] tracking-[0.18em] ${done ? "text-emerald-300" : "text-slate-400"}`}>{done ? "COMPLETE" : "IDLE"}</span>
          </>
        )}
      </div>
      {stats.map((s, i) => (
        <Fragment key={i}>
          <span className="h-6 w-px bg-white/10" />
          {s}
        </Fragment>
      ))}
      <span className="h-6 w-px bg-white/10" />
      <button onClick={toggleCine} title="Toggle cinematic camera"
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] transition ${cinematic ? "bg-teal-300/15 text-teal-200 ring-1 ring-teal-300/40" : "text-slate-400 ring-1 ring-white/10 hover:text-slate-200"}`}>
        {cinematic ? <Video size={13} /> : <VideoOff size={13} />}
        Cinematic
      </button>
    </div>
  );
}
