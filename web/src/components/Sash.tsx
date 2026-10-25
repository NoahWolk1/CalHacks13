"use client";
// VS Code-style drag handle: 6px hit area, the hairline border lights up in the accent on hover/drag, pointer capture + rAF.
import { useRef } from "react";
import { useLayout } from "@/lib/client/layout";

type Props = {
  axis: "x" | "y";
  id: "right";
  /** Called (at most once per frame) with the pointer's client coordinate on the drag axis. */
  onMove: (pos: number) => void;
  onReset: () => void;
  className?: string;
  label: string;
};

export default function Sash({ axis, id, onMove, onReset, className = "", label }: Props) {
  const raf = useRef(0);
  const pos = useRef(0);
  const active = useRef(false);

  const flush = () => { raf.current = 0; onMove(pos.current); };
  const end = (e: React.PointerEvent) => {
    if (!active.current) return;
    active.current = false;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    onMove(pos.current);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }
    useLayout.getState().set({ dragging: null });
  };

  const x = axis === "x";
  return (
    <div
      data-sash={id} role="separator" aria-orientation={x ? "vertical" : "horizontal"} aria-label={label} title={`${label} · double-click to reset`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = true;
        pos.current = x ? e.clientX : e.clientY;
        useLayout.getState().set({ dragging: id });
      }}
      onPointerMove={(e) => {
        if (!active.current) return;
        pos.current = x ? e.clientX : e.clientY;
        if (!raf.current) raf.current = requestAnimationFrame(flush);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      className={`group/sash absolute z-30 touch-none select-none ${x ? "w-[6px] cursor-col-resize" : "h-[6px] cursor-row-resize"} ${className}`}
    >
      <span className={`gs-sash-line pointer-events-none absolute bg-accent opacity-0 transition-opacity delay-0 group-hover/sash:opacity-100 group-hover/sash:delay-150 ${x ? "inset-y-0 left-[2px] w-[2px]" : "inset-x-0 top-[2px] h-[2px]"}`} />
    </div>
  );
}
