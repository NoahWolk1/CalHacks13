import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import * as turf from "@turf/turf";
import type { Polygon, MultiPolygon } from "geojson";

// Element84 Earth Search (public STAC over the AWS open-data Sentinel-2 L2A + Landsat C2 L2 archives). No key.
const STAC = "https://earth-search.aws.element84.com/v1";

interface StacItem {
  id: string;
  bbox: [number, number, number, number];
  geometry: Polygon | MultiPolygon;
  properties: Record<string, unknown> & { datetime: string; platform?: string; "eo:cloud_cover"?: number };
  assets: Record<string, { href: string }>;
  links: { rel: string; href: string }[];
}

const pct = (v: unknown) => (typeof v === "number" ? +v.toFixed(1) : null);
const ageDays = (iso: string) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
const platformName = (p?: string) => (p ?? "").replace(/^sentinel-(\d)(\w)$/i, (_, n, l) => `Sentinel-${n}${l.toUpperCase()}`).replace(/^landsat-(\d)$/i, "Landsat $1");

export const sentinelWorker: Worker = {
  id: "sentinel-imagery",
  name: "Sentinel Eye",
  description: "Finds the latest cloud-free Sentinel-2 (10 m) and Landsat 8/9 satellite scenes over the area from the public Earth Search STAC archive, with preview imagery, revisit cadence and scene land-cover mix (water / vegetation / built-up).",
  vehicle: "satellite",
  color: "#94a7e6",
  tools: ["http_get"],
  dataSources: ["ESA Copernicus Sentinel-2 L2A (via Element84 Earth Search)", "USGS Landsat Collection 2 L2"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const region = task.region;
    const center = region.center;
    const search = (collection: string, limit: number) =>
      getJson<{ features: StacItem[] }>(`${STAC}/search`, {
        signal, timeoutMs: 20_000,
        init: {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            collections: [collection], intersects: region.polygon.geometry, limit,
            sortby: [{ field: "properties.datetime", direction: "desc" }], query: { "eo:cloud_cover": { lt: 40 } },
          }),
        },
      });
    log("Querying Earth Search STAC for Sentinel-2 + Landsat scenes (<40% cloud)…");
    const [s2, ls] = await Promise.allSettled([search("sentinel-2-l2a", 10), search("landsat-c2-l2", 4)]);
    // The item geometry is the valid-data footprint: drop scenes where the area sits in the no-data edge of a tile.
    const covering = (items: StacItem[]) => items.filter((i) => { try { return turf.booleanPointInPolygon(center, i.geometry); } catch { return true; } });
    const self = (i: StacItem, coll: string) => i.links.find((l) => l.rel === "self")?.href ?? `${STAC}/collections/${coll}/items/${i.id}`;

    if (s2.status === "fulfilled") {
      const items = covering(s2.value.features ?? []);
      log(`${items.length} Sentinel-2 scenes cover the area`);
      // Same overpass can show up as several MGRS tiles; one per datetime.
      const passes = items.filter((i, n) => items.findIndex((j) => j.properties.datetime.slice(0, 13) === i.properties.datetime.slice(0, 13)) === n);
      const best = passes[0];
      if (best) {
        const p = best.properties;
        const tile = String(p["grid:code"] ?? "").replace(/^MGRS-/, "") || `${p["mgrs:utm_zone"]}${p["mgrs:latitude_band"]}${p["mgrs:grid_square"]}`;
        const days = ageDays(p.datetime);
        emit({
          claim: `Latest clear Sentinel-2 image: ${p.datetime.slice(0, 10)} (${days} day${days === 1 ? "" : "s"} ago) by ${platformName(p.platform)}, tile ${tile}, ${pct(p["eo:cloud_cover"])}% cloud`,
          geometry: { type: "Point", coordinates: center },
          source_url: self(best, "sentinel-2-l2a"), source_type: "sentinel2_stac", observed_at: p.datetime.slice(0, 10),
          confidence: 0.95, category: "imagery", severity: 0.3,
          props: {
            areaLevel: true, satellite: platformName(p.platform), sceneId: best.id, acquired: p.datetime, ageDays: days, cloudCover: pct(p["eo:cloud_cover"]), tile,
            thumbnail: best.assets.thumbnail?.href, visual: best.assets.visual?.href, imageBounds: best.bbox,
            sunElevation: pct(p["view:sun_elevation"]), resolutionM: 10,
          },
        });
        // Scene classification (SCL) percentages are for the whole ~110 km tile, not the selection.
        const water = pct(p["s2:water_percentage"]), veg = pct(p["s2:vegetation_percentage"]), bare = pct(p["s2:not_vegetated_percentage"]);
        if (water !== null || veg !== null) {
          emit({
            claim: `Sentinel-2 scene land cover (whole ${tile} tile): ${water}% water, ${veg}% vegetation, ${bare}% built-up/bare ground`,
            geometry: { type: "Point", coordinates: center },
            source_url: self(best, "sentinel-2-l2a"), source_type: "sentinel2_scl", observed_at: p.datetime.slice(0, 10),
            confidence: 0.7, category: "imagery", severity: 0.2,
            props: { areaLevel: true, sceneLevel: true, tile, waterPct: water, vegetationPct: veg, notVegetatedPct: bare, cloudShadowPct: pct(p["s2:cloud_shadow_percentage"]), snowIcePct: pct(p["s2:snow_ice_percentage"]), thumbnail: best.assets.thumbnail?.href },
          });
        }
        if (passes.length >= 3) {
          const span = (Date.parse(passes[0].properties.datetime) - Date.parse(passes[passes.length - 1].properties.datetime)) / 86_400_000;
          const sats = [...new Set(passes.map((i) => platformName(i.properties.platform)))];
          emit({
            claim: `${passes.length} clear Sentinel-2 passes since ${passes[passes.length - 1].properties.datetime.slice(0, 10)}: a usable image about every ${Math.max(1, Math.round(span / (passes.length - 1)))} days (${sats.join(", ")})`,
            geometry: { type: "Point", coordinates: center },
            source_url: `${STAC}/collections/sentinel-2-l2a`, source_type: "sentinel2_stac", confidence: 0.85, category: "imagery", severity: 0.15,
            props: { areaLevel: true, passes: passes.map((i) => ({ date: i.properties.datetime, satellite: platformName(i.properties.platform), cloudCover: pct(i.properties["eo:cloud_cover"]), thumbnail: i.assets.thumbnail?.href })) },
          });
        }
      } else {
        emit({
          claim: "No cloud-free (<40%) Sentinel-2 scene in the recent archive covers this area",
          geometry: { type: "Point", coordinates: center }, source_url: `${STAC}/collections/sentinel-2-l2a`, source_type: "sentinel2_stac",
          confidence: 0.6, category: "imagery", severity: 0.2, props: { areaLevel: true },
        });
      }
    } else log(`Sentinel-2 search failed: ${(s2.reason as Error).message.slice(0, 80)}`);

    if (ls.status === "fulfilled") {
      const best = covering(ls.value.features ?? [])[0];
      if (best) {
        const p = best.properties;
        const days = ageDays(p.datetime);
        // Landsat asset hrefs are requester-pays s3://; the STAC "thumbnail" link 302s to a public presigned JPEG.
        const thumb = best.links.find((l) => l.rel === "thumbnail")?.href;
        emit({
          claim: `Latest clear Landsat scene: ${p.datetime.slice(0, 10)} (${days} day${days === 1 ? "" : "s"} ago) by ${platformName(p.platform)}, WRS path ${p["landsat:wrs_path"]}/row ${p["landsat:wrs_row"]}, ${pct(p["eo:cloud_cover"])}% cloud`,
          geometry: { type: "Point", coordinates: center },
          source_url: self(best, "landsat-c2-l2"), source_type: "landsat_stac", observed_at: p.datetime.slice(0, 10),
          confidence: 0.95, category: "imagery", severity: 0.2,
          props: {
            areaLevel: true, satellite: platformName(p.platform), sceneId: best.id, acquired: p.datetime, ageDays: days, cloudCover: pct(p["eo:cloud_cover"]),
            wrsPath: p["landsat:wrs_path"], wrsRow: p["landsat:wrs_row"], thumbnail: thumb, imageBounds: best.bbox, resolutionM: 30,
          },
        });
      }
    } else log(`Landsat search failed: ${(ls.reason as Error).message.slice(0, 80)}`);

    if (s2.status === "rejected" && ls.status === "rejected") throw s2.reason;
  },
};
