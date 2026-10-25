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
  const h = ra / 15;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60), ss = ((h - hh) * 60 - mm) * 60;
  return `${String(hh).padStart(2, "0")}h${String(mm).padStart(2, "0")}m${ss.toFixed(0).padStart(2, "0")}s`;
}

export function formatDec(dec: number) {
  const s = dec < 0 ? "-" : "+";
  const a = Math.abs(dec), d = Math.floor(a), m = Math.floor((a - d) * 60), sec = ((a - d) * 60 - m) * 60;
  return `${s}${String(d).padStart(2, "0")}°${String(m).padStart(2, "0")}′${sec.toFixed(0).padStart(2, "0")}″`;
}
