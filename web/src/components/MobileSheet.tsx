"use client";
// Below `lg`: the side panels collapse into one bottom sheet (peek / half / full).
// Peek shows the live status row (what the desktop StatusBar shows) + segmented tabs.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { Rocket, Video, VideoOff, Check } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { isOwnRun, startRun } from "@/lib/client/runClient";
import { setSheetInset } from "@/lib/client/camera";
import { regionAreaKm2 } from "@/lib/geo";
import { MissionControls, OrchestratorLog, useCanRun } from "./CommandPanel";
import { RightTabBody, useRightTabs, type RightTab } from "./RightPanel";
import { fmt, useCinematic, useMissionStats } from "./StatusBar";
import { TOOLS } from "./TopBar";

type Snap = "peek" | "half" | "full";
type SheetTab = "mission" | RightTab;
const ORDER: Snap[] = ["peek", "half", "full"];
/** Visible height of the collapsed sheet, above the home-indicator safe area. */
export const SHEET_PEEK = 124;

function useViewport() {
  const [vp, setVp] = useState({ h: 844, safe: 0 });
  const probe = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const read = () => setVp({ h: window.innerHeight, safe: probe.current?.offsetHeight ?? 0 });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return { ...vp, probe };
}

export default function MobileSheet() {
  const { h: vh, safe, probe } = useViewport();
  const runId = useStore((s) => s.runId);
  const tool = useStore((s) => s.tool);
  const set = useStore((s) => s.set);
  const watching = !!runId && !isOwnRun(runId);
  const [snap, setSnap] = useState<Snap>("peek");
  const [tab, setTab] = useState<SheetTab>("mission");
  const [drag, setDrag] = useState(0);
  const dragged = useRef(false);

  const heights: Record<Snap, number> = {
    peek: SHEET_PEEK + safe,
    half: Math.round(vh * 0.5),
    full: vh - 72 - safe,
  };
  const height = Math.max(heights.peek, Math.min(heights.full, heights[snap] - drag));

  useEffect(() => { setSheetInset(SHEET_PEEK + safe); }, [safe]);
  // Touch: one finger should pan the map by default (desktop starts on the box tool).
  useEffect(() => { if (useStore.getState().tool === "box") set({ tool: "pan" }); }, [set]);

  // Follow the store: auto tab switches (first insight, answer streaming, a finding tapped on the map),
  // run start (drop to peek so the swarm is visible), drawing (get out of the way), and a fresh region.
  useEffect(() => useStore.subscribe((s, prev) => {
    if (s.rightTab !== prev.rightTab) setTab(s.rightTab);
    if (s.running && !prev.running) { setTab(s.rightTab); setSnap("peek"); }
    if (s.tool !== "pan" && s.tool !== prev.tool) setSnap("peek");
    if (s.region && s.region !== prev.region && !s.running) setSnap("peek");
    if (s.selectedFinding && s.selectedFinding !== prev.selectedFinding) setSnap((v) => (v === "full" ? "half" : v));
  }), []);

  // Spectators (shared `/?run=` link) land on the live agents feed.
  useEffect(() => { if (watching) { setTab("agents"); setSnap("peek"); } }, [watching]);

  const pick = (t: SheetTab) => {
    setTab(t);
    if (t !== "mission") set({ rightTab: t });
    if (snap === "peek") setSnap("half");
  };

  const onPan = (_: PointerEvent, info: PanInfo) => { dragged.current = true; setDrag(info.offset.y); };
  const onPanEnd = (_: PointerEvent, info: PanInfo) => {
    const target = heights[snap] - info.offset.y;
    // Fling picks the next snap in the swipe direction; otherwise the nearest one.
    let next: Snap;
    if (Math.abs(info.velocity.y) > 400) {
      const i = ORDER.indexOf(snap) + (info.velocity.y < 0 ? 1 : -1);
      next = ORDER[Math.max(0, Math.min(2, i))];
    } else {
      next = ORDER.reduce((a, b) => (Math.abs(heights[b] - target) < Math.abs(heights[a] - target) ? b : a));
    }
    setSnap(next);
    setDrag(0);
    setTimeout(() => { dragged.current = false; }, 0);
  };
  const toggle = (e: React.MouseEvent) => {
    if (dragged.current || (e.target as HTMLElement).closest("button")) return;
    setSnap((v) => (v === "peek" ? "half" : "peek"));
  };

  const current = TOOLS.find((t) => t.id === tool);

  return (
    <>
      <div ref={probe} aria-hidden className="pointer-events-none fixed bottom-0 h-[var(--safe-bottom)] w-px opacity-0" />
      <motion.section
        className="glass pointer-events-auto absolute inset-x-0 bottom-0 z-30 mx-auto flex max-w-[640px] flex-col rounded-t-[22px] border-b-0 lg:hidden"
        style={{ paddingBottom: "var(--safe-bottom)", background: "rgba(8, 12, 20, 0.96)" }}
        initial={false}
        animate={{ height }}
        transition={drag ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 40 }}
      >
        {/* Tool hint rides on top of the sheet */}
        <AnimatePresence>
          {current && tool !== "pan" && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
              style={{ x: "-50%" }} className="absolute bottom-full left-1/2 mb-3 flex items-center whitespace-nowrap">
              <ToolHint text={current.touchHint} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drag handle + live status (tap to expand/collapse) */}
        <motion.div onPan={onPan} onPanEnd={onPanEnd} onClick={toggle} className="shrink-0 cursor-grab touch-none select-none px-4 pt-2">
          <div className="mx-auto h-1 w-10 rounded-full bg-white/20" />
          <PeekRow watching={watching} />
        </motion.div>

        {/* Segmented tabs */}
        <Tabs tab={tab} onPick={pick} />

        {/* Body */}
        <div key={tab} className={`scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain ${snap === "peek" && !drag ? "invisible" : ""}`}>
          {tab === "mission" ? (
            <>
              <MissionControls className="p-4" />
              <OrchestratorLog className="h-[300px]" />
            </>
          ) : (
            <div className="p-3 pb-6"><RightTabBody tab={tab} /></div>
          )}
        </div>
      </motion.section>
    </>
  );
}

function Tabs({ tab, onPick }: { tab: SheetTab; onPick: (t: SheetTab) => void }) {
  const right = useRightTabs();
  const tabs = [{ id: "mission" as const, label: "Mission", n: 0 }, ...right];
  return (
    <div className="mx-3 mb-2 mt-2.5 flex shrink-0 gap-0.5 rounded-xl border border-white/5 bg-black/30 p-1">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onPick(t.id)}
          className={`relative min-w-0 flex-1 rounded-lg px-1 py-1.5 text-[11.5px] transition ${tab === t.id ? "text-white" : "text-slate-400"}`}>
          {tab === t.id && <motion.span layoutId="sheet-tab" className="absolute inset-0 rounded-lg bg-white/[0.08] ring-1 ring-white/10" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
          <span className="relative block truncate">{t.label}{t.n ? <span className="ml-1 font-mono text-[10px] text-teal-300">{t.n}</span> : null}</span>
        </button>
      ))}
    </div>
  );
}

function PeekRow({ watching }: { watching: boolean }) {
  const { running, done, elapsed, active, agents, shown, total, insights } = useMissionStats();
  const region = useStore((s) => s.region);
  const canRun = useCanRun();
  const [cinematic, toggleCine] = useCinematic();
  const label = running ? (watching ? "WATCHING" : "LIVE") : done ? "COMPLETE" : "IDLE";

  return (
    <div className="mt-2 flex h-10 items-center gap-3">
      <div className="flex shrink-0 items-center gap-2">
        {running ? (
          <span className="relative flex h-2 w-2">
            <span className="ping-soft absolute inline-flex h-full w-full rounded-full bg-rose-500" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_8px] shadow-rose-500" />
          </span>
        ) : (
          <span className={`h-2 w-2 rounded-full ${done ? "bg-emerald-400" : "bg-slate-500"}`} />
        )}
        <div className="leading-none">
          <div className={`font-mono text-[10.5px] font-semibold tracking-[0.16em] ${running ? "text-rose-300" : done ? "text-emerald-300" : "text-slate-400"}`}>{label}</div>
          {(running || done) && <div className={`mt-1 font-mono text-[12px] tabular-nums ${running ? "text-teal-200" : "text-slate-300"}`}>{fmt(elapsed)}</div>}
        </div>
      </div>

      {running || done ? (
        <div className="flex min-w-0 flex-1 items-center justify-evenly gap-2 border-l border-white/10 pl-2">
          {running && <Stat label="Agents" value={active} total={agents} />}
          <Stat label="Findings" value={shown} total={total} />
          <Stat label="Insights" value={insights} accent={insights > 0} />
        </div>
      ) : region ? (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] text-slate-100">{region.label ?? "Selected area"}</div>
          <div className="font-mono text-[10px] text-slate-500">{region.kind.toUpperCase()} · {regionAreaKm2(region).toFixed(2)} km²</div>
        </div>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[12px] text-slate-400">Pick a demo spot or draw an area</span>
      )}

      {!running && canRun ? (
        <button onClick={() => startRun()}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-teal-300 to-sky-400 px-3.5 py-2 text-[12px] font-semibold text-slate-950 shadow-[0_0_24px_-6px] shadow-teal-300/70 active:scale-95">
          <Rocket size={14} /> Deploy
        </button>
      ) : region || running ? (
        <button onClick={toggleCine} aria-label="Toggle cinematic camera"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition ${cinematic ? "bg-teal-300/15 text-teal-200 ring-1 ring-teal-300/40" : "text-slate-400 ring-1 ring-white/10"}`}>
          {cinematic ? <Video size={15} /> : <VideoOff size={15} />}
        </button>
      ) : null}
    </div>
  );
}

function Stat({ label, value, total, accent }: { label: string; value: number; total?: number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className={`font-mono text-[13px] tabular-nums ${accent ? "text-teal-200" : "text-slate-100"}`}>
        {value}{total !== undefined && <span className="text-slate-500">/{total}</span>}
      </span>
      <span className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-slate-500">{label}</span>
    </div>
  );
}

function ToolHint({ text }: { text: string }) {
  const { tool, pinRadius, set } = useStore();
  return (
    <div className="glass flex items-center gap-2 rounded-full py-1.5 pl-3 pr-1.5 font-mono text-[10.5px] tracking-wide text-slate-300">
      <span>{text}</span>
      {tool === "pin" && (
        <>
          <input type="range" min={150} max={2000} step={50} value={pinRadius} onChange={(e) => set({ pinRadius: Number(e.target.value) })}
            className="h-1 w-20 accent-teal-300" aria-label="Pin radius" />
          <span className="w-[44px] text-right tabular-nums text-teal-200">{pinRadius >= 1000 ? `${(pinRadius / 1000).toFixed(1)}km` : `${pinRadius}m`}</span>
        </>
      )}
      {tool === "polygon" && (
        <button onClick={() => window.dispatchEvent(new Event("gs:finish-polygon"))}
          className="flex items-center gap-1 rounded-full bg-teal-300/15 px-2 py-1 text-teal-200 ring-1 ring-teal-300/40"><Check size={12} /> Done</button>
      )}
      <button onClick={() => set({ tool: "pan" })} className="rounded-full px-2 py-1 text-slate-400 ring-1 ring-white/10">Cancel</button>
    </div>
  );
}
