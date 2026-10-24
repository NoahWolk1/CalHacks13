import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import * as turf from "@turf/turf";
import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";

// FEMA National Flood Hazard Layer, "Flood Hazard Zones" (layer 28). Public, no key, US-wide.
const NFHL = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query";

const ZONE_INFO: Record<string, { label: string; sev: number }> = {
  VE: { label: "coastal high-hazard zone (wave action, 1% annual chance)", sev: 1 },
  V: { label: "coastal high-hazard zone (1% annual chance)", sev: 0.95 },
  AE: { label: "100-year floodplain with base flood elevation", sev: 0.85 },
  A: { label: "100-year floodplain", sev: 0.8 },
  AO: { label: "shallow flooding zone (1–3 ft)", sev: 0.7 },
  AH: { label: "shallow ponding zone", sev: 0.7 },
  X: { label: "moderate/minimal flood hazard", sev: 0.25 },
};

export const floodWorker: Worker = {
  id: "fema-flood",
  name: "Flood Recon",
  description: "Maps official FEMA flood hazard zones (100-year floodplain, coastal surge zones) intersecting the area.",
  vehicle: "drone",
  color: "#38bdf8",
  tools: ["http_get"],
  dataSources: ["FEMA National Flood Hazard Layer"],
  coverage: "US",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const [a, b, c, d] = task.region.bbox;
    const qs = new URLSearchParams({
      geometry: `${a},${b},${c},${d}`, geometryType: "esriGeometryEnvelope", inSR: "4326", outSR: "4326",
      spatialRel: "esriSpatialRelIntersects", outFields: "FLD_ZONE,SFHA_TF,ZONE_SUBTY,STATIC_BFE,DFIRM_ID",
      returnGeometry: "true", geometryPrecision: "5", maxAllowableOffset: "0.00005", resultRecordCount: "200", f: "geojson",
    });
    log("Querying FEMA NFHL flood hazard zones…");
    const fc = await getJson<FeatureCollection<Polygon | MultiPolygon>>(`${NFHL}?${qs}`, { signal, timeoutMs: 25_000 });
    const feats = (fc.features ?? []).filter((f) => f.geometry);
    log(`${feats.length} flood zone polygons in bbox`);

    // Merge per zone type, clip to region so polygons don't spill past the selection.
    const byZone = new Map<string, typeof feats>();
    for (const f of feats) {
      const z = String(f.properties?.FLD_ZONE ?? "?");
      if (z === "AREA NOT INCLUDED" || z === "OPEN WATER") continue;
      if (!byZone.has(z)) byZone.set(z, []);
      byZone.get(z)!.push(f);
    }
    let emitted = 0;
    for (const [zone, list] of byZone) {
      const info = ZONE_INFO[zone] ?? { label: `flood zone ${zone}`, sev: 0.5 };
      if (zone === "X" && byZone.size > 1) {
        // Zone X is "minimal hazard" background; only mention if it's all there is.
        continue;
      }
      for (const f of list.slice(0, 25)) {
        let geom: Polygon | MultiPolygon = f.geometry;
        try {
          const clipped = turf.intersect(turf.featureCollection([turf.feature(geom), task.region.polygon as never]));
          if (!clipped) continue;
          geom = clipped.geometry as Polygon | MultiPolygon;
        } catch { /* keep unclipped */ }
        const areaM2 = turf.area(geom);
        if (areaM2 < 150) continue;
        const bfe = f.properties?.STATIC_BFE;
        emit({
          claim: `FEMA ${zone}: ${info.label}${bfe && bfe > -9000 ? `, base flood elevation ${bfe} ft` : ""} (${Math.round(areaM2).toLocaleString()} m² in area)`,
          geometry: geom,
          source_url: "https://msc.fema.gov/portal/home",
          source_type: "fema_nfhl",
          confidence: 0.95,
          category: "flood",
          severity: info.sev,
          props: { zone, sfha: f.properties?.SFHA_TF === "T", bfe, dfirm: f.properties?.DFIRM_ID, areaM2: Math.round(areaM2) },
        });
        emitted++;
      }
    }
    if (!emitted) {
      emit({
        claim: byZone.has("X") ? "Area is FEMA Zone X: minimal mapped flood hazard" : "No FEMA-mapped special flood hazard area intersects this region",
        geometry: { type: "Point", coordinates: task.region.center },
        source_url: "https://msc.fema.gov/portal/home", source_type: "fema_nfhl", confidence: 0.8, category: "flood", severity: 0.1,
        props: { areaLevel: true },
      });
    }
  },
};
