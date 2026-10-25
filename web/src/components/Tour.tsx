"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/client/store";
import { useLayout } from "@/lib/client/layout";

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

export const TOUR: Step[] = [
  { target: "tool-box", side: "below", waitFor: "region", onEnter: () => useStore.getState().set({ tool: "pan" }),
    title: "Pick an area", body: "Drag over any neighborhood on the map." },
  { target: "mode-ask", side: "left", onEnter: () => useStore.getState().set({ mode: "ask" }),
    title: "Ask a question", body: "Ask a question and we'll find the right agents to answer it!" },
  { target: "mode-insights", side: "left", title: "Or find insights",
    body: "Don't have a specific question? Allow our agents to perform a general analysis." },
  { target: "focus", side: "left", title: "Research focus",
    body: "Pick the lens, like Site Risk Analyst or Storefront Scout. It decides which team of agents goes out." },
  { target: "run", side: "left", waitFor: "run", title: "Deploy the swarm",
    body: "Start the research. Answers and insights will appear here." },
  { target: "agents", side: "below", title: "Agents",
    body: "Each agent covers one kind of data, like permits, flood zones or local news. Browse them here, or describe a new one and have Claude build it." },
];

const DONE_KEY = "gs-tour-done";
const CARD_W = 300;
const GAP = 12;
const EDGE = 12;

function finish() {
  useStore.getState().set({ tour: null });
  try { localStorage.setItem(DONE_KEY, "1"); } catch { /* private mode */ }
}

function go(i: number) {
  if (i >= TOUR.length) return finish();
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
    const measure = () => {
      const el = document.querySelector(`[data-tour="${name}"]`);
      const r = el?.getBoundingClientRect();
      const edge = el?.closest("aside")?.getBoundingClientRect().left ?? r?.left ?? 0;
      const next = r && r.width > 0 && r.right > 0 && r.left < window.innerWidth ? { top: r.top, left: r.left, width: r.width, height: r.height, edge } : null;
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

  // First visit: start once the page has settled.
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(DONE_KEY) === "1"; } catch { /* private mode: show it */ }
    if (seen) return;
    const t = setTimeout(() => { if (useStore.getState().tour == null) go(0); }, 1200);
    return () => clearTimeout(t);
  }, []);

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
        <div className="num text-[11.5px] text-fg3">{step! + 1} of {TOUR.length}</div>
        <div className="mt-1 text-[14px] font-medium tracking-[-0.005em] text-fg1">{cur.title}</div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg2">{cur.body}</p>
        <div className="mt-3 flex items-center gap-1.5">
          <button onClick={finish} className="mr-auto text-[12px] text-fg3 underline-offset-2 transition-colors hover:text-fg1 hover:underline">
            {last ? "Close" : "Skip tour"}
          </button>
          {step! > 0 && (
            <button onClick={() => go(step! - 1)} className="h-7 rounded-md border border-line px-2.5 text-[12px] text-fg2 transition-colors hover:bg-raised hover:text-fg1">Back</button>
          )}
          <button onClick={() => go(step! + 1)} className="h-7 rounded-md bg-fg1 px-3 text-[12px] font-medium text-bg transition-colors hover:bg-white">
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
