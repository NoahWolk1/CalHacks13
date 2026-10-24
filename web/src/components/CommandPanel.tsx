"use client";

import { useEffect, useRef } from "react";
import { ShieldAlert, Store, Siren, Sparkles, MessageSquareText, Rocket, Square, X, Cpu, AlertTriangle } from "lucide-react";
import { useStore, agentById } from "@/lib/client/store";
import { startRun, stopRun } from "@/lib/client/runClient";
import { regionAreaKm2 } from "@/lib/geo";
import { reverseLabel } from "@/lib/client/geocode";
import { SectionLabel, VehicleGlyph } from "./ui";
import { DemoSpotChips } from "./PlaceSearch";

const ICONS = { ShieldAlert, Store, Siren } as const;

/** Reverse-geocode a freshly drawn region so the chip shows a real place name before the run. */
export function useRegionLabel() {
  const region = useStore((s) => s.region);
  useEffect(() => {
    if (!region || region.label) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      reverseLabel(region.center, ctl.signal).then((label) => {
        const cur = useStore.getState().region;
        if (label && cur && cur.bbox === region.bbox && !cur.label) useStore.getState().set({ region: { ...cur, label } });
      }).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [region]);
}

export const useCanRun = () => useStore((s) => !!s.region && (s.mode === "insights" || s.question.trim().length > 2));

export default function CommandPanel() {
  return (
    <aside className="glass pointer-events-auto absolute bottom-4 left-4 top-[76px] z-20 flex w-[360px] flex-col overflow-hidden rounded-2xl max-lg:hidden">
      <MissionControls className="p-4" />
      <OrchestratorLog className="min-h-0 flex-1" />
    </aside>
  );
}

/** Orchestrator picker, mode + question, region chip and the deploy button. Shared by the desktop panel and the mobile sheet. */
export function MissionControls({ className = "" }: { className?: string }) {
  const { profiles, profileId, mode, question, region, running, set } = useStore();
  const profile = profiles.find((p) => p.id === profileId);
  const canRun = useCanRun();

  return (
      <div className={`space-y-5 ${className}`}>
        {/* Orchestrator */}
        <div>
          <SectionLabel>Orchestrator</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {profiles.map((p) => {
              const Icon = ICONS[p.icon as keyof typeof ICONS] ?? Sparkles;
              const on = p.id === profileId;
              return (
                <button key={p.id} onClick={() => set({ profileId: p.id })} disabled={running}
                  className={`group rounded-xl border px-2 py-2.5 text-left transition ${on ? "border-teal-300/50 bg-teal-300/10" : "border-white/5 bg-white/[0.02] hover:border-white/15"}`}>
                  <Icon size={16} className={on ? "text-teal-300" : "text-slate-400 group-hover:text-slate-200"} />
                  <div className={`mt-1.5 text-[11px] font-medium leading-tight ${on ? "text-white" : "text-slate-300"}`}>{p.name}</div>
                </button>
              );
            })}
          </div>
          {profile && <p className="mt-2 text-xs text-slate-400"><span className="text-slate-200">{profile.tagline}</span> · {profile.persona}</p>}
        </div>

        {/* Mode */}
        <div>
          <div className="relative grid grid-cols-2 rounded-xl border border-white/5 bg-black/30 p-1 text-xs">
            <span className="absolute inset-y-1 w-[calc(50%-4px)] rounded-lg bg-white/[0.07] transition-all duration-300" style={{ left: mode === "ask" ? 4 : "50%" }} />
            {(["ask", "insights"] as const).map((m) => (
              <button key={m} onClick={() => set({ mode: m })} disabled={running} className={`relative z-10 flex items-center justify-center gap-1.5 py-1.5 ${mode === m ? "text-white" : "text-slate-400"}`}>
                {m === "ask" ? <MessageSquareText size={13} /> : <Sparkles size={13} />}{m === "ask" ? "Ask" : "Insights"}
              </button>
            ))}
          </div>
          {mode === "ask" ? (
            <div className="mt-2">
              <textarea value={question} onChange={(e) => set({ question: e.target.value })} disabled={running} rows={2}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && canRun) { e.preventDefault(); startRun(); } }}
                placeholder="Ask anything about the selected area…"
                className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white max-lg:text-base placeholder:text-slate-500 focus:border-teal-300/50 focus:outline-none" />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {profile?.sampleQuestions.map((q) => (
                  <button key={q} onClick={() => set({ question: q })} className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400 hover:border-teal-300/40 hover:text-teal-200">{q}</button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-400">No question needed. The full survey team sweeps the area, and the orchestrator hunts for findings that <span className="text-slate-200">combine</span> into risks, opportunities and conflicts.</p>
          )}
        </div>

        {/* Region + launch */}
        <div className="space-y-2">
          {region ? (
            <div className="flex items-center gap-2 rounded-xl border border-teal-300/20 bg-teal-300/[0.05] px-3 py-2 text-xs">
              <span className="h-2 w-2 rounded-sm bg-teal-300 shadow-[0_0_10px] shadow-teal-300" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-slate-100">{region.label ?? "Selected area"}</div>
                <div className="font-mono text-[10px] text-slate-500">{region.kind.toUpperCase()} · {regionAreaKm2(region).toFixed(2)} km²</div>
              </div>
              {!running && <button onClick={() => set({ region: null })} className="text-slate-500 hover:text-white"><X size={14} /></button>}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-xs text-slate-500">
              Draw a box, polygon or pin on the map, or jump to a demo spot:
              <DemoSpotChips />
            </div>
          )}
          <button onClick={() => (running ? stopRun() : startRun())} disabled={!running && !canRun}
            className={`group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-2.5 text-sm font-semibold transition ${running ? "bg-rose-500/15 text-rose-200 ring-1 ring-rose-400/30 hover:bg-rose-500/25" : "bg-gradient-to-r from-teal-300 to-sky-400 text-slate-950 shadow-[0_0_30px_-6px] shadow-teal-300/70 hover:brightness-110 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-400 disabled:shadow-none"}`}>
            {running ? <><Square size={14} /> Recall agents</> : <><Rocket size={15} /> Deploy agents</>}
            {!running && canRun && <span className="shimmer absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent" />}
          </button>
        </div>
      </div>
  );
}

/** Streaming orchestrator thoughts + dispatch plan. */
export function OrchestratorLog({ className = "" }: { className?: string }) {
  const { running, thoughts, plan } = useStore();
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [thoughts.length, plan.length]);
  return (
      <div className={`flex flex-col border-t border-white/5 bg-black/20 ${className}`}>
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <Cpu size={12} className="text-teal-300" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Orchestrator log</span>
          {running && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-teal-300" />}
        </div>
        <div ref={logRef} className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4 font-mono text-[11px] leading-relaxed">
          {!thoughts.length && <div className="text-slate-600">Waiting for a mission…</div>}
          {thoughts.map((t, i) => (
            <div key={i} className={`flex gap-2 ${t.kind === "gap" ? "text-amber-300" : "text-slate-300"}`}>
              <span className="select-none text-teal-400/70">{t.kind === "gap" ? <AlertTriangle size={11} className="mt-0.5" /> : "›"}</span>
              <span className={i === thoughts.length - 1 && running ? "caret" : ""}>{t.text}</span>
            </div>
          ))}
          {plan.length > 0 && (
            <div className="space-y-1 rounded-lg border border-white/5 bg-white/[0.02] p-2">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Dispatch plan</div>
              {plan.map((s) => {
                const a = agentById(s.agentId);
                return a ? (
                  <div key={s.agentId} className="flex items-start gap-2">
                    <VehicleGlyph kind={a.vehicle} color={a.color} size={13} />
                    <span><span style={{ color: a.color }}>{a.name}</span> <span className="text-slate-500">· {s.reason}</span></span>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
  );
}
