"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { useStore, agentById } from "@/lib/client/store";
import type { Finding } from "@/lib/types";
import { AgentAvatar } from "./ui";

// Preferred props, in display order, with formatting. Anything else falls back to generic formatting.
const KNOWN: Record<string, { label: string; fmt?: (v: unknown) => string }> = {
  zone: { label: "Flood zone" },
  sfha: { label: "SFHA", fmt: (v) => (v ? "Yes" : "No") },
  bfe: { label: "Base flood elev.", fmt: (v) => `${num(v, 1)} ft` },
  areaM2: { label: "Area", fmt: (v) => `${(Number(v) / 1e4).toFixed(2)} ha` },
  permit: { label: "Permit #" },
  cost: { label: "Est. cost", fmt: (v) => money(v) },
  estimated_cost: { label: "Est. cost", fmt: (v) => money(v) },
  revised_cost: { label: "Revised cost", fmt: (v) => money(v) },
  stories: { label: "Stories" },
  units: { label: "Units" },
  proposed_units: { label: "Units" },
  elevationM: { label: "Elevation", fmt: (v) => `${num(v, 1)} m` },
  mag: { label: "Magnitude", fmt: (v) => `M${num(v, 1)}` },
  depthKm: { label: "Depth", fmt: (v) => `${num(v, 1)} km` },
  status: { label: "Status" },
  type: { label: "Type" },
  use: { label: "Use" },
  address: { label: "Address" },
  filed: { label: "Filed" },
  pop: { label: "Population", fmt: (v) => Number(v).toLocaleString() },
  income: { label: "Median income", fmt: (v) => money(v) },
  rent: { label: "Median rent", fmt: (v) => `$${Number(v).toLocaleString()}` },
  renterShare: { label: "Renters", fmt: (v) => `${Math.round(Number(v) * 100)}%` },
  m4plus: { label: "M4+ quakes" },
  nearestKm: { label: "Nearest", fmt: (v) => `${v} km` },
  median: { label: "Median elev.", fmt: (v) => `${num(v, 1)} m` },
  us_aqi: { label: "US AQI" },
  pm2_5: { label: "PM2.5", fmt: (v) => `${num(v, 1)} µg/m³` },
  subclass: { label: "Kind" },
  distanceM: { label: "Distance", fmt: (v) => `${Math.round(Number(v))} m` },
  count: { label: "Count" },
};
const HIDDEN = new Set(["areaLevel", "id", "geometry", "url", "source_url", "targetId", "offRegion", "dfirm", "description", "details", "tract", "class", "group"]);

function money(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;
}
function num(v: unknown, d: number) { const n = Number(v); return Number.isFinite(n) ? n.toFixed(d) : String(v); }
function humanize(k: string) { return k.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()); }

function propRows(f: Finding): [string, string][] {
  const p = f.props ?? {};
  const rows: [string, string][] = [];
  const seen = new Set<string>();
  for (const [k, spec] of Object.entries(KNOWN)) {
    if (p[k] == null || p[k] === "" || seen.has(spec.label) || (typeof p[k] === "number" && (p[k] as number) <= -999)) continue;
    seen.add(spec.label);
    rows.push([spec.label, spec.fmt ? spec.fmt(p[k]) : String(p[k])]);
  }
  for (const [k, v] of Object.entries(p)) {
    if (rows.length >= 6) break;
    if (k in KNOWN || HIDDEN.has(k) || v == null || typeof v === "object" || String(v).length > 40) continue;
    rows.push([humanize(k), typeof v === "number" ? (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(2)) : String(v)]);
  }
  return rows.slice(0, 6);
}

export default function FindingInspector() {
  const f = useStore((s) => (s.selectedFinding ? s.findings[s.selectedFinding] : undefined));
  const set = useStore((s) => s.set);

  useEffect(() => {
    if (!f) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") set({ selectedFinding: null }); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [f, set]);

  const a = f ? agentById(f.worker_id) : undefined;
  const color = a?.color ?? "#5eead4";
  const rows = f ? propRows(f) : [];

  return (
    <AnimatePresence>
      {f && (
        <motion.div key={f.id} initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
          className="glass pointer-events-auto absolute left-[392px] top-[120px] z-20 w-[340px] overflow-hidden rounded-2xl">
          <div className="h-0.5 w-full" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
          <div className="p-3.5">
            <div className="flex items-start gap-2.5">
              {a && <AgentAvatar agent={a} size={30} />}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium" style={{ color }}>{a?.name ?? f.worker_id}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  {f.id} · {f.source_type}{f.props?.areaLevel ? " · area-wide" : ""}
                </div>
              </div>
              <button onClick={() => set({ selectedFinding: null })} title="Close (Esc)" className="rounded-md p-1 text-slate-500 transition hover:bg-white/5 hover:text-white"><X size={14} /></button>
            </div>

            <p className="mt-2.5 text-[13px] leading-snug text-slate-100">{f.claim}</p>

            {rows.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {rows.map(([k, v]) => (
                  <div key={k} className="min-w-0 rounded-lg border border-white/5 bg-white/[0.025] px-2 py-1.5">
                    <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">{k}</div>
                    <div className="truncate text-xs text-slate-100" title={v}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1">
                <div className="mb-1 flex justify-between font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">
                  <span>Confidence</span><span className="text-slate-300">{Math.round(f.confidence * 100)}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${f.confidence * 100}%` }} transition={{ duration: 0.6 }} />
                </div>
              </div>
              {f.observed_at && (
                <div className="text-right">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">Observed</div>
                  <div className="font-mono text-[11px] text-slate-300">{f.observed_at.slice(0, 10)}</div>
                </div>
              )}
            </div>

            {f.source_url && (
              <a href={f.source_url} target="_blank" rel="noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 text-xs text-slate-300 transition hover:border-teal-300/40 hover:bg-teal-300/10 hover:text-white">
                <ExternalLink size={12} /> View source
              </a>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
