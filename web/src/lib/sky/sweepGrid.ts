// Planet-sweep geometry (sweep.ts), free of server code so the page can count tiles too.
import { separation } from "./geom";
import { SKY_MAX_RADIUS, type Cone } from "./types";

export const SWEEP_MAX_RADIUS = 180;
export const SWEEP_BUDGET = { min: 0.1, max: 1000 } as const;
const RAD = Math.PI / 180;
const OBLIQUITY = 23.4393;

/** Ecliptic latitude (degrees) of an ICRS position. */
export function eclipticLat(ra: number, dec: number) {
  const s = Math.sin(dec * RAD) * Math.cos(OBLIQUITY * RAD) - Math.cos(dec * RAD) * Math.sin(OBLIQUITY * RAD) * Math.sin(ra * RAD);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}

/**
 * Tiles of radius r covering the region, on a grid fixed on the sky so overlapping sweeps share tiles.
 * Rows are √2·r apart and each row covers its own band: centres √2·r apart along the row (measured
 * at the band's equatorward edge, where the circles are widest apart), so the corners of neighbouring
 * circles meet at the band edges and no gap opens, whatever the next row does.
 * Ordered deepest TESS coverage first, then nearest the region's centre.
 */
export function tileRegion(region: Cone, r = SKY_MAX_RADIUS): Cone[] {
  if (region.radius <= r) return [region];
  const rows = Math.ceil(180 / (Math.SQRT2 * r));
  const dy = 180 / rows;
  const out: (Cone & { beta: number; sep: number })[] = [];
  for (let j = 0; j <= rows; j++) {
    const dec = -90 + j * dy;
    const edge = Math.max(0, Math.abs(dec) - dy / 2);
    const n = Math.max(1, Math.ceil((360 * Math.cos(edge * RAD)) / (Math.SQRT2 * r * 0.98)));
    for (let i = 0; i < n; i++) {
      const ra = (((i + (j % 2) * 0.5) * 360) / n) % 360;
      const sep = separation(region.ra, region.dec, ra, dec);
      if (sep < region.radius + r) out.push({ ra: +ra.toFixed(4), dec: +dec.toFixed(4), radius: r, beta: Math.abs(eclipticLat(ra, dec)), sep });
    }
  }
  // Coverage comes in bands of ecliptic latitude; within a 10° band, nearer the centre first.
  out.sort((a, b) => Math.floor(b.beta / 10) - Math.floor(a.beta / 10) || a.sep - b.sep);
  return out.map(({ ra, dec, radius }) => ({ ra, dec, radius }));
}

/** Notebook line and find ids of a tile: "T3·C1" is find C1 of the sweep's third tile. */
export const tileFindId = (tile: number, id: string) => `T${tile + 1}·${id}`;
export function parseTileFindId(id: string) {
  const m = id.match(/^T(\d+)·(.+)$/);
  return m ? { tile: Number(m[1]) - 1, id: m[2] } : null;
}
