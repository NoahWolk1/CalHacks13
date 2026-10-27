// Variable Census agent's catalog: the AAVSO International Variable Star Index (VSX, via VizieR TAP),
// which folds in GCVS, ASAS-SN, ZTF, Gaia DR3, ATLAS, TESS and Kepler variable-star surveys. A
// periodic variable or eclipsing binary found in a light curve and missing from VSX and SIMBAD's
// variable types is uncatalogued: a new variable-star find that can be submitted to VSX.
import { getJson } from "@/lib/http";
import { adqlNum, separation } from "./geom";
import type { Cone } from "./types";

export const VIZIER_TAP = "https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync";
export type VsxStar = { name: string; type: string; period?: number; ra: number; dec: number };

/** SIMBAD object types that already mark a star as variable (any kind). */
export const VARIABLE_OTYPES = new Set(["V*", "V*?", "Pu*", "RR*", "Ce*", "cC*", "dS*", "SX*", "gD*", "bC*", "BY*", "RS*", "Ro*", "Er*", "Fl*", "LP*", "Mi*", "sr*", "Ir*", "Or*", "RV*", "WV*", "a2*", "El*", "EB*", "EB?", "Al*", "bL*", "WU*", "ZZ*", "Be*", "CV*", "No*", "TT*", "Y*O", "Ae*", "S*"]);

/** Within this the VSX entry is the star itself (VSX positions are good to an arcsecond or two). */
export const VSX_SELF_ARCSEC = 15;

export function vsxQuery(c: Cone, padArcmin = 2.5) {
  return `SELECT TOP 3000 Name, Type, Period, RAJ2000, DEJ2000 FROM "B/vsx/vsx" `
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

/** Catalogued variables in (and just around) the cone. */
export async function variablesNear(c: Cone, signal: AbortSignal): Promise<VsxStar[]> {
  const url = `${VIZIER_TAP}?${new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "json", QUERY: vsxQuery(c) })}`;
  return parseVsx(await getJson(url, { timeoutMs: 12_000, signal, retries: 1 }));
}

/** The VSX entry for this star, if any. */
export function vsxEntry(star: { ra: number; dec: number }, vsx: VsxStar[]): VsxStar | undefined {
  return vsx.map((v) => ({ v, sep: separation(star.ra, star.dec, v.ra, v.dec) * 3600 }))
    .filter((x) => x.sep <= VSX_SELF_ARCSEC).sort((a, b) => a.sep - b.sep)[0]?.v;
}

/** VSX types for eclipsing and ellipsoidal binaries and planetary transits (E, EA, EB, EW, ELL, EP,
 *  with VSX's ":" / "+" / "|" qualifiers). */
export const isEclipsingType = (type: string) => /^(EA|EB|EW|EP|ELL|E)(?![A-Z])/.test(type.trim().toUpperCase());
