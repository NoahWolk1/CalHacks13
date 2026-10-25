"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ExternalLink, X } from "lucide-react";
import { useStore, agentById } from "@/lib/client/store";
import type { Finding } from "@/lib/types";
import { VehicleGlyph } from "./ui";
import { useIsDesktop } from "@/lib/client/useMedia";
import { useLayout, geometry } from "@/lib/client/layout";

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
  // Satellite imagery / orbit passes / EONET events
  satellite: { label: "Satellite" },
  nextSatellite: { label: "Satellite" },
  acquired: { label: "Acquired", fmt: (v) => when(v) },
  passTime: { label: "Pass", fmt: (v) => when(v) },
  nextPass: { label: "Pass", fmt: (v) => when(v) },
  ageDays: { label: "Age", fmt: (v) => `${v} ${Number(v) === 1 ? "day" : "days"}` },
  cloudCover: { label: "Cloud cover", fmt: (v) => `${num(v, 0)}%` },
  resolutionM: { label: "Resolution", fmt: (v) => `${v} m` },
  waterPct: { label: "Water", fmt: (v) => `${num(v, 1)}%` },
  vegetationPct: { label: "Vegetation", fmt: (v) => `${num(v, 1)}%` },
  notVegetatedPct: { label: "Built / bare", fmt: (v) => `${num(v, 1)}%` },
  maxElevation: { label: "Max elevation", fmt: (v) => `${v}°` },
  visible: { label: "Naked eye", fmt: (v) => (v ? "Visible" : "Not visible") },
  crossTrackKm: { label: "Track offset", fmt: (v) => `${v} km` },
  swathKm: { label: "Swath", fmt: (v) => `${v} km` },
  eventCategory: { label: "Event", fmt: (v) => humanize(String(v)) },
  distanceKm: { label: "Distance", fmt: (v) => `${v} km` },
  open: { label: "Status", fmt: (v) => (v ? "Ongoing" : "Closed") },
  sceneId: { label: "Scene" },
  tile: { label: "Tile" },
  noradId: { label: "NORAD ID" },
};
const HIDDEN = new Set(["areaLevel", "sceneLevel", "id", "geometry", "url", "source_url", "targetId", "offRegion", "dfirm", "description", "details", "tract", "class", "group",
  "timeZone", "eventId", "thumbnailCaption", "sunElevation", "magnitudeUnit", "hoursUntil", "wrsPath", "wrsRow", "cloudShadowPct", "snowIcePct"]);

/** ISO timestamp → "Oct 15, 12:04 PM PDT" in the viewer's zone. */
function when(v: unknown) {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

function money(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${n}`;
}
/** "Sentinel-2 L2A, 2026-10-21" (or the worker's own caption / platform). */
function sceneCaption(f: Finding) {
  const p = f.props ?? {};
  if (typeof p.thumbnailCaption === "string") return p.thumbnailCaption;
  const date = String(p.acquired ?? p.datetime ?? p.date ?? f.observed_at ?? "").slice(0, 10);
  const what = /landsat/i.test(String(p.satellite ?? p.platform ?? p.collection ?? "")) ? "Landsat C2 L2" : "Sentinel-2 L2A";
  return date ? `${what}, ${date}` : what;
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
  const desktop = useIsDesktop();
  // Narrow map strip: the card can't sit beside the Missions group (top-right) or the imagery
  // switcher (bottom-right), so it drops below the former and stops above the latter.
  const narrow = useLayout((s) => geometry(s).mw < 620);

  useEffect(() => {
    if (!f) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") set({ selectedFinding: null }); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [f, set]);

  const a = f ? agentById(f.worker_id) : undefined;
  const color = a?.color ?? "var(--fg2)";
  const rows = f ? propRows(f) : [];

  return (
    <AnimatePresence>
      {f && (
        <motion.div key={f.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          style={desktop && narrow ? { top: 100, maxHeight: "calc(100% - 296px)" } : undefined}
          className="glass gs-follow pointer-events-auto absolute left-[calc(var(--gs-le)+12px)] top-[60px] z-20 w-[min(340px,calc(var(--gs-mw)-24px))] max-h-[calc(100%-118px)] overflow-y-auto overscroll-contain scroll-thin rounded-lg max-lg:inset-x-4 max-lg:top-[calc(var(--safe-top)_+_108px)] max-lg:z-30 max-lg:w-auto max-lg:max-h-[calc(100%-var(--safe-top)-120px-var(--gs-sheet,124px))]">
          <div className="p-3.5">
            <div className="flex items-center gap-2.5">
              {a && <VehicleGlyph kind={a.vehicle} color={color} size={15} />}
              <div className="min-w-0 flex-1 truncate text-[12.5px]">
                <span className="font-medium text-fg1">{a?.name ?? f.worker_id}</span>
                <span className="text-fg3"> · <span className="num text-[11.5px]">{f.id}</span> · {f.source_type}{f.props?.areaLevel ? " · area-wide" : ""}</span>
              </div>
              <button onClick={() => set({ selectedFinding: null })} title="Close (Esc)" aria-label="Close" className="rounded-[4px] p-1 text-fg3 transition-colors hover:bg-raised hover:text-fg1"><X size={14} strokeWidth={1.5} /></button>
            </div>

            <p className="mt-2.5 text-[13.5px] leading-snug text-fg1">{f.claim}</p>

            {typeof f.props?.thumbnail === "string" && (
              <figure className="mt-2.5 overflow-hidden rounded-md border border-line bg-bg">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote scene preview, arbitrary host */}
                <img src={f.props.thumbnail} alt={`Scene preview for ${f.id}`} loading="lazy" className="block max-h-[200px] w-full object-cover" />
                <figcaption className="px-2 py-1 text-[11px] text-fg3">{sceneCaption(f)}</figcaption>
              </figure>
            )}

            {rows.length > 0 && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3">
                {rows.map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[11.5px] text-fg3">{k}</dt>
                    <dd className="num truncate text-[12.5px] text-fg1" title={v}>{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-3 flex items-end gap-4 border-t border-line pt-3">
              <div className="flex-1">
                <div className="mb-1.5 flex justify-between text-[11.5px] text-fg3">
                  <span>Confidence</span><span className="num text-fg1">{Math.round(f.confidence * 100)}%</span>
                </div>
                <div className="h-[2px] bg-line-strong">
                  <div className="h-full" style={{ width: `${f.confidence * 100}%`, background: color }} />
                </div>
              </div>
              {f.observed_at && (
                <div className="text-right">
                  <div className="text-[11.5px] text-fg3">Observed</div>
                  <div className="num text-[12px] text-fg1">{f.observed_at.slice(0, 10)}</div>
                </div>
              )}
            </div>

            {f.source_url && (
              <a href={f.source_url} target="_blank" rel="noreferrer"
                className="mt-3 flex h-8 items-center justify-center gap-1.5 rounded-md border border-line-strong text-[12.5px] text-fg1 transition-colors hover:bg-raised">
                View source <ExternalLink size={12} strokeWidth={1.5} className="text-fg3" />
              </a>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
