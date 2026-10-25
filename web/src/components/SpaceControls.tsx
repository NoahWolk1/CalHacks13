"use client";
// Basemap imagery toggle + live "Overhead now" readout for real tracked satellites (collapsed until clicked).
import { useState } from "react";
import { Map as MapIcon, Satellite, Moon, ChevronDown } from "lucide-react";
import { useSpace, type Imagery } from "@/lib/client/space";
import { compass } from "@/lib/client/orbit";

const OPTIONS: { id: Imagery; label: string; title: string; icon: typeof MapIcon }[] = [
  { id: "map", label: "Map", title: "Vector basemap", icon: MapIcon },
  { id: "s2", label: "Satellite", title: "Satellite (Sentinel-2 cloudless 2023, EOX)", icon: Satellite },
  { id: "night", label: "Night", title: "Night lights (NASA VIIRS Black Marble)", icon: Moon },
];

export default function SpaceControls() {
  const imagery = useSpace((s) => s.imagery);
  const setImagery = useSpace((s) => s.setImagery);
  const zoom = useSpace((s) => s.zoom);
  const tracked = useSpace((s) => s.tracked);
  const over = useSpace((s) => s.overhead);
  const city = zoom >= 9;
  const rows = over.slice(0, 4);
  const [open, setOpen] = useState(false);

  return (
    <div className="glass gs-follow pointer-events-auto absolute bottom-[54px] right-[calc(var(--gs-re)+12px)] z-20 w-[228px] rounded-md text-[12px] max-lg:bottom-auto max-lg:left-4 max-lg:right-auto max-lg:top-[calc(var(--safe-top)+56px)] max-lg:w-auto">
      <div className="flex gap-0.5 p-0.5" role="radiogroup" aria-label="Basemap imagery">
        {OPTIONS.map(({ id, label, title, icon: Icon }) => {
          const on = imagery === id;
          return (
            <button key={id} role="radio" aria-checked={on} title={title} onClick={() => setImagery(id)}
              aria-label={label} className={`flex h-[26px] flex-1 items-center justify-center gap-1.5 rounded-[4px] px-2 transition-colors max-lg:w-[34px] ${on ? "bg-active text-fg1 shadow-[inset_0_0_0_1px_var(--line-strong)]" : "text-fg3 hover:text-fg1"}`}>
              <Icon size={13} strokeWidth={1.5} />
              {/* Phones: icon-only, so it fits beside the Missions / Share link group. */}
              <span className="max-lg:hidden">{label}</span>
            </button>
          );
        })}
      </div>

      {tracked > 0 && (
        <div className="border-t border-line max-lg:hidden">
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="flex w-full items-baseline justify-between px-2.5 py-1.5 text-fg3 transition-colors hover:text-fg1">
            <span className="text-[11px] uppercase tracking-[0.08em]">{city ? "Overhead now" : "Live orbits"}</span>
            <span className="flex items-center gap-1.5">
              <span className="num text-[11px] text-fg4">{city ? `${over.length}/${tracked}` : `${tracked} satellites`}</span>
              <ChevronDown size={12} strokeWidth={1.5} className={`self-center transition-transform ${open ? "rotate-180" : ""}`} />
            </span>
          </button>
          {open && city && (
            <div className="px-2.5 pb-2">
              {rows.length === 0 && <div className="text-fg3">No tracked satellite above the horizon</div>}
              {rows.map((o) => (
                <div key={o.label} className="flex items-baseline gap-2 py-[1px]" title={`${Math.round(o.altKm)} km altitude, ${Math.round(o.rangeKm)} km away`}>
                  <span className={`min-w-0 flex-1 truncate ${o.curated ? "text-fg1" : "text-fg2"}`}>{o.label}</span>
                  <span className="num text-fg2">{o.elevation.toFixed(0)}°</span>
                  <span className="num w-[22px] text-right text-fg3">{compass(o.azimuth)}</span>
                </div>
              ))}
            </div>
          )}
          {open && !city && <div className="px-2.5 pb-2 text-fg3">Zoom in to a city to see what's overhead</div>}
        </div>
      )}
    </div>
  );
}
