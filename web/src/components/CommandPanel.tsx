"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useStore, agentById, pickProfile } from "@/lib/client/store";
import { startRun, stopRun } from "@/lib/client/runClient";
import { regionAreaKm2 } from "@/lib/geo";
import { reverseLabel } from "@/lib/client/geocode";
import { motion } from "framer-motion";
import { useLayout, dragPanel, GUTTER, LOG_MIN } from "@/lib/client/layout";
import { VehicleGlyph } from "./ui";
import Sash from "./Sash";
import { DemoSpotChips } from "./PlaceSearch";


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
  const open = useLayout((s) => s.leftOpen);
  const dragging = useLayout((s) => s.dragging === "left");
  const logHeight = useLayout((s) => s.logHeight);
  const aside = useRef<HTMLElement>(null);
  const moveLog = (y: number) => {
    const r = aside.current?.getBoundingClientRect();
    if (!r) return;
    useLayout.getState().set({ logHeight: Math.round(Math.max(LOG_MIN, Math.min(r.height - 180, r.bottom - y))) });
  };
  return (
    <motion.aside ref={aside} initial={false} inert={!open && !dragging} aria-hidden={!open}
      animate={open ? { x: 0, opacity: 1, visibility: "visible" } : { x: "-100%", opacity: 0, ...(dragging ? {} : { transitionEnd: { visibility: "hidden" as const } }) }}
      transition={{ type: "spring", stiffness: 420, damping: 40 }}
      style={{ width: "var(--gs-lw)" }}
      className="dock pointer-events-auto absolute bottom-0 left-0 top-12 z-20 flex flex-col border-r border-line max-lg:hidden">
      <MissionControls className="scroll-thin min-h-0 flex-auto overflow-y-auto" />
      <div className="relative shrink-0">
        <Sash axis="y" id="log" label="Resize orchestrator log" onMove={moveLog}
          onReset={() => useLayout.getState().set({ logHeight: null })} className="inset-x-0 -top-[3px]" />
      </div>
      {/* Default: the log takes ~42% but yields to the controls on short screens (Deploy stays visible).
          Once the user drags the divider, their height wins and the controls scroll instead. */}
      <OrchestratorLog style={logHeight == null
        ? { flex: "0 1000 42%", minHeight: LOG_MIN }
        : { flex: "none", height: `clamp(${LOG_MIN}px, var(--gs-log), calc(100% - 180px))` }} />
      <Sash axis="x" id="left" label="Resize mission panel" className="inset-y-0 -right-[4px]"
        onMove={(x) => dragPanel("left", x - GUTTER)} onReset={() => useLayout.getState().set({ leftWidth: null })} />
    </motion.aside>
  );
}

/** Mode + question, orchestrator picker, region chip and the deploy button. Shared by the desktop panel and the mobile sheet. */
export function MissionControls({ className = "" }: { className?: string }) {
  const { profiles, profileId, mode, question, region, running, routed, set } = useStore();
  // "auto" (default) lets the orchestrator route the question; a stale saved id also means auto.
  const sel = profiles.some((p) => p.id === profileId) ? profileId : "auto";
  const auto = sel === "auto";
  const profile = profiles.find((p) => p.id === sel);
  const autoPicked = routed?.auto ? routed.profileId : null;
  const canRun = useCanRun();
  // Auto: one sample per specialist, so the chips show the range of questions it routes.
  const samples = auto ? profiles.map((p) => p.sampleQuestions[0]).filter(Boolean) : profile?.sampleQuestions ?? [];

  return (
      <div className={className}>
        {/* Mode + question: the main input */}
        <div className="px-4">
          <div role="tablist" className="-mx-4 flex gap-5 border-b border-line px-4">
            {(["ask", "insights"] as const).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} onClick={() => set({ mode: m })} disabled={running}
                className={`relative h-9 text-[13px] transition-colors ${mode === m ? "text-fg1" : "text-fg3 hover:text-fg2"}`}>
                {m === "ask" ? "Ask a question" : "Find insights"}
                {mode === m && <span className="absolute inset-x-0 -bottom-px h-[1.5px] bg-fg1" />}
              </button>
            ))}
          </div>
          {mode === "ask" ? (
            <div className="pb-4 pt-3">
              <textarea value={question} onChange={(e) => set({ question: e.target.value })} disabled={running} rows={3}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && canRun) { e.preventDefault(); startRun(); } }}
                placeholder={auto ? "Ask anything about the selected area. It goes to the right specialist." : "Ask anything about the selected area"}
                aria-label="Question"
                className="w-full resize-none rounded-md border border-line-strong bg-bg px-3 py-2.5 text-[14px] leading-snug text-fg1 max-lg:text-base placeholder:text-fg4 focus:border-fg3 focus:outline-none focus-visible:outline-none" />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {samples.map((q) => (
                  <button key={q} onClick={() => set({ question: q })} disabled={running}
                    className="rounded-[4px] border border-line px-2 py-0.5 text-left text-[12px] text-fg3 transition-colors hover:border-line-strong hover:text-fg1">{q}</button>
                ))}
              </div>
            </div>
          ) : (
            <p className="pb-4 pt-3 text-[12.5px] leading-relaxed text-fg2">No question needed. The full survey team sweeps the area and the orchestrator looks for findings that <span className="text-fg1">combine</span> into risks, opportunities and conflicts.</p>
          )}
        </div>

        {/* Orchestrator: compact secondary row on Auto, full list when a specialist is forced */}
        <div className="border-t border-line p-4">
          <div className="mb-2 text-[12px] text-fg3">Orchestrator</div>
          {auto ? (
            <>
              <div role="radiogroup" aria-label="Orchestrator" className="flex flex-wrap gap-1">
                {[{ id: "auto", name: "Auto" }, ...profiles].map((p) => {
                  const on = p.id === sel;
                  const picked = p.id === autoPicked;
                  return (
                    <button key={p.id} role="radio" aria-checked={on} onClick={() => pickProfile(p.id)} disabled={running}
                      title={"tagline" in p ? p.tagline : "Routes your question to the right specialist"}
                      className={`flex items-center gap-1.5 rounded-[4px] border px-2 py-[3px] text-[12px] transition-colors disabled:cursor-not-allowed ${on ? "border-line-strong bg-raised text-fg1" : picked ? "border-line-strong text-fg1" : "border-line text-fg3 hover:border-line-strong hover:text-fg1"}`}>
                      {picked && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />}
                      {p.name}
                      {picked && <span className="text-[11px] text-fg3">auto-picked</span>}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[12px] leading-snug text-fg3"><span className="text-fg2">Auto:</span> routes your question to the right specialist</p>
            </>
          ) : (
            <>
              <div role="radiogroup" aria-label="Orchestrator" className="overflow-hidden rounded-md border border-line">
                {[{ id: "auto", name: "Auto", tagline: "Routes your question to the right specialist", defaultAgents: [] as string[] }, ...profiles].map((p, i) => {
                  const on = p.id === sel;
                  const team = p.defaultAgents.map((id) => agentById(id)).filter((a) => a && !a.needsKeys?.length); // keyless agents sit out
                  return (
                    <button key={p.id} role="radio" aria-checked={on} onClick={() => pickProfile(p.id)} disabled={running}
                      className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed ${i ? "border-t border-line" : ""} ${on ? "bg-raised" : "hover:bg-raised/60"} ${running && !on ? "opacity-50" : ""}`}>
                      <span className={`mt-[3px] h-3 w-3 shrink-0 rounded-full border ${on ? "border-[4px] border-fg1" : "border-line-strong"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2 text-[13px] font-medium text-fg1">{p.name}
                          {p.id === autoPicked && <span className="text-[11px] font-normal text-fg3">auto-picked</span>}
                        </span>
                        <span className="block text-[12px] leading-snug text-fg3">{p.tagline}</span>
                        {team.length > 0 && (
                          <span className="mt-1.5 flex gap-[3px]" aria-hidden>
                            {team.map((a) => <span key={a!.id} title={a!.name} className="h-1.5 w-1.5 rounded-[1.5px]" style={{ background: a!.color }} />)}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              {profile?.persona && <p className="mt-2 text-[12px] leading-snug text-fg3">For {profile.persona.replace(/^./, (c) => c.toLowerCase())}</p>}
            </>
          )}
        </div>

        {/* Region + launch */}
        <div className="space-y-2.5 p-4">
          {region ? (
            <div className="flex items-center gap-2.5 rounded-md border border-line bg-bg px-3 py-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[2px] border-[1.5px] border-accent bg-accent/15" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-fg1">{region.label ?? "Selected area"}</div>
                <div className="num text-[11.5px] text-fg3">{region.kind === "box" ? "Box" : region.kind === "pin" ? "Radius" : "Polygon"} · {regionAreaKm2(region).toFixed(2)} km²</div>
              </div>
              {!running && <button onClick={() => set({ region: null })} aria-label="Clear area" className="rounded-[4px] p-1 text-fg3 transition-colors hover:bg-raised hover:text-fg1"><X size={14} strokeWidth={1.5} /></button>}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-fg3">
              Draw a box, polygon or pin on the map, or start from a demo area:
              <DemoSpotChips />
            </div>
          )}
          <button onClick={() => (running ? stopRun() : startRun())} disabled={!running && !canRun}
            className={`flex h-9 w-full items-center justify-center gap-2 rounded-md text-[13px] font-medium transition-colors ${running ? "border border-line-strong text-fg1 hover:bg-raised" : "bg-fg1 text-bg hover:bg-white disabled:bg-raised disabled:text-fg4"}`}>
            {running ? <><span className="h-2 w-2 rounded-[1px] bg-accent" /> Recall agents</> : <>Deploy agents</>}
          </button>
        </div>
      </div>
  );
}

/** Streaming orchestrator thoughts + dispatch plan. */
export function OrchestratorLog({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const { running, thoughts, plan, routed, profiles } = useStore();
  const routedTo = routed?.auto ? profiles.find((p) => p.id === routed.profileId) : undefined;
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [thoughts.length, plan.length]);
  const t0 = thoughts[0]?.at;
  return (
      <div className={`flex flex-col border-t border-line ${className}`} style={style}>
        <div className="flex items-center gap-2 px-4 pb-2 pt-3 text-[12px] text-fg3">
          <span>Orchestrator log</span>
          {plan.length > 0 && <span className="num ml-auto text-[11.5px]">{plan.length} dispatched</span>}
        </div>
        <div ref={logRef} className="scroll-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-4 text-[12.5px] leading-relaxed">
          {!thoughts.length && !routedTo && <div className="text-fg4">Waiting for a mission.</div>}
          {routedTo && (
            <div className="grid grid-cols-[38px_1fr] gap-2 text-fg2">
              <span className="select-none pt-px text-[11px] text-fg4">auto</span>
              <span><span className="text-fg1">Routed to {routedTo.name}:</span> {routed!.reason}</span>
            </div>
          )}
          {thoughts.map((t, i) => (
            <div key={i} className={`grid grid-cols-[38px_1fr] gap-2 ${t.kind === "gap" ? "text-[#d9a46b]" : "text-fg2"}`}>
              <span className="num select-none pt-px text-[11px] text-fg4">{t.at != null && t0 != null ? fmtT(t.at - t0) : String(i + 1).padStart(2, "0")}</span>
              <span className={i === thoughts.length - 1 && running ? "caret" : ""}>{t.text}</span>
            </div>
          ))}
          {plan.length > 0 && (
            <div className="mt-2 border-t border-line pt-2">
              {plan.map((s) => {
                const a = agentById(s.agentId);
                return a ? (
                  <div key={s.agentId} className="grid grid-cols-[16px_minmax(0,auto)_1fr] items-baseline gap-2 py-[3px]">
                    <span className="translate-y-[2px]"><VehicleGlyph kind={a.vehicle} color={a.color} size={13} /></span>
                    <span className="whitespace-nowrap text-fg1">{a.name}</span>
                    <span className="truncate text-fg3" title={s.reason}>{s.reason}</span>
                  </div>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
  );
}

function fmtT(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
