"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/client/store";
import { useLayout } from "@/lib/client/layout";
import type { RunMode } from "@/lib/types";

/**
 * Desktop guided tour: rings the element each step is about (found by its `data-tour` attribute) and
 * points a callout at it. Doesn't block the page, so step 1 can wait for the user to actually draw an area.
 * Shows once per browser (localStorage); the "?" button in the top bar replays it.
 */
type Step = {
  target: string;
  side: "below" | "left";
  /** Advance by itself when this happens (Next still works). */
  waitFor?: "region" | "run";
  /** Put the page in the state this step talks about (e.g. start on Pan, select Ask). */
  onEnter?: () => void;
  title: string;
  body: string;
};

/** The research mode before the tour switched it, so leaving the tour early can put it back. */
let modeBefore: RunMode | null = null;
const setMode = (mode: RunMode) => {
  const s = useStore.getState();
  modeBefore ??= s.mode;
  s.set({ mode });
};

export const TOUR: Step[] = [
  // Select Box so dragging draws instead of orbiting (unless the user already picked a drawing tool).
  { target: "tool-box", side: "below", waitFor: "region", onEnter: () => { if (useStore.getState().tool === "pan") useStore.getState().set({ tool: "box" }); },
    title: "Pick an area", body: "Drag over any neighborhood on the map." },
  { target: "mode-ask", side: "left", onEnter: () => setMode("ask"),
    title: "Ask a question.", body: "We'll find the right agents to answer it." },
  // Back to Insights, so the Run button on step 5 works without a typed question.
  { target: "mode-insights", side: "left", onEnter: () => setMode("insights"),
    title: "Just exploring?", body: "Let our agents run a general analysis of the area." },
  { target: "focus", side: "left",
    title: "Choose a lens", body: "Site Risk Analyst, Storefront Scout and the others each send a different team of agents." },
  { target: "run", side: "left", waitFor: "run",
    title: "Start the research", body: "Answers and insights will appear here." },
  { target: "agents", side: "below",
    title: "Meet the agents", body: "Each covers one kind of data, like permits, flood zones or local news. Browse them, or describe a new one and Claude will build it." },
];

const DONE_KEY = "gs-tour-done";
const START_DELAY = 4000;
const CARD_W = 320;
const GAP = 12;
const EDGE = 12;

function finish() {
  const s = useStore.getState();
  // Leaving before the run step: put back the mode the tour switched away from.
  if (modeBefore && s.tour != null && s.tour <= TOUR.findIndex((t) => t.waitFor === "run") && !s.running) s.set({ mode: modeBefore });
  modeBefore = null;
  s.set({ tour: null });
  try { localStorage.setItem(DONE_KEY, "1"); } catch { /* private mode */ }
}

/** A step to pass over: its target isn't on the page (e.g. results showing instead of the form), or going forward, what it waits for already happened. */
function skip(t: Step, forward: boolean) {
  const s = useStore.getState();
  if (forward && ((t.waitFor === "region" && s.region) || (t.waitFor === "run" && s.running))) return true;
  return !document.querySelector(`[data-tour="${t.target}"]`);
}

function go(i: number, dir: 1 | -1 = 1) {
  while (i >= 0 && i < TOUR.length && skip(TOUR[i], dir === 1)) i += dir;
  if (i >= TOUR.length) return finish();
  if (i < 0) return; // Back with nothing earlier to show: stay put.
  // Panel steps need the research panel open.
  if (TOUR[i].side === "left") useLayout.getState().set({ rightOpen: true });
  TOUR[i].onEnter?.();
  useStore.getState().set({ tour: i });
}

export const startTour = () => go(0);

/** `edge`: left edge of the panel the target sits in (callouts stay clear of the whole panel), else its own left. */
type Box = { top: number; left: number; width: number; height: number; edge: number };

/** Viewport box of `[data-tour=name]`, re-measured as panels slide and resize. Null when it isn't on screen. */
function useTargetBox(name: string | undefined) {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!name) { setBox(null); return; }
    // Scroll a target in the research panel into view, so the ring isn't drawn off-screen.
    const el0 = document.querySelector(`[data-tour="${name}"]`);
    const sc = el0?.closest<HTMLElement>(".overflow-y-auto");
    if (el0 && sc) {
      const r = el0.getBoundingClientRect(), p = sc.getBoundingClientRect();
      if (r.top < p.top || r.bottom > p.bottom) sc.scrollTop += r.top - p.top - 16;
    }
    const measure = () => {
      const el = document.querySelector(`[data-tour="${name}"]`);
      const r = el?.getBoundingClientRect();
      const edge = el?.closest("aside")?.getBoundingClientRect().left ?? r?.left ?? 0;
      const next = r && r.width > 0 && r.right > 0 && r.left < window.innerWidth && r.bottom > 0 && r.top < window.innerHeight ?{ top: r.top, left: r.left, width: r.width, height: r.height, edge } : null;
      setBox((cur) => (cur && next && cur.top === next.top && cur.left === next.left && cur.width === next.width && cur.height === next.height && cur.edge === next.edge ? cur : next));
    };
    measure();
    const id = setInterval(measure, 200);
    window.addEventListener("resize", measure);
    return () => { clearInterval(id); window.removeEventListener("resize", measure); };
  }, [name]);
  return box;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function Ring({ box }: { box: Box }) {
  return (
    <div className="pointer-events-none fixed animate-pulse rounded-md shadow-[0_0_0_2px_var(--accent),0_0_18px_2px_rgba(232,133,61,0.35)] transition-[top,left,width,height] duration-200"
      style={{ top: box.top - 4, left: box.left - 4, width: box.width + 8, height: box.height + 8 }} />
  );
}

export default function Tour() {
  const step = useStore((s) => s.tour);
  const covered = usePathname() !== "/";
  const cur = step != null ? TOUR[step] : undefined;
  const target = useTargetBox(cur?.target);
  const card = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(160);

  // First visit: let the Pan hint show for a moment, then start. Not on a shared run link (`?run=`).
  // Unmounting (e.g. resizing to phone width) ends the tour without marking it done.
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(DONE_KEY) === "1"; } catch { /* private mode: show it */ }
    if (seen || new URL(window.location.href).searchParams.has("run")) return () => useStore.getState().set({ tour: null });
    const t = setTimeout(() => { if (useStore.getState().tour == null) go(0); }, START_DELAY);
    return () => { clearTimeout(t); useStore.getState().set({ tour: null }); };
  }, []);

  // Escape closes the tour (unless typing in a field).
  useEffect(() => {
    if (step == null) return;
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "Escape" && tag !== "INPUT" && tag !== "TEXTAREA") finish();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [step]);

  // Steps that wait on the user move on by themselves.
  useEffect(() => useStore.subscribe((s, prev) => {
    const w = s.tour != null ? TOUR[s.tour].waitFor : undefined;
    if ((w === "region" && s.region && s.region !== prev.region) || (w === "run" && s.running && !prev.running)) go(s.tour! + 1);
  }), []);

  // Clicking Agents on the last step counts as finishing.
  useEffect(() => { if (covered && step === TOUR.length - 1) finish(); }, [covered, step]);

  // Left-side callouts center on their target, so they need the card's height for each step's copy.
  useLayoutEffect(() => {
    const h = card.current?.offsetHeight;
    if (h) setCardH(h);
  }, [step, covered]);

  if (!cur || covered) return null;

  const vw = window.innerWidth, vh = window.innerHeight;
  let pos: { top: number; left: number };
  let arrow: { top: number; left: number } | null = null;
  if (!target) {
    pos = { top: (vh - cardH) / 2, left: (vw - CARD_W) / 2 };
  } else if (cur.side === "below") {
    const cx = target.left + target.width / 2;
    pos = { top: target.top + target.height + GAP + 4, left: clamp(cx - CARD_W / 2, EDGE, vw - CARD_W - EDGE) };
    arrow = { top: -5, left: clamp(cx - pos.left - 5, 14, CARD_W - 24) };
  } else {
    const cy = target.top + target.height / 2;
    pos = { top: clamp(cy - cardH / 2, 56, vh - cardH - EDGE), left: Math.max(EDGE, Math.min(target.left, target.edge) - GAP - 4 - CARD_W) };
    arrow = { top: clamp(cy - pos.top - 5, 14, cardH - 24), left: CARD_W - 6 };
  }
  const last = step === TOUR.length - 1;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]">
      {target && <Ring box={target} />}
      <div ref={card} role="dialog" aria-label={`Tour: ${cur.title}`}
        className="pointer-events-auto fixed rounded-lg border border-line-strong bg-panel p-4 shadow-[0_12px_40px_rgba(0,0,0,0.5)] transition-[top,left] duration-200"
        style={{ top: pos.top, left: pos.left, width: CARD_W }}>
        {arrow && <span aria-hidden className="absolute h-2.5 w-2.5 rotate-45 border-line-strong bg-panel"
          style={{ top: arrow.top, left: arrow.left, borderWidth: cur.side === "below" ? "1px 0 0 1px" : "1px 1px 0 0" }} />}
        <div className="num text-[12px] text-fg3">{step! + 1} of {TOUR.length}</div>
        <div className="mt-1 text-[15px] font-medium tracking-[-0.005em] text-fg1">{cur.title}</div>
        <p className="mt-1 text-[14px] leading-relaxed text-fg2">{cur.body}</p>
        <div className="mt-3 flex items-center gap-1.5">
          <button onClick={finish} className="mr-auto text-[12px] text-fg3 underline-offset-2 transition-colors hover:text-fg1 hover:underline">
            {last ? "Close" : "Skip tour"}
          </button>
          {step! > 0 && (
            <button onClick={() => go(step! - 1, -1)} className="h-7 rounded-md border border-line px-2.5 text-[12px] text-fg2 transition-colors hover:bg-raised hover:text-fg1">Back</button>
          )}
          <button onClick={() => go(step! + 1)} className="h-7 rounded-md bg-fg1 px-3 text-[12px] font-medium text-bg transition-colors hover:bg-white">
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
