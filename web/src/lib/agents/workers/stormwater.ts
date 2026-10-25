import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import { touchesSF } from "@/lib/geo";
import * as turf from "@turf/turf";
import type { FeatureCollection, Geometry, Polygon, MultiPolygon, LineString, MultiLineString } from "geojson";

// SFPUC 100-Year Storm Flood Risk map + historical creeks/water bodies (public ArcGIS, no key).
// Unlike FEMA (coastal only in SF), this covers inland stormwater flooding, e.g. the Mission's buried creeks.
const BASE = "https://services.arcgis.com/Zs2aNLFN00jrS4gG/ArcGIS/rest/services/FloodMap/FeatureServer";
const SOURCE = "https://sfpuc.gov/learning/come-visit/floodmap";

export const stormwaterWorker: Worker = {
  id: "sf-stormwater",
  name: "Storm Scout",
  description: "Maps San Francisco's 100-year storm flood risk zone (inland stormwater flooding FEMA misses) plus buried historical creeks and filled-in lagoons/marshes. San Francisco only.",
  vehicle: "drone",
  color: "#62a89c",
  tools: ["http_get"],
  dataSources: ["SFPUC 100-Year Storm Flood Risk Map", "SFPUC historical creeks & water bodies"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    if (!touchesSF(task.region)) { log("Outside San Francisco: no SFPUC flood map here."); return; }
    const [a, b, c, d] = task.region.bbox;
    const q = (layer: number) => getJson<FeatureCollection<Geometry>>(`${BASE}/${layer}/query?${new URLSearchParams({
      geometry: `${a},${b},${c},${d}`, geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326", spatialRel: "esriSpatialRelIntersects",
      outFields: "*", returnGeometry: "true", geometryPrecision: "5", maxAllowableOffset: "0.00003", f: "geojson",
    })}`, { signal, timeoutMs: 25_000 });
    log("Querying SFPUC storm flood map, historical creeks and water bodies…");
    const [storm, creeks, water] = await Promise.all([q(1), q(3).catch(() => null), q(4).catch(() => null)]);
    const clip = (g: Polygon | MultiPolygon) => {
      try { return turf.intersect(turf.featureCollection([turf.feature(g), task.region.polygon as never]))?.geometry as Polygon | MultiPolygon | undefined; }
      catch { return undefined; }
    };

    // 100-year storm zone: one citywide multipolygon → clip, then split into parts so each block is its own finding.
    let parts = 0;
    for (const f of storm.features) {
      const clipped = clip(f.geometry as Polygon | MultiPolygon);
      if (!clipped) continue;
      const polys = clipped.type === "Polygon" ? [clipped.coordinates] : clipped.coordinates;
      for (const coords of polys) {
        const g: Polygon = { type: "Polygon", coordinates: coords };
        const area = turf.area(g);
        if (area < 400 || parts >= 30) continue;
        parts++;
        emit({
          claim: `SFPUC 100-year storm flood risk zone: ≥6 in. of contiguous street flooding expected in a 100-year storm (${Math.round(area).toLocaleString()} m²)`,
          geometry: g, source_url: SOURCE, source_type: "sfpuc_flood_map", observed_at: "2018-09-25", confidence: 0.85,
          category: "flood", severity: 0.8, props: { zone: "STORM100", areaM2: Math.round(area) },
        });
      }
    }
    log(`${parts} storm-flood blocks in area`);

    // Former lagoons/marshes/bay: filled land settles and liquefies, and water wants to go back.
    let w = 0;
    for (const f of water?.features ?? []) {
      const clipped = clip(f.geometry as Polygon | MultiPolygon);
      if (!clipped || turf.area(clipped) < 800 || w >= 6) continue;
      w++;
      emit({
        claim: `Built on a former water body (historical lagoon/marsh, now fill): ${Math.round(turf.area(clipped)).toLocaleString()} m² of the area`,
        geometry: clipped, source_url: SOURCE, source_type: "historical_waterbody", confidence: 0.75,
        category: "history", severity: 0.6, props: { zone: "FILL" },
      });
    }

    // Buried creeks: emit as lines, clipped roughly to the bbox.
    for (const f of (creeks?.features ?? []).slice(0, 6)) {
      const g = f.geometry as LineString | MultiLineString;
      const lines = g.type === "LineString" ? [g.coordinates] : g.coordinates;
      const inside = lines.map((l) => l.filter(([x, y]) => x >= a && x <= c && y >= b && y <= d)).filter((l) => l.length >= 2);
      if (!inside.length) continue;
      const name = String(f.properties?.NAME1 ?? "Unnamed creek");
      emit({
        claim: `Buried historical creek runs under the area: ${name}`,
        geometry: inside.length === 1 ? { type: "LineString", coordinates: inside[0] } : { type: "MultiLineString", coordinates: inside },
        source_url: SOURCE, source_type: "historical_creek", confidence: 0.7, category: "history", severity: 0.5, props: { name },
      });
    }
  },
};
