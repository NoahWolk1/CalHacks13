import type { Worker } from "@/lib/types";
import { inRegion } from "@/lib/geo";
import { planTiles, readTileLayers } from "./tiles";

// Businesses & amenities from OpenStreetMap, read straight out of OpenFreeMap vector tiles
// (no key, no Overpass rate limits).
const GROUPS: Record<string, string> = {
  cafe: "food", restaurant: "food", fast_food: "food", bar: "food", bakery: "food", ice_cream: "food", beer: "food",
  grocery: "retail", shop: "retail", clothing_store: "retail", convenience: "retail", supermarket: "retail", alcohol_shop: "retail",
  school: "civic", college: "civic", library: "civic", hospital: "civic", town_hall: "civic", police: "civic", fire_station: "civic", place_of_worship: "civic",
  park: "green", playground: "green", garden: "green",
  railway: "transit", bus: "transit", ferry_terminal: "transit",
};

export const placesWorker: Worker = {
  id: "osm-places",
  name: "Street Scout",
  description: "Inventories businesses and amenities (cafés, restaurants, shops, schools, transit, parks) to measure competition, foot-traffic anchors and services.",
  vehicle: "rover",
  color: "#8cc27c",
  tools: ["http_get"],
  dataSources: ["OpenStreetMap via OpenFreeMap vector tiles"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    // POIs only exist at z14: big areas get a spread sample (tiles.ts), and the claim says so.
    const plan = planTiles(task.region.bbox, task.region.center, { maxZ: 14, maxTiles: 16 });
    if (plan.sampled) log(`Area spans ${plan.total} tiles; sampling ${plan.tiles.length}.`);
    const sampled = plan.sampled ? ` (sampled ${plan.tiles.length} of ${plan.total} map tiles, so a partial count)` : "";
    log(`Reading ${plan.tiles.length} map tiles…`);
    const { features } = await readTileLayers(plan, ["poi"], signal);
    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    const named: { name: string; cls: string; sub: string; lng: number; lat: number }[] = [];
    for (const f of features.poi) {
      if (f.geometry.type !== "Point") continue;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      if (!inRegion(task.region, lng, lat)) continue;
      const props = f.properties ?? {};
      const cls = String(props.class ?? "other"), sub = String(props.subclass ?? cls);
      // Unnamed POIs are mostly street furniture (bike racks, bollards, bins): skip them in the tally.
      if (!props.name) continue;
      // Tiles carry a buffer past their edges, so the same POI shows up in neighbouring tiles.
      const key = `${props.name}@${lng.toFixed(4)},${lat.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts[sub] = (counts[sub] ?? 0) + 1;
      named.push({ name: String(props.name), cls, sub, lng, lat });
    }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    log(`${total} points of interest found`);
    if (!total) {
      // Say so: "nothing mapped" is an answer (and on a sampled area, a partial one).
      emit({
        claim: `No named businesses or amenities mapped in OpenStreetMap here${sampled}. OSM coverage of shops is thin in many rural areas.`,
        geometry: { type: "Point", coordinates: task.region.center },
        source_url: "https://www.openstreetmap.org", source_type: "osm_poi_aggregate", confidence: plan.sampled ? 0.4 : 0.6, category: "places",
        severity: 0.1, props: { areaLevel: true, counts, sampledTiles: plan.tiles.length, totalTiles: plan.total },
      });
      return;
    }
    const top = Object.entries(counts).sort((p, q) => q[1] - p[1]).slice(0, 8);
    emit({
      claim: `${total} named businesses/amenities${sampled}. Most common: ${top.map(([k, n]) => `${k.replace(/_/g, " ")} (${n})`).join(", ")}`,
      geometry: { type: "Point", coordinates: task.region.center },
      source_url: "https://www.openstreetmap.org", source_type: "osm_poi_aggregate", confidence: 0.75, category: "places",
      severity: 0.3, props: { areaLevel: true, counts },
    });
    // Pin a representative, mixed sample so the map shows texture without drowning it.
    // "coffee shop" should surface cafés, not every shop: match the specific subclass (with a few aliases).
    const q = (task.question ?? "").toLowerCase().replace(/coffee|café/g, "cafe").replace(/\bbars?\b|pubs?\b/g, "bar");
    const asked = (p: { cls: string; sub: string }) => !!q && [p.sub, p.cls].some((k) => k !== "shop" && new RegExp(`\\b${k.replace(/_/g, " ").replace(/[^a-z0-9 ]/gi, "")}`).test(q));
    const scored = named.map((p) => ({ p, s: (asked(p) ? 2 : 0) + (GROUPS[p.cls] ? 1 : 0) + Math.random() * 0.5 }));
    scored.sort((m, n) => n.s - m.s);
    for (const { p } of scored.slice(0, 30)) {
      emit({
        claim: `${p.name} (${p.sub.replace(/_/g, " ")})`,
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        source_url: `https://www.openstreetmap.org/search?query=${encodeURIComponent(p.name)}#map=19/${p.lat}/${p.lng}`,
        source_type: "osm_poi", confidence: 0.7, category: "places", severity: 0.2,
        props: { class: p.cls, subclass: p.sub, group: GROUPS[p.cls] ?? "other" },
      });
    }
  },
};
