// Shared OpenFreeMap vector-tile reader for tile-based workers (places, settlements, kit.osmTileLayers).
// Any area size works: pick the highest zoom that fits the tile budget, and when even the lowest
// allowed zoom doesn't fit, sample tiles near the centre (medium areas) or spread across the whole
// box (huge areas) instead of reading only the middle.
import type { Feature } from "geojson";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { getBuffer, getJson } from "@/lib/http";

const TILEJSON = "https://tiles.openfreemap.org/planet";

export const lng2x = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
export const lat2y = (lat: number, z: number) => { const r = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z); };
const tileCount = ([a, b, c, d]: number[], z: number) => (lng2x(c, z) - lng2x(a, z) + 1) * (lat2y(b, z) - lat2y(d, z) + 1);

export type TilePlan = { z: number; tiles: [number, number][]; total: number; sampled: boolean };

/**
 * Which tiles to read for a bbox. Zoom: the highest in [minZ, maxZ] with ≤ maxTiles tiles (else minZ).
 * If that still exceeds the budget: ≤ 4× budget → the tiles nearest the centre; bigger → an even grid across the box.
 */
export function planTiles(bbox: number[], center: [number, number], opts: { maxZ?: number; minZ?: number; maxTiles?: number } = {}): TilePlan {
  const { maxZ = 14, maxTiles = 16 } = opts;
  const minZ = opts.minZ ?? maxZ;
  let z = minZ;
  for (let k = maxZ; k >= minZ; k--) if (tileCount(bbox, k) <= maxTiles) { z = k; break; }
  const [a, b, c, d] = bbox;
  const [x0, x1, y0, y1] = [lng2x(a, z), lng2x(c, z), lat2y(d, z), lat2y(b, z)];
  const all: [number, number][] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) all.push([x, y]);
  if (all.length <= maxTiles) return { z, tiles: all, total: all.length, sampled: false };
  if (all.length <= maxTiles * 4) {
    const [cx, cy] = [lng2x(center[0], z), lat2y(center[1], z)];
    all.sort((p, q) => Math.hypot(p[0] - cx, p[1] - cy) - Math.hypot(q[0] - cx, q[1] - cy));
    return { z, tiles: all.slice(0, maxTiles), total: all.length, sampled: true };
  }
  // Even grid shaped like the box (n columns × m rows ≈ maxTiles), cell centres.
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const n = Math.max(1, Math.min(w, Math.round(Math.sqrt((maxTiles * w) / h))));
  const m = Math.max(1, Math.min(h, Math.floor(maxTiles / n)));
  const pick = (lo: number, span: number, k: number) => Array.from({ length: k }, (_, i) => lo + Math.floor((span * (i + 0.5)) / k));
  const tiles = pick(x0, w, n).flatMap((x) => pick(y0, h, m).map((y) => [x, y] as [number, number]));
  return { z, tiles, total: all.length, sampled: true };
}

// The build path changes with each planet rebuild, so cache it for an hour, not forever.
let template: { at: number; url: Promise<string> } | null = null;
/** The bare /planet/{z}/{x}/{y} path answers 200 with an empty body; real tiles live under the dated build path the TileJSON names. */
export function tileTemplate(signal?: AbortSignal): Promise<string> {
  if (template && Date.now() - template.at < 3_600_000) return template.url;
  const url = getJson<{ tiles: string[] }>(TILEJSON, { signal, timeoutMs: 8000 }).then((t) => t.tiles[0]);
  template = { at: Date.now(), url };
  url.catch(() => { template = null; });
  return url;
}

/** Reads the given OpenMapTiles layers for the planned tiles. `failed` counts tiles that didn't load. */
export async function readTileLayers(plan: TilePlan, layers: string[], signal: AbortSignal): Promise<{ features: Record<string, Feature[]>; failed: number }> {
  const t = await tileTemplate(signal);
  const features: Record<string, Feature[]> = Object.fromEntries(layers.map((l) => [l, []]));
  let failed = 0;
  await Promise.all(plan.tiles.map(async ([x, y]) => {
    // OpenFreeMap answers featureless tiles (open water, empty bush) with an empty body, which http.ts
    // reports as "empty response": that's a loaded-but-empty tile, not a failure.
    let empty = false;
    const buf = await getBuffer(t.replace("{z}", String(plan.z)).replace("{x}", String(x)).replace("{y}", String(y)), { signal })
      .catch((e: Error) => { empty = /empty response/.test(e.message); return null; });
    if (empty) return;
    if (!buf) { failed++; return; }
    if (!buf.byteLength) return;
    const vt = new VectorTile(new PbfReader(new Uint8Array(buf)));
    for (const name of layers) {
      const layer = vt.layers[name];
      if (!layer) continue;
      for (let i = 0; i < layer.length; i++) features[name].push(layer.feature(i).toGeoJSON(x, y, plan.z) as Feature);
    }
  }));
  return { features, failed };
}
