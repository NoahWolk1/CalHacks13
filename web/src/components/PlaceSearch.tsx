"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MapPin, Loader2, X } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { flyTo, fitBox } from "@/lib/client/camera";
import { searchPlaces, type Place } from "@/lib/client/geocode";
import { DEMO_SPOTS, regionForSpot, type DemoSpot } from "@/lib/client/demoSpots";

export function pickSpot(s: DemoSpot) {
  const st = useStore.getState();
  if (st.running) return;
  st.resetRun();
  st.set({ region: regionForSpot(s) }); // keep the active tool: the area stays editable by its handles
}

/** One-click demo regions (used in the search dropdown and the empty region slot). */
export function DemoSpotChips({ compact, className = "" }: { compact?: boolean; className?: string }) {
  const running = useStore((s) => s.running);
  return (
    <div className={`flex flex-wrap gap-1 ${compact ? "" : "mt-2"} ${className}`}>
      {DEMO_SPOTS.map((s) => (
        <button key={s.id} onClick={() => pickSpot(s)} disabled={running} title={s.blurb}
          className="flex items-center rounded-[4px] border border-line-strong bg-raised/60 px-2 py-0.5 text-[12px] text-fg2 transition-colors max-lg:px-2.5 max-lg:py-1 hover:border-fg4 hover:text-fg1 disabled:opacity-40">
          {s.short}
        </button>
      ))}
    </div>
  );
}

export default function PlaceSearch({ variant = "desktop", onClose }: { variant?: "desktop" | "mobile" | "popover"; onClose?: () => void }) {
  const mobile = variant === "mobile";
  /** Desktop top bar too narrow for the field: expands from an icon, closes on blur. */
  const popover = variant === "popover";
  const running = useStore((s) => s.running);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(mobile || popover);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Place[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // Debounced geocode
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) { setResults([]); setErr(null); setBusy(false); return; }
    const ctl = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      searchPlaces(term, ctl.signal)
        .then((r) => { setResults(r); setErr(r.length ? null : "No matches"); setActive(0); })
        .catch((e) => { if ((e as Error).name !== "AbortError") setErr("Search unavailable"); })
        .finally(() => { if (!ctl.signal.aborted) setBusy(false); });
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  // Close on outside click; "/" focuses search
  useEffect(() => {
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) { setOpen(false); onClose?.(); } };
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [onClose]);

  // Mobile: the field only exists while expanded, so focus it right away.
  useEffect(() => { if (mobile || popover) input.current?.focus(); }, [mobile, popover]);

  const go = (p: Place) => {
    if (p.bbox) fitBox(p.bbox, 16); else flyTo(p.center, 15.5);
    setOpen(false);
    input.current?.blur();
    onClose?.();
  };
  const showResults = q.trim().length >= 3;

  return (
    <div ref={wrap} className={`pointer-events-auto relative h-full ${mobile ? "flex-1" : ""}`}>
      <div className={`flex h-full ${mobile ? "glass w-full rounded-lg" : popover ? "w-full rounded-md border bg-bg" : "w-[260px] rounded-md border bg-bg"} items-center gap-2 px-2.5 transition-colors ${open ? "border-fg4" : "border-line"}`}>
        {busy ? <Loader2 size={14} strokeWidth={1.5} className="shrink-0 animate-spin text-fg3" /> : <Search size={14} strokeWidth={1.5} className="shrink-0 text-fg3" />}
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); input.current?.blur(); onClose?.(); }
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && results[active]) go(results[active]);
          }}
          placeholder="Search a place, e.g. San Francisco" spellCheck={false}
          className={`min-w-0 flex-1 bg-transparent ${mobile ? "text-base" : "text-[12.5px]"} text-fg1 placeholder:text-fg4 focus:outline-none focus-visible:outline-none`} />
        {mobile ? (
          <button onClick={() => { setOpen(false); onClose?.(); }} className="-mr-1 p-1.5 text-fg3 hover:text-fg1" aria-label="Close search"><X size={16} strokeWidth={1.5} /></button>
        ) : q ? (
          <button onClick={() => { setQ(""); input.current?.focus(); }} className="text-fg3 hover:text-fg1" aria-label="Clear"><X size={13} strokeWidth={1.5} /></button>
        ) : (
          <kbd className="rounded-[3px] border border-line px-1 font-mono text-[10.5px] text-fg3">/</kbd>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            className={`glass absolute right-0 top-full z-40 mt-2 overflow-hidden rounded-lg p-1 ${mobile ? "left-0" : "w-[320px]"}`}>
            {showResults ? (
              <>
                <div className="px-2 pb-1 pt-1.5 text-[12px] text-fg3">Places</div>
                {results.map((p, i) => (
                  <button key={`${p.center.join()}-${i}`} onMouseEnter={() => setActive(i)} onClick={() => go(p)}
                    className={`flex w-full items-start gap-2 rounded-[4px] px-2 ${mobile ? "py-2.5" : "py-1.5"} text-left ${i === active ? "bg-raised" : ""}`}>
                    <MapPin size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-fg3" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] text-fg1">{p.name}</span>
                      <span className="block truncate text-[12px] text-fg3">{p.detail}</span>
                    </span>
                  </button>
                ))}
                {!results.length && <div className="px-2 py-2 text-[12.5px] text-fg3">{busy ? "Searching…" : err ?? "Searching…"}</div>}
              </>
            ) : (
              <>
                <div className="px-2 pb-1 pt-1.5 text-[12px] text-fg3">Demo spots</div>
                {DEMO_SPOTS.map((s) => (
                  <button key={s.id} disabled={running} onClick={() => { pickSpot(s); setOpen(false); onClose?.(); }}
                    className={`group flex w-full items-center gap-2 rounded-[4px] px-2 ${mobile ? "py-2.5" : "py-1.5"} text-left hover:bg-raised disabled:opacity-40`}>
                    <span className="h-2 w-2 shrink-0 rounded-[2px] border border-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg1">{s.short}</span>
                      <span className="block truncate text-[12px] text-fg3">{s.blurb}</span>
                    </span>
                    <span className="text-[12px] text-fg4 group-hover:text-fg2">Set area</span>
                  </button>
                ))}
                <div className="border-t border-line px-2 pb-1 pt-1.5 text-[12px] text-fg4">Type 3+ letters to search anywhere.</div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
