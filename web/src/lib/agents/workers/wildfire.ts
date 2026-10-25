import type { Worker } from "@/lib/types";
import * as turf from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import { regionAreaKm2 } from "@/lib/geo";
import { areaM2, arcgisQuery, bboxIntersects, clipToRegion, padBbox } from "./kit";

// CAL FIRE Fire Hazard Severity Zones (Office of the State Fire Marshal). Public, no key, California only.
// - Statewide: CAL FIRE "FHSZ for real estate inspections" layer (SRA + LRA zones).
// - Bay Area: MTC's copy of the 2025 State + Local FHSZ maps (adds the newer LRA Moderate/High zones).
const CALFIRE = "https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/ArcGIS/rest/services/fhsz24_5/FeatureServer/0";
const MTC_2025 = "https://services3.arcgis.com/i2dkYWmb4wHvYPda/arcgis/rest/services/FHSZ_2025/FeatureServer/0";
const BAY: [number, number, number, number] = [-123.53, 36.89, -121.2, 38.86];
const CA: [number, number, number, number] = [-124.5, 32.5, -114.1, 42.1];
const SEARCH_M = 8000;

const SEV: Record<string, number> = { "Very High": 0.95, High: 0.75, Moderate: 0.45 };
const RESP: Record<string, string> = { SRA: "State Responsibility Area", LRA: "Local Responsibility Area" };

export const wildfireWorker: Worker = {
  id: "calfire-fhsz",
  name: "Ember Watch",
  description: "Checks CAL FIRE Fire Hazard Severity Zones (Moderate / High / Very High) in and within ~8 km of the area: what's inside, and how far the nearest wildland-fire zone is.",
  vehicle: "drone",
  color: "#e39a7b",
  tools: ["http_get"],
  dataSources: ["CAL FIRE / OSFM Fire Hazard Severity Zones", "MTC 2025 State & Local FHSZ (Bay Area)"],
  coverage: "California",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!bboxIntersects(r.bbox, CA)) { log("Outside California: no FHSZ maps."); return; }
    const search = padBbox(r.bbox, SEARCH_M);
    const bay = bboxIntersects(r.bbox, BAY);
    log(`Querying ${bay ? "2025 Bay Area" : "CAL FIRE statewide"} Fire Hazard Severity Zones within ~8 km…`);
    const feats = bay
      ? (await arcgisQuery<Polygon | MultiPolygon>(MTC_2025, search, { where: "Hazard_Class <> 'NonWildland'", outFields: "Reg_Author,Hazard_Class", offset: 0.0001, signal }))
          .map((f) => ({ g: f.geometry, resp: String(f.properties?.Reg_Author ?? ""), cls: String(f.properties?.Hazard_Class ?? "") }))
      : (await arcgisQuery<Polygon | MultiPolygon>(CALFIRE, search, { outFields: "FHSZ_7Class,FHSZ_Description,SRA22_2", offset: 0.0001, signal }))
          .map((f) => ({ g: f.geometry, resp: String(f.properties?.SRA22_2 ?? ""), cls: String(f.properties?.FHSZ_Description ?? "") }));
    const zones = feats.filter((z) => z.g && SEV[z.cls]);
    log(`${zones.length} hazard zone polygon(s) nearby`);
    const regionM2 = regionAreaKm2(r) * 1e6;
    const center = turf.point(r.center);

    const inside: { cls: string; resp: string; m2: number; g: Polygon | MultiPolygon }[] = [];
    const near: { cls: string; resp: string; km: number; g: Polygon | MultiPolygon }[] = [];
    for (const z of zones) {
      const g = clipToRegion(r, z.g);
      const m2 = areaM2(g);
      if (g && m2 > 200) inside.push({ cls: z.cls, resp: z.resp, m2, g });
      else {
        let km = Infinity;
        try { km = Math.max(0, turf.pointToPolygonDistance(center, turf.feature(z.g), { units: "kilometers" })); } catch { /* skip */ }
        if (Number.isFinite(km)) near.push({ cls: z.cls, resp: z.resp, km, g: z.g });
      }
    }
    for (const z of inside.sort((a, b) => SEV[b.cls] - SEV[a.cls] || b.m2 - a.m2).slice(0, 12)) {
      const pct = (z.m2 / regionM2) * 100;
      emit({
        claim: `CAL FIRE ${z.cls} Fire Hazard Severity Zone (${RESP[z.resp] ?? z.resp}) covers ${pct < 1 ? "<1" : pct.toFixed(0)}% of the area: defensible-space and Chapter 7A ignition-resistant building rules apply`,
        geometry: z.g,
        source_url: "https://osfm.fire.ca.gov/what-we-do/community-wildfire-preparedness-and-mitigation/fire-hazard-severity-zones",
        source_type: "calfire_fhsz", confidence: 0.92, category: "wildfire", severity: +(SEV[z.cls] * (0.7 + 0.3 * Math.min(1, pct / 30))).toFixed(2),
        props: { hazardClass: z.cls, responsibility: z.resp, areaM2: Math.round(z.m2), shareOfArea: +(z.m2 / regionM2).toFixed(3), inside: true },
      });
    }
    // Nearest zone of each class outside the selection: draw a pin on the zone, not the whole polygon.
    const nearest = new Map<string, (typeof near)[number]>();
    for (const z of near) if (!nearest.has(z.cls) || nearest.get(z.cls)!.km > z.km) nearest.set(z.cls, z);
    for (const z of [...nearest.values()].sort((a, b) => a.km - b.km)) {
      const pin = turf.nearestPointOnLine(turf.polygonToLine(turf.feature(z.g)) as never, center).geometry.coordinates as [number, number];
      emit({
        claim: `Nearest ${z.cls} Fire Hazard Severity Zone is ${z.km.toFixed(1)} km from the area's center (${RESP[z.resp] ?? z.resp})`,
        geometry: { type: "Point", coordinates: pin },
        source_url: "https://osfm.fire.ca.gov/what-we-do/community-wildfire-preparedness-and-mitigation/fire-hazard-severity-zones",
        source_type: "calfire_fhsz", confidence: 0.9, category: "wildfire", severity: +(SEV[z.cls] * Math.max(0.1, 1 - z.km / 10) * 0.6).toFixed(2),
        props: { hazardClass: z.cls, responsibility: z.resp, distanceKm: +z.km.toFixed(2), inside: false, offRegion: true },
      });
    }
    const worst = inside.sort((a, b) => SEV[b.cls] - SEV[a.cls])[0];
    const closest = [...nearest.values()].sort((a, b) => a.km - b.km)[0];
    const share = Math.min(1, inside.reduce((s, z) => s + z.m2, 0) / regionM2);
    emit({
      claim: worst
        ? `Wildfire: ${Math.max(1, Math.round(share * 100))}% of the area is in a mapped Fire Hazard Severity Zone (worst: ${worst.cls})`
        : closest
          ? `Wildfire: no Fire Hazard Severity Zone inside the area; nearest is ${closest.cls} at ${closest.km.toFixed(1)} km`
          : "Wildfire: no Fire Hazard Severity Zone (Moderate or above) within ~8 km: urban, non-wildland area",
      geometry: { type: "Point", coordinates: r.center },
      source_url: "https://osfm.fire.ca.gov/what-we-do/community-wildfire-preparedness-and-mitigation/fire-hazard-severity-zones",
      source_type: "calfire_fhsz", confidence: 0.9, category: "wildfire",
      severity: worst ? +(SEV[worst.cls] * (0.6 + 0.4 * share)).toFixed(2) : closest ? +(SEV[closest.cls] * Math.max(0.05, 1 - closest.km / 8) * 0.5).toFixed(2) : 0.05,
      props: { areaLevel: true, worstClass: worst?.cls ?? null, shareInZone: +share.toFixed(3), nearestKm: closest ? +closest.km.toFixed(2) : null, nearestClass: closest?.cls ?? null, source: bay ? "MTC FHSZ 2025" : "CAL FIRE fhsz24_5" },
    });
  },
};
