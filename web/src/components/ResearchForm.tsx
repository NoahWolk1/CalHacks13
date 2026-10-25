"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useStore, agentById, pickProfile } from "@/lib/client/store";
import { startRun } from "@/lib/client/runClient";
import { regionAreaKm2 } from "@/lib/geo";
import { reverseLabel } from "@/lib/client/geocode";
import { VehicleGlyph } from "./ui";
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

/** Area, question and focus, then start. The first step of the research panel (desktop and mobile). */
export function ResearchForm({ onBack }: { onBack?: () => void }) {
  const { profiles, profileId, mode, question, region, running, routed, set } = useStore();
  // "auto" (default) lets the orchestrator route the question; a stale saved id also means auto.
  const sel = profiles.some((p) => p.id === profileId) ? profileId : "auto";
  const auto = sel === "auto";
  const profile = profiles.find((p) => p.id === sel);
  const autoPicked = routed?.auto ? profiles.find((p) => p.id === routed.profileId) : undefined;
  const canRun = useCanRun();
  // Auto: one sample per specialist, so the chips show the range of questions it routes.
  const samples = auto ? profiles.map((p) => p.sampleQuestions[0]).filter(Boolean) : profile?.sampleQuestions ?? [];

  return (
    <div className="space-y-5 p-4">
      {onBack && (
        <button onClick={onBack} className="text-[12px] text-fg3 underline-offset-2 transition-colors hover:text-fg1 hover:underline">Back to results</button>
      )}

      {/* Where */}
      <div>
        <div className="mb-2 text-[12px] text-fg3">Area</div>
        {region ? (
          <div className="flex items-center gap-2.5 rounded-md border border-line bg-bg px-3 py-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[2px] border-[1.5px] border-accent bg-accent/15" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-fg1">{region.label ?? "Selected area"}</div>
              <div className="num text-[11.5px] text-fg3">{region.kind === "box" ? "Box" : region.kind === "pin" ? "Radius" : "Polygon"} · {regionAreaKm2(region).toFixed(2)} km²</div>
            </div>
            <button onClick={() => set({ region: null })} aria-label="Clear area" className="rounded-[4px] p-1 text-fg3 transition-colors hover:bg-raised hover:text-fg1"><X size={14} strokeWidth={1.5} /></button>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-fg3">
            Draw a box, polygon or pin on the map, or start from a demo area:
            <DemoSpotChips />
          </div>
        )}
      </div>

      {/* What */}
      <div>
        <div className="mb-2 flex items-center gap-3 text-[12px]">
          {(["ask", "insights"] as const).map((m) => (
            <button key={m} onClick={() => set({ mode: m })} aria-pressed={mode === m}
              className={`transition-colors ${mode === m ? "text-fg1" : "text-fg3 hover:text-fg2"}`}>
              {m === "ask" ? "Ask a question" : "Find insights"}
            </button>
          ))}
        </div>
        {mode === "ask" ? (
          <>
            <textarea value={question} onChange={(e) => set({ question: e.target.value })} rows={3}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && canRun) { e.preventDefault(); startRun(); } }}
              placeholder={auto ? "What do you want to know about this area? It goes to the right specialist." : "What do you want to know about this area?"}
              className="w-full resize-none rounded-md border border-line bg-bg px-3 py-2 text-[13px] text-fg1 max-lg:text-base placeholder:text-fg4 focus:border-fg4 focus:outline-none focus-visible:outline-none" />
            {!question.trim() && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {samples.slice(0, 4).map((q) => (
                  <button key={q} onClick={() => set({ question: q })}
                    className="rounded-[4px] border border-line px-2 py-0.5 text-left text-[12px] text-fg3 transition-colors hover:border-line-strong hover:text-fg1">{q}</button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="rounded-md border border-line bg-bg px-3 py-2.5 text-[12.5px] leading-relaxed text-fg2">No question needed. We survey the whole area and surface the risks, opportunities and conflicts that turn up when sources are combined.</p>
        )}
      </div>

      {/* Lens */}
      <label className="block">
        <span className="mb-2 block text-[12px] text-fg3">Research focus</span>
        <select value={sel} onChange={(e) => pickProfile(e.target.value)} disabled={running}
          className="h-9 w-full rounded-md border border-line bg-bg px-2.5 text-[13px] text-fg1 focus:border-fg4 focus:outline-none">
          <option value="auto">Auto</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === autoPicked?.id ? " (auto-picked)" : ""}</option>)}
        </select>
        <span className="mt-1.5 block text-[12px] leading-snug text-fg3">
          {auto ? "Routes your question to the right specialist." : profile?.tagline}
        </span>
        {auto && autoPicked && <AutoPicked name={autoPicked.name} reason={routed!.reason} className="mt-1.5" />}
      </label>

      <button onClick={() => startRun()} disabled={running || !canRun}
        className="flex h-9 w-full items-center justify-center rounded-md bg-fg1 text-[13px] font-medium text-bg transition-colors hover:bg-white disabled:bg-raised disabled:text-fg4">
        {mode === "ask" ? "Research this question" : "Research this area"}
      </button>
    </div>
  );
}

/** Which specialist Auto routed the mission to (accent dot + "auto-picked"); the reason is the tooltip. */
export function AutoPicked({ name, reason, className = "" }: { name: string; reason?: string; className?: string }) {
  return (
    <div className={`flex min-w-0 items-center gap-1.5 text-[12px] text-fg3 ${className}`} title={reason}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
      <span className="truncate">Routed to <span className="text-fg1">{name}</span></span>
      <span className="shrink-0 rounded-[3px] border border-line px-1 text-[11px] text-fg3">auto-picked</span>
    </div>
  );
}

/** Streaming orchestrator thoughts + dispatch plan. */
export function OrchestratorLog({ className = "" }: { className?: string }) {
  const { running, thoughts, plan, routed, profiles } = useStore();
  const routedTo = routed?.auto ? profiles.find((p) => p.id === routed.profileId) : undefined;
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }); }, [thoughts.length, plan.length]);
  const t0 = thoughts[0]?.at;
  return (
      <div className={`flex flex-col ${className}`}>
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
