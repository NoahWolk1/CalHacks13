import * as turf from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import type { Region } from "@/lib/types";
import { regionFromBox, regionFromPin, regionFromPolygon, distanceM } from "@/lib/geo";

type LL = [number, number];

/**
 * A draggable point on a selected region. Primary handles (corner/vertex/center) move a point;
 * secondary ones (edge/mid/radius) sit between them: a box edge slides one side, a polygon
 * midpoint becomes a new vertex when grabbed, a pin's rim sets its radius.
 */
export type Handle = { kind: "corner" | "edge" | "vertex" | "mid" | "center" | "radius"; i: number; pos: LL };
export const isPrimary = (h: Handle) => h.kind === "corner" || h.kind === "vertex" || h.kind === "center";

// Same range as the pin-radius slider.
const PIN_MIN = 150, PIN_MAX = 2000;
// Huge rings would bury the map in handles; those just aren't editable.
const MAX_VERTS = 80;

function ring(r: Region): LL[] | null {
  const g = r.polygon.geometry;
  if (g.type !== "Polygon") return null;
  const pts = g.coordinates[0] as LL[];
  return pts.slice(0, -1); // drop the closing point
}

export function regionHandles(r: Region): Handle[] {
  if (r.kind === "box") {
    const [a, b, c, d] = r.bbox, mx = (a + c) / 2, my = (b + d) / 2;
    const corners: LL[] = [[a, b], [c, b], [c, d], [a, d]];
    const edges: LL[] = [[mx, b], [c, my], [mx, d], [a, my]]; // south, east, north, west
    return [...corners.map((pos, i) => ({ kind: "corner" as const, i, pos })), ...edges.map((pos, i) => ({ kind: "edge" as const, i, pos }))];
  }
  if (r.kind === "pin") {
    const rim = turf.destination(r.center, (r.radiusM ?? PIN_MIN) / 1000, 90, { units: "kilometers" }).geometry.coordinates as LL;
    return [{ kind: "center", i: 0, pos: r.center }, { kind: "radius", i: 0, pos: rim }];
  }
  const pts = ring(r);
  if (!pts || pts.length > MAX_VERTS) return [];
  return [
    ...pts.map((pos, i) => ({ kind: "vertex" as const, i, pos })),
    ...pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return { kind: "mid" as const, i, pos: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as LL }; }),
  ];
}

/** Start dragging `h`. A polygon midpoint is promoted to a real vertex first. */
export function grabHandle(r: Region, h: Handle): [Region, Handle] {
  if (h.kind !== "mid") return [r, h];
  const pts = ring(r)!;
  pts.splice(h.i + 1, 0, h.pos);
  return [polygonRegion(pts), { kind: "vertex", i: h.i + 1, pos: h.pos }];
}

/** The region with handle `h` dragged to `to`. */
export function dragHandle(r: Region, h: Handle, to: LL): Region {
  switch (h.kind) {
    case "corner": {
      const [a, b, c, d] = r.bbox;
      const opposite: LL = [[c, d], [a, d], [a, b], [c, b]][h.i] as LL;
      return regionFromBox(opposite, to);
    }
    case "edge": {
      const bb = [...r.bbox];
      bb[[1, 2, 3, 0][h.i]] = h.i % 2 ? to[0] : to[1]; // south→minLat, east→maxLng, north→maxLat, west→minLng
      return regionFromBox([bb[0], bb[1]], [bb[2], bb[3]]);
    }
    case "center": return regionFromPin(to, r.radiusM ?? PIN_MIN);
    case "radius": return regionFromPin(r.center, Math.round(Math.min(PIN_MAX, Math.max(PIN_MIN, distanceM(r.center, to)))));
    default: {
      const pts = ring(r)!;
      pts[h.i] = to;
      return polygonRegion(pts);
    }
  }
}

function polygonRegion(pts: LL[]): Region {
  return regionFromPolygon(turf.polygon([[...pts, pts[0]]]) as Feature<Polygon>, "polygon");
}
