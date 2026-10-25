"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MLMap, type MapMouseEvent, type MapTouchEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer, PathLayer, SolidPolygonLayer, IconLayer, LineLayer, TextLayer, ArcLayer } from "@deck.gl/layers";
import { TripsLayer } from "@deck.gl/geo-layers";
import { PathStyleExtension } from "@deck.gl/extensions";
import type { Layer, PickingInfo } from "@deck.gl/core";
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon, MultiLineString } from "geojson";
import { useStore, agentById } from "@/lib/client/store";
import { onRunEvent } from "@/lib/client/runClient";
import { Fleet, type Vehicle } from "@/lib/client/sim";
import { STYLE_URL, applyTheme, extractRoads } from "@/lib/client/mapStyle";
import { VEHICLE_ICON, ALTITUDE, hexToRgb } from "@/lib/client/icons";
import { MAP, agentColor } from "@/lib/client/theme";
import { regionFromBox, regionFromPin, regionFromPolygon, anchorOf } from "@/lib/geo";
import type { Finding } from "@/lib/types";
import { registerMap, fitBox, panelPadding, panelOffset } from "@/lib/client/camera";
import { useLayout, geometry } from "@/lib/client/layout";
import FindingInspector from "./FindingInspector";
import SpaceControls from "./SpaceControls";
import { installSpace, deckHidden, DECK_VIEWS } from "@/lib/client/space";

type LL = [number, number];
const ACCENT: [number, number, number] = MAP.accent;
const HALO = MAP.halo;
// Flat overlay layers all sit at z=0; skip depth testing so they never z-fight each other or the region fill.
const FLAT = { parameters: { depthCompare: "always" as const, depthWriteEnabled: false } };
const FLOOD_COLORS: Record<string, [number, number, number]> = MAP.flood;
const DASH = new PathStyleExtension({ dash: true });

export default function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const fleetRef = useRef<Fleet | null>(null);
  const draft = useRef<{ box?: [LL, LL]; poly?: LL[]; cursor?: LL }>({});
  const [hover, setHover] = useState<{ x: number; y: number; f: Finding } | null>(null);
  const tool = useStore((s) => s.tool);

  // ── map + overlay + animation loop ────────────────────────────────────────
  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current!,
      style: STYLE_URL,
      center: [-122.418, 37.768],
      zoom: 12.4,
      pitch: 48,
      bearing: -14,
      attributionControl: { compact: true },
      maxPitch: 75,
    });
    mapRef.current = map;
    registerMap(map);
    const fleet = (fleetRef.current = new Fleet((id) => useStore.getState().reveal(id)));
    const overlay = new MapboxOverlay({ interleaved: false, layers: [], views: DECK_VIEWS });
    map.addControl(overlay as never);
    map.on("style.load", () => applyTheme(map));
    // A few OpenFreeMap layers reference sprite icons the dark sprite lacks (circle-11, wood-pattern): stub them silently.
    map.on("styleimagemissing", (e: { id: string }) => { if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); });
    // Compact attribution starts expanded until the first drag; start it folded so it never runs under the status bar.
    map.once("load", () => {
      const a = map.getContainer().querySelector(".maplibregl-ctrl-attrib");
      a?.classList.remove("maplibregl-compact-show"); a?.removeAttribute("open");
    });
    const uninstallSpace = installSpace(map); // globe, intro fly-in, imagery, live satellites

    let raf = 0, last = performance.now() / 1000;
    const frame = () => {
      const now = performance.now() / 1000;
      fleet.tick(now, now - last);
      last = now;
      const s = useStore.getState();
      // Never fight an in-flight camera animation (fitBounds on a reopened /?run= mission, fly-to-insight).
      if (s.running && cinematic && !map.isEasing()) map.setBearing(map.getBearing() + 0.035);
      overlay.setProps({
        layers: deckHidden(map) ? [] : buildLayers(now, fleet, draft.current),
        onHover: (info: PickingInfo) => {
          const f = pickedFinding(info);
          setHover(f && "claim" in f ? { x: info.x, y: info.y, f } : null);
        },
        onClick: (info: PickingInfo) => {
          const f = pickedFinding(info);
          if (f && "claim" in f) useStore.getState().set({ selectedFinding: f.id });
        },
        getCursor: ({ isHovering }: { isHovering: boolean }) => (isHovering ? "pointer" : useStore.getState().tool === "pan" ? "grab" : "crosshair"),
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Feed server events into the fleet simulation.
    const off = onRunEvent((e) => {
      if (e.type === "run_started") { fleet.setRegion(useStore.getState().region); loadRoads(); }
      if (e.type === "agent_status") { const a = agentById(e.agentId); if (a) fleet.onStatus(a, e.status, e.targets); }
      if (e.type === "agent_spawned") fleet.ensure(e.agent);
      if (e.type === "finding") fleet.onFinding(e.finding);
    });
    const loadRoads = () => map.once("idle", () => fleet.setRoads(extractRoads(map)));

    return () => { cancelAnimationFrame(raf); off(); uninstallSpace(); registerMap(null); map.remove(); };
  }, []);

  // ── fly to region when it changes ─────────────────────────────────────────
  // MapView is loaded lazily (ssr: false), so a region restored from `/?run=<id>` can land in the
  // store before this subscription exists. Fit whatever region is already there once the map loads.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const fitExisting = () => {
      const r = useStore.getState().region;
      if (!r) return;
      fleetRef.current?.setRegion(r);
      fitBox(r.bbox);
      map.once("moveend", () => map.once("idle", () => fleetRef.current?.setRoads(extractRoads(map))));
    };
    if (map.loaded()) fitExisting(); else map.once("load", fitExisting);
  }, []);

  useEffect(() => useStore.subscribe((s, prev) => {
    const map = mapRef.current;
    if (!map) return;
    if (s.region && s.region !== prev.region && s.region.bbox !== prev.region?.bbox) {
      fleetRef.current?.setRegion(s.region);
      const [a, b, c, d] = s.region.bbox;
      map.fitBounds([[a, b], [c, d]], { padding: panelPadding(), pitch: 55, bearing: map.getBearing(), duration: 1400, maxZoom: 16.5 });
      map.once("moveend", () => map.once("idle", () => fleetRef.current?.setRoads(extractRoads(map))));
    }
    if (s.selectedFinding && s.selectedFinding !== prev.selectedFinding) {
      const f = s.findings[s.selectedFinding];
      if (f && !f.props?.areaLevel) map.easeTo({ center: anchorOf(f.geometry), zoom: Math.max(map.getZoom(), 15.5), duration: 900, offset: panelOffset() });
    }
    if (s.selectedInsight && s.selectedInsight !== prev.selectedInsight) {
      const ins = s.insights.find((i) => i.id === s.selectedInsight);
      const fs = (ins?.findingIds ?? []).map((id) => s.findings[id]).filter((f) => f && !f.props?.areaLevel && !f.props?.offRegion);
      // Prefer the pinpoint findings: a large flood polygon would otherwise blow the frame out to the whole region.
      const pts = fs.filter((f) => f.geometry.type === "Point");
      const geoms = (pts.length >= 2 ? pts : fs).map((f) => ({ type: "Feature" as const, geometry: f.geometry, properties: {} }));
      if (geoms.length) fitBox(turf.bbox(turf.featureCollection(geoms)) as [number, number, number, number], 16.5);
      else if (s.region) fitBox(s.region.bbox);
    }
  }), []);

  // ── keep the region centered in the visible strip when panels resize/toggle ─
  // Subscribes outside React: layout changes never re-render MapView, they only re-pad the camera.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const edges = () => { const g = geometry(); return `${g.le}|${g.re}`; };
    let last = edges();
    const unsub = useLayout.subscribe((l) => {
      if (l.dragging || !l.hydrated) return;
      const key = edges();
      if (key === last) return;
      last = key;
      clearTimeout(t);
      t = setTimeout(() => {
        const map = mapRef.current, region = useStore.getState().region;
        if (!map || !region || window.innerWidth < 1024) return;
        const [a, b, c, d] = region.bbox;
        map.fitBounds([[a, b], [c, d]], { padding: panelPadding(), pitch: map.getPitch(), bearing: map.getBearing(), duration: 700, maxZoom: 16.5 });
      }, 250);
    });
    return () => { unsub(); clearTimeout(t); };
  }, []);

  // ── drawing tools ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ll = (e: { lngLat: MapMouseEvent["lngLat"] }): LL => [e.lngLat.lng, e.lngLat.lat];
    const st = useStore.getState;
    if (tool === "pan") { map.dragPan.enable(); map.doubleClickZoom.enable(); return; }
    map.dragPan.disable();
    map.doubleClickZoom.disable();
    draft.current = {};

    // A live mission owns the region: drawing mid-run would desync the fleet from its findings.
    const busy = () => st().running;
    const down = (e: MapMouseEvent) => {
      if (busy()) return;
      if (tool === "box") draft.current = { box: [ll(e), ll(e)] };
    };
    const move = (e: MapMouseEvent) => {
      if (tool === "box" && draft.current.box) draft.current.box[1] = ll(e);
      draft.current.cursor = ll(e);
    };
    const up = () => {
      if (tool !== "box" || !draft.current.box) return;
      if (busy()) { draft.current = {}; return; }
      const [p, q] = draft.current.box;
      draft.current = {};
      if (Math.abs(p[0] - q[0]) < 1e-4 || Math.abs(p[1] - q[1]) < 1e-4) return;
      st().set({ region: regionFromBox(p, q), tool: "pan" });
    };
    const click = (e: MapMouseEvent) => {
      if (busy()) return;
      if (tool === "pin") { st().set({ region: regionFromPin(ll(e), st().pinRadius), tool: "pan" }); return; }
      if (tool !== "polygon") return;
      const pts = (draft.current.poly ??= []);
      const px = map.project(e.lngLat);
      const snap = window.matchMedia("(pointer: coarse)").matches ? 28 : 14; // fingers are less precise
      if (pts.length >= 3 && px.dist(map.project(pts[0])) < snap) return finishPoly();
      pts.push(ll(e));
    };
    const finishPoly = () => {
      const pts = draft.current.poly;
      draft.current = {};
      if (busy()) return;
      if (!pts || pts.length < 3) return;
      const poly = turf.polygon([[...pts, pts[0]]]) as Feature<Polygon | MultiPolygon>;
      st().set({ region: regionFromPolygon(poly, "polygon"), tool: "pan" });
    };
    const dbl = (e: MapMouseEvent) => { if (tool === "polygon") { e.preventDefault(); finishPoly(); } };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { draft.current = {}; st().set({ tool: "pan" }); } if (e.key === "Enter" && tool === "polygon") finishPoly(); };

    // Touch: one-finger drag draws the box (taps already arrive as clicks for pin/polygon).
    const tdown = (e: MapTouchEvent) => {
      if (tool !== "box" || e.points.length !== 1 || busy()) return;
      e.preventDefault();
      draft.current = { box: [ll(e), ll(e)] };
    };
    const tmove = (e: MapTouchEvent) => {
      if (tool !== "box" || !draft.current.box) return;
      if (e.points.length !== 1) { draft.current = {}; return; } // pinch → cancel draft
      e.preventDefault();
      draft.current.box[1] = ll(e);
    };

    map.on("mousedown", down); map.on("mousemove", move); map.on("mouseup", up); map.on("click", click); map.on("dblclick", dbl);
    map.on("touchstart", tdown); map.on("touchmove", tmove); map.on("touchend", up);
    window.addEventListener("keydown", key);
    window.addEventListener("gs:finish-polygon", finishPoly);
    return () => {
      map.off("mousedown", down); map.off("mousemove", move); map.off("mouseup", up); map.off("click", click); map.off("dblclick", dbl);
      map.off("touchstart", tdown); map.off("touchmove", tmove); map.off("touchend", up);
      window.removeEventListener("keydown", key);
      window.removeEventListener("gs:finish-polygon", finishPoly);
    };
  }, [tool]);

  return (
    <div className="absolute inset-0">
      <div ref={el} className="h-full w-full" />
      <FindingInspector />
      <SpaceControls />
      {hover && (
        <div className="glass pointer-events-none absolute z-30 max-w-xs rounded-md px-3 py-2 text-[12.5px]" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="mb-1 flex items-center gap-1.5 text-[12px] text-fg3">
            <span className="h-1.5 w-1.5 rounded-[1.5px]" style={{ background: agentById(hover.f.worker_id)?.color }} />
            {agentById(hover.f.worker_id)?.name} · <span className="num text-[11px]">{hover.f.id}</span>
          </div>
          <div className="text-fg1">{hover.f.claim}</div>
        </div>
      )}
    </div>
  );
}

/** Point layers pick the Finding itself; polygon/line layers pick `{ f, ring|path }` wrappers. */
function pickedFinding(info: PickingInfo): Finding | undefined {
  const o = info.object as (Finding & { f?: Finding }) | undefined;
  return o?.f ?? o;
}

/** deck.gl draws text on a canvas, so it needs the real (hashed) next/font family name. */
let fontCache = "";
function uiFont() {
  if (!fontCache && typeof document !== "undefined") fontCache = getComputedStyle(document.body).getPropertyValue("--font-geist-sans").trim();
  return fontCache || "ui-sans-serif, system-ui, sans-serif";
}

let cinematic = true;
export const setCinematic = (v: boolean) => { cinematic = v; };

// ── layers ─────────────────────────────────────────────────────────────────
function buildLayers(now: number, fleet: Fleet, draft: { box?: [LL, LL]; poly?: LL[]; cursor?: LL }): Layer[] {
  const s = useStore.getState();
  const ms = performance.now();
  const layers: Layer[] = [];
  const region = s.region;

  // Region outline + fill + scanning sweep
  if (region) {
    const ring = ringOf(region.polygon);
    layers.push(
      new SolidPolygonLayer({ ...FLAT, id: "region-fill", data: [{ ring }], getPolygon: (d: { ring: LL[] }) => d.ring, getFillColor: [...ACCENT, s.running ? 11 : 9] }),
      new PathLayer({ ...FLAT, id: "region-line", data: [{ ring }], getPath: (d: { ring: LL[] }) => d.ring, getColor: [...ACCENT, 235], getWidth: 1.5, widthUnits: "pixels" }),
    );
    if (s.running) {
      const [a, b, c, d] = region.bbox;
      const t = (now * 0.22) % 1;
      const y = b + (d - b) * (t < 0.5 ? t * 2 : 2 - t * 2);
      const chord = chordAt(region.polygon, y, a, c);
      if (chord) layers.push(new PathLayer({ ...FLAT, id: "sweep", data: [chord], getPath: (p: LL[]) => p, getColor: [...ACCENT, 90], getWidth: 1, widthUnits: "pixels" }));
    }
  }

  // Drawing preview
  if (draft.box) {
    const [p, q] = draft.box;
    const ring: LL[] = [p, [q[0], p[1]], q, [p[0], q[1]], p];
    layers.push(new PathLayer({ ...FLAT, id: "draft-box", data: [ring], getPath: (r: LL[]) => r, getColor: [...ACCENT, 255], getWidth: 2, widthUnits: "pixels" }));
  }
  if (draft.poly?.length) {
    const path = draft.cursor ? [...draft.poly, draft.cursor] : draft.poly;
    layers.push(
      new PathLayer({ ...FLAT, id: "draft-poly", data: [path], getPath: (r: LL[]) => r, getColor: [...ACCENT, 255], getWidth: 2, widthUnits: "pixels" }),
      new ScatterplotLayer({ ...FLAT, id: "draft-verts", data: draft.poly, getPosition: (p: LL) => p, getRadius: 5, radiusUnits: "pixels", getFillColor: [255, 255, 255], getLineColor: ACCENT, stroked: true, lineWidthMinPixels: 2 }),
    );
  }
  if (s.tool === "pin" && draft.cursor) {
    layers.push(new ScatterplotLayer({ ...FLAT, id: "pin-preview", data: [draft.cursor], getPosition: (p: LL) => p, getRadius: s.pinRadius, getFillColor: [...ACCENT, 20], getLineColor: [...ACCENT, 200], stroked: true, lineWidthMinPixels: 1.5 }));
  }

  // Findings
  const revealed = s.findingOrder.filter((id) => s.revealed[id]).map((id) => s.findings[id]);
  const highlight = new Set<string>();
  const ins = s.insights.find((i) => i.id === (s.hoveredInsight ?? s.selectedInsight));
  ins?.findingIds.forEach((id) => highlight.add(id));
  if (s.selectedFinding) highlight.add(s.selectedFinding);
  const dim = highlight.size > 0;

  const polys = revealed.filter((f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon");
  const polyRings = polys.flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : (f.geometry as MultiPolygon).coordinates).map((p) => ({ f, ring: p[0] as LL[] })));
  const isFill = (f: Finding) => f.props?.zone === "FILL";
  const polyColor = (f: Finding) => FLOOD_COLORS[String(f.props?.zone)] ?? hexToRgb(agentById(f.worker_id)?.color ?? agentColor(f.worker_id));
  const solidRings = polyRings.filter((d) => !isFill(d.f));
  const fillRings = polyRings.filter((d) => isFill(d.f));
  const fade = (f: Finding, base: number) => (dim && !highlight.has(f.id) ? base * 0.35 : base) * Math.min(1, (ms - (s.revealed[f.id] ?? ms)) / 900);
  layers.push(
    // Historic fill: flat, faint sand wash with a dashed outline, drawn under everything else.
    new SolidPolygonLayer({
      ...FLAT, id: "finding-fill-polys", data: fillRings, getPolygon: (d: { ring: LL[] }) => d.ring, pickable: true,
      getFillColor: (d: { f: Finding }) => [...polyColor(d.f), fade(d.f, 55)] as [number, number, number, number],
      updateTriggers: { getFillColor: [ms] },
    }),
    new PathLayer({
      ...FLAT, id: "finding-fill-lines", data: fillRings, getPath: (d: { ring: LL[] }) => d.ring, widthUnits: "pixels", getWidth: 1.4,
      getColor: [...FLOOD_COLORS.FILL, 200], getDashArray: [4, 3], dashJustified: true, extensions: [DASH],
    } as never),
    new SolidPolygonLayer({
      id: "finding-polys", data: solidRings, getPolygon: (d: { ring: LL[] }) => d.ring, extruded: true, getElevation: 6,
      getFillColor: (d: { f: Finding }) => [...polyColor(d.f), fade(d.f, 60)] as [number, number, number, number],
      updateTriggers: { getFillColor: [ms] }, pickable: true,
    }),
    new PathLayer({
      ...FLAT, id: "finding-poly-lines", data: solidRings, getPath: (d: { ring: LL[] }) => d.ring, widthUnits: "pixels", getWidth: 1.2,
      getColor: (d: { f: Finding }) => [...polyColor(d.f), 140] as [number, number, number, number],
    }),
  );

  // Line findings (e.g. buried creeks): soft glow + crisp core in the agent's color.
  const lines = revealed
    .filter((f) => f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")
    .flatMap((f) => (f.geometry.type === "LineString" ? [f.geometry.coordinates] : (f.geometry as MultiLineString).coordinates).map((path) => ({ f, path: path as LL[] })));
  if (lines.length) {
    const lc = (f: Finding) => hexToRgb(agentById(f.worker_id)?.color ?? agentColor(f.worker_id));
    layers.push(
      new PathLayer({
        ...FLAT, id: "finding-lines-glow", data: lines, getPath: (d: { path: LL[] }) => d.path, widthUnits: "pixels", capRounded: true, jointRounded: true,
        getWidth: (d: { f: Finding }) => (highlight.has(d.f.id) ? 9 : 6),
        getColor: (d: { f: Finding }) => [...lc(d.f), fade(d.f, 35)] as [number, number, number, number],
        updateTriggers: { getColor: [ms], getWidth: [s.selectedFinding, s.hoveredInsight, s.selectedInsight] },
      }),
      new PathLayer({
        ...FLAT, id: "finding-lines", data: lines, getPath: (d: { path: LL[] }) => d.path, widthUnits: "pixels", capRounded: true, jointRounded: true, pickable: true,
        getWidth: (d: { f: Finding }) => (highlight.has(d.f.id) ? 3 : 2),
        getColor: (d: { f: Finding }) => [...lc(d.f), fade(d.f, 230)] as [number, number, number, number],
        updateTriggers: { getColor: [ms], getWidth: [s.selectedFinding, s.hoveredInsight, s.selectedInsight] },
      }),
    );
  }

  const pts = revealed.filter((f) => f.geometry.type === "Point" && !f.props?.areaLevel);
  const color = (f: Finding) => hexToRgb(agentById(f.worker_id)?.color ?? agentColor(f.worker_id));
  layers.push(
    new ScatterplotLayer<Finding>({
      ...FLAT, id: "finding-rings", data: pts.filter((f) => ms - s.revealed[f.id] < 1400),
      getPosition: (f) => anchorOf(f.geometry), radiusUnits: "pixels", stroked: true, filled: false, lineWidthUnits: "pixels", getLineWidth: 1,
      getRadius: (f) => 6 + ((ms - s.revealed[f.id]) / 1400) * 22,
      getLineColor: (f) => [...color(f), 200 * (1 - (ms - s.revealed[f.id]) / 1400)] as [number, number, number, number],
      updateTriggers: { getRadius: [ms], getLineColor: [ms] },
    }),
    new ScatterplotLayer<Finding>({
      ...FLAT, id: "finding-pins", data: pts, pickable: true,
      getPosition: (f) => anchorOf(f.geometry), radiusUnits: "pixels", stroked: true, lineWidthUnits: "pixels",
      getRadius: (f) => {
        const pop = Math.max(0, 1 - (ms - s.revealed[f.id]) / 350);
        return (3.5 + (f.severity ?? 0.3) * 4) * (1 + pop * 0.8) * (highlight.has(f.id) ? 1.5 : 1);
      },
      getFillColor: (f) => [...color(f), dim && !highlight.has(f.id) ? 55 : 235] as [number, number, number, number],
      getLineColor: (f) => (highlight.has(f.id) ? [...MAP.arc, 255] : [...HALO, 220]) as [number, number, number, number],
      getLineWidth: (f) => (highlight.has(f.id) ? 1.5 : 1),
      updateTriggers: { getRadius: [ms, s.hoveredInsight, s.selectedInsight, s.selectedFinding], getFillColor: [highlight.size, s.hoveredInsight, s.selectedInsight, s.selectedFinding], getLineColor: [s.hoveredInsight, s.selectedInsight, s.selectedFinding], getLineWidth: [s.hoveredInsight, s.selectedInsight, s.selectedFinding] },
    }),
  );

  // Insight arcs: connect the findings an insight was built from.
  const arcIns = ins ?? (s.insights.length && !s.running ? null : s.insights[s.insights.length - 1]);
  if (arcIns) {
    const fs = arcIns.findingIds.map((id) => s.findings[id]).filter(Boolean);
    const hub = fs[0];
    if (hub) {
      const pairs = fs.slice(1).filter((f) => !f.props?.areaLevel).map((f) => ({ from: anchorOf(hub.geometry), to: anchorOf(f.geometry), a: color(hub), b: color(f) }));
      layers.push(new ArcLayer({
        id: "insight-arcs", data: pairs, getSourcePosition: (d: { from: LL }) => d.from, getTargetPosition: (d: { to: LL }) => d.to,
        getSourceColor: [...MAP.arc, 150], getTargetColor: [...MAP.arc, 150],
        getWidth: 1.2, widthUnits: "pixels", getHeight: 0.5, greatCircle: false,
      }));
    }
  }

  // Fleet
  const vs = [...fleet.vehicles.values()].filter((v) => v.mode !== "staged" || s.running);
  const alt = (v: Vehicle) => ALTITUDE[v.kind];
  const pos3 = (v: Vehicle): [number, number, number] => [v.pos[0], v.pos[1], alt(v)];
  const live = (v: Vehicle) => !v.done || v.queue.length > 0;
  type Trail = { path: [number, number, number][]; ts: number[]; color: [number, number, number] };
  const trails: Trail[] = vs.filter((v) => v.trail.path.length >= 2).map((v) => {
    const n = Math.min(v.trail.path.length, v.trail.ts.length);
    const path = v.trail.path.slice(-n).map((p) => [p[0], p[1], alt(v)] as [number, number, number]);
    // deck treats a path whose first and last points coincide (a parked vehicle) as a closed loop and
    // re-sizes its geometry, which no longer matches the per-vertex timestamps. Nudge it open.
    const a = path[0], z = path[path.length - 1];
    if (a[0] === z[0] && a[1] === z[1]) z[0] += 1e-9;
    return { path, ts: v.trail.ts.slice(-n), color: v.color };
  });
  layers.push(
    new TripsLayer({
      // Snapshot each trail per frame so geometry and per-vertex timestamps come from the same arrays.
      id: "trails", data: trails,
      getPath: (t: Trail) => t.path as never,
      getTimestamps: (t: Trail) => t.ts, getColor: (t: Trail) => t.color, opacity: 0.6,
      widthMinPixels: 2, trailLength: 5, currentTime: now, capRounded: true, jointRounded: true,
    }),
    new LineLayer({
      id: "tethers", data: vs.filter((v) => alt(v) > 20),
      getSourcePosition: (v: Vehicle) => [v.pos[0], v.pos[1], 0], getTargetPosition: pos3,
      getColor: (v: Vehicle) => [...v.color, 60] as [number, number, number, number], getWidth: 1, widthUnits: "pixels",
      updateTriggers: { getSourcePosition: [now], getTargetPosition: [now] },
    }),
    new ScatterplotLayer({
      ...FLAT, id: "footprints", data: vs.filter((v) => v.kind === "drone" && live(v) && v.mode !== "staged"),
      getPosition: (v: Vehicle) => v.pos, radiusUnits: "meters",
      getRadius: 60,
      filled: false, getLineColor: (v: Vehicle) => [...v.color, 90] as [number, number, number, number],
      stroked: true, lineWidthMinPixels: 1, updateTriggers: { getPosition: [now], getRadius: [now] },
    }),
    new LineLayer({
      id: "beams", data: vs.flatMap((v) => v.beams.map((b) => ({ v, b }))),
      getSourcePosition: (d: { v: Vehicle; b: Vehicle["beams"][number] }) => [d.b.from[0], d.b.from[1], alt(d.v)],
      getTargetPosition: (d: { b: Vehicle["beams"][number] }) => [d.b.to[0], d.b.to[1], 0],
      getColor: (d: { b: Vehicle["beams"][number] }) => [...d.b.color, 255 * Math.max(0, Math.min(1, (d.b.until - now) / 0.4))] as [number, number, number, number],
      getWidth: 1.5, widthUnits: "pixels", updateTriggers: { getColor: [now] },
    }),
    new ScatterplotLayer({
      id: "vehicle-glow", data: vs, getPosition: pos3, radiusUnits: "pixels",
      // Only a brief pulse when the vehicle reports a finding; no standing glow disc.
      getRadius: (v: Vehicle) => 12 + Math.max(0, 1 - (now - v.pulse) / 0.5) * 12,
      getFillColor: (v: Vehicle) => [...v.color, 70 * Math.max(0, 1 - (now - v.pulse) / 0.5)] as [number, number, number, number],
      updateTriggers: { getPosition: [now], getRadius: [now], getFillColor: [now] },
    }),
    new IconLayer({
      id: "vehicles", data: vs, billboard: false, sizeUnits: "pixels",
      getIcon: (v: Vehicle) => ({ url: VEHICLE_ICON[v.kind], id: v.kind, width: 128, height: 128, mask: true }),
      getPosition: pos3, getSize: (v: Vehicle) => (v.kind === "satellite" ? 42 : v.kind === "drone" ? 34 : 26),
      getAngle: (v: Vehicle) => -v.heading,
      getColor: (v: Vehicle) => (v.error ? [229, 103, 90, 255] : [...v.color, live(v) ? 255 : 110]) as [number, number, number, number],
      updateTriggers: { getPosition: [now], getAngle: [now], getColor: [now] },
    }),
    new TextLayer({
      id: "vehicle-labels", data: vs.filter((v) => live(v) && v.mode !== "parked"), getPosition: pos3, getText: (v: Vehicle) => v.name,
      getSize: 11, getPixelOffset: [0, -26], getColor: [...MAP.label, 235],
      fontFamily: uiFont(), fontWeight: 500, characterSet: "auto",
      outlineWidth: 4, outlineColor: [...HALO, 235], fontSettings: { sdf: true },
      updateTriggers: { getPosition: [now] },
    }),
  );

  if (region && (s.running || vs.length)) {
    layers.push(
      new ScatterplotLayer({
        id: "hq", data: [fleet.commandPost], getPosition: (p: LL) => p, radiusUnits: "pixels",
        getRadius: 5, getFillColor: [...ACCENT, 255], getLineColor: [...HALO, 255], stroked: true, lineWidthMinPixels: 2,
      }),
      new TextLayer({ id: "hq-label", data: [fleet.commandPost], getPosition: (p: LL) => p, getText: () => "Command", getSize: 11, getPixelOffset: [0, 16], getColor: [...ACCENT, 235], fontFamily: uiFont(), fontWeight: 500, outlineWidth: 4, outlineColor: [...HALO, 235], fontSettings: { sdf: true } }),
    );
  }
  // Empty or degenerate inputs make deck.gl issue zero-instance draws (GL_INVALID_VALUE spam).
  return layers.filter((l) => !Array.isArray(l.props.data) || l.props.data.length > 0);
}

function ringOf(f: Feature<Polygon | MultiPolygon>): LL[] {
  const g = f.geometry;
  return (g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0][0]) as LL[];
}

function chordAt(poly: Feature<Polygon | MultiPolygon>, y: number, a: number, c: number): LL[] | null {
  const line = turf.lineString([[a - 0.01, y], [c + 0.01, y]]);
  const hits = turf.lineIntersect(line, poly).features.map((p) => p.geometry.coordinates as LL).sort((p, q) => p[0] - q[0]);
  return hits.length >= 2 ? [hits[0], hits[hits.length - 1]] : null;
}
