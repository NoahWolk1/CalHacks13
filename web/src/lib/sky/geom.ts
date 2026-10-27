import { SKY_MAX_RADIUS, type Cone } from "./types";

const RAD = Math.PI / 180;

/** Great-circle separation in degrees between two (ra, dec) points given in degrees. */
export function separation(ra1: number, dec1: number, ra2: number, dec2: number) {
  const s = Math.sin(((dec2 - dec1) * RAD) / 2) ** 2 + Math.cos(dec1 * RAD) * Math.cos(dec2 * RAD) * Math.sin(((ra2 - ra1) * RAD) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(s)))) / RAD;
}

/** Validates/normalises a requested cone; returns null when it's not a usable region. */
export function parseCone(raw: unknown): Cone | null {
  const r = raw as Partial<Record<keyof Cone, unknown>> | null;
  if (!r) return null;
  const ra = Number(r.ra), dec = Number(r.dec), radius = Number(r.radius);
  if (![ra, dec, radius].every(Number.isFinite)) return null;
  if (dec < -90 || dec > 90 || radius <= 0) return null;
  return { ra: ((ra % 360) + 360) % 360, dec, radius: Math.min(SKY_MAX_RADIUS, Math.max(0.005, radius)) };
}

/** Plain-number formatting for ADQL (no exponent notation). */
export const adqlNum = (n: number) => n.toFixed(6);

export function formatRa(ra: number) {
  // Round the total first, so 56.75° reads 03h47m00s, not 03h46m60s.
  const t = Math.round((ra / 15) * 3600) % 86400;
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  return `${String(hh).padStart(2, "0")}h${String(mm).padStart(2, "0")}m${String(ss).padStart(2, "0")}s`;
}

export function formatDec(dec: number) {
  const s = dec < 0 ? "-" : "+";
  const t = Math.round(Math.abs(dec) * 3600), d = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  return `${s}${String(d).padStart(2, "0")}°${String(m).padStart(2, "0")}′${String(sec).padStart(2, "0")}″`;
}
