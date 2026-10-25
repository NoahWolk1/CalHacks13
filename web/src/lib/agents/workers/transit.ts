import type { Worker } from "@/lib/types";
import type { MultiLineString, Position } from "geojson";
import * as turf from "@turf/turf";
import { regionWkt, touchesSF } from "@/lib/geo";
import { clamp01, datasetUrl, day, fmt, num, pt, soda, title, within } from "./sfdata";

// SFMTA Muni stops + simplified route patterns (DataSF), plus BART's SF stations (static: they don't move).
const STOPS = "i28k-bkz6";
const ROUTES = "9exe-acju";
const BART: [name: string, lng: number, lat: number][] = [
  ["Embarcadero", -122.39702, 37.792874], ["Montgomery St", -122.401066, 37.789405], ["Powell St", -122.407974, 37.784471],
  ["Civic Center/UN Plaza", -122.414123, 37.779732], ["16th St Mission", -122.419694, 37.765062], ["24th St Mission", -122.418143, 37.75247],
  ["Glen Park", -122.433817, 37.733064], ["Balboa Park", -122.447506, 37.721585], ["Daly City", -122.469081, 37.706121],
];
// Muni Metro rail, Rapid and the 10-minute-or-better "frequent" local network (SFMTA service tiers, approx.).
const FREQUENT = new Set(["1", "5", "7", "8", "14", "22", "24", "28", "29", "30", "38", "44", "47", "49"]);
const tier = (route: string) => (/^(J|K|L|M|N|T|F|KT|S|C|PM|PH)$/.test(route) ? "rail" : /R$/.test(route) ? "rapid" : FREQUENT.has(route) ? "frequent" : "local");
const WALK_M = 800; // ~10-minute walk

interface Stop { stopid: string; stopname?: string; shelter?: string; accessibilitymask?: string; latitude?: string; longitude?: string }

export const transitWorker: Worker = {
  id: "sf-transit",
  name: "Transit Scout",
  description: "Public transit access: Muni stops in the area, Muni lines crossing it (rail, Rapid, frequent vs. local as a frequency proxy, drawn as route lines), and BART stations within a 10-minute walk. San Francisco only.",
  vehicle: "rover",
  color: "#7fb8d6",
  tools: ["http_get"],
  dataSources: ["SFMTA Muni Stops (DataSF i28k-bkz6)", "SFMTA Muni Simple Routes (DataSF 9exe-acju)", "BART station locations"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!touchesSF(r)) { log("Outside San Francisco: no Muni data here."); return; }
    log("Loading Muni stops and routes…");
    const [stops, routes] = await Promise.all([
      soda<Stop[]>(STOPS, { $select: "stopid, stopname, shelter, accessibilitymask, latitude, longitude", $where: within("shape", r), $limit: "1000" }, signal),
      soda<{ route_name?: string; direction?: string; g?: MultiLineString }[]>(ROUTES, { $select: "route_name, direction, simplify_preserve_topology(shape, 0.00005) as g", $where: `intersects(shape, '${regionWkt(r)}')`, $limit: "300" }, signal),
    ]);
    const lines = new Map<string, Position[][]>();
    const [a, b, c, d] = r.bbox, pad = 0.001;
    const inBox = ([x, y]: Position) => x >= a - pad && x <= c + pad && y >= b - pad && y <= d + pad;
    for (const x of routes) {
      if (!x.route_name || lines.has(x.route_name)) continue; // one direction is enough to draw
      lines.set(x.route_name, (x.g?.coordinates ?? []).map((l) => l.filter(inBox)).filter((l) => l.length >= 2));
    }
    const names = [...lines.keys()].sort((p, q) => parseInt(p) - parseInt(q) || p.localeCompare(q));
    const byTier = { rail: [] as string[], rapid: [] as string[], frequent: [] as string[], local: [] as string[] };
    for (const n of names) byTier[tier(n)].push(n);

    const bart = BART.map(([name, lng, lat]) => {
      let dist = 0;
      try { dist = Math.max(0, turf.pointToPolygonDistance([lng, lat], r.polygon as never, { units: "meters" })); } catch { dist = turf.distance([lng, lat], r.center, { units: "meters" }); }
      return { name, lng, lat, dist };
    }).filter((s) => s.dist <= WALK_M).sort((p, q) => p.dist - q.dist);
    const sheltered = stops.filter((s) => num(s.shelter) > 0).length;
    log(`${stops.length} stops, ${names.length} Muni lines, ${bart.length} BART stations within ${WALK_M} m`);
    const score = clamp01((byTier.rail.length * 2 + byTier.rapid.length * 1.5 + byTier.frequent.length + byTier.local.length * 0.4 + bart.length * 3) / 20);
    emit({
      claim: `${stops.length} Muni stops and ${names.length} Muni lines (${byTier.rail.length} rail, ${byTier.rapid.length} Rapid, ${byTier.frequent.length} frequent, ${byTier.local.length} local: ${names.slice(0, 12).join(", ")}${names.length > 12 ? "…" : ""}). BART: ${bart.length ? bart.map((s) => `${s.name}${s.dist ? ` (${fmt(s.dist)} m)` : " (in area)"}`).join(", ") : `none within ${WALK_M} m`}`,
      geometry: pt(...r.center), source_url: datasetUrl(ROUTES), source_type: "transit_aggregate", observed_at: day(new Date().toISOString()),
      confidence: 0.85, category: "transit", severity: clamp01(0.25 + score * 0.6),
      props: { areaLevel: true, stops: stops.length, shelteredStops: sheltered, lines: names, rail: byTier.rail, rapid: byTier.rapid, frequent: byTier.frequent, local: byTier.local, bartStations: bart.map((s) => ({ name: s.name, distanceM: Math.round(s.dist) })), transitScore: +score.toFixed(2) },
    });
    for (const s of bart) {
      emit({
        claim: `BART ${s.name} station${s.dist ? `, ${fmt(s.dist)} m from the area` : " is inside the area"}: regional rail to SFO, Oakland, East Bay`,
        geometry: pt(s.lng, s.lat), source_url: "https://www.bart.gov/stations", source_type: "bart_station", confidence: 0.95, category: "transit",
        severity: s.dist ? 0.55 : 0.75, props: { bart: true, station: s.name, distanceM: Math.round(s.dist) },
      });
    }
    // Route lines, best tiers first.
    const drawn = [...byTier.rail, ...byTier.rapid, ...byTier.frequent, ...byTier.local].slice(0, 10);
    for (const n of drawn) {
      const l = lines.get(n);
      if (!l?.length) continue;
      const t = tier(n);
      emit({
        claim: `Muni ${t === "rail" ? "Metro/rail" : t === "rapid" ? "Rapid" : t === "frequent" ? "frequent-network" : "local"} line ${n} runs through the area`,
        geometry: { type: "MultiLineString", coordinates: l }, source_url: `https://www.sfmta.com/routes/${n.toLowerCase()}`, source_type: "muni_route",
        confidence: 0.9, category: "transit", severity: t === "local" ? 0.3 : 0.45, props: { route: n, tier: t },
      });
    }
    // A spread-out sample of stops (every k-th) so the map shows coverage without 60 pins.
    const k = Math.max(1, Math.ceil(stops.length / 10));
    for (const s of stops.filter((_, i) => i % k === 0).slice(0, 10)) {
      if (!num(s.latitude)) continue;
      emit({
        claim: `Muni stop: ${title(s.stopname?.replace(/\s+[NESW]{1,2}-[A-Z]{2}(\/[A-Z]{2})?$/, "").replace(/&/g, " & "))}${num(s.shelter) ? " (sheltered)" : ""}`,
        geometry: pt(s.longitude!, s.latitude!), source_url: `https://www.sfmta.com/stops/${s.stopid}`, source_type: "muni_stop",
        confidence: 0.9, category: "transit", severity: 0.2, props: { stopId: s.stopid, sheltered: num(s.shelter) > 0 },
      });
    }
  },
};
