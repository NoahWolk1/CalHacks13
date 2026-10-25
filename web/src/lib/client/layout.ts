"use client";
// Desktop panel layout (one VS Code-style resizable/collapsible research panel on the right) in one small store.
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
export const RIGHT = { min: 320, max: 640 } as const;
/** Visible map strip left of the panel never gets narrower than this. */
export const MIN_MAP = 360;
/** Dragging a panel narrower than this snaps it shut (like VS Code). */
export const SNAP_CLOSE = 200;

type Prefs = { rightWidth: number | null; rightOpen: boolean };
type Drag = null | "right";

type LayoutState = Prefs & {
  vw: number;
  hydrated: boolean;
  dragging: Drag;
  set: (p: Partial<LayoutState>) => void;
  toggleRight: () => void;
};

const KEY = "gs-layout-v1";
const DEFAULT_PREFS: Prefs = { rightWidth: null, rightOpen: true };

export const useLayout = create<LayoutState>((set) => ({
  ...DEFAULT_PREFS,
  vw: 1600,
  hydrated: false,
  dragging: null,
  set: (p) => set(p),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
}));

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Fluid default: a narrower panel between 1024 and ~1500px so the map isn't crushed. */
export function defaultWidth(vw: number) {
  return Math.round(clamp(vw * 0.27, RIGHT.min, 440));
}

export type Geometry = {
  vw: number;
  rightOpen: boolean;
  /** Panel width (kept even while collapsed, so it reopens at the same size). */
  rw: number;
  /** Left/right insets of the visible map strip from the window edges. */
  le: number; re: number;
  /** Width and center x of the visible map strip. */
  mw: number; mid: number;
};

export function geometry(s: Pick<LayoutState, keyof Prefs | "vw"> = useLayout.getState()): Geometry {
  const { vw, rightOpen } = s;
  // Keep MIN_MAP visible, down to the panel's minimum width.
  const rw = Math.max(RIGHT.min, Math.min(clamp(s.rightWidth ?? defaultWidth(vw), RIGHT.min, RIGHT.max), vw - MIN_MAP - GUTTER));
  const le = 0, re = rightOpen ? GUTTER + rw : RAIL;
  const mw = Math.max(0, vw - le - re);
  return { vw, rightOpen, rw, le, re, mw, mid: le + mw / 2 };
}

/** Largest width the panel may take right now without squeezing the map below MIN_MAP. */
export function maxWidth(g = geometry()) {
  return Math.max(RIGHT.min, Math.min(RIGHT.max, g.vw - MIN_MAP - GUTTER));
}

/** Apply a raw sash position for the panel: snaps shut below SNAP_CLOSE, otherwise clamps. */
export function dragPanel(raw: number) {
  const st = useLayout.getState();
  if (raw < SNAP_CLOSE) { st.set({ rightOpen: false }); return; }
  const w = Math.round(clamp(raw, RIGHT.min, maxWidth(geometry({ ...st, rightOpen: true }))));
  st.set({ rightOpen: true, rightWidth: w });
}

function applyVars(s: LayoutState) {
  const g = geometry(s);
  const r = document.documentElement.style;
  r.setProperty("--gs-rw", `${g.rw}px`);
  r.setProperty("--gs-le", `${g.le}px`);
  r.setProperty("--gs-re", `${g.re}px`);
  r.setProperty("--gs-mw", `${g.mw}px`);
  r.setProperty("--gs-trw", g.rightOpen ? `${g.rw}px` : "auto");
  const ds = document.documentElement.dataset;
  if (s.dragging) { ds.gsDrag = "x"; ds.gsSash = s.dragging; }
  else { delete ds.gsDrag; delete ds.gsSash; }
}

function load(): Partial<Prefs> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Partial<Prefs>;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return { rightWidth: num(p.rightWidth), rightOpen: p.rightOpen !== false };
  } catch { return {}; }
}

function save(s: Prefs) {
  try {
    const { rightWidth, rightOpen } = s;
    localStorage.setItem(KEY, JSON.stringify({ rightWidth, rightOpen }));
  } catch { /* storage blocked: layout just won't persist */ }
}

/** Mount once (App): hydrates saved prefs, tracks the viewport, writes CSS vars, persists, and binds Cmd/Ctrl+B (toggle panel). */
export function useLayoutSync() {
  useEffect(() => {
    const st = useLayout.getState();
    st.set({ ...load(), vw: window.innerWidth, hydrated: true });
    applyVars(useLayout.getState());

    let saveT: ReturnType<typeof setTimeout> | undefined;
    const unsub = useLayout.subscribe((s, prev) => {
      applyVars(s);
      if (s.rightWidth !== prev.rightWidth || s.rightOpen !== prev.rightOpen) {
        clearTimeout(saveT);
        saveT = setTimeout(() => save(useLayout.getState()), 200);
      }
    });

    let raf = 0;
    const resize = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => useLayout.getState().set({ vw: window.innerWidth })); };
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.code !== "KeyB" || e.shiftKey || window.innerWidth < 1024) return;
      e.preventDefault();
      useLayout.getState().toggleRight();
    };
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", key);
    return () => { unsub(); clearTimeout(saveT); cancelAnimationFrame(raf); window.removeEventListener("resize", resize); window.removeEventListener("keydown", key); };
  }, []);
}
