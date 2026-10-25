"use client";

import { useState } from "react";
import { Hand, BoxSelect, Pentagon, MapPin, Boxes, Search } from "lucide-react";
import { useStore, type Tool } from "@/lib/client/store";
import { useIsDesktop } from "@/lib/client/useMedia";
import { APP_NAME } from "@/lib/brand";
import PlaceSearch from "./PlaceSearch";

export const TOOLS: { id: Tool; label: string; icon: typeof Hand; hint: string; touchHint: string }[] = [
  { id: "pan", label: "Pan", icon: Hand, hint: "Drag to orbit · scroll to zoom", touchHint: "Drag to pan · pinch to zoom" },
  { id: "box", label: "Box", icon: BoxSelect, hint: "Drag to draw a box", touchHint: "Drag a finger to draw a box" },
  { id: "polygon", label: "Polygon", icon: Pentagon, hint: "Click points, click first point or press Enter to close", touchHint: "Tap corners to outline" },
  { id: "pin", label: "Pin", icon: MapPin, hint: "Click to drop a pin", touchHint: "Tap to drop a pin" },
];

export function RadarMark() {
  return (
    <span className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-300/10 ring-1 ring-teal-300/30">
      <svg viewBox="0 0 32 32" className="h-6 w-6 drop-shadow-[0_0_6px_rgba(94,234,212,0.7)]">
        <defs>
          <linearGradient id="gs-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5eead4" stopOpacity="0" />
            <stop offset="1" stopColor="#5eead4" stopOpacity="0.75" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="13" fill="none" stroke="#5eead4" strokeOpacity="0.35" strokeWidth="1.2" />
        <circle cx="16" cy="16" r="8" fill="none" stroke="#5eead4" strokeOpacity="0.25" strokeWidth="1" />
        <g style={{ transformOrigin: "16px 16px", animation: "gs-spin 2.6s linear infinite" }}>
          <path d="M16 16 L16 3 A13 13 0 0 1 28.4 12 Z" fill="url(#gs-sweep)" />
          <line x1="16" y1="16" x2="28.4" y2="12" stroke="#5eead4" strokeWidth="1.2" strokeLinecap="round" />
        </g>
        <circle cx="16" cy="16" r="1.8" fill="#5eead4" />
        <circle cx="22" cy="9" r="1.3" fill="#38bdf8" className="animate-pulse" />
        <circle cx="9" cy="20" r="1.1" fill="#5eead4" className="animate-pulse" />
      </svg>
      <style>{`@keyframes gs-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

export default function TopBar() {
  const desktop = useIsDesktop();
  return desktop ? <DesktopTopBar /> : <MobileTopBar />;
}

function DesktopTopBar() {
  const { tool, pinRadius, running, llm, agents, set } = useStore();
  const current = TOOLS.find((t) => t.id === tool);

  return (
    <header className="pointer-events-none absolute left-4 right-4 top-4 z-30 flex h-[48px] items-stretch justify-between gap-3 max-lg:hidden">
      {/* Brand */}
      <div className="glass pointer-events-auto flex w-[360px] shrink-0 items-center gap-3 rounded-2xl px-3">
        <RadarMark />
        <div className="min-w-0 leading-tight">
          <div className="text-glow text-[15px] font-bold tracking-tight text-white">{APP_NAME}</div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-slate-500">multi-agent geo recon</div>
        </div>
      </div>

      {/* Drawing tools + place search */}
      <div className="flex min-w-0 items-stretch gap-2">
      <div className="relative flex min-w-0 flex-col items-center">
        <div className={`glass pointer-events-auto flex h-full items-center gap-1 rounded-full px-1.5 transition ${running ? "opacity-60" : ""}`}>
          {TOOLS.map(({ id, label, icon: Icon }) => {
            const on = tool === id;
            return (
              <button key={id} onClick={() => set({ tool: id })} disabled={running} title={label}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition disabled:cursor-not-allowed ${on ? "bg-teal-300/15 text-teal-200 ring-1 ring-teal-300/40 shadow-[0_0_16px_-4px] shadow-teal-300/60" : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-100"}`}>
                <Icon size={14} />
                <span>{label}</span>
              </button>
            );
          })}
          {tool === "pin" && (
            <div className="ml-1 flex items-center gap-2 border-l border-white/10 pl-3 pr-2">
              <input type="range" min={150} max={2000} step={50} value={pinRadius} disabled={running}
                onChange={(e) => set({ pinRadius: Number(e.target.value) })}
                className="h-1 w-24 cursor-pointer accent-teal-300 disabled:cursor-not-allowed" aria-label="Pin radius" />
              <span className="w-[52px] text-right font-mono text-[11px] tabular-nums text-teal-200">
                {pinRadius >= 1000 ? `${(pinRadius / 1000).toFixed(2)}km` : `${pinRadius}m`}
              </span>
            </div>
          )}
        </div>
        {current && !running && (
          <div className="pointer-events-none absolute top-full mt-1.5 whitespace-nowrap rounded-full bg-black/40 px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-slate-400 backdrop-blur">
            {current.hint}
          </div>
        )}
      </div>
      <PlaceSearch />
      </div>

      {/* Status + hub */}
      <div className="glass pointer-events-auto flex w-[400px] shrink-0 items-center justify-end gap-2 rounded-2xl px-2">
        {llm ? (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-400/20">
            <span className="relative flex h-1.5 w-1.5">
              <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Claude · online
          </span>
        ) : (
          <span title="Set ANTHROPIC_API_KEY for Claude reasoning"
            className="flex cursor-help items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-300 ring-1 ring-amber-400/20">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Heuristic mode
          </span>
        )}
        <button onClick={() => set({ hubOpen: true })}
          className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-200 transition hover:border-teal-300/40 hover:bg-teal-300/10 hover:text-white">
          <Boxes size={14} className="text-teal-300" />
          Agent Hub
          <span className="rounded-md bg-teal-300/15 px-1.5 font-mono text-[10px] text-teal-200">{agents.length}</span>
        </button>
      </div>
    </header>
  );
}

/** Phones/tablets: logo mark, expandable search, Agent Hub; drawing tools live in a floating rail. */
function MobileTopBar() {
  const { tool, running, llm, agents, set } = useStore();
  const [searching, setSearching] = useState(false);
  const btn = "glass pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-slate-300 transition active:scale-95";

  return (
    <>
      <header className="pointer-events-none absolute inset-x-4 z-30 flex h-11 items-stretch gap-2" style={{ top: "max(12px, env(safe-area-inset-top))" }}>
        {searching ? (
          <PlaceSearch variant="mobile" onClose={() => setSearching(false)} />
        ) : (
          <>
            <div className="glass pointer-events-auto relative flex items-center gap-2 rounded-2xl pl-1.5 pr-3">
              <RadarMark />
              <span className="text-glow text-[14px] font-bold tracking-tight text-white">{APP_NAME}</span>
              <span title={llm ? "Claude online" : "Heuristic mode"} className={`h-1.5 w-1.5 rounded-full ${llm ? "bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400" : "bg-amber-400"}`} />
            </div>
            <div className="flex-1" />
            <button onClick={() => setSearching(true)} className={btn} aria-label="Search a place"><Search size={17} /></button>
            <button onClick={() => set({ hubOpen: true })} className={`${btn} relative`} aria-label="Agent Hub">
              <Boxes size={17} className="text-teal-300" />
              <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-teal-300 px-1 text-center font-mono text-[10px] font-semibold leading-[18px] text-slate-950">{agents.length}</span>
            </button>
          </>
        )}
      </header>

      {/* Floating tool rail */}
      {!running && (
        <div className="glass pointer-events-auto absolute right-4 z-20 flex flex-col gap-1 rounded-2xl p-1" style={{ top: "calc(max(12px, env(safe-area-inset-top)) + 100px)" }}>
          {TOOLS.map(({ id, label, icon: Icon }) => {
            const on = tool === id;
            return (
              <button key={id} onClick={() => set({ tool: id })} aria-label={label} aria-pressed={on}
                className={`grid h-10 w-10 place-items-center rounded-xl transition active:scale-95 ${on ? "bg-teal-300/15 text-teal-200 ring-1 ring-teal-300/40 shadow-[0_0_16px_-4px] shadow-teal-300/60" : "text-slate-400"}`}>
                <Icon size={17} />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
