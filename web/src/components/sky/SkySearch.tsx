"use client";
// Sky search: Sun, Moon and planets resolved locally at their current position (astronomy-engine);
// stars, galaxies, nebulae, clusters and catalog ids (M42, NGC 7000, HD 209458…) via CDS Sesame.
import { useEffect, useRef, useState } from "react";
import { Body, Equator, Observer } from "astronomy-engine";
import { LoaderCircle, Search, X } from "lucide-react";
import { formatDec, formatRa } from "@/lib/sky/geom";
import type { SkyHit } from "@/lib/sky/resolve";

const SOLAR: { name: string; body: Body; type: string }[] = [
  { name: "Sun", body: Body.Sun, type: "Star (Sun)" },
  { name: "Moon", body: Body.Moon, type: "Moon" },
  ...(["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"] as const).map((n) => ({ name: n, body: Body[n], type: "Planet" })),
];

function solarHits(q: string): SkyHit[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const now = new Date(), obs = new Observer(0, 0, 0);
  return SOLAR.filter((s) => s.name.toLowerCase().startsWith(t)).map((s) => {
    const e = Equator(s.body, now, obs, false, true);
    return { name: s.name, type: `${s.type} · position now`, category: "solar-system", ra: e.ra * 15, dec: e.dec, source: "astronomy-engine" };
  });
}

export default function SkySearch({ onPick, disabled }: { onPick: (h: SkyHit) => void; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<SkyHit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    const local = solarHits(term);
    setHits(local); setActive(0); setErr(null);
    if (term.length < 2 || local.some((h) => h.name.toLowerCase() === term.toLowerCase())) { setBusy(false); return; }
    const ctl = new AbortController();
    setBusy(true);
    const t = setTimeout(() => {
      fetch(`/api/sky/resolve?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => r.json() as Promise<{ hit: SkyHit | null; error?: string }>)
        .then(({ hit, error }) => {
          if (hit) setHits([...local, hit]);
          else if (!local.length) setErr(error ? "Name lookup unavailable" : "No object by that name");
        })
        .catch((e) => { if ((e as Error).name !== "AbortError") setErr("Name lookup unavailable"); })
        .finally(() => { if (!ctl.signal.aborted) setBusy(false); });
    }, 400);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  useEffect(() => {
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("mousedown", down);
    return () => window.removeEventListener("mousedown", down);
  }, []);

  const pick = (h: SkyHit) => { onPick(h); setOpen(false); setQ(h.name); };

  return (
    <div ref={wrap} className="relative">
      <div className={`flex h-[32px] items-center gap-2 rounded-md border bg-bg px-2.5 transition-colors ${open ? "border-line-strong" : "border-line"}`}>
        {busy ? <LoaderCircle size={13} className="shrink-0 animate-spin text-fg3" /> : <Search size={13} strokeWidth={1.5} className="shrink-0 text-fg3" />}
        <input value={q} disabled={disabled} spellCheck={false} placeholder="Search a star, galaxy, planet… e.g. Vega, M51, Saturn"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === "Enter" && hits[active]) pick(hits[active]);
          }}
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg1 placeholder:text-fg4 focus:outline-none focus-visible:outline-none disabled:opacity-50" />
        {q && <button onClick={() => { setQ(""); setHits([]); }} className="text-fg3 hover:text-fg1" aria-label="Clear"><X size={13} strokeWidth={1.5} /></button>}
      </div>
      {open && q.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border border-line-strong bg-panel p-1 shadow-lg">
          {hits.map((h, i) => (
            <button key={`${h.name}-${h.source}`} onMouseEnter={() => setActive(i)} onClick={() => pick(h)}
              className={`flex w-full items-baseline gap-2 rounded-[4px] px-2 py-1.5 text-left ${i === active ? "bg-raised" : ""}`}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg1">{h.name}</span>
                <span className="block truncate text-[12px] text-fg3">{h.type}</span>
              </span>
              <span className="num shrink-0 text-[11.5px] text-fg4">{formatRa(h.ra)} {formatDec(h.dec)}</span>
            </button>
          ))}
          {!hits.length && <div className="px-2 py-1.5 text-[12.5px] text-fg3">{busy ? "Looking up…" : err ?? "Looking up…"}</div>}
          <div className="border-t border-line px-2 pb-0.5 pt-1 text-[11px] text-fg4">Names resolved by CDS Sesame (SIMBAD / NED / VizieR)</div>
        </div>
      )}
    </div>
  );
}
