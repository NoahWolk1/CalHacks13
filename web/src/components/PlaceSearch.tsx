"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, MapPin, Loader2, X, LocateFixed, ImageUp } from "lucide-react";
import { useStore } from "@/lib/client/store";
import { flyTo, fitBox } from "@/lib/client/camera";
import { searchPlaces, type Place } from "@/lib/client/geocode";
import { locatePhoto } from "@/lib/client/locateImage";
import type { LocateResult } from "@/lib/locate";
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
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState<string | null>(null);
  // Photo search: Claude reads the photo's clues, the guesses are geocoded (see /api/locate).
  const [photo, setPhoto] = useState<(LocateResult & { preview: string }) | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // With an area selected, the photo is searched for inside it, at street level from the area's map names.
  const region = useStore((s) => s.region);
  const areaOk = !!region && region.bbox[2] - region.bbox[0] <= 0.5 && region.bbox[3] - region.bbox[1] <= 0.5;
  const [inArea, setInArea] = useState(true);
  const area = areaOk && inArea && region ? { bbox: region.bbox, center: region.center } : undefined;
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

  const findPhoto = (file: File | undefined) => {
    if (!file) return;
    setPhotoBusy(true); setPhotoErr(null); setPhoto(null); setQ(""); setOpen(true);
    locatePhoto(file, area)
      .then((r) => { setPhoto(r); if (!r.guesses.length) setPhotoErr(r.summary || "No usable clues in that photo."); })
      .catch((e) => setPhotoErr((e as Error).message))
      .finally(() => setPhotoBusy(false));
  };
  // Pasting an image while the search is open runs a photo search.
  useEffect(() => {
    if (!open) return;
    const paste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f) { e.preventDefault(); findPhoto(f); }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  }, [open, area]); // eslint-disable-line react-hooks/exhaustive-deps

  // Browser geolocation: fly to the user's position at the same zoom as a search result.
  const locate = () => {
    if (!navigator.geolocation) { setLocErr("Location isn't available in this browser"); return; }
    setLocating(true); setLocErr(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setLocating(false); go({ name: "Current location", detail: "", center: [coords.longitude, coords.latitude] }); },
      (e) => { setLocating(false); setLocErr(e.code === e.PERMISSION_DENIED ? "Location permission denied" : "Couldn't get your location"); },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

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
            <button onClick={locate} disabled={locating}
              className={`flex w-full items-center gap-2 rounded-[4px] border-b border-line px-2 ${mobile ? "py-2.5" : "py-1.5"} text-left hover:bg-raised disabled:opacity-60`}>
              {locating ? <Loader2 size={13} strokeWidth={1.5} className="shrink-0 animate-spin text-fg3" /> : <LocateFixed size={13} strokeWidth={1.5} className="shrink-0 text-fg3" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg1">{locating ? "Finding you…" : "Use current location"}</span>
                {locErr && <span className="block truncate text-[12px] text-fg3">{locErr}</span>}
              </span>
            </button>
            <input ref={fileInput} type="file" accept="image/*" className="hidden"
              onChange={(e) => { findPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            <button onClick={() => fileInput.current?.click()} disabled={photoBusy}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); findPhoto(e.dataTransfer.files[0]); }}
              className={`flex w-full items-center gap-2 rounded-[4px] border-b border-line px-2 ${mobile ? "py-2.5" : "py-1.5"} text-left hover:bg-raised disabled:opacity-60`}>
              {photoBusy ? <Loader2 size={13} strokeWidth={1.5} className="shrink-0 animate-spin text-fg3" /> : <ImageUp size={13} strokeWidth={1.5} className="shrink-0 text-fg3" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg1">{photoBusy ? "Reading the photo…" : "Find a place from a photo"}</span>
                <span className="block truncate text-[12px] text-fg3">{photoErr ?? (area ? "Searched for inside the selected area" : "Upload, drop or paste an image")}</span>
              </span>
            </button>
            {areaOk && (
              <label className="flex cursor-pointer items-center gap-2 border-b border-line px-2 py-1.5 text-[12px] text-fg3 hover:text-fg1">
                <input type="checkbox" checked={inArea} onChange={(e) => setInArea(e.target.checked)} className="accent-accent" />
                Only look inside the selected area (street level)
              </label>
            )}
            {!showResults && photo && photo.guesses.length > 0 ? (
              <>
                <div className="flex items-start gap-2 px-2 pb-1 pt-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.preview} alt="Your photo" className="h-10 w-10 shrink-0 rounded-[3px] object-cover" />
                  <span className="min-w-0 flex-1 text-[12px] leading-snug text-fg3">
                    {photo.summary}
                    {photo.capped && <span className="mt-0.5 block text-fg4">{photo.capped === "people" ? "People are in the photo" : "Taken inside a home"}: shown at city level only. Crop them out for a street-level match.</span>}
                  </span>
                  <button onClick={() => { setPhoto(null); setPhotoErr(null); }} className="text-fg3 hover:text-fg1" aria-label="Clear photo"><X size={13} strokeWidth={1.5} /></button>
                </div>
                {photo.guesses.map((g, i) => (
                  <button key={`${g.center.join()}-${i}`} onClick={() => go(g)} title={g.clues}
                    className={`flex w-full items-start gap-2 rounded-[4px] px-2 ${mobile ? "py-2.5" : "py-1.5"} text-left hover:bg-raised`}>
                    <MapPin size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-fg3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-fg1">{g.name}</span>
                      <span className="block text-[12px] text-fg3">{g.clues}</span>
                    </span>
                    <span className="shrink-0 text-right text-[11.5px] text-fg4">{g.confidence}<span className="block">{g.via === "map" ? "map match" : g.precision}</span></span>
                  </button>
                ))}
              </>
            ) : showResults ? (
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
