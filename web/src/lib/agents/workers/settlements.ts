import type { Worker } from "@/lib/types";
import { inRegion } from "@/lib/geo";
import { planTiles, readTileLayers } from "./tiles";

// Cities, towns, villages and hamlets from the OpenMapTiles `place` layer in OpenFreeMap vector tiles
// (no key, global, no Overpass). Lower zooms drop small places, so pick the highest zoom whose tile
// count fits the budget. Measured (DR Congo, Oct 2026): villages are near-complete from z10, hamlets
// appear from z11; z12+ adds only urban quarters/neighbourhoods, which aren't settlements.
const MAX_TILES = 64;
const MAX_Z = 12;
const MIN_Z = 6;
const HAMLET_Z = 11;
const VILLAGE_Z = 10;

// Largest first: the pin order and the summary breakdown follow it.
const CLASSES = ["city", "town", "village", "suburb", "hamlet", "isolated_dwelling"] as const;
const PLURAL: Record<string, string> = { city: "cities", town: "towns", village: "villages", suburb: "suburbs", hamlet: "hamlets", isolated_dwelling: "isolated dwellings" };
const SEVERITY: Record<string, number> = { city: 0.6, town: 0.5, village: 0.35, suburb: 0.3, hamlet: 0.2, isolated_dwelling: 0.15 };

export const settlementsWorker: Worker = {
  id: "osm-settlements",
  name: "Settlement Scout",
  description: "Counts and pins populated places (cities, towns, villages, hamlets, suburbs) anywhere in the world from OpenStreetMap, with a breakdown by size class.",
  vehicle: "drone",
  color: "#e0b26a",
  tools: ["http_get"],
  dataSources: ["OpenStreetMap place layer via OpenFreeMap vector tiles"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    const plan = planTiles(r.bbox, r.center, { maxZ: MAX_Z, minZ: MIN_Z, maxTiles: MAX_TILES });
    const { z, tiles } = plan;
    log(`Reading ${tiles.length}${plan.sampled ? ` of ${plan.total}` : ""} map tiles at zoom ${z}…`);
    const { features, failed } = await readTileLayers(plan, ["place"], signal);
    const seen = new Set<string>();
    const places: { name: string; cls: string; rank: number; lng: number; lat: number }[] = [];
    for (const f of features.place) {
      if (f.geometry.type !== "Point") continue;
      const p = f.properties ?? {};
      const cls = String(p.class ?? "");
      if (!(CLASSES as readonly string[]).includes(cls)) continue;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      if (!inRegion(r, lng, lat)) continue;
      const name = String(p["name:latin"] ?? p.name ?? "").trim();
      // Tiles carry a buffer past their edges, so the same place shows up in neighbouring tiles.
      const key = `${name}@${lng.toFixed(3)},${lat.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      places.push({ name, cls, rank: Number(p.rank ?? 99), lng, lat });
    }
    if (failed) log(`${failed} of ${tiles.length} tiles failed to load`);
    log(`${places.length} settlements found`);
    const counts: Record<string, number> = {};
    for (const p of places) counts[p.cls] = (counts[p.cls] ?? 0) + 1;
    const order = (cls: string) => CLASSES.indexOf(cls as (typeof CLASSES)[number]);
    places.sort((p, q) => order(p.cls) - order(q.cls) || p.rank - q.rank || p.name.localeCompare(q.name));
    // Honest about what this zoom can see: below z11 the tiles drop hamlets, below z10 most villages.
    const partial = plan.sampled ? `only ${tiles.length} of ${plan.total} map tiles were sampled` : z < VILLAGE_Z ? "most villages and hamlets are omitted at this scale, so this undercounts heavily" : z < HAMLET_Z ? "hamlets are omitted at this scale" : "";
    const incomplete = partial || failed > 0;
    const breakdown = CLASSES.filter((k) => counts[k]).map((k) => `${counts[k]} ${counts[k] === 1 ? k.replace(/_/g, " ") : PLURAL[k]}`).join(", ");
    const largest = places.filter((p) => p.name).slice(0, 3).map((p) => `${p.name} (${p.cls})`).join(", ");
    emit({
      claim: places.length
        ? `${incomplete ? "At least " : ""}${places.length} mapped settlements in the area: ${breakdown}. Largest: ${largest}.${partial ? ` Note: ${partial}.` : ""}${failed ? ` ${failed} of ${tiles.length} map tiles failed to load.` : ""} OpenStreetMap coverage varies; rural places may be unmapped.`
        : `No settlements mapped in OpenStreetMap inside this area${partial ? ` (${partial})` : ""}`,
      geometry: { type: "Point", coordinates: r.center },
      source_url: `https://www.openstreetmap.org/#map=${Math.max(z - 1, 5)}/${r.center[1]}/${r.center[0]}`,
      source_type: "osm_place_aggregate", confidence: incomplete ? 0.65 : 0.8, category: "settlement",
      severity: +Math.min(0.6, 0.2 + places.length / 500).toFixed(2),
      props: { areaLevel: true, count: places.length, counts, zoom: z, tiles: tiles.length, complete: !incomplete },
    });
    for (const p of places.filter((x) => x.name).slice(0, 40)) {
      emit({
        claim: `${p.name} (${p.cls.replace(/_/g, " ")})`,
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        source_url: `https://www.openstreetmap.org/#map=14/${p.lat}/${p.lng}`,
        source_type: "osm_place", confidence: 0.75, category: "settlement", severity: SEVERITY[p.cls] ?? 0.2,
        props: { class: p.cls, name: p.name },
      });
    }
  },
};
