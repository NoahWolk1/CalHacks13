// The `osm` tool primitive for generated agents: OpenStreetMap features inside the task's area,
// read from OpenFreeMap vector tiles (OpenMapTiles schema; no key, global, cached via http.ts).
// Public Overpass is overloaded/unreachable from our hosts, so this is the reliable path for
// "how many schools / villages / rivers / parks here" questions.
//
// Zoom per layer (checked on DR Congo, Mission SF and Lyon): POIs, buildings and house numbers only
// appear in full at z14 (z12-13 carry just a few high-rank POIs such as subway stations), so those
// layers always read z14 and sample tiles when the area is large. Places are complete by z11
// (villages from z10, hamlets from z11). Other layers pick the highest zoom ≤ 14 that fits the budget.

import type { Feature, Geometry, Position } from "geojson";
import * as turf from "@turf/turf";
import type { Region } from "@/lib/types";
import { inRegion } from "@/lib/geo";
import { planTiles, readTileLayers, type TilePlan } from "./workers/tiles";

export const OSM_LAYERS = [
  "place", "poi", "building", "housenumber", "water", "water_name", "waterway", "landuse", "landcover", "park",
  "transportation", "transportation_name", "aeroway", "aerodrome_label", "boundary", "mountain_peak",
] as const;
export type OsmLayer = (typeof OSM_LAYERS)[number];

/** Tiles per call: dense layers (heavy tiles) / the rest (light at lower zooms; 64 lets places reach z11 on a ~110 km box). */
export const OSM_TILE_BUDGET = { dense: 48, other: 64 };
/** Layers whose features only appear at full detail (z14): sample at z14 rather than read a coarse zoom. */
const DENSE = new Set<OsmLayer>(["poi", "building", "housenumber"]);
/** [lowest useful zoom, zoom at which the layer is complete]. */
const ZOOMS: Record<OsmLayer, [number, number]> = {
  place: [8, 11], poi: [14, 14], building: [14, 14], housenumber: [14, 14],
  water: [8, 14], water_name: [8, 14], waterway: [8, 14], landuse: [8, 14], landcover: [8, 14], park: [8, 14],
  transportation: [8, 14], transportation_name: [8, 14], aeroway: [10, 14], aerodrome_label: [8, 10],
  boundary: [6, 10], mountain_peak: [8, 14],
};

export interface OsmQuery {
  layer: OsmLayer;
  filter?: { class?: string[]; subclass?: string[]; nameContains?: string };
  limit?: number;
  countOnly?: boolean;
}

export function chooseZoom(layer: OsmLayer, bbox: number[], center: [number, number], budget = OSM_TILE_BUDGET): TilePlan {
  const [minZ, fullZ] = ZOOMS[layer];
  return DENSE.has(layer)
    ? planTiles(bbox, center, { minZ: fullZ, maxZ: fullZ, maxTiles: budget.dense })
    : planTiles(bbox, center, { minZ, maxZ: fullZ, maxTiles: budget.other });
}

export interface OsmItem {
  key: string; name?: string; class: string; subclass?: string;
  lng: number; lat: number; kind: "point" | "line" | "polygon"; areaM2?: number; rank?: number; extra?: Record<string, unknown>;
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;
const ringsOf = (g: Geometry): Position[][] =>
  g.type === "Point" ? [[g.coordinates]] : g.type === "MultiPoint" || g.type === "LineString" ? [g.coordinates]
    : g.type === "MultiLineString" || g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];

/** Is any (sampled) vertex of the geometry inside the region? Points: exact test. */
export function clipToRegion(region: Pick<Region, "polygon" | "bbox">, g: Geometry): [number, number] | null {
  const pts = ringsOf(g).flat();
  if (!pts.length) return null;
  const [a, b, c, d] = region.bbox;
  const step = Math.max(1, Math.floor(pts.length / 24));
  for (let i = 0; i < pts.length; i += step) {
    const [lng, lat] = pts[i];
    if (lng < a || lng > c || lat < b || lat > d) continue;
    if (inRegion(region as Region, lng, lat)) return [lng, lat];
  }
  return null;
}

/** One feature as an item. Location: the point itself, a line's middle vertex, a polygon's ring average. */
export function toItem(f: Feature, layer: string): Omit<OsmItem, "key"> & { key: string } | null {
  const g = f.geometry;
  if (!g) return null;
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const kind: OsmItem["kind"] = g.type.includes("Point") ? "point" : g.type.includes("Line") ? "line" : "polygon";
  const pts = ringsOf(g)[0] ?? [];
  if (!pts.length) return null;
  let lng: number, lat: number;
  if (kind === "polygon") { lng = pts.reduce((s, q) => s + q[0], 0) / pts.length; lat = pts.reduce((s, q) => s + q[1], 0) / pts.length; }
  else [lng, lat] = pts[Math.floor(pts.length / 2)] as [number, number];
  const name = typeof p.name === "string" && p.name ? p.name : undefined;
  const cls = String(p.class ?? (layer === "building" ? "building" : layer === "housenumber" ? "housenumber" : layer));
  const subclass = typeof p.subclass === "string" ? p.subclass : undefined;
  const id = typeof f.id === "number" && f.id > 0 ? f.id : null;
  // Tiles carry a buffer past their edges and split lines/polygons, so the same OSM object shows up in
  // several tiles: dedupe on the OSM id when present, else name+class+rounded coords.
  // Named lines (rivers, roads) are many OSM ways sharing one name, so merge those by name.
  const key = name && kind === "line" ? `${layer}|${cls}|${name}` : id != null ? `${layer}#${id}` : `${layer}|${cls}|${name ?? ""}|${lng.toFixed(3)},${lat.toFixed(3)}`;
  const extra: Record<string, unknown> = {};
  for (const k of ["ele", "admin_level", "capital", "housenumber", "ref", "brunnel", "intermittent"]) if (p[k] != null && p[k] !== "") extra[k] = p[k];
  return {
    key, name, class: cls, subclass: subclass && subclass !== cls ? subclass : undefined, lng, lat, kind,
    areaM2: kind === "polygon" ? turf.area(g as Geometry) : undefined,
    rank: typeof p.rank === "number" ? p.rank : undefined,
    extra: Object.keys(extra).length ? extra : undefined,
  };
}

/** Merge duplicates: keep the first location, sum polygon parts (approximate: tile buffers overlap a little). */
export function dedupe(items: OsmItem[]): OsmItem[] {
  const by = new Map<string, OsmItem>();
  for (const it of items) {
    const prev = by.get(it.key);
    if (!prev) { by.set(it.key, { ...it }); continue; }
    if (it.areaM2 != null) prev.areaM2 = (prev.areaM2 ?? 0) + it.areaM2;
  }
  return [...by.values()];
}

export function matches(it: OsmItem, filter: OsmQuery["filter"]): boolean {
  if (!filter) return true;
  const lc = (xs?: string[]) => xs?.map((s) => s.toLowerCase().trim()).filter(Boolean);
  const cls = lc(filter.class), sub = lc(filter.subclass);
  // class matches either the class or the subclass (OpenMapTiles puts "school" in both, "village" only in class).
  if (cls?.length && !cls.includes(it.class.toLowerCase()) && !cls.includes((it.subclass ?? "").toLowerCase())) return false;
  if (sub?.length && !sub.includes((it.subclass ?? it.class).toLowerCase())) return false;
  const nc = filter.nameContains?.toLowerCase().trim();
  if (nc && !(it.name ?? "").toLowerCase().includes(nc)) return false;
  return true;
}

const tally = (items: OsmItem[], f: (i: OsmItem) => string) => {
  const out: Record<string, number> = {};
  for (const i of items) out[f(i)] = (out[f(i)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort((p, q) => q[1] - p[1]).slice(0, 25));
};

/** Pure: raw tile features → the compact tool result. */
export function summarize(raw: Feature[], layer: OsmLayer, region: Pick<Region, "polygon" | "bbox">, plan: TilePlan, q: OsmQuery, failed = 0) {
  const items: OsmItem[] = [];
  for (const f of raw) {
    if (!f.geometry || !clipToRegion(region, f.geometry)) continue;
    const it = toItem(f, layer);
    if (it) items.push(it);
  }
  const all = dedupe(items);
  const hits = all.filter((i) => matches(i, q.filter));
  const limit = Math.max(0, Math.min(200, q.limit ?? 40));
  // Named first, then by rank (lower = more important in OpenMapTiles), then biggest areas.
  const ordered = [...hits].sort((p, r) => (+!p.name - +!r.name) || ((p.rank ?? 99) - (r.rank ?? 99)) || ((r.areaM2 ?? 0) - (p.areaM2 ?? 0)));
  const [, fullZ] = ZOOMS[layer];
  const notes: string[] = [];
  if (plan.sampled) notes.push(`Area spans ${plan.total} tiles at z${plan.z}; read a sample of ${plan.tiles.length}, so total covers only the sampled tiles (see estimatedTotal).`);
  if (plan.z < fullZ) notes.push(`Read at z${plan.z} (< z${fullZ}) to fit the tile budget: small/low-rank features may be missing, so counts are a lower bound.`);
  // readTileLayers counts empty tiles (no mapped features: OpenFreeMap answers with an empty body) as failed too.
  if (failed) notes.push(`${failed} of the tiles read were empty or unavailable.`);
  if (layer === "building" || layer === "landuse" || layer === "landcover") notes.push("Polygons split across tiles are merged approximately; areas are approximate.");
  return {
    layer, zoom: plan.z, tilesRead: plan.tiles.length, sampled: plan.sampled,
    total: hits.length,
    ...(plan.sampled ? { estimatedTotal: Math.round((hits.length * plan.total) / plan.tiles.length) } : {}),
    named: hits.filter((h) => h.name).length,
    byClass: tally(hits, (i) => (i.subclass ? `${i.class}/${i.subclass}` : i.class)),
    ...(q.filter && hits.length < all.length ? { layerClasses: tally(all, (i) => i.class) } : {}),
    note: notes.join(" ") || undefined,
    sourceUrl: "https://www.openstreetmap.org/#map=17/{lat}/{lng}",
    ...(!q.countOnly && hits.some((h) => h.name) ? { next: "Report with emit_findings: one area-level finding with the count (lng/lat null), then ONE SEPARATE finding per named feature below (8-12 of them, each with its own lng/lat and sourceUrl filled in), so each gets its own pin." } : {}),
    features: q.countOnly ? [] : ordered.slice(0, limit).map((i) => ({
      name: i.name ?? null, class: i.class, ...(i.subclass ? { subclass: i.subclass } : {}),
      lng: r5(i.lng), lat: r5(i.lat), ...(i.areaM2 != null ? { areaM2: Math.round(i.areaM2) } : {}), ...(i.extra ?? {}),
    })),
  };
}

export async function osmFeatures(region: Region, q: OsmQuery, signal: AbortSignal) {
  if (!OSM_LAYERS.includes(q.layer)) throw new Error(`Unknown layer "${q.layer}". Use one of: ${OSM_LAYERS.join(", ")}`);
  const plan = chooseZoom(q.layer, region.bbox, region.center);
  const { features, failed } = await readTileLayers(plan, [q.layer], signal);
  return summarize(features[q.layer], q.layer, region, plan, q, failed);
}

export const OSM_TOOL = {
  name: "osm_features",
  description:
    "OpenStreetMap features inside the selected area (fast, global, no key; reads OpenFreeMap vector tiles). Use this FIRST to count or locate " +
    "mapped things (villages/towns, schools, hospitals, shops, parks, rivers, roads, buildings, land use) instead of Overpass. Returns " +
    "{zoom, tilesRead, sampled, total, estimatedTotal?, byClass, features:[{name, class, subclass, lng, lat, areaM2?}], note}. Layers (OpenMapTiles): " +
    "place (class city/town/village/hamlet/suburb/neighbourhood/isolated_dwelling), poi (class e.g. school, hospital, cafe, restaurant, shop, bus, " +
    "place_of_worship, college, pharmacy; subclass is the OSM tag value), building, housenumber, water (lake/river/pond/ocean), water_name, " +
    "waterway (river/stream/canal), landuse (residential/industrial/farmland/school/hospital/cemetery/...), landcover (wood/grass/farmland/wetland/sand/ice), " +
    "park, transportation (motorway/trunk/primary/secondary/tertiary/minor/service/track/path/rail), transportation_name (named roads), aeroway, " +
    "aerodrome_label (airports), boundary, mountain_peak. Unknown classes? Call once without a filter and read byClass. Respect the note: " +
    "sampled or low-zoom results are lower bounds. Then report with emit_findings: one area-level finding with the count and " +
    "breakdown (lng/lat null), plus one finding per notable named feature (up to ~10, each with its own lng/lat from the result and " +
    "source_url https://www.openstreetmap.org/#map=17/<lat>/<lng>). Counts are deduplicated OpenStreetMap features: report them as such.",
  input_schema: {
    type: "object" as const,
    required: ["layer"],
    properties: {
      layer: { type: "string", enum: [...OSM_LAYERS] },
      filter: {
        type: "object",
        properties: {
          class: { type: "array", items: { type: "string" }, description: "Match class (or subclass), e.g. [\"village\",\"hamlet\"] or [\"school\"]" },
          subclass: { type: "array", items: { type: "string" } },
          nameContains: { type: "string" },
        },
      },
      limit: { type: "integer", description: "Max features listed (default 40, max 200)" },
      countOnly: { type: "boolean" },
    },
  },
};

/** Parse loose tool input (nulls allowed) into an OsmQuery. */
export function parseOsmInput(input: unknown): OsmQuery {
  const i = (input ?? {}) as Record<string, unknown>;
  const f = (i.filter ?? null) as Record<string, unknown> | null;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : undefined);
  return {
    layer: String(i.layer ?? "") as OsmLayer,
    filter: f ? { class: arr(f.class), subclass: arr(f.subclass), nameContains: typeof f.nameContains === "string" ? f.nameContains : undefined } : undefined,
    limit: typeof i.limit === "number" ? i.limit : undefined,
    countOnly: i.countOnly === true,
  };
}
