import type { Worker } from "@/lib/types";
import { getBuffer, getJson } from "@/lib/http";
import { inRegion } from "@/lib/geo";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

// Businesses & amenities from OpenStreetMap, read straight out of OpenFreeMap vector tiles
// (no key, no Overpass rate limits).
// The bare /planet/{z}/{x}/{y} path answers 200 with an empty body; real tiles live under a dated
// build path that the TileJSON names, so resolve the template first.
const TILEJSON = "https://tiles.openfreemap.org/planet";
const Z = 14;
const tileTemplate = async (signal: AbortSignal) =>
  (await getJson<{ tiles: string[] }>(TILEJSON, { signal, timeoutMs: 8000 })).tiles[0];

const lng2x = (lng: number) => Math.floor(((lng + 180) / 360) * 2 ** Z);
const lat2y = (lat: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z); };

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
  color: "#34d399",
  tools: ["http_get"],
  dataSources: ["OpenStreetMap via OpenFreeMap vector tiles"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const [a, b, c, d] = task.region.bbox;
    const xs = [lng2x(a), lng2x(c)], ys = [lat2y(d), lat2y(b)];
    const tiles: [number, number][] = [];
    for (let x = xs[0]; x <= xs[1]; x++) for (let y = ys[0]; y <= ys[1]; y++) tiles.push([x, y]);
    if (tiles.length > 16) {
      log(`Area spans ${tiles.length} tiles; sampling the central 16.`);
      const [cx, cy] = [lng2x(task.region.center[0]), lat2y(task.region.center[1])];
      tiles.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy)).splice(16);
    }
    const template = await tileTemplate(signal);
    log(`Reading ${tiles.length} map tiles…`);
    const counts: Record<string, number> = {};
    const seen = new Set<string>();
    const named: { name: string; cls: string; sub: string; lng: number; lat: number }[] = [];
    await Promise.all(tiles.map(async ([x, y]) => {
      const buf = await getBuffer(template.replace("{z}", String(Z)).replace("{x}", String(x)).replace("{y}", String(y)), { signal }).catch(() => null);
      if (!buf?.byteLength) return;
      const layer = new VectorTile(new PbfReader(new Uint8Array(buf))).layers["poi"];
      if (!layer) return;
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i).toGeoJSON(x, y, Z);
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
    }));
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    log(`${total} points of interest found`);
    if (!total) return;
    const top = Object.entries(counts).sort((p, q) => q[1] - p[1]).slice(0, 8);
    emit({
      claim: `${total} named businesses/amenities. Most common: ${top.map(([k, n]) => `${k.replace(/_/g, " ")} (${n})`).join(", ")}`,
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
