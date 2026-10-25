// NASA Exoplanet Archive TAP (pscomppars: one row per confirmed planet, composite parameters).
import { adqlNum } from "./geom";
import type { Cone, SkyObject } from "./types";

export const EXO_TAP = "https://exoplanetarchive.ipac.caltech.edu/TAP/sync";
export const EXO_CAP = 50;

export function exoQuery(c: Cone, cap = EXO_CAP) {
  return `select top ${cap} pl_name,hostname,ra,dec,sy_dist,sy_pnum,pl_rade,pl_bmasse,pl_orbper,pl_eqt,disc_year,discoverymethod,st_spectype `
    + `from pscomppars where contains(point('icrs',ra,dec),circle('icrs',${adqlNum(c.ra)},${adqlNum(c.dec)},${adqlNum(c.radius)}))=1 order by sy_dist asc`;
}

/** The archive's Cloudflare WAF rejects ADQL in a GET query string (403), so the query goes as a POST form. */
export const exoRequest = (c: Cone, cap = EXO_CAP): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ query: exoQuery(c, cap), format: "json" }).toString(),
});

const num = (v: unknown, digits = 3) => (typeof v === "number" && Number.isFinite(v) ? +v.toPrecision(digits) : undefined);

export function parseExoplanets(json: unknown): SkyObject[] {
  if (!Array.isArray(json)) throw new Error("unexpected Exoplanet Archive response");
  const out: SkyObject[] = [];
  for (const r of json as Record<string, unknown>[]) {
    const ra = r.ra, dec = r.dec;
    if (typeof ra !== "number" || typeof dec !== "number") continue;
    const name = typeof r.pl_name === "string" ? r.pl_name.trim() : "";
    if (!name || !Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    const host = typeof r.hostname === "string" ? r.hostname.trim() : "";
    const props: Record<string, string | number> = {};
    if (host) props["host star"] = host;
    const entries: [string, unknown, number?][] = [
      ["distance (pc)", r.sy_dist], ["planets in system", r.sy_pnum], ["radius (Earth = 1)", r.pl_rade], ["mass (Earth = 1)", r.pl_bmasse],
      ["orbital period (days)", r.pl_orbper, 4], ["equilibrium temp (K)", r.pl_eqt], ["discovered", r.disc_year, 4],
    ];
    for (const [k, v, d] of entries) { const n = num(v, d); if (n !== undefined) props[k] = n; }
    if (typeof r.discoverymethod === "string") props.method = r.discoverymethod;
    if (typeof r.st_spectype === "string" && r.st_spectype) props["host spectral type"] = r.st_spectype;
    out.push({
      id: "", name, type: "Exoplanet", category: "exoplanet", ra, dec, source: "exoplanets",
      url: `https://exoplanetarchive.ipac.caltech.edu/overview/${encodeURIComponent(host || name)}`, props,
    });
  }
  return out;
}
