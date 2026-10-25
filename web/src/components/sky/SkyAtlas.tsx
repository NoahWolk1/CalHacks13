"use client";

// Interactive sky atlas: Aladin Lite v3 (CDS Strasbourg), loaded as an ES module from jsdelivr at a
// pinned version (no npm dependency). Draws the selected cone and the sky agents' results.
import { useEffect, useRef, useState } from "react";
import { separation } from "@/lib/sky/geom";
import type { Cone, SkyCategory, SkyObject } from "@/lib/sky/types";

export const ALADIN_URL = "https://cdn.jsdelivr.net/npm/aladin-lite@3.8.2/dist/aladin.js";

export const SURVEYS = [
  { id: "P/DSS2/color", label: "DSS color" },
  { id: "P/PanSTARRS/DR1/color-z-zg-g", label: "PanSTARRS" },
] as const;

export const CATEGORY_STYLE: Record<SkyCategory, { color: string; label: string; shape: string }> = {
  galaxy: { color: "#8fb3ff", label: "Galaxies", shape: "circle" },
  nebula: { color: "#e58fb5", label: "Nebulae", shape: "rhomb" },
  cluster: { color: "#d2c162", label: "Clusters", shape: "square" },
  star: { color: "#ecebe6", label: "Stars", shape: "plus" },
  exoplanet: { color: "#6dbf8b", label: "Exoplanets", shape: "triangle" },
  "solar-system": { color: "#e8853d", label: "Sun, Moon & planets", shape: "circle" },
  observation: { color: "#5ec8d8", label: "Telescope archives", shape: "square" },
  other: { color: "#b3afa6", label: "Other", shape: "cross" },
};

/* eslint-disable @typescript-eslint/no-explicit-any -- Aladin Lite ships no types */
type AladinLib = any;
type Aladin = any;

let loading: Promise<AladinLib> | null = null;
function loadAladin(): Promise<AladinLib> {
  const w = window as unknown as { __aladinLib?: AladinLib };
  if (w.__aladinLib) return Promise.resolve(w.__aladinLib);
  return (loading ??= new Promise((resolve, reject) => {
    const done = () => { window.removeEventListener("aladin-ready", done); if (w.__aladinLib) resolve(w.__aladinLib); else reject(new Error("Aladin Lite failed to load")); };
    window.addEventListener("aladin-ready", done);
    const s = document.createElement("script");
    s.type = "module";
    // Module script: the bundle is an ES module with a default export.
    s.textContent = `import A from "${ALADIN_URL}"; await A.init; window.__aladinLib = A; window.dispatchEvent(new Event("aladin-ready"));`;
    s.onerror = () => reject(new Error("Aladin Lite failed to load"));
    document.head.appendChild(s);
    setTimeout(() => { if (!w.__aladinLib) { loading = null; reject(new Error("Aladin Lite timed out loading")); } }, 20_000);
  }));
}

export type AtlasApi = {
  view: () => Cone | null;
  goto: (c: Cone) => void;
  drawCircle: (cb: (c: Cone) => void) => void;
  setSurvey: (id: string) => void;
};

export default function SkyAtlas({ cone, objects, selectedId, onSelect, apiRef, onError }: {
  cone: Cone; objects: SkyObject[]; selectedId: string | null; onSelect: (id: string) => void;
  apiRef: React.MutableRefObject<AtlasApi | null>; onError: (msg: string) => void;
}) {
  const div = useRef<HTMLDivElement>(null);
  const al = useRef<{ A: AladinLib; aladin: Aladin; cone: any; results: any[]; sel: any } | null>(null);
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const initial = useRef(cone);

  useEffect(() => {
    let dead = false;
    loadAladin().then((A) => {
      if (dead || !div.current) return;
      const c0 = initial.current;
      const aladin = A.aladin(div.current, {
        survey: SURVEYS[0].id, fov: Math.max(0.2, c0.radius * 3), target: `${c0.ra} ${c0.dec}`, cooFrame: "ICRS",
        showReticle: true, showZoomControl: true, showFullscreenControl: false, showLayersControl: false, showGotoControl: false,
        showFrame: false, showCooGrid: false, showProjectionControl: false, showSettingsControl: false, showShareControl: false,
        showContextMenu: false, showSimbadPointerControl: false, showCooGridControl: false, showStatusBar: false,
        reticleColor: "#9a968d", reticleSize: 18, backgroundColor: "rgb(8,8,8)",
      });
      const coneLayer = A.graphicOverlay({ color: "#e8853d", lineWidth: 2 });
      aladin.addOverlay(coneLayer);
      const sel = A.graphicOverlay({ color: "#ffffff", lineWidth: 2 });
      aladin.addOverlay(sel);
      aladin.on("objectClicked", (o: any) => { const id = o?.data?.id; if (typeof id === "string") onSelectRef.current(id); });
      al.current = { A, aladin, cone: coneLayer, results: [], sel };
      apiRef.current = {
        view: () => {
          const [ra, dec] = aladin.getRaDec();
          const [fw, fh] = aladin.getFov();
          return Number.isFinite(ra) && Number.isFinite(dec) ? { ra, dec, radius: Math.min(fw, fh) / 2 } : null;
        },
        goto: (c) => { aladin.gotoRaDec(c.ra, c.dec); aladin.setFoV(Math.max(0.2, c.radius * 3)); },
        drawCircle: (cb) => aladin.select("circle", (shape: { x: number; y: number; r: number }) => {
          const center = aladin.pix2world(shape.x, shape.y);
          const edge = aladin.pix2world(shape.x + shape.r, shape.y);
          if (!center || !edge || shape.r < 3) return;
          cb({ ra: center[0], dec: center[1], radius: Math.max(0.01, separation(center[0], center[1], edge[0], edge[1])) });
        }),
        setSurvey: (id) => (aladin.setImageSurvey ?? aladin.setBaseImageLayer).call(aladin, id),
      };
      setReady(true);
    }).catch((e: Error) => !dead && onError(e.message));
    return () => { dead = true; apiRef.current = null; };
  }, [apiRef, onError]);

  // Selected cone outline.
  useEffect(() => {
    const a = al.current;
    if (!ready || !a) return;
    a.cone.removeAll();
    a.cone.add(a.A.circle(cone.ra, cone.dec, cone.radius, { color: "#e8853d", lineWidth: 2 }));
  }, [ready, cone]);

  // Result markers: one catalog per category, labelled.
  useEffect(() => {
    const a = al.current;
    if (!ready || !a) return;
    for (const c of a.results) { try { if (a.aladin.removeOverlay) a.aladin.removeOverlay(c); else a.aladin.removeLayer(c); } catch { c.hide?.(); } }
    a.results = [];
    const rank = new Map(objects.map((o, i) => [o.id, o.category === "solar-system" ? 0 : i]));
    const groups = new Map<SkyCategory, SkyObject[]>();
    for (const o of objects) groups.set(o.category, [...(groups.get(o.category) ?? []), o]);
    for (const [cat, list] of groups) {
      const st = CATEGORY_STYLE[cat];
      const layer = a.A.catalog({ name: st.label, color: st.color, shape: st.shape, sourceSize: cat === "solar-system" ? 20 : 13, displayLabel: cat !== "star", labelColumn: "name", labelColor: st.color, labelFont: "11px sans-serif" });
      a.aladin.addCatalog(layer);
      // Label only the most notable results (each source returns them ranked) to keep the field readable.
      layer.addSources(list.map((o) => a.A.source(o.ra, o.dec, { id: o.id, name: rank.get(o.id)! < 14 ? o.name : "" })));
      a.results.push(layer);
    }
  }, [ready, objects]);

  // Highlight ring around the selected result.
  useEffect(() => {
    const a = al.current;
    if (!ready || !a) return;
    a.sel.removeAll();
    const o = objects.find((x) => x.id === selectedId);
    if (o) a.sel.add(a.A.circle(o.ra, o.dec, Math.max(cone.radius / 25, 0.004), { color: "#ffffff", lineWidth: 2 }));
  }, [ready, selectedId, objects, cone.radius]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#080808]">
      {/* Aladin positions its controls against this div: it must be the positioned, sized box. */}
      <div ref={div} className="relative h-full w-full" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-[12.5px] text-fg3">Loading sky atlas…</div>}
    </div>
  );
}
