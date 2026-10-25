// Small shared helpers for the hazard/environment/context workers: ArcGIS FeatureServer queries,
// clipping polygons to the selection, and reading OpenStreetMap layers out of OpenFreeMap tiles.

import { getBuffer, getJson } from "@/lib/http";
import type { Region } from "@/lib/types";
import * as turf from "@turf/turf";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

type BBox = [number, number, number, number];

/** Pads a bbox by `m` metres (roughly; fine at city scale). */
export function padBbox([a, b, c, d]: BBox, m: number): BBox {
  const dLat = m / 111_320, dLng = m / (111_320 * Math.cos((((b + d) / 2) * Math.PI) / 180));
  return [a - dLng, b - dLat, c + dLng, d + dLat];
}

export function bboxIntersects(p: BBox, q: BBox) {
  return !(p[2] < q[0] || p[0] > q[2] || p[3] < q[1] || p[1] > q[3]);
}

/** Envelope query against an ArcGIS FeatureServer/MapServer layer, returned as GeoJSON in WGS84. */
export async function arcgisQuery<G extends Geometry = Geometry>(
  layerUrl: string,
  bbox: BBox,
  opts: { outFields?: string; where?: string; geometry?: boolean; offset?: number; count?: number; signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Feature<G>[]> {
  const qs = new URLSearchParams({
    where: opts.where ?? "1=1",
    geometry: bbox.map((v) => v.toFixed(5)).join(","), geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326",
    spatialRel: "esriSpatialRelIntersects", outFields: opts.outFields ?? "*", returnGeometry: String(opts.geometry ?? true),
    geometryPrecision: "5", resultRecordCount: String(opts.count ?? 200), f: "geojson",
  });
  if (opts.offset) qs.set("maxAllowableOffset", String(opts.offset));
  const fc = await getJson<FeatureCollection<G> & { error?: { message: string } }>(`${layerUrl}/query?${qs}`, { signal: opts.signal, timeoutMs: opts.timeoutMs ?? 20_000 });
  if (fc.error) throw new Error(`ArcGIS: ${fc.error.message}`);
  return fc.features ?? [];
}

/** Count-only envelope query (cheap pre-check before pulling heavy geometry). */
export async function arcgisCount(layerUrl: string, bbox: BBox, signal?: AbortSignal, where = "1=1"): Promise<number> {
  const qs = new URLSearchParams({
    where, geometry: bbox.map((v) => v.toFixed(5)).join(","), geometryType: "esriGeometryEnvelope", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", returnCountOnly: "true", f: "json",
  });
  const r = await getJson<{ count?: number; error?: { message: string } }>(`${layerUrl}/query?${qs}`, { signal, timeoutMs: 15_000 });
  if (r.error) throw new Error(`ArcGIS: ${r.error.message}`);
  return r.count ?? 0;
}

/** Clips a polygon to the selected region. Pre-clips to the bbox first so whole-Bay polygons stay cheap. */
export function clipToRegion(region: Region, geom: Polygon | MultiPolygon): Polygon | MultiPolygon | null {
  try {
    const pre = turf.bboxClip(turf.feature(geom), region.bbox).geometry as Polygon | MultiPolygon;
    const rings = pre.type === "Polygon" ? pre.coordinates : pre.coordinates.flat();
    if (!rings.some((r) => r.length >= 4)) return null;
    if (region.kind === "box") return cleanEmpty(pre);
    const out = turf.intersect(turf.featureCollection([turf.feature(pre), region.polygon as Feature<Polygon | MultiPolygon>]));
    return out ? (out.geometry as Polygon | MultiPolygon) : null;
  } catch {
    return null;
  }
}

function cleanEmpty(g: Polygon | MultiPolygon): Polygon | MultiPolygon | null {
  if (g.type === "Polygon") {
    const rings = g.coordinates.filter((r) => r.length >= 4);
    return rings.length ? { type: "Polygon", coordinates: rings } : null;
  }
  const polys = g.coordinates.map((p) => p.filter((r) => r.length >= 4)).filter((p) => p.length);
  return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
}

/** Area in m² of a clipped geometry (0 on failure). */
export const areaM2 = (g: Polygon | MultiPolygon | null) => (g ? turf.area(g) : 0);

// ─── OpenStreetMap layers from OpenFreeMap vector tiles (same source as the places worker) ─────────

const Z = 14;
const lng2x = (lng: number) => Math.floor(((lng + 180) / 360) * 2 ** Z);
const lat2y = (lat: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z); };

/** Reads the given OpenMapTiles layers (e.g. "water", "building", "poi") for the region's z14 tiles. */
export async function osmTileLayers(region: Region, layers: string[], signal: AbortSignal, maxTiles = 16): Promise<Record<string, Feature[]>> {
  const [a, b, c, d] = region.bbox;
  const tiles: [number, number][] = [];
  for (let x = lng2x(a); x <= lng2x(c); x++) for (let y = lat2y(d); y <= lat2y(b); y++) tiles.push([x, y]);
  const [cx, cy] = [lng2x(region.center[0]), lat2y(region.center[1])];
  tiles.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy)).splice(maxTiles);
  const template = (await getJson<{ tiles: string[] }>("https://tiles.openfreemap.org/planet", { signal, timeoutMs: 8000 })).tiles[0];
  const out: Record<string, Feature[]> = Object.fromEntries(layers.map((l) => [l, []]));
  await Promise.all(tiles.map(async ([x, y]) => {
    const buf = await getBuffer(template.replace("{z}", String(Z)).replace("{x}", String(x)).replace("{y}", String(y)), { signal }).catch(() => null);
    if (!buf?.byteLength) return;
    const vt = new VectorTile(new PbfReader(new Uint8Array(buf)));
    for (const name of layers) {
      const layer = vt.layers[name];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) out[name].push(layer.feature(i).toGeoJSON(x, y, Z) as Feature);
    }
  }));
  return out;
}
