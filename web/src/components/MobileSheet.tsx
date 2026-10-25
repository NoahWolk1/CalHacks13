"use client";
// Below `lg`: the side panels collapse into one bottom sheet (peek / half / full).
// Peek shows the live status row (what the desktop StatusBar shows) + segmented tabs.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { Video, VideoOff, Check } from "lucide-react";
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
  // Overlays above the sheet (finding inspector) size themselves against its live height.
  useEffect(() => { document.documentElement.style.setProperty("--gs-sheet", `${height}px`); }, [height]);
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
        className="glass pointer-events-auto absolute inset-x-0 bottom-0 z-30 mx-auto flex max-w-[640px] flex-col rounded-t-xl border-b-0 lg:hidden"
        style={{ paddingBottom: "var(--safe-bottom)" }}
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
          <div className="mx-auto h-1 w-9 rounded-full bg-line-strong" />
          <PeekRow watching={watching} />
        </motion.div>

        {/* Segmented tabs */}
        <Tabs tab={tab} onPick={pick} />

        {/* Body */}
        <div key={tab} className={`scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain ${snap === "peek" && !drag ? "invisible" : ""}`}>
          {tab === "mission" ? (
            <>
              <MissionControls />
              <OrchestratorLog className="h-[300px]" />
            </>
          ) : (
            <div className="pb-6"><RightTabBody tab={tab} /></div>
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
    <div role="tablist" className="mt-1.5 flex shrink-0 border-b border-line px-2">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => onPick(t.id)}
          className={`relative min-w-0 flex-1 px-1 py-2.5 text-[13px] transition-colors ${tab === t.id ? "text-fg1" : "text-fg3"}`}>
          <span className="block truncate">{t.label}{t.n ? <span className="num ml-1 text-[11px] text-fg3">{t.n}</span> : null}</span>
          {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-[1.5px] bg-fg1" />}
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
  const label = running ? (watching ? "Watching" : "Live") : done ? "Complete" : "Idle";

  return (
    <div className="mt-2 flex h-10 items-center gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-accent" : done ? "bg-ok" : "bg-fg4"}`} />
        <div className="leading-none">
          <div className={`text-[12.5px] font-medium ${running ? "text-accent" : done ? "text-fg2" : "text-fg3"}`}>{label}</div>
          {(running || done) && <div className="num mt-1 text-[12px] text-fg1">{fmt(elapsed)}</div>}
        </div>
      </div>

      {running || done ? (
        <div className="flex min-w-0 flex-1 items-center justify-evenly gap-2 border-l border-line pl-2">
          {running && <Stat label="Agents" value={active} total={agents} />}
          <Stat label="Findings" value={shown} total={total} />
          <Stat label="Insights" value={insights} />
        </div>
      ) : region ? (
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-medium text-fg1">{region.label ?? "Selected area"}</div>
          <div className="num text-[11.5px] text-fg3">{regionAreaKm2(region).toFixed(2)} km²</div>
        </div>
      ) : (
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg3">Pick a demo area or draw one</span>
      )}

      {!running && canRun ? (
        <button onClick={() => startRun()}
          className="flex h-9 shrink-0 items-center rounded-md bg-fg1 px-3.5 text-[13px] font-medium text-bg active:bg-white">
          Deploy
        </button>
      ) : region || running ? (
        <button onClick={toggleCine} aria-label="Toggle cinematic camera"
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border transition-colors ${cinematic ? "border-line-strong bg-active text-fg1" : "border-line text-fg3"}`}>
          {cinematic ? <Video size={15} strokeWidth={1.5} /> : <VideoOff size={15} strokeWidth={1.5} />}
        </button>
      ) : null}
    </div>
  );
}

function Stat({ label, value, total }: { label: string; value: number; total?: number }) {
  return (
    <div className="flex flex-col items-center leading-none">
      <span className="num text-[13px] text-fg1">
        {value}{total !== undefined && <span className="text-fg3">/{total}</span>}
      </span>
      <span className="mt-1 text-[11px] text-fg3">{label}</span>
    </div>
  );
}

function ToolHint({ text }: { text: string }) {
  const { tool, pinRadius, set } = useStore();
  return (
    <div className="glass flex items-center gap-2 rounded-md py-1.5 pl-3 pr-1.5 text-[12.5px] text-fg2">
      <span>{text}</span>
      {tool === "pin" && (
        <>
          <input type="range" min={150} max={2000} step={50} value={pinRadius} onChange={(e) => set({ pinRadius: Number(e.target.value) })}
            className="h-1 w-20" aria-label="Pin radius" />
          <span className="num w-[44px] text-right text-[11.5px] text-fg1">{pinRadius >= 1000 ? `${(pinRadius / 1000).toFixed(1)}km` : `${pinRadius}m`}</span>
        </>
      )}
      {tool === "polygon" && (
        <button onClick={() => window.dispatchEvent(new Event("gs:finish-polygon"))}
          className="flex items-center gap-1 rounded-[4px] bg-fg1 px-2 py-1 text-bg"><Check size={12} /> Done</button>
      )}
      <button onClick={() => set({ tool: "pan" })} className="rounded-[4px] border border-line px-2 py-1 text-fg3">Cancel</button>
    </div>
  );
}
