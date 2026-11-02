// Variable Census agent's catalog: the AAVSO International Variable Star Index (VSX: HEASARC's copy,
// refreshed from AAVSO, with VizieR's at CDS as the fallback; AAVSO's own API sits behind a bot wall),
// which folds in GCVS, ASAS-SN, ZTF, Gaia DR3, ATLAS, TESS and Kepler variable-star surveys. A
// periodic variable or eclipsing binary found in a light curve and missing from VSX and SIMBAD's
// variable types is uncatalogued: a new variable-star find that can be submitted to VSX.
import { getJson, getText } from "@/lib/http";
import { parseVotable } from "./votable";
import { adqlNum, separation } from "./geom";
import type { Cone } from "./types";

export const VIZIER_TAP = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync";
export const HEASARC_TAP = "https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync";
export type VsxStar = { name: string; type: string; period?: number; ra: number; dec: number };

/** SIMBAD object types that already mark a star as variable (any kind). */
export const VARIABLE_OTYPES = new Set(["V*", "V*?", "Pu*", "RR*", "Ce*", "cC*", "dS*", "SX*", "gD*", "bC*", "BY*", "RS*", "Ro*", "Er*", "Fl*", "LP*", "Mi*", "sr*", "Ir*", "Or*", "RV*", "WV*", "a2*", "El*", "EB*", "EB?", "Al*", "bL*", "WU*", "ZZ*", "Be*", "CV*", "No*", "TT*", "Y*O", "Ae*", "S*"]);

/** Row cap for the cone queries: a 3° sweep tile near the Magellanic Clouds holds well over 3,000 VSX
 *  variables, and a truncated list calls catalogued variables new. */
export const VSX_MAX_ROWS = 200_000; // the LMC tile at RA 79.4°, Dec -69.1° has 88,143

/** Within this the VSX entry is the star itself (VSX positions are good to an arcsecond or two). */
export const VSX_SELF_ARCSEC = 15;

export function vsxQuery(c: Cone, padArcmin = 2.5) {
  return `SELECT TOP ${VSX_MAX_ROWS} Name, Type, Period, RAJ2000, DEJ2000 FROM "B/vsx/vsx" `
    + `WHERE CONTAINS(POINT('ICRS', RAJ2000, DEJ2000), CIRCLE('ICRS', ${adqlNum(c.ra)}, ${adqlNum(c.dec)}, ${adqlNum(c.radius + padArcmin / 60)})) = 1`;
}

export function parseVsx(json: unknown): VsxStar[] {
  const t = json as { metadata?: { name: string }[]; data?: unknown[][] };
  if (!t?.metadata || !Array.isArray(t.data)) throw new Error("unexpected VizieR response");
  const col = Object.fromEntries(t.metadata.map((m, i) => [m.name, i]));
  return t.data.flatMap((r) => {
    const ra = r[col.RAJ2000], dec = r[col.DEJ2000], p = r[col.Period];
    if (typeof ra !== "number" || typeof dec !== "number") return [];
    return [{ name: String(r[col.Name] ?? "").trim(), type: String(r[col.Type] ?? "").trim(), ra, dec, ...(typeof p === "number" && p > 0 ? { period: p } : {}) }];
  });
}

/** HEASARC's VSX table (aavsovsx): same stars, its own column names. */
export function vsxHeasarcQuery(c: Cone, padArcmin = 2.5) {
  return `SELECT TOP ${VSX_MAX_ROWS} name, variability_type, period, ra, dec FROM aavsovsx `
    + `WHERE CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${adqlNum(c.ra)}, ${adqlNum(c.dec)}, ${adqlNum(c.radius + padArcmin / 60)})) = 1`;
}

export function parseVsxRows(rows: Record<string, unknown>[]): VsxStar[] {
  return rows.flatMap((r) => {
    const ra = r.ra, dec = r.dec, p = r.period;
    if (typeof ra !== "number" || typeof dec !== "number") return [];
    return [{ name: String(r.name ?? "").trim(), type: String(r.variability_type ?? "").trim(), ra, dec, ...(typeof p === "number" && p > 0 ? { period: p } : {}) }];
  });
}

/** Catalogued variables in (and just around) the cone: HEASARC first, VizieR (CDS) if that fails. */
export async function variablesNear(c: Cone, signal: AbortSignal): Promise<VsxStar[]> {
  // A sweep tile's 3° cone takes HEASARC ~35 s; a star's few-arcminute cone, about a second.
  const wide = c.radius >= 0.5;
  try {
    const xml = await getText(`${HEASARC_TAP}?${new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", QUERY: vsxHeasarcQuery(c) })}`, { timeoutMs: wide ? 120_000 : 15_000, signal, retries: 1 });
    return parseVsxRows(parseVotable(xml));
  } catch (heasarc) {
    if (signal.aborted) throw heasarc;
    const url = `${VIZIER_TAP}?${new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "json", QUERY: vsxQuery(c) })}`;
    try { return parseVsx(await getJson(url, { timeoutMs: wide ? 90_000 : 12_000, signal, retries: 0 })); } catch (viz) {
      throw new Error(`HEASARC: ${(heasarc as Error).message.slice(0, 60)}; VizieR: ${(viz as Error).message.slice(0, 60)}`);
    }
  }
}

// Lookups by position: a tile's list runs to ~90,000 variables and every star is looked up on every
// save, so each list gets (once) declination bands of entries sorted by RA.
const BAND_DEG = 0.1;
type Band = { ra: number[]; i: number[] };
const bandIndex = new WeakMap<VsxStar[], Map<number, Band>>();
function bandsOf(vsx: VsxStar[]) {
  let bands = bandIndex.get(vsx);
  if (bands) return bands;
  const tmp = new Map<number, number[]>();
  vsx.forEach((v, i) => { const b = Math.floor(v.dec / BAND_DEG); (tmp.get(b) ?? tmp.set(b, []).get(b)!).push(i); });
  bands = new Map([...tmp].map(([b, idx]) => { idx.sort((x, y) => vsx[x].ra - vsx[y].ra); return [b, { ra: idx.map((i) => vsx[i].ra), i: idx }]; }));
  bandIndex.set(vsx, bands);
  return bands;
}
const lowerBound = (a: number[], x: number) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo; };

/** The VSX entries within `arcmin` of a position, in the list's own order (same as filtering the list). */
export function vsxWithin(pos: { ra: number; dec: number }, vsx: VsxStar[], arcmin: number): VsxStar[] {
  const r = arcmin / 60, bands = bandsOf(vsx), hits: number[] = [];
  // A circle reaching the pole spans every RA.
  const edge = Math.abs(pos.dec) + r;
  const dra = edge >= 89.99 ? 180 : Math.min(180, r / Math.cos(edge * Math.PI / 180));
  // RA ranges to scan, split where they wrap through 0°/360°.
  const lo = pos.ra - dra, hi = pos.ra + dra;
  const ranges: [number, number][] = dra >= 180 ? [[-Infinity, Infinity]] : lo < 0 ? [[lo + 360, 360], [0, hi]] : hi >= 360 ? [[lo, 360], [0, hi - 360]] : [[lo, hi]];
  for (let b = Math.floor((pos.dec - r) / BAND_DEG); b <= Math.floor((pos.dec + r) / BAND_DEG); b++) {
    const band = bands.get(b);
    if (!band) continue;
    for (const [a, z] of ranges) {
      for (let k = a === -Infinity ? 0 : lowerBound(band.ra, a); k < band.ra.length && band.ra[k] <= z; k++) {
        const v = vsx[band.i[k]];
        if (separation(pos.ra, pos.dec, v.ra, v.dec) * 60 <= arcmin) hits.push(band.i[k]);
      }
    }
  }
  return hits.sort((x, y) => x - y).map((i) => vsx[i]);
}

/** The VSX entry for this star, if any. */
export function vsxEntry(star: { ra: number; dec: number }, vsx: VsxStar[]): VsxStar | undefined {
  return vsxWithin(star, vsx, VSX_SELF_ARCSEC / 60).map((v) => ({ v, sep: separation(star.ra, star.dec, v.ra, v.dec) * 3600 }))
    .filter((x) => x.sep <= VSX_SELF_ARCSEC).sort((a, b) => a.sep - b.sep)[0]?.v;
}

/** VSX types for eclipsing and ellipsoidal binaries and planetary transits (E, EA, EB, EW, ELL, EP,
 *  with VSX's ":" / "+" / "|" qualifiers). */
export const isEclipsingType = (type: string) => /^(EA|EB|EW|EP|ELL|E)(?![A-Z])/.test(type.trim().toUpperCase());
