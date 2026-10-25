import type { Worker } from "@/lib/types";
import type { MultiPolygon, Polygon } from "geojson";
import { areaM2, arcgisQuery, clipToRegion } from "./kit";
import { regionAreaKm2 } from "@/lib/geo";

// California Geological Survey regulatory hazard zones (Seismic Hazards Mapping Act + tsunami planning).
// Hosted by CGS on ArcGIS Online. Public, no key, California only.
const CGS = "https://services2.arcgis.com/zr3KAIbsRSUyARHG/ArcGIS/rest/services";
const LAYERS = [
  { key: "liquefaction", url: `${CGS}/CGS_Liquefaction_Zones/FeatureServer/0`, label: "Liquefaction Zone", sev: 0.8,
    what: "soils that may liquefy in strong shaking; site-specific geotechnical report required for new construction" },
  { key: "landslide", url: `${CGS}/CGS_Landslide_Zones/FeatureServer/0`, label: "Earthquake-Induced Landslide Zone", sev: 0.75,
    what: "slopes that may fail in strong shaking; geotechnical review required" },
  { key: "tsunami", url: `${CGS}/CA_Tsunami_Hazard_Area/FeatureServer/0`, label: "Tsunami Hazard Area", sev: 0.7,
    what: "evacuation zone for a maximum considered tsunami" },
] as const;

const CA_BOUNDS: [number, number, number, number] = [-124.5, 32.5, -114.1, 42.1];

export const groundHazardsWorker: Worker = {
  id: "cgs-ground-hazards",
  name: "Ground Truth",
  description: "Maps official California Geological Survey hazard zones: liquefaction, earthquake-induced landslide, and tsunami evacuation areas, with the share of the selection inside each.",
  vehicle: "rover",
  color: "#a3b06a",
  tools: ["http_get"],
  dataSources: ["CGS Seismic Hazard Zones (liquefaction, landslide)", "CGS Tsunami Hazard Areas"],
  coverage: "California",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    const [a, b, c, d] = r.bbox;
    if (c < CA_BOUNDS[0] || a > CA_BOUNDS[2] || d < CA_BOUNDS[1] || b > CA_BOUNDS[3]) {
      log("Outside California: CGS hazard zones don't cover this area.");
      return;
    }
    const regionM2 = regionAreaKm2(r) * 1e6;
    log("Querying CGS liquefaction, landslide and tsunami zones…");
    const results = await Promise.all(LAYERS.map(async (L) => {
      // Tsunami layer has a polygon for "outside hazard area" too; only keep the evacuation zone.
      const where = L.key === "tsunami" ? "Evacuate LIKE 'Yes%'" : "1=1";
      const feats = await arcgisQuery<Polygon | MultiPolygon>(L.url, r.bbox, { where, offset: 0.00003, signal }).catch((e) => {
        log(`${L.label}: ${(e as Error).message}`);
        return null;
      });
      return { L, feats };
    }));
    const unavailable = results.filter(({ feats }) => feats === null).map(({ L }) => L.key);
    if (unavailable.length === LAYERS.length) throw new Error("CGS hazard data unavailable: all layer queries failed");
    const summary: Record<string, number> = {};
    let emitted = 0;
    for (const { L, feats } of results) {
      if (!feats) continue;
      let total = 0;
      const pieces: { g: Polygon | MultiPolygon; m2: number; p: Record<string, unknown> }[] = [];
      for (const f of feats) {
        const g = f.geometry ? clipToRegion(r, f.geometry) : null;
        const m2 = areaM2(g);
        if (!g || m2 < 100) continue;
        total += m2;
        pieces.push({ g, m2, p: f.properties ?? {} });
      }
      const share = Math.min(1, total / regionM2);
      summary[L.key] = +share.toFixed(3);
      log(`${L.label}: ${pieces.length} polygon(s), ${(share * 100).toFixed(0)}% of area`);
      for (const { g, m2, p } of pieces.sort((x, y) => y.m2 - x.m2).slice(0, 8)) {
        const pct = (m2 / regionM2) * 100;
        const quad = p.QUAD_NAME ? ` (${p.QUAD_NAME} quad, released ${p.RELEASED})` : p.County ? ` (${p.County} County)` : "";
        emit({
          claim: `CGS ${L.label}: ${L.what}. Covers ${Math.round(m2).toLocaleString()} m² (${pct < 1 ? "<1" : pct.toFixed(0)}% of the area)${quad}`,
          geometry: g,
          source_url: String(p.REPORTLINK ?? p.Map_Link ?? "https://maps.conservation.ca.gov/cgs/EQZApp/app/"),
          source_type: "cgs_hazard_zone", observed_at: typeof p.RELEASED === "string" ? p.RELEASED : undefined,
          confidence: 0.95, category: L.key, severity: +(L.sev * (0.6 + 0.4 * Math.min(1, share * 2))).toFixed(2),
          props: { hazard: L.key, zone: L.label, areaM2: Math.round(m2), shareOfArea: +(m2 / regionM2).toFixed(3), quad: p.QUAD_NAME, released: p.RELEASED, mapPdf: p.GEOPDFLINK ?? p.Map_Link },
        });
        emitted++;
      }
    }
    const parts = LAYERS.filter((L) => summary[L.key] != null).map((L) => `${L.key} ${summary[L.key] ? `${Math.max(1, Math.round(summary[L.key] * 100))}%` : "none"}`);
    const worst = Math.max(0, ...LAYERS.map((L) => (summary[L.key] ? L.sev : 0)));
    const missingNote = unavailable.length ? ` Unavailable hazard layers: ${unavailable.join(", ")}; their exposure is unknown.` : "";
    emit({
      claim: (emitted
        ? `CGS regulatory hazard zones cover parts of this area (share of area: ${parts.join(", ")}). Building here triggers geotechnical investigation under the Seismic Hazards Mapping Act.`
        : `No CGS hazard zone intersects this area in the successfully checked layers (${parts.join(", ")}).`) + missingNote,
      geometry: { type: "Point", coordinates: r.center },
      source_url: "https://maps.conservation.ca.gov/cgs/EQZApp/app/", source_type: "cgs_hazard_zone", confidence: unavailable.length ? 0.6 : 0.9,
      category: emitted ? Object.entries(summary).sort((x, y) => y[1] - x[1])[0][0] : "liquefaction",
      severity: emitted ? +(worst * 0.85).toFixed(2) : 0.1,
      props: { areaLevel: true, shareOfArea: summary, unavailableHazards: unavailable,
        ...Object.fromEntries(LAYERS.map(({ key }) => [key, summary[key] == null ? null : summary[key] > 0])),
      },
    });
  },
};
