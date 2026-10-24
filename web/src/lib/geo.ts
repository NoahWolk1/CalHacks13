import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon, Geometry } from "geojson";
import type { Region } from "./types";

export function regionFromPolygon(poly: Feature<Polygon | MultiPolygon>, kind: Region["kind"], radiusM?: number): Region {
  const bbox = turf.bbox(poly) as Region["bbox"];
  const c = turf.centroid(poly).geometry.coordinates as [number, number];
  return { kind, polygon: poly, bbox, center: c, radiusM };
}

export function regionFromBox(a: [number, number], b: [number, number]): Region {
  const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);
  return regionFromPolygon(turf.bboxPolygon([minX, minY, maxX, maxY]), "box");
}

export function regionFromPin(center: [number, number], radiusM: number): Region {
  const circle = turf.circle(center, radiusM / 1000, { steps: 64, units: "kilometers" });
  return regionFromPolygon(circle, "pin", radiusM);
}

export function regionAreaKm2(r: Region) {
  return turf.area(r.polygon) / 1e6;
}

export function inRegion(r: Region, lng: number, lat: number) {
  return turf.booleanPointInPolygon([lng, lat], r.polygon);
}

/** Representative point for any geometry (used for pins, arcs, vehicle targets). */
export function anchorOf(g: Geometry): [number, number] {
  if (g.type === "Point") return g.coordinates as [number, number];
  return turf.pointOnFeature({ type: "Feature", geometry: g, properties: {} }).geometry.coordinates as [number, number];
}

/** Evenly spaced sample points inside the region (for gridded APIs like elevation). */
export function sampleGrid(r: Region, n: number): [number, number][] {
  const [minX, minY, maxX, maxY] = r.bbox;
  const side = Math.ceil(Math.sqrt(n * 1.6));
  const pts: [number, number][] = [];
  for (let i = 0; i < side; i++)
    for (let j = 0; j < side; j++) {
      const lng = minX + ((i + 0.5) / side) * (maxX - minX);
      const lat = minY + ((j + 0.5) / side) * (maxY - minY);
      if (inRegion(r, lng, lat)) pts.push([lng, lat]);
    }
  return pts.slice(0, n);
}

/** Socrata within_polygon() WKT for the region (SF Open Data filters). */
export function regionWkt(r: Region) {
  const g = r.polygon.geometry;
  const ring = (g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0][0]) as number[][];
  // Socrata rejects huge WKT; simplify rings with many vertices.
  const step = Math.max(1, Math.floor(ring.length / 40));
  const pts = ring.filter((_, i) => i % step === 0);
  if (pts[0] !== pts[pts.length - 1]) pts.push(pts[0]);
  return `MULTIPOLYGON (((${pts.map((p) => `${p[0]} ${p[1]}`).join(", ")})))`;
}

/** Rough San Francisco city bounds; SF-only data sources check this. */
const SF_BOUNDS: [number, number, number, number] = [-122.52, 37.70, -122.35, 37.84];
export function touchesSF(r: Region) {
  const [a, b, c, d] = r.bbox;
  return !(c < SF_BOUNDS[0] || a > SF_BOUNDS[2] || d < SF_BOUNDS[1] || b > SF_BOUNDS[3]);
}

export function distanceM(a: [number, number], b: [number, number]) {
  return turf.distance(a, b, { units: "meters" });
}
