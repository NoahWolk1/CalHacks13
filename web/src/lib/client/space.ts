"use client";
// "Take it to space": globe projection + atmosphere, the opening fly-in from orbit, imagery
// basemaps (Sentinel-2 cloudless / VIIRS night lights), live satellites from real TLEs and the
// ground tracks of satellite-pass findings. Everything here is MapLibre-native so it renders
// correctly on the globe; deck.gl only draws once the projection has settled into mercator.
import type { Map as MLMap, GeoJSONSource, ProjectionSpecification } from "maplibre-gl";
import { MapView as DeckMapView } from "@deck.gl/core";
import { create } from "zustand";
import type { FeatureCollection, LineString, Point } from "geojson";
import { useStore } from "./store";
import { UI } from "./theme";
import { loadSats, positions, groundTrack, overhead, splitAntimeridian, type Sat, type Overhead, type LL } from "./orbit";

/** Globe while zoomed out, flat mercator from GLOBE_END up. deck.gl (overlaid mode) only knows
 *  mercator, so MapView hides its layers below GLOBE_END and pins deck to a plain MapView. */
const GLOBE_START = 5;
export const GLOBE_END = 6.5;
const PROJECTION = { type: ["interpolate", ["linear"], ["zoom"], GLOBE_START, "vertical-perspective", GLOBE_END, "mercator"] } as unknown as ProjectionSpecification;
/** Explicit view so deck.gl never tries to derive one from our (expression) projection. */
export const DECK_VIEWS = new DeckMapView({ id: "mapbox" }) as never; // MapboxOverlayProps types views as null
export const deckHidden = (map: MLMap) => map.getZoom() < GLOBE_END;

const SF = { center: [-122.418, 37.768] as LL, zoom: 12.4, pitch: 48, bearing: -14 };
const SPACE = { center: [-131, 31] as LL, zoom: 1.55, pitch: 0, bearing: 0 };

export type Imagery = "map" | "s2" | "night";
const IMAGERY_KEY = "gs.imagery";
const FONT = ["Noto Sans Regular"];

interface SpaceState {
  imagery: Imagery;
  zoom: number;
  tracked: number;
  overhead: Overhead[];
  overheadAt: LL | null;
  setImagery: (i: Imagery) => void;
}

export const useSpace = create<SpaceState>((set) => ({
  imagery: "map", zoom: SF.zoom, tracked: 0, overhead: [], overheadAt: null,
  setImagery: (imagery) => {
    set({ imagery });
    try { localStorage.setItem(IMAGERY_KEY, imagery); } catch { /* private mode */ }
  },
}));

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export function installSpace(map: MLMap): () => void {
  let sats: Sat[] = [];
  let buildingOpacity: unknown;
  const timers: ReturnType<typeof setInterval>[] = [];

  try {
    const saved = localStorage.getItem(IMAGERY_KEY) as Imagery | null;
    if (saved === "s2" || saved === "night" || saved === "map") useSpace.setState({ imagery: saved });
  } catch { /* ignore */ }

  // ── opening shot: Earth from orbit, then dive into San Francisco ─────────
  const shared = new URL(window.location.href).searchParams.has("run");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let intro = !shared && !reduce;
  if (intro) map.jumpTo(SPACE);
  useSpace.setState({ zoom: map.getZoom() });
  const cancelIntro = () => { intro = false; };
  const interactions = ["mousedown", "wheel", "touchstart", "keydown"] as const;
  interactions.forEach((e) => map.getCanvasContainer().addEventListener(e, cancelIntro, { once: true, passive: true }));
  const startIntro = () => {
    if (!intro || useStore.getState().region) return;
    intro = false;
    map.flyTo({ ...SF, duration: 3800, curve: 1.6, essential: false });
  };

  // ── style: projection, sky, imagery, satellites, ground tracks ──────────
  const setup = () => {
    map.setProjection(PROJECTION);
    map.setSky({
      "sky-color": UI.bg, "horizon-color": "#1d1f22", "fog-color": UI.bg,
      "sky-horizon-blend": 0.6, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.95,
      // A thin, cool limb on the globe that fades out as the camera comes down.
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.42, GLOBE_START, 0.22, GLOBE_END + 0.5, 0],
    } as never);

    const below = map.getLayer("waterway") ? "waterway" : undefined;
    if (!map.getSource("s2cloudless")) {
      map.addSource("s2cloudless", {
        type: "raster", tileSize: 256, maxzoom: 17,
        tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg"],
        attribution: '<a href="https://s2maps.eu" target="_blank" rel="noreferrer">Sentinel-2 cloudless - https://s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2023)',
      });
      map.addSource("blackmarble", {
        type: "raster", tileSize: 256, maxzoom: 8,
        tiles: ["https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png"],
        attribution: 'Night lights: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noreferrer">NASA GIBS</a> VIIRS Black Marble 2016',
      });
    }
    if (!map.getLayer("imagery-s2")) {
      map.addLayer({ id: "imagery-s2", type: "raster", source: "s2cloudless", layout: { visibility: "none" },
        paint: { "raster-opacity": 0.92, "raster-saturation": -0.3, "raster-brightness-max": 0.78, "raster-contrast": 0.05, "raster-fade-duration": 200 } }, below);
      map.addLayer({ id: "imagery-night", type: "raster", source: "blackmarble", layout: { visibility: "none" },
        paint: { "raster-opacity": 1, "raster-saturation": -0.15, "raster-fade-duration": 200 } }, below);
    }

    if (!map.getSource("sat-pos")) {
      map.addSource("sat-pos", { type: "geojson", data: EMPTY });
      map.addSource("sat-tracks", { type: "geojson", data: EMPTY });
      map.addSource("finding-tracks", { type: "geojson", data: EMPTY });
    }
    if (!map.getLayer("sat-tracks")) {
      const fadeOut = (a: number) => ["interpolate", ["linear"], ["zoom"], 4, a, 7.5, 0] as never;
      map.addLayer({ id: "sat-tracks", type: "line", source: "sat-tracks", maxzoom: 8,
        paint: { "line-color": UI.fg3, "line-width": 1, "line-opacity": fadeOut(0.55), "line-dasharray": [2, 2] } });
      map.addLayer({ id: "sat-dots", type: "circle", source: "sat-pos", maxzoom: 8,
        paint: {
          "circle-radius": ["case", ["get", "curated"], 3.2, 1.7],
          "circle-color": ["case", ["get", "curated"], UI.fg1, UI.fg2],
          "circle-opacity": fadeOut(0.9),
          "circle-stroke-width": ["case", ["get", "curated"], 1.5, 0],
          "circle-stroke-color": UI.bg,
          "circle-stroke-opacity": fadeOut(1),
          "circle-pitch-alignment": "map",
        } });
      map.addLayer({ id: "sat-labels", type: "symbol", source: "sat-pos", maxzoom: 8, filter: ["get", "curated"],
        layout: { "text-field": ["get", "text"], "text-font": FONT, "text-size": 11, "text-anchor": "left", "text-offset": [0.8, 0], "text-allow-overlap": false, "text-optional": true },
        paint: { "text-color": UI.fg2, "text-halo-color": UI.bg, "text-halo-width": 1.4, "text-opacity": fadeOut(1) } });
      // Satellite passes reported by research workers: the swath they flew over this area.
      map.addLayer({ id: "finding-tracks", type: "line", source: "finding-tracks",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#d9d6ce", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1, 12, 1.8], "line-opacity": 0.7, "line-dasharray": [3, 2.5] } });
    }
    applyImagery(useSpace.getState().imagery);
    pushSats(true);
    pushFindingTracks();
  };

  const applyImagery = (im: Imagery) => {
    if (!map.getLayer("imagery-s2")) return;
    map.setLayoutProperty("imagery-s2", "visibility", im === "s2" ? "visible" : "none");
    // On the plain map the night-lights layer still shows faintly from orbit, so the globe reads as Earth.
    map.setLayoutProperty("imagery-night", "visibility", im === "s2" ? "none" : "visible");
    map.setPaintProperty("imagery-night", "raster-opacity", (im === "night" ? 1 : ["interpolate", ["linear"], ["zoom"], 2, 0.75, GLOBE_START, 0.35, GLOBE_END, 0]) as never);
    // Keep the 3D buildings readable over a photo: lighter massing instead of opaque slabs.
    if (map.getLayer("building-3d")) {
      if (buildingOpacity === undefined) buildingOpacity = map.getPaintProperty("building-3d", "fill-extrusion-opacity") ?? 0.85;
      map.setPaintProperty("building-3d", "fill-extrusion-opacity", (im === "map" ? buildingOpacity : im === "s2" ? 0.5 : 0.35) as never);
    }
  };

  // ── satellites ───────────────────────────────────────────────────────────
  let lastTracks = 0;
  const pushSats = (forceTracks = false) => {
    if (!sats.length) return;
    const z = map.getZoom();
    const now = new Date();
    if (z < 8.5) {
      const ps = positions(sats, now);
      (map.getSource("sat-pos") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: ps.map((p) => ({
          type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] } as Point,
          properties: { curated: p.sat.curated, text: `${p.sat.label}  ${Math.round(p.altKm)} km` },
        })),
      });
    }
    if (forceTracks || now.getTime() - lastTracks > 30_000) {
      lastTracks = now.getTime();
      (map.getSource("sat-tracks") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features: sats.filter((s) => s.curated).flatMap((s) => groundTrack(s, now).map((seg) => ({
          type: "Feature" as const, geometry: { type: "LineString", coordinates: seg } as LineString, properties: { name: s.label },
        }))),
      });
    }
  };

  const pushOverhead = () => {
    if (!sats.length) return;
    const region = useStore.getState().region;
    const c = map.getCenter();
    const at: LL = region?.center ?? [c.lng, c.lat];
    useSpace.setState({ overhead: overhead(sats, at), overheadAt: at, tracked: sats.length });
  };

  // ── findings with a satellite ground track ──────────────────────────────
  let lastKey = "";
  const pushFindingTracks = () => {
    const s = useStore.getState();
    const fs = s.findingOrder.filter((id) => s.revealed[id]).map((id) => s.findings[id])
      .filter((f) => Array.isArray(f?.props?.groundTrack) && (f.props!.groundTrack as unknown[]).length > 1);
    const key = fs.map((f) => f.id).join("|");
    const src = map.getSource("finding-tracks") as GeoJSONSource | undefined;
    if (!src || (key === lastKey && key !== "")) return;
    lastKey = key;
    src.setData({
      type: "FeatureCollection",
      features: fs.flatMap((f) => splitAntimeridian(f.props!.groundTrack as LL[]).map((seg) => ({
        type: "Feature" as const, geometry: { type: "LineString", coordinates: seg } as LineString, properties: { id: f.id },
      }))),
    });
  };

  map.on("style.load", setup);
  if (map.isStyleLoaded()) setup();
  // Hold on the globe until its first tiles have drawn (or 3s), then take a beat before diving in.
  map.once("load", () => {
    let go = false;
    const fire = () => { if (go) return; go = true; setTimeout(startIntro, 900); };
    map.once("idle", fire);
    setTimeout(fire, 3000);
  });
  const onZoom = () => useSpace.setState({ zoom: map.getZoom() });
  map.on("zoom", onZoom);
  const unsubImagery = useSpace.subscribe((s, p) => { if (s.imagery !== p.imagery) applyImagery(s.imagery); });
  const unsubStore = useStore.subscribe((s, p) => {
    if (s.revealed !== p.revealed || s.findings !== p.findings) pushFindingTracks();
    if (s.region !== p.region) pushOverhead();
  });

  loadSats().then((list) => { sats = list; useSpace.setState({ tracked: list.length }); pushSats(true); pushOverhead(); }).catch(() => {});
  timers.push(setInterval(() => pushSats(), 250));
  timers.push(setInterval(pushOverhead, 2000));

  return () => {
    timers.forEach(clearInterval);
    unsubImagery(); unsubStore();
    map.off("style.load", setup); map.off("zoom", onZoom);
    interactions.forEach((e) => map.getCanvasContainer().removeEventListener(e, cancelIntro));
  };
}
