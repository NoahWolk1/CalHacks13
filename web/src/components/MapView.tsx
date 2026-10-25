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
import { regionFromBox, regionFromPin, regionFromPolygon, anchorOf } from "@/lib/geo";
import type { Finding } from "@/lib/types";
import { registerMap, fitBox, panelPadding, panelOffset } from "@/lib/client/camera";
import FindingInspector from "./FindingInspector";

type LL = [number, number];
const ACCENT: [number, number, number] = [94, 234, 212];
// Flat overlay layers all sit at z=0; skip depth testing so they never z-fight each other or the region fill.
const FLAT = { parameters: { depthCompare: "always" as const, depthWriteEnabled: false } };
const FLOOD_COLORS: Record<string, [number, number, number]> = { VE: [37, 99, 235], V: [37, 99, 235], AE: [56, 189, 248], A: [56, 189, 248], AO: [125, 211, 252], AH: [125, 211, 252], X: [100, 116, 139], STORM100: [20, 184, 166], FILL: [217, 169, 99] };
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
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay as never);
    map.on("style.load", () => applyTheme(map));

    let raf = 0, last = performance.now() / 1000;
    const frame = () => {
      const now = performance.now() / 1000;
      fleet.tick(now, now - last);
      last = now;
      const s = useStore.getState();
      if (s.running && cinematic) map.setBearing(map.getBearing() + 0.035);
      overlay.setProps({
        layers: buildLayers(now, fleet, draft.current),
        onHover: (info: PickingInfo) => {
          const f = pickedFinding(info);
          setHover(f && "claim" in f ? { x: info.x, y: info.y, f } : null);
        },
        onClick: (info: PickingInfo) => {
          const f = pickedFinding(info);
          if (f && "claim" in f) useStore.getState().set({ selectedFinding: f.id, rightTab: "findings" });
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

    return () => { cancelAnimationFrame(raf); off(); registerMap(null); map.remove(); };
  }, []);

  // ── fly to region when it changes ─────────────────────────────────────────
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

    const down = (e: MapMouseEvent) => {
      if (tool === "box") draft.current = { box: [ll(e), ll(e)] };
    };
    const move = (e: MapMouseEvent) => {
      if (tool === "box" && draft.current.box) draft.current.box[1] = ll(e);
      draft.current.cursor = ll(e);
    };
    const up = () => {
      if (tool !== "box" || !draft.current.box) return;
      const [p, q] = draft.current.box;
      draft.current = {};
      if (Math.abs(p[0] - q[0]) < 1e-4 || Math.abs(p[1] - q[1]) < 1e-4) return;
      st().set({ region: regionFromBox(p, q), tool: "pan" });
    };
    const click = (e: MapMouseEvent) => {
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
      if (!pts || pts.length < 3) return;
      const poly = turf.polygon([[...pts, pts[0]]]) as Feature<Polygon | MultiPolygon>;
      st().set({ region: regionFromPolygon(poly, "polygon"), tool: "pan" });
    };
    const dbl = (e: MapMouseEvent) => { if (tool === "polygon") { e.preventDefault(); finishPoly(); } };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { draft.current = {}; st().set({ tool: "pan" }); } if (e.key === "Enter" && tool === "polygon") finishPoly(); };

    // Touch: one-finger drag draws the box (taps already arrive as clicks for pin/polygon).
    const tdown = (e: MapTouchEvent) => {
      if (tool !== "box" || e.points.length !== 1) return;
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
      <div className="pointer-events-none absolute inset-0 vignette" />
      <FindingInspector />
      {hover && (
        <div className="pointer-events-none absolute z-30 max-w-xs glass rounded-lg px-3 py-2 text-xs" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-white/50">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: agentById(hover.f.worker_id)?.color }} />
            {agentById(hover.f.worker_id)?.name} · {hover.f.id}
          </div>
          <div className="text-white/90">{hover.f.claim}</div>
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
      new SolidPolygonLayer({ ...FLAT, id: "region-fill", data: [{ ring }], getPolygon: (d: { ring: LL[] }) => d.ring, getFillColor: [...ACCENT, s.running ? 22 : 14] }),
      new PathLayer({ ...FLAT, id: "region-glow", data: [{ ring }], getPath: (d: { ring: LL[] }) => d.ring, getColor: [...ACCENT, 50], getWidth: 10, widthUnits: "pixels" }),
      new PathLayer({ ...FLAT, id: "region-line", data: [{ ring }], getPath: (d: { ring: LL[] }) => d.ring, getColor: [...ACCENT, 230], getWidth: 1.6, widthUnits: "pixels" }),
    );
    if (s.running) {
      const [a, b, c, d] = region.bbox;
      const t = (now * 0.22) % 1;
      const y = b + (d - b) * (t < 0.5 ? t * 2 : 2 - t * 2);
      const chord = chordAt(region.polygon, y, a, c);
      if (chord) layers.push(new PathLayer({ ...FLAT, id: "sweep", data: [chord], getPath: (p: LL[]) => p, getColor: [...ACCENT, 140], getWidth: 2, widthUnits: "pixels" }));
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
  const polyColor = (f: Finding) => FLOOD_COLORS[String(f.props?.zone)] ?? hexToRgb(agentById(f.worker_id)?.color ?? "#38bdf8");
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
      getFillColor: (d: { f: Finding }) => [...polyColor(d.f), fade(d.f, 110)] as [number, number, number, number],
      updateTriggers: { getFillColor: [ms] }, pickable: true,
    }),
    new PathLayer({
      ...FLAT, id: "finding-poly-lines", data: solidRings, getPath: (d: { ring: LL[] }) => d.ring, widthUnits: "pixels", getWidth: 1.2,
      getColor: (d: { f: Finding }) => [...(FLOOD_COLORS[String(d.f.props?.zone)] ?? [56, 189, 248]), 220] as [number, number, number, number],
    }),
  );

  // Line findings (e.g. buried creeks): soft glow + crisp core in the agent's color.
  const lines = revealed
    .filter((f) => f.geometry.type === "LineString" || f.geometry.type === "MultiLineString")
    .flatMap((f) => (f.geometry.type === "LineString" ? [f.geometry.coordinates] : (f.geometry as MultiLineString).coordinates).map((path) => ({ f, path: path as LL[] })));
  if (lines.length) {
    const lc = (f: Finding) => hexToRgb(agentById(f.worker_id)?.color ?? "#2dd4bf");
    layers.push(
      new PathLayer({
        ...FLAT, id: "finding-lines-glow", data: lines, getPath: (d: { path: LL[] }) => d.path, widthUnits: "pixels", capRounded: true, jointRounded: true,
        getWidth: (d: { f: Finding }) => (highlight.has(d.f.id) ? 14 : 10),
        getColor: (d: { f: Finding }) => [...lc(d.f), fade(d.f, 60)] as [number, number, number, number],
        updateTriggers: { getColor: [ms], getWidth: [s.selectedFinding, s.hoveredInsight, s.selectedInsight] },
      }),
      new PathLayer({
        ...FLAT, id: "finding-lines", data: lines, getPath: (d: { path: LL[] }) => d.path, widthUnits: "pixels", capRounded: true, jointRounded: true, pickable: true,
        getWidth: (d: { f: Finding }) => (highlight.has(d.f.id) ? 4 : 3),
        getColor: (d: { f: Finding }) => [...lc(d.f).map((c) => Math.min(255, c + 30)), fade(d.f, 240)] as [number, number, number, number],
        updateTriggers: { getColor: [ms], getWidth: [s.selectedFinding, s.hoveredInsight, s.selectedInsight] },
      }),
    );
  }

  const pts = revealed.filter((f) => f.geometry.type === "Point" && !f.props?.areaLevel);
  const color = (f: Finding) => hexToRgb(agentById(f.worker_id)?.color ?? "#ffffff");
  layers.push(
    new ScatterplotLayer<Finding>({
      ...FLAT, id: "finding-rings", data: pts.filter((f) => ms - s.revealed[f.id] < 1400),
      getPosition: (f) => anchorOf(f.geometry), radiusUnits: "pixels", stroked: true, filled: false, lineWidthUnits: "pixels", getLineWidth: 2,
      getRadius: (f) => 6 + ((ms - s.revealed[f.id]) / 1400) * 34,
      getLineColor: (f) => [...color(f), 255 * (1 - (ms - s.revealed[f.id]) / 1400)] as [number, number, number, number],
      updateTriggers: { getRadius: [ms], getLineColor: [ms] },
    }),
    new ScatterplotLayer<Finding>({
      ...FLAT, id: "finding-pins", data: pts, pickable: true,
      getPosition: (f) => anchorOf(f.geometry), radiusUnits: "pixels", stroked: true, lineWidthUnits: "pixels",
      getRadius: (f) => {
        const pop = Math.max(0, 1 - (ms - s.revealed[f.id]) / 350);
        return (3.5 + (f.severity ?? 0.3) * 5) * (1 + pop * 1.5) * (highlight.has(f.id) ? 1.6 : 1);
      },
      getFillColor: (f) => [...color(f), dim && !highlight.has(f.id) ? 60 : 235] as [number, number, number, number],
      getLineColor: (f) => (highlight.has(f.id) ? [255, 255, 255, 255] : [6, 10, 17, 200]),
      getLineWidth: (f) => (highlight.has(f.id) ? 2 : 1),
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
        getSourceColor: (d: { a: number[] }) => [...d.a, 230] as [number, number, number, number], getTargetColor: (d: { b: number[] }) => [...d.b, 230] as [number, number, number, number],
        getWidth: 2.2, widthUnits: "pixels", getHeight: 0.5, greatCircle: false,
      }));
    }
  }

  // Fleet
  const vs = [...fleet.vehicles.values()].filter((v) => v.mode !== "staged" || s.running);
  const alt = (v: Vehicle) => ALTITUDE[v.kind];
  const pos3 = (v: Vehicle): [number, number, number] => [v.pos[0], v.pos[1], alt(v)];
  const live = (v: Vehicle) => !v.done || v.queue.length > 0;
  layers.push(
    new TripsLayer({
      id: "trails", data: vs,
      getPath: (v: Vehicle) => v.trail.path.map((p) => [p[0], p[1], alt(v)]) as never,
      getTimestamps: (v: Vehicle) => v.trail.ts, getColor: (v: Vehicle) => v.color, opacity: 0.85,
      widthMinPixels: 2.5, trailLength: 5, currentTime: now, capRounded: true, jointRounded: true,
      updateTriggers: { getPath: [now], getTimestamps: [now] },
    }),
    new LineLayer({
      id: "tethers", data: vs.filter((v) => alt(v) > 20),
      getSourcePosition: (v: Vehicle) => [v.pos[0], v.pos[1], 0], getTargetPosition: pos3,
      getColor: (v: Vehicle) => [...v.color, 70] as [number, number, number, number], getWidth: 1, widthUnits: "pixels",
      updateTriggers: { getSourcePosition: [now], getTargetPosition: [now] },
    }),
    new ScatterplotLayer({
      ...FLAT, id: "footprints", data: vs.filter((v) => v.kind === "drone" && live(v) && v.mode !== "staged"),
      getPosition: (v: Vehicle) => v.pos, radiusUnits: "meters",
      getRadius: (v: Vehicle) => 60 + 14 * Math.sin(now * 4 + v.index),
      getFillColor: (v: Vehicle) => [...v.color, 26] as [number, number, number, number], getLineColor: (v: Vehicle) => [...v.color, 120] as [number, number, number, number],
      stroked: true, lineWidthMinPixels: 1, updateTriggers: { getPosition: [now], getRadius: [now] },
    }),
    new LineLayer({
      id: "beams", data: vs.flatMap((v) => v.beams.map((b) => ({ v, b }))),
      getSourcePosition: (d: { v: Vehicle; b: Vehicle["beams"][number] }) => [d.b.from[0], d.b.from[1], alt(d.v)],
      getTargetPosition: (d: { b: Vehicle["beams"][number] }) => [d.b.to[0], d.b.to[1], 0],
      getColor: (d: { b: Vehicle["beams"][number] }) => [...d.b.color, 255 * Math.max(0, Math.min(1, (d.b.until - now) / 0.4))] as [number, number, number, number],
      getWidth: 2, widthUnits: "pixels", updateTriggers: { getColor: [now] },
    }),
    new ScatterplotLayer({
      id: "vehicle-glow", data: vs, getPosition: pos3, radiusUnits: "pixels",
      getRadius: (v: Vehicle) => 15 + Math.max(0, 1 - (now - v.pulse) / 0.5) * 14,
      getFillColor: (v: Vehicle) => [...v.color, live(v) ? 55 : 20] as [number, number, number, number],
      updateTriggers: { getPosition: [now], getRadius: [now] },
    }),
    new IconLayer({
      id: "vehicles", data: vs, billboard: false, sizeUnits: "pixels",
      getIcon: (v: Vehicle) => ({ url: VEHICLE_ICON[v.kind], id: v.kind, width: 128, height: 128, mask: true }),
      getPosition: pos3, getSize: (v: Vehicle) => (v.kind === "satellite" ? 42 : v.kind === "drone" ? 34 : 26),
      getAngle: (v: Vehicle) => -v.heading,
      getColor: (v: Vehicle) => (v.error ? [248, 113, 113, 255] : [...v.color.map((c) => Math.min(255, c + 40)), live(v) ? 255 : 120]) as [number, number, number, number],
      updateTriggers: { getPosition: [now], getAngle: [now], getColor: [now] },
    }),
    new TextLayer({
      id: "vehicle-labels", data: vs.filter((v) => live(v) && v.mode !== "parked"), getPosition: pos3, getText: (v: Vehicle) => v.name.toUpperCase(),
      getSize: 9, getPixelOffset: [0, -26], getColor: (v: Vehicle) => [...v.color, 230] as [number, number, number, number],
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 600, characterSet: "auto",
      outlineWidth: 3, outlineColor: [6, 10, 17, 220], fontSettings: { sdf: true },
      updateTriggers: { getPosition: [now] },
    }),
  );

  if (region && (s.running || vs.length)) {
    layers.push(
      new ScatterplotLayer({
        id: "hq", data: [fleet.commandPost], getPosition: (p: LL) => p, radiusUnits: "pixels",
        getRadius: 7 + Math.sin(now * 3) * 2, getFillColor: [255, 255, 255, 230], getLineColor: [...ACCENT, 160], stroked: true, lineWidthMinPixels: 6,
        updateTriggers: { getRadius: [now] },
      }),
      new TextLayer({ id: "hq-label", data: [fleet.commandPost], getPosition: (p: LL) => p, getText: () => "COMMAND", getSize: 10, getPixelOffset: [0, 18], getColor: [...ACCENT, 220], fontFamily: "ui-monospace, Menlo, monospace", fontWeight: 700, outlineWidth: 3, outlineColor: [6, 10, 17, 220], fontSettings: { sdf: true } }),
    );
  }
  return layers;
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
