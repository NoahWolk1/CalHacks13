import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import { distanceM, inRegion, regionAreaKm2, sampleGrid } from "@/lib/geo";
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import { arcgisCount, arcgisQuery, bboxIntersects, clipToRegion, osmTileLayers } from "./kit";

// Sea-level rise exposure.
// - Inundation: MTC/BCDC Bay Area sea-level-rise layers (the "SLR with PDAs/TOCs" web map; the 150 cm
//   layer is the Bay Shoreline "4.9 ft total water level" USGS-based extent). Bay Area only.
// - Which places get wet: named OpenStreetMap POIs (and OSM water, to measure land only) from OpenFreeMap tiles.
// - Today's water: nearest NOAA CO-OPS tide gauge (US coasts), level vs Mean Higher High Water.
const MTC = "https://services3.arcgis.com/i2dkYWmb4wHvYPda/arcgis/rest/services/SLR_with_PDAs_TOCs_Map_WFL1/FeatureServer";
const SCENARIOS = [
  { cm: 50, ft: 1.6, layer: 10, sev: 0.9 },
  { cm: 75, ft: 2.5, layer: 12, sev: 0.8 },
  { cm: 150, ft: 4.9, layer: 13, sev: 0.6 },
];
const BAY: [number, number, number, number] = [-123.63, 37.06, -121.2, 38.78];
const COOPS = "https://api.tidesandcurrents.noaa.gov";

type Poly = Polygon | MultiPolygon;
const polysOf = (g: Poly): Position[][][] => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

export const seaLevelWorker: Worker = {
  id: "sea-level-rise",
  name: "Tide Line",
  description: "Projects sea-level-rise flooding (1.6 / 2.5 / 4.9 ft scenarios) over the area, measures the share of land and the named places that would be underwater, and reads today's water level at the nearest NOAA tide gauge.",
  vehicle: "boat",
  color: "#4fb2c4",
  tools: ["http_get"],
  dataSources: ["MTC/BCDC Bay Area sea level rise inundation layers", "NOAA CO-OPS tide gauges", "OpenStreetMap places + water via OpenFreeMap"],
  coverage: "SF Bay Area (inundation); US coasts (tide gauge)",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    const center = r.center;
    const tide = readTide(center, signal).catch((e) => { log(`Tide gauge: ${(e as Error).message}`); return null; });

    if (bboxIntersects(r.bbox, BAY)) {
      log("Checking Bay Area sea-level-rise inundation layers (50 / 75 / 150 cm)…");
      const counts = await Promise.all(SCENARIOS.map((s) => arcgisCount(`${MTC}/${s.layer}`, r.bbox, signal).catch(() => -1)));
      const wet = SCENARIOS.filter((_, i) => counts[i] > 0);
      if (counts.every((n) => n < 0)) log("Inundation service unreachable.");
      // A failed count or geometry request is unknown, never a zero-flood scenario.
      const completed = new Set(SCENARIOS.filter((_, i) => counts[i] === 0).map((s) => s.cm));
      const clipped = new Map<number, Poly>();
      await Promise.all(wet.map(async (s) => {
        const feats = await arcgisQuery<Poly>(`${MTC}/${s.layer}`, r.bbox, { outFields: "FID", signal, timeoutMs: 25_000 }).catch((e) => { log(`${s.cm} cm layer: ${(e as Error).message}`); return null; });
        if (!feats?.length) return; // a positive count without geometry cannot establish absence
        const parts: Position[][][] = [];
        for (const f of feats) {
          const g = f.geometry ? clipToRegion(r, f.geometry) : null;
          if (g) parts.push(...polysOf(g));
        }
        if (parts.length) clipped.set(s.cm, parts.length === 1 ? { type: "Polygon", coordinates: parts[0] } : { type: "MultiPolygon", coordinates: parts });
        completed.add(s.cm);
      }));
      const checked = SCENARIOS.filter((s) => completed.has(s.cm));
      const unavailable = SCENARIOS.filter((s) => !completed.has(s.cm));
      const missingNote = unavailable.length ? ` Unavailable scenarios: ${unavailable.map((s) => `${s.ft} ft`).join(", ")}; flooding at these levels is unknown.` : "";
      if (unavailable.length) log(missingNote.trim());

      if (!clipped.size) {
        if (checked.length) {
          emit({
            claim: unavailable.length
              ? `No sea-level-rise inundation mapped in the successfully checked scenarios (${checked.map((s) => `${s.ft} ft`).join(", ")}).${missingNote}`
              : "No sea-level-rise inundation mapped in this area even at 4.9 ft (150 cm) of rise: ground is above the Bay Area shoreline flood extents",
            geometry: { type: "Point", coordinates: center },
            source_url: "https://www.adaptingtorisingtides.org/maps-and-data-products/", source_type: "bay_slr_inundation", confidence: 0.85,
            category: "slr", severity: 0.05, props: { areaLevel: true, scenariosFlooded: [], landShare: Object.fromEntries(checked.map((s) => [s.cm, 0])), unavailableScenariosCm: unavailable.map((s) => s.cm) },
          });
        }
      } else {
        // Separate land from water already in the Bay: sample points, drop the ones on OSM water.
        log("Reading OpenStreetMap water and places…");
        const osm = await osmTileLayers(r, ["water", "poi"], signal).catch(() => ({ water: [], poi: [] }) as Record<string, Feature[]>);
        const water = (osm.water ?? []).filter((f) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") as Feature<Poly>[];
        const onWater = (p: [number, number]) => water.some((w) => turf.booleanPointInPolygon(p, w));
        const grid = sampleGrid(r, 400);
        const land = grid.filter((p) => !onWater(p));
        const landShare: Record<number, number> = {};
        for (const s of checked) {
          const g = clipped.get(s.cm);
          landShare[s.cm] = g && land.length ? land.filter((p) => turf.booleanPointInPolygon(p, g)).length / land.length : 0;
        }
        const landKm2 = regionAreaKm2(r) * (grid.length ? land.length / grid.length : 1);

        for (const s of SCENARIOS) {
          const g = clipped.get(s.cm);
          if (!g) continue;
          const pct = Math.round(landShare[s.cm] * 100);
          emit({
            claim: `${s.ft} ft (${s.cm} cm) sea-level rise: ${pct ? `${pct}% of the land here` : "only shoreline/water edges here"} would flood`,
            geometry: g,
            source_url: "https://www.adaptingtorisingtides.org/maps-and-data-products/", source_type: "bay_slr_inundation", confidence: 0.8,
            category: "slr", severity: +(s.sev * Math.min(1, 0.35 + landShare[s.cm] * 2)).toFixed(2),
            props: { scenarioCm: s.cm, scenarioFt: s.ft, landShareFlooded: +landShare[s.cm].toFixed(3) },
          });
        }

        // Named places on land that go under at ~2.5 ft (else the lowest scenario that floods land).
        const pick = SCENARIOS.find((s) => s.cm === 75 && landShare[75] > 0) ?? SCENARIOS.find((s) => landShare[s.cm] > 0);
        const pg = pick && clipped.get(pick.cm);
        const placesWet: string[] = [];
        if (pick && pg) {
          const seenP = new Set<string>();
          for (const f of osm.poi ?? []) {
            const name = f.properties?.name;
            if (f.geometry.type !== "Point" || !name || seenP.has(String(name))) continue;
            const p = f.geometry.coordinates as [number, number];
            if (!inRegion(r, p[0], p[1]) || !turf.booleanPointInPolygon(p, pg) || onWater(p)) continue;
            seenP.add(String(name));
            placesWet.push(String(name));
            if (placesWet.length > 12) continue;
            const sub = String(f.properties?.subclass ?? f.properties?.class ?? "place").replace(/_/g, " ");
            emit({
              claim: `${name} (${sub}) sits inside the ${pick.ft} ft sea-level-rise flood extent`,
              geometry: { type: "Point", coordinates: p },
              source_url: `https://www.openstreetmap.org/search?query=${encodeURIComponent(String(name))}#map=19/${p[1]}/${p[0]}`,
              source_type: "bay_slr_inundation", confidence: 0.7, category: "slr", severity: +(pick.sev * 0.8).toFixed(2),
              props: { scenarioCm: pick.cm, scenarioFt: pick.ft, place: name, subclass: sub, atRisk: true },
            });
          }
        }
        const first = checked.find((s) => landShare[s.cm] > 0.01);
        const shares = checked.map((s) => `${s.ft} ft ${Math.round(landShare[s.cm] * 100)}%`).join(", ");
        emit({
          claim: (first
            ? `Sea-level rise exposure: land floods in the ${first.ft} ft mapped scenario. Share of land flooded: ${shares}${placesWet.length ? `. Places in the ${pick!.ft} ft zone include ${placesWet.slice(0, 4).join(", ")}` : ""}`
            : unavailable.length
              ? `Share of land flooded in the successfully checked scenarios: ${shares}.`
              : `Sea-level rise reaches only the water's edge here; under 1% of the ~${landKm2.toFixed(2)} km² of land floods even at 4.9 ft`) + missingNote,
          geometry: { type: "Point", coordinates: center },
          source_url: "https://www.adaptingtorisingtides.org/maps-and-data-products/", source_type: "bay_slr_inundation", confidence: 0.8,
          category: "slr", severity: first ? +(first.sev * Math.min(1, 0.4 + Math.max(...Object.values(landShare)) * 1.5)).toFixed(2) : 0.15,
          props: { areaLevel: true, firstFloodFt: first && !unavailable.some((s) => s.cm < first.cm) ? first.ft : null, landShare, unavailableScenariosCm: unavailable.map((s) => s.cm), placesAtRisk: placesWet.slice(0, 20) },
        });
      }
    } else {
      log("Outside the SF Bay Area: no inundation layer; reporting the tide gauge only.");
    }

    const t = await tide;
    if (t) {
      const above = t.levelFt > 0;
      emit({
        claim: `NOAA tide gauge ${t.name} (${t.km.toFixed(0)} km away): water now ${Math.abs(t.levelFt).toFixed(2)} ft ${above ? "ABOVE" : "below"} mean higher high water${t.nextHigh ? `; next high tide ${t.nextHigh.v >= 0 ? "+" : ""}${t.nextHigh.v.toFixed(2)} ft vs MHHW at ${t.nextHigh.t.slice(11)}` : ""}`,
        geometry: { type: "Point", coordinates: [t.lng, t.lat] },
        source_url: `https://tidesandcurrents.noaa.gov/stationhome.html?id=${t.id}`, source_type: "noaa_coops", observed_at: t.at, confidence: 0.95,
        category: "slr", severity: +Math.min(0.9, Math.max(0.05, 0.3 + 0.4 * Math.max(t.levelFt, t.nextHigh?.v ?? -9))).toFixed(2),
        props: { tideGauge: true, stationId: t.id, levelFtVsMHHW: t.levelFt, nextHigh: t.nextHigh, distanceKm: Math.round(t.km), offRegion: !inRegion(r, t.lng, t.lat) },
      });
    }
  },
};

interface Station { id: string; name: string; lat: number; lng: number }

async function readTide(center: [number, number], signal: AbortSignal) {
  const list = await getJson<{ stations: Station[] }>(`${COOPS}/mdapi/prod/webapi/stations.json?type=waterlevels`, { signal, timeoutMs: 12_000 });
  const near = list.stations.map((s) => ({ ...s, km: distanceM(center, [s.lng, s.lat]) / 1000 })).sort((a, b) => a.km - b.km)[0];
  if (!near || near.km > 60) return null;
  const base = `${COOPS}/api/prod/datagetter?station=${near.id}&datum=MHHW&units=english&time_zone=lst_ldt&format=json`;
  const lvl = await getJson<{ data?: { t: string; v: string }[] }>(`${base}&product=water_level&date=latest`, { signal, timeoutMs: 10_000 });
  const last = lvl.data?.[lvl.data.length - 1];
  if (!last || last.v === "") return null;
  const now = last.t; // "YYYY-MM-DD HH:mm", station local time
  const pred = await getJson<{ predictions?: { t: string; v: string; type: string }[] }>(
    `${base}&product=predictions&interval=hilo&begin_date=${encodeURIComponent(now.replace(/-/g, ""))}&range=36`, { signal, timeoutMs: 10_000 },
  ).catch(() => ({ predictions: [] }));
  const hi = (pred.predictions ?? []).find((p) => p.type === "H" && p.t > now);
  return { id: near.id, name: near.name, lat: near.lat, lng: near.lng, km: near.km, levelFt: +last.v, at: now, nextHigh: hi ? { t: hi.t, v: +hi.v } : null };
}
