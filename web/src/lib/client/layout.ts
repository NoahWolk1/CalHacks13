"use client";
// Desktop panel layout (VS Code-style resizable/collapsible sidebars) in one small store.
// Geometry is pushed to CSS custom properties on <html>, so dragging a sash repositions the
// panels, top bar, status bar etc. without re-rendering React (or the deck.gl map).
import { useEffect } from "react";
import { create } from "zustand";

/** Panels are docked flush to the window edges (no outer gutter). */
export const GUTTER = 0;
/** A collapsed panel leaves a slim activity rail on its edge (reopen + quick tabs). */
export const RAIL = 36;
/** Height of the docked top bar; panels and rails start below it. */
export const TOPBAR = 48;
export const LEFT = { min: 280, max: 560 } as const;
export const RIGHT = { min: 320, max: 640 } as const;
/** Visible map strip between the panels never gets narrower than this. */
export const MIN_MAP = 360;
/** Dragging a panel narrower than this snaps it shut (like VS Code). */
export const SNAP_CLOSE = 200;
export const LOG_MIN = 96;

type Prefs = { leftWidth: number | null; rightWidth: number | null; leftOpen: boolean; rightOpen: boolean; logHeight: number | null };
type Drag = null | "left" | "right" | "log";

type LayoutState = Prefs & {
  vw: number;
  hydrated: boolean;
  dragging: Drag;
  set: (p: Partial<LayoutState>) => void;
  toggleLeft: () => void;
  toggleRight: () => void;
};

const KEY = "gs-layout-v1";
const DEFAULT_PREFS: Prefs = { leftWidth: null, rightWidth: null, leftOpen: true, rightOpen: true, logHeight: null };

export const useLayout = create<LayoutState>((set) => ({
  ...DEFAULT_PREFS,
  vw: 1600,
  hydrated: false,
  dragging: null,
  set: (p) => set(p),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
}));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Fluid defaults: narrower panels between 1024 and ~1500px so the map isn't crushed. */
export function defaultWidths(vw: number) {
  return { left: Math.round(clamp(vw * 0.225, LEFT.min, 360)), right: Math.round(clamp(vw * 0.25, RIGHT.min, 400)) };
}

export type Geometry = {
  vw: number;
  leftOpen: boolean; rightOpen: boolean;
  /** Panel widths (kept even while collapsed, so they reopen at the same size). */
  lw: number; rw: number;
  /** Left/right insets of the visible map strip from the window edges. */
  le: number; re: number;
  /** Width and center x of the visible map strip. */
  mw: number; mid: number;
};

export function geometry(s: Pick<LayoutState, keyof Prefs | "vw"> = useLayout.getState()): Geometry {
  const { vw, leftOpen, rightOpen } = s;
  const d = defaultWidths(vw);
  let lw = clamp(s.leftWidth ?? d.left, LEFT.min, LEFT.max);
  let rw = clamp(s.rightWidth ?? d.right, RIGHT.min, RIGHT.max);
  // Keep MIN_MAP visible: shave the right panel first, then the left, down to their minimums.
  let over = (leftOpen ? GUTTER + lw : RAIL) + (rightOpen ? GUTTER + rw : RAIL) - (vw - MIN_MAP);
  if (over > 0 && rightOpen) { const t = Math.min(over, rw - RIGHT.min); rw -= t; over -= t; }
  if (over > 0 && leftOpen) { const t = Math.min(over, lw - LEFT.min); lw -= t; over -= t; }
  const le = leftOpen ? GUTTER + lw : RAIL, re = rightOpen ? GUTTER + rw : RAIL;
  const mw = Math.max(0, vw - le - re);
  return { vw, leftOpen, rightOpen, lw, rw, le, re, mw, mid: le + mw / 2 };
}

/** Largest width a panel may take right now without squeezing the map below MIN_MAP. */
export function maxWidth(side: "left" | "right", g = geometry()) {
  const other = side === "left" ? g.re : g.le;
  const room = g.vw - MIN_MAP - other - GUTTER;
  return side === "left" ? Math.max(LEFT.min, Math.min(LEFT.max, room)) : Math.max(RIGHT.min, Math.min(RIGHT.max, room));
}

/** Apply a raw sash position for a side panel: snaps shut below SNAP_CLOSE, otherwise clamps. */
export function dragPanel(side: "left" | "right", raw: number) {
  const st = useLayout.getState();
  if (raw < SNAP_CLOSE) { st.set(side === "left" ? { leftOpen: false } : { rightOpen: false }); return; }
  const g = geometry({ ...st, ...(side === "left" ? { leftOpen: true } : { rightOpen: true }) });
  const w = Math.round(clamp(raw, side === "left" ? LEFT.min : RIGHT.min, maxWidth(side, g)));
  st.set(side === "left" ? { leftOpen: true, leftWidth: w } : { rightOpen: true, rightWidth: w });
}

function applyVars(s: LayoutState) {
  const g = geometry(s);
  const r = document.documentElement.style;
  r.setProperty("--gs-lw", `${g.lw}px`);
  r.setProperty("--gs-rw", `${g.rw}px`);
  r.setProperty("--gs-le", `${g.le}px`);
  r.setProperty("--gs-re", `${g.re}px`);
  r.setProperty("--gs-mw", `${g.mw}px`);
  r.setProperty("--gs-tlw", g.leftOpen ? `${g.lw}px` : "auto");
  r.setProperty("--gs-trw", g.rightOpen ? `${g.rw}px` : "auto");
  r.setProperty("--gs-log", s.logHeight != null ? `${s.logHeight}px` : "42%");
  const ds = document.documentElement.dataset;
  if (s.dragging) { ds.gsDrag = s.dragging === "log" ? "y" : "x"; ds.gsSash = s.dragging; }
  else { delete ds.gsDrag; delete ds.gsSash; }
}

function load(): Partial<Prefs> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Partial<Prefs>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      leftWidth: num(p.leftWidth), rightWidth: num(p.rightWidth), logHeight: num(p.logHeight),
      leftOpen: p.leftOpen !== false, rightOpen: p.rightOpen !== false,
    };
  } catch { return {}; }
}

function save(s: Prefs) {
  try {
    const { leftWidth, rightWidth, leftOpen, rightOpen, logHeight } = s;
    localStorage.setItem(KEY, JSON.stringify({ leftWidth, rightWidth, leftOpen, rightOpen, logHeight }));
  } catch { /* storage blocked: layout just won't persist */ }
}

/** Mount once (App): hydrates saved prefs, tracks the viewport, writes CSS vars, persists, and binds Cmd/Ctrl+B. */
export function useLayoutSync() {
  useEffect(() => {
    const st = useLayout.getState();
    st.set({ ...load(), vw: window.innerWidth, hydrated: true });
    applyVars(useLayout.getState());

    let saveT: ReturnType<typeof setTimeout> | undefined;
    const unsub = useLayout.subscribe((s, prev) => {
      applyVars(s);
      if (s.leftWidth !== prev.leftWidth || s.rightWidth !== prev.rightWidth || s.leftOpen !== prev.leftOpen || s.rightOpen !== prev.rightOpen || s.logHeight !== prev.logHeight) {
        clearTimeout(saveT);
        saveT = setTimeout(() => save(useLayout.getState()), 200);
      }
    });

    let raf = 0;
    const resize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => useLayout.getState().set({ vw: window.innerWidth })); };
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.code !== "KeyB" || e.shiftKey || window.innerWidth < 1024) return;
      e.preventDefault();
      if (e.altKey) useLayout.getState().toggleRight(); else useLayout.getState().toggleLeft();
    };
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", key);
    return () => { unsub(); clearTimeout(saveT); cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("keydown", key); };
  }, []);
}
