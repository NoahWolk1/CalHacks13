// Real satellites: CelesTrak TLEs (via /api/tle) propagated client-side with SGP4 (satellite.js).
import * as sat from "satellite.js";

export type LL = [number, number];

export interface Sat {
  norad: string;
  name: string;
  /** Display label (curated ones get a clean name). */
  label: string;
  /** Imaging/crewed satellites we name on the map and track with ground lines. */
  curated: boolean;
  rec: sat.SatRec;
}

export interface SatPos { sat: Sat; lng: number; lat: number; altKm: number }

/** name in CelesTrak (trimmed, upper-case) -> label */
const CURATED: Record<string, string> = {
  "ISS (ZARYA)": "ISS",
  "SENTINEL-2A": "Sentinel-2A",
  "SENTINEL-2B": "Sentinel-2B",
  "SENTINEL-2C": "Sentinel-2C",
  "LANDSAT 8": "Landsat 8",
  "LANDSAT 9": "Landsat 9",
};
const MAX_OTHERS = 48;

function parse(text: string): { name: string; l1: string; l2: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out: { name: string; l1: string; l2: string }[] = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    if (lines[i + 1]?.startsWith("1 ") && lines[i + 2]?.startsWith("2 ")) {
      out.push({ name: lines[i].trim(), l1: lines[i + 1], l2: lines[i + 2] });
      i += 2;
    }
  }
  return out;
}

async function group(g: string): Promise<string> {
  try {
    const r = await fetch(`/api/tle?group=${g}`);
    if (r.ok) return await r.text();
  } catch { /* fall through to CelesTrak directly (it serves CORS) */ }
  const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`);
  return r.ok ? r.text() : "";
}

let loading: Promise<Sat[]> | null = null;
export function loadSats(): Promise<Sat[]> {
  return (loading ??= (async () => {
    const texts = await Promise.all(["stations", "resource"].map((g) => group(g).catch(() => "")));
    const seen = new Set<string>();
    const curated: Sat[] = [], others: Sat[] = [];
    for (const { name, l1, l2 } of texts.flatMap(parse)) {
      const norad = l1.slice(2, 7).trim();
      if (seen.has(norad)) continue;
      seen.add(norad);
      let rec: sat.SatRec;
      try { rec = sat.twoline2satrec(l1, l2); } catch { continue; }
      if (rec.error) continue;
      const key = name.toUpperCase();
      const label = CURATED[key];
      if (label) curated.push({ norad, name, label, curated: true, rec });
      // Skip debris / rocket bodies / sub-modules of the stations: they clutter without meaning much.
      else if (!/DEB|R\/B|MODULE|POISK|NAUKA|WENTIAN|MENGTIAN/.test(key)) others.push({ norad, name, label: titleCase(name), curated: false, rec });
    }
    if (!curated.length && !others.length) loading = null; // allow a retry later
    return [...curated, ...others.slice(0, MAX_OTHERS)];
  })());
}

function titleCase(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export function position(s: Sat, d: Date, gmst = sat.gstime(d)): SatPos | null {
  const pv = sat.propagate(s.rec, d);
  if (!pv.position || typeof pv.position === "boolean") return null;
  const g = sat.eciToGeodetic(pv.position, gmst);
  const lng = sat.degreesLong(g.longitude), lat = sat.degreesLat(g.latitude);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { sat: s, lng, lat, altKm: g.height };
}

export function positions(sats: Sat[], d = new Date()): SatPos[] {
  const gmst = sat.gstime(d);
  const out: SatPos[] = [];
  for (const s of sats) { const p = position(s, d, gmst); if (p) out.push(p); }
  return out;
}

/** Ground track from -min..+min around `d`, split into segments at the antimeridian. */
export function groundTrack(s: Sat, d = new Date(), minutes = 45, stepMin = 1): LL[][] {
  const segs: LL[][] = [];
  let cur: LL[] = [];
  for (let m = -minutes; m <= minutes; m += stepMin) {
    const p = position(s, new Date(d.getTime() + m * 60_000));
    if (!p) continue;
    const prev = cur[cur.length - 1];
    if (prev && Math.abs(p.lng - prev[0]) > 180) { if (cur.length > 1) segs.push(cur); cur = []; }
    cur.push([p.lng, p.lat]);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

/** Split any lng/lat path at antimeridian jumps (used for findings' groundTrack props). */
export function splitAntimeridian(path: LL[]): LL[][] {
  const segs: LL[][] = [];
  let cur: LL[] = [];
  for (const p of path) {
    const prev = cur[cur.length - 1];
    if (prev && Math.abs(p[0] - prev[0]) > 180) { if (cur.length > 1) segs.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

export interface Overhead { label: string; curated: boolean; elevation: number; azimuth: number; altKm: number; rangeKm: number }

/** Tracked satellites above the horizon from `at` right now, highest first. */
export function overhead(sats: Sat[], at: LL, d = new Date(), minElevation = 0): Overhead[] {
  const gmst = sat.gstime(d);
  const obs = { longitude: sat.degreesToRadians(at[0]), latitude: sat.degreesToRadians(at[1]), height: 0.02 };
  const out: Overhead[] = [];
  for (const s of sats) {
    const pv = sat.propagate(s.rec, d);
    if (!pv.position || typeof pv.position === "boolean") continue;
    const look = sat.ecfToLookAngles(obs, sat.eciToEcf(pv.position, gmst));
    const el = (look.elevation * 180) / Math.PI;
    if (!(el > minElevation)) continue;
    const g = sat.eciToGeodetic(pv.position, gmst);
    out.push({ label: s.label, curated: s.curated, elevation: el, azimuth: ((look.azimuth * 180) / Math.PI + 360) % 360, altKm: g.height, rangeKm: look.rangeSat });
  }
  return out.sort((a, b) => b.elevation - a.elevation);
}

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const compass = (az: number) => DIRS[Math.round(az / 45) % 8];
