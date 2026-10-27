"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Hand, BoxSelect, Pentagon, MapPin, Users, Search, PanelRightClose, PanelRightOpen, CircleHelp, Telescope } from "lucide-react";
import { useLayout } from "@/lib/client/layout";
import { useStore, type Tool } from "@/lib/client/store";
import { useIsDesktop } from "@/lib/client/useMedia";
import { APP_NAME } from "@/lib/brand";
import PlaceSearch from "./PlaceSearch";
import { startTour } from "./Tour";

export const TOOLS: { id: Tool; label: string; icon: typeof Hand; hint: string; touchHint: string; editHint?: string }[] = [
  { id: "pan", label: "Pan", icon: Hand, hint: "Drag to orbit. Scroll to zoom.", touchHint: "Drag to pan · pinch to zoom" },
  { id: "box", label: "Box", icon: BoxSelect, hint: "Drag to draw a box", touchHint: "Drag a finger to draw a box", editHint: "Drag the handles to adjust · Esc to clear and redraw" },
  { id: "polygon", label: "Polygon", icon: Pentagon, hint: "Click points, click first point or press Enter to close", touchHint: "Tap corners to outline", editHint: "Drag the handles to adjust · click to outline a new area" },
  { id: "pin", label: "Pin", icon: MapPin, hint: "Click to drop a pin", touchHint: "Tap to drop a pin", editHint: "Drag the handles to adjust · click to move the pin" },
];

/** Switch drawing tools. A different tool drops the selected area; picking the active draw tool again puts it down. */
export function pickTool(id: Tool) {
  const { tool, set } = useStore.getState();
  if (id === tool && id === "pan") return;
  set({ tool: id === tool ? "pan" : id, region: null });
}

/** Static three-dot "swarm" mark; one dot in the accent. */
export function SwarmMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden className="shrink-0">
      <path d="M10 4.5 4.5 14h11z" fill="none" stroke="var(--fg1)" strokeOpacity=".3" strokeWidth="1" />
      <circle cx="10" cy="4.5" r="2.2" fill="var(--fg1)" />
      <circle cx="4.5" cy="14" r="2.2" fill="var(--fg1)" />
      <circle cx="15.5" cy="14" r="2.2" fill="var(--accent)" />
    </svg>
  );
}

export default function TopBar() {
  const desktop = useIsDesktop();
  return desktop ? <DesktopTopBar /> : <MobileTopBar />;
}

function PanelToggle() {
  const open = useLayout((s) => s.rightOpen);
  const Icon = open ? PanelRightClose : PanelRightOpen;
  return (
    <button onClick={() => useLayout.getState().toggleRight()}
      title={`${open ? "Hide" : "Show"} research panel (⌘B)`} aria-label={`${open ? "Hide" : "Show"} research panel`} aria-pressed={open}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] text-fg3 transition-colors hover:bg-raised hover:text-fg1">
      <Icon size={15} strokeWidth={1.5} />
    </button>
  );
}

function DesktopTopBar() {
  const { tool, pinRadius, running, llm, agents, region, set } = useStore();
  const current = TOOLS.find((t) => t.id === tool);
  const inspecting = useStore((s) => s.selectedFinding != null); // the inspector card takes that corner
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBtn = useRef<HTMLButtonElement>(null);
  // "/" opens the collapsed search when the full field is hidden for lack of room.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && searchBtn.current?.offsetParent) { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <header className="dock absolute inset-x-0 top-0 z-30 flex h-12 items-stretch border-b border-line max-lg:hidden">
      {/* Brand */}
      <div className="flex shrink-0 items-center gap-2.5 pl-4 pr-2">
        <SwarmMark />
        <div className="flex min-w-0 flex-1 items-baseline gap-2 whitespace-nowrap">
          <span className="text-[14px] font-semibold tracking-[-0.01em] text-fg1">{APP_NAME}</span>
          <span className="truncate text-[12px] text-fg3">Area research</span>
        </div>
      </div>

      {/* Drawing tools + place search, centered over the visible map strip */}
      <div className="@container flex min-w-0 flex-1 items-center justify-center px-3">
      <div className="flex min-w-0 items-center gap-2">
      <div className="relative flex min-w-0 flex-col items-center">
        <div className={`flex h-[30px] items-center gap-0.5 rounded-md border border-line bg-bg p-0.5 transition-opacity ${running ? "opacity-50" : ""}`}>
          {TOOLS.map(({ id, label, icon: Icon }) => {
            const on = tool === id;
            return (
              <button key={id} onClick={() => pickTool(id)} disabled={running} title={label} aria-label={label} aria-pressed={on} data-tour={`tool-${id}`}
                className={`flex h-full items-center gap-1.5 rounded-[4px] px-2.5 text-[12.5px] transition-colors disabled:cursor-not-allowed @max-[600px]:px-2 ${on ? "bg-active text-fg1 shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-fg2 hover:text-fg1"}`}>
                <Icon size={14} strokeWidth={1.5} />
                <span className="@max-[600px]:hidden">{label}</span>
              </button>
            );
          })}
          {tool === "pin" && (
            <div className="ml-1 flex items-center gap-2 border-l border-line pl-2.5 pr-1.5 @max-[440px]:pl-2">
              <input type="range" min={150} max={2000} step={50} value={pinRadius} disabled={running}
                onChange={(e) => set({ pinRadius: Number(e.target.value) })}
                className="h-1 w-24 cursor-pointer disabled:cursor-not-allowed @max-[440px]:w-16" aria-label="Pin radius" />
              <span className="num w-[48px] text-right text-[11.5px] text-fg2">
                {pinRadius >= 1000 ? `${(pinRadius / 1000).toFixed(2)}km` : `${pinRadius}m`}
              </span>
            </div>
          )}
        </div>
        {(running || current) && !inspecting && (
          <div className="pointer-events-none absolute top-full mt-[19px] flex max-w-[calc(100cqw-16px)] items-center gap-2 whitespace-nowrap rounded-[4px] bg-bg/85 px-2 py-0.5 text-[12px] text-fg3 @max-[600px]:hidden">
            <span className="truncate">{running ? "Recall agents to draw a new area" : region && current!.editHint ? current!.editHint : current!.hint}</span>
            {!running && tool !== "pan" && (
              <button onClick={() => pickTool("pan")} title="Cancel selection (Esc)"
                className="pointer-events-auto shrink-0 text-fg2 underline-offset-2 transition-colors hover:text-fg1 hover:underline">
                Cancel <kbd className="num text-[11px] text-fg4">Esc</kbd>
              </button>
            )}
          </div>
        )}
      </div>
      <div className="h-[30px] @max-[460px]:hidden"><PlaceSearch /></div>
      <div className="relative hidden h-[30px] @max-[460px]:block">
        {searchOpen ? (
          <div className="absolute right-0 top-0 h-full w-[260px]"><PlaceSearch variant="popover" onClose={() => setSearchOpen(false)} /></div>
        ) : (
          <button ref={searchBtn} onClick={() => setSearchOpen(true)} title="Search a place (/)" aria-label="Search a place"
            className="grid h-full w-[30px] place-items-center rounded-md border border-line bg-bg text-fg3 transition-colors hover:text-fg1">
            <Search size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
      </div>
      </div>

      {/* Status + agents link (tracks the research panel's width) */}
      <div className="gs-follow flex shrink-0 items-center justify-end gap-3 pl-3 pr-2" style={{ width: "var(--gs-trw)" }}>
        <span title={llm ? "Claude is reasoning over findings" : "Set ANTHROPIC_API_KEY for Claude reasoning"}
          className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] text-fg3 ${llm ? "" : "cursor-help"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${llm ? "bg-ok" : "bg-[#d2c162]"}`} />
          {llm ? "Claude online" : "Heuristic mode"}
        </span>
        <Link href="/space" title="Research a region of space" className="shrink-0 text-[12.5px] text-fg3 transition-colors hover:text-fg1">Space</Link>
        <button onClick={startTour} title="Take the tour" aria-label="Take the tour"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[4px] text-fg3 transition-colors hover:bg-raised hover:text-fg1">
          <CircleHelp size={15} strokeWidth={1.5} />
        </button>
        <Link href="/agents" data-tour="agents"
          className="flex h-[30px] shrink-0 items-center gap-2 whitespace-nowrap rounded-md border border-line-strong px-3 text-[12.5px] text-fg1 transition-colors hover:bg-raised">
          Agents
          <span className="num text-[11.5px] text-fg3">{agents.length}</span>
        </Link>
        <PanelToggle />
      </div>
    </header>
  );
}

/** Phones/tablets: logo mark, expandable search, Agent Hub; drawing tools live in a floating rail. */
function MobileTopBar() {
  const { tool, running, llm, agents } = useStore();
  const [searching, setSearching] = useState(false);
  const btn = "glass pointer-events-auto grid h-11 w-11 shrink-0 place-items-center rounded-lg text-fg2 transition-colors active:bg-raised";

  return (
    <>
      <header className="pointer-events-none absolute inset-x-4 z-30 flex h-11 items-stretch gap-2" style={{ top: "max(12px, env(safe-area-inset-top))" }}>
        {searching ? (
          <PlaceSearch variant="mobile" onClose={() => setSearching(false)} />
        ) : (
          <>
            <div className="glass pointer-events-auto relative flex items-center gap-2 rounded-lg pl-3 pr-3">
              <SwarmMark size={18} />
              <span className="text-[14px] font-semibold tracking-[-0.01em] text-fg1">{APP_NAME}</span>
              <span title={llm ? "Claude online" : "Heuristic mode"} className={`h-1.5 w-1.5 rounded-full ${llm ? "bg-ok" : "bg-[#d2c162]"}`} />
            </div>
            <div className="flex-1" />
            <button onClick={() => setSearching(true)} className={btn} aria-label="Search a place"><Search size={17} strokeWidth={1.5} /></button>
            <Link href="/space" className={btn} aria-label="Space research"><Telescope size={17} strokeWidth={1.5} /></Link>
            <Link href="/agents" className={`${btn} relative`} aria-label="Agents">
              <Users size={17} strokeWidth={1.5} />
              <span className="num absolute -right-1 -top-1 min-w-[18px] rounded-[4px] border border-line-strong bg-panel px-1 text-center text-[10px] leading-[16px] text-fg2">{agents.length}</span>
            </Link>
          </>
        )}
      </header>

      {/* Floating tool rail */}
      {!running && (
        <div className="glass pointer-events-auto absolute right-4 z-20 flex flex-col gap-0.5 rounded-lg p-1" style={{ top: "calc(max(12px, env(safe-area-inset-top)) + 100px)" }}>
          {TOOLS.map(({ id, label, icon: Icon }) => {
            const on = tool === id;
            return (
              <button key={id} onClick={() => pickTool(id)} aria-label={label} aria-pressed={on}
                className={`grid h-10 w-10 place-items-center rounded-md transition-colors ${on ? "bg-active text-fg1 shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-fg3"}`}>
                <Icon size={17} strokeWidth={1.5} />
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
