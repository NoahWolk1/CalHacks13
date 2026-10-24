"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MapPin, Loader2, Sparkles, X } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { flyTo, fitBox } from "@/lib/client/camera";
import { searchPlaces, type Place } from "@/lib/client/geocode";
import { DEMO_SPOTS, regionForSpot, type DemoSpot } from "@/lib/client/demoSpots";

export function pickSpot(s: DemoSpot) {
  const st = useStore.getState();
  if (st.running) return;
  st.resetRun();
  st.set({ region: regionForSpot(s), tool: "pan" });
}

/** One-click demo regions (used in the search dropdown and the empty region slot). */
export function DemoSpotChips({ compact, className = "" }: { compact?: boolean; className?: string }) {
  const running = useStore((s) => s.running);
  return (
    <div className={`flex flex-wrap gap-1 ${compact ? "" : "mt-2"} ${className}`}>
      {DEMO_SPOTS.map((s) => (
        <button key={s.id} onClick={() => pickSpot(s)} disabled={running} title={s.blurb}
          className="flex items-center gap-1 rounded-full border border-teal-300/20 bg-teal-300/[0.04] px-2 py-0.5 text-[11px] text-teal-100/80 transition max-lg:px-2.5 max-lg:py-1 max-lg:text-[12px] hover:border-teal-300/50 hover:bg-teal-300/10 hover:text-white disabled:opacity-40">
          <Sparkles size={10} className="text-teal-300" />{s.short}
        </button>
      ))}
    </div>
  );
}

export default function PlaceSearch({ variant = "desktop", onClose }: { variant?: "desktop" | "mobile"; onClose?: () => void }) {
  const mobile = variant === "mobile";
  const running = useStore((s) => s.running);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(mobile);
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
  useEffect(() => { if (mobile) input.current?.focus(); }, [mobile]);

  const go = (p: Place) => {
    if (p.bbox) fitBox(p.bbox, 16); else flyTo(p.center, 15.5);
    setOpen(false);
    input.current?.blur();
    onClose?.();
  };
  const showResults = q.trim().length >= 3;

  return (
    <div ref={wrap} className={`pointer-events-auto relative h-full ${mobile ? "flex-1" : ""}`}>
      <div className={`glass flex h-full ${mobile ? "w-full rounded-2xl" : "w-[250px]"} items-center gap-2 rounded-full px-3.5 transition ${open ? "ring-1 ring-teal-300/40" : ""}`}>
        {busy ? <Loader2 size={14} className="shrink-0 animate-spin text-teal-300" /> : <Search size={14} className="shrink-0 text-slate-400" />}
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); input.current?.blur(); onClose?.(); }
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && results[active]) go(results[active]);
          }}
          placeholder="Search a place…" spellCheck={false}
          className={`min-w-0 flex-1 bg-transparent ${mobile ? "text-base" : "text-xs"} text-white placeholder:text-slate-500 focus:outline-none`} />
        {mobile ? (
          <button onClick={() => { setOpen(false); onClose?.(); }} className="-mr-1 p-1.5 text-slate-400 hover:text-white" aria-label="Close search"><X size={16} /></button>
        ) : q ? (
          <button onClick={() => { setQ(""); input.current?.focus(); }} className="text-slate-500 hover:text-white"><X size={13} /></button>
        ) : (
          <kbd className="rounded border border-white/10 px-1 font-mono text-[9px] text-slate-500">/</kbd>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}
            style={mobile ? { background: "rgba(8, 12, 20, 0.97)" } : undefined}
            className={`glass absolute right-0 top-full z-40 mt-2 overflow-hidden rounded-xl p-1.5 ${mobile ? "left-0" : "w-[320px]"}`}>
            {showResults ? (
              <>
                <div className="px-2 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Places</div>
                {results.map((p, i) => (
                  <button key={`${p.center.join()}-${i}`} onMouseEnter={() => setActive(i)} onClick={() => go(p)}
                    className={`flex w-full items-start gap-2 rounded-lg px-2 ${mobile ? "py-2.5" : "py-1.5"} text-left transition ${i === active ? "bg-white/[0.06]" : ""}`}>
                    <MapPin size={13} className="mt-0.5 shrink-0 text-teal-300" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-slate-100">{p.name}</span>
                      <span className="block truncate text-[11px] text-slate-500">{p.detail}</span>
                    </span>
                  </button>
                ))}
                {!results.length && <div className="px-2 py-2 text-xs text-slate-500">{busy ? "Searching…" : err ?? "Searching…"}</div>}
              </>
            ) : (
              <>
                <div className="px-2 pb-1 pt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">Demo spots</div>
                {DEMO_SPOTS.map((s) => (
                  <button key={s.id} disabled={running} onClick={() => { pickSpot(s); setOpen(false); onClose?.(); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 ${mobile ? "py-2.5" : "py-1.5"} text-left transition hover:bg-white/[0.06] disabled:opacity-40`}>
                    <Sparkles size={13} className="shrink-0 text-teal-300" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-slate-100">{s.short}</span>
                      <span className="block truncate text-[11px] text-slate-500">{s.blurb}</span>
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-wider text-teal-300/70">Set area</span>
                  </button>
                ))}
                <div className="px-2 pb-1 pt-1.5 text-[10.5px] text-slate-600">Type 3+ letters to search anywhere.</div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
