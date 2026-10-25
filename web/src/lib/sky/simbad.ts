// SIMBAD (CDS Strasbourg) TAP: notable objects in a cone — galaxies, nebulae, clusters, and stars
// brighter than V=9 — ranked by how much literature cites them (nbref), which tracks "notable".
import { adqlNum } from "./geom";
import type { Cone, SkyCategory, SkyObject } from "./types";

export const SIMBAD_TAP = "https://simbad.cds.unistra.fr/simbad/sim-tap/sync";
export const SIMBAD_CAP = 50;

const GALAXY = ["G", "GiG", "GiC", "GiP", "BiC", "IG", "PaG", "GrG", "CGG", "ClG", "SCG", "SBG", "H2G", "EmG", "AGN", "SyG", "Sy1", "Sy2", "QSO", "Bla", "BLL", "LIN", "LSB", "rG", "PoG"];
const NEBULA = ["HII", "RNe", "DNe", "PN", "SNR", "MoC", "ISM", "Cld", "bub", "GNe"];
const CLUSTER = ["Cl*", "OpC", "GlC", "As*"];

export const LABEL: Record<string, string> = {
  G: "Galaxy", GiG: "Galaxy in group", GiC: "Galaxy in cluster", GiP: "Galaxy in pair", BiC: "Brightest cluster galaxy", IG: "Interacting galaxies",
  PaG: "Galaxy pair", GrG: "Galaxy group", CGG: "Compact galaxy group", ClG: "Galaxy cluster", SCG: "Supercluster", SBG: "Starburst galaxy",
  H2G: "HII galaxy", EmG: "Emission-line galaxy", AGN: "Active galactic nucleus", SyG: "Seyfert galaxy", Sy1: "Seyfert 1 galaxy", Sy2: "Seyfert 2 galaxy",
  QSO: "Quasar", Bla: "Blazar", BLL: "BL Lac object", LIN: "LINER galaxy", LSB: "Low surface brightness galaxy", rG: "Radio galaxy", PoG: "Part of a galaxy",
  HII: "HII region (emission nebula)", RNe: "Reflection nebula", DNe: "Dark nebula", PN: "Planetary nebula", SNR: "Supernova remnant", MoC: "Molecular cloud",
  ISM: "Interstellar matter", Cld: "Cloud", bub: "Bubble", GNe: "Nebula", "Cl*": "Star cluster", OpC: "Open cluster", GlC: "Globular cluster", "As*": "Stellar association",
  "*": "Star", "**": "Double star", "SB*": "Spectroscopic binary", "EB*": "Eclipsing binary", "V*": "Variable star", "Be*": "Be star", "WR*": "Wolf-Rayet star",
  "C*": "Carbon star", "PM*": "High proper-motion star", "Em*": "Emission-line star", "Ae*": "Herbig Ae/Be star", "Or*": "Orion variable", "RG*": "Red giant",
  "s*r": "Red supergiant", "s*b": "Blue supergiant", "s*y": "Yellow supergiant", "LP*": "Long-period variable", "Ce*": "Cepheid", "BY*": "BY Draconis variable",
  "RS*": "RS CVn variable", "dS*": "Delta Scuti variable", "Y*O": "Young stellar object", "TT*": "T Tauri star", "Mi*": "Mira variable", "BD*": "Brown dwarf", "LM*": "Low-mass star", "MS*": "Main-sequence star", "Al*": "Algol-type binary", "El*": "Ellipsoidal variable", "Ir*": "Irregular variable", "RR*": "RR Lyrae variable", "bC*": "Beta Cephei variable", "a2*": "Alpha2 CVn variable", "gD*": "Gamma Doradus variable", "Ro*": "Rotating variable", "Er*": "Eruptive variable", "Fl*": "Flare star", "Pe*": "Peculiar star", "HS*": "Hot subdwarf", "sg*": "Supergiant", "s?r": "Red supergiant candidate", "AB*": "Asymptotic giant branch star", "Ae?": "Herbig Ae/Be candidate", "X": "X-ray source", "Rad": "Radio source", "IR": "Infrared source", "UV": "UV source", "Pu*": "Pulsating star", "SN*": "Supernova", "WD*": "White dwarf", "HB*": "Horizontal-branch star", "No*": "Nova", "Psr": "Pulsar",
};

export function categoryOf(otype: string): SkyCategory {
  if (GALAXY.includes(otype)) return "galaxy";
  if (NEBULA.includes(otype)) return "nebula";
  if (CLUSTER.includes(otype)) return "cluster";
  if (otype.includes("*")) return "star";
  return "other";
}

// Ordering by the expression (not the nbref column) keeps SIMBAD from walking its global nbref index:
// ~0.8 s instead of 8–17 s in sparse fields.
export function simbadQuery(c: Cone, cap = SIMBAD_CAP) {
  const types = [...GALAXY, ...NEBULA, ...CLUSTER].map((t) => `'${t}'`).join(",");
  return `SELECT TOP ${cap} b.main_id, b.otype, b.ra, b.dec, b.nbref, b.galdim_majaxis, b.sp_type, f.V AS vmag, b.rvz_redshift, b.plx_value, b.nbref + 0 AS rank `
    + `FROM basic AS b LEFT JOIN allfluxes AS f ON f.oidref = b.oid `
    + `WHERE CONTAINS(POINT('ICRS', b.ra, b.dec), CIRCLE('ICRS', ${adqlNum(c.ra)}, ${adqlNum(c.dec)}, ${adqlNum(c.radius)})) = 1 `
    + `AND b.ra IS NOT NULL AND (f.V < 9 OR b.otype IN (${types})) ORDER BY rank DESC`;
}

export function simbadUrl(c: Cone, cap = SIMBAD_CAP) {
  const p = new URLSearchParams({ REQUEST: "doQuery", LANG: "ADQL", FORMAT: "json", QUERY: simbadQuery(c, cap) });
  return `${SIMBAD_TAP}?${p}`;
}

/** SIMBAD pads catalog prefixes ("M  42", "NAME Orion Nebula Cluster"): tidy for display. */
export function tidyName(id: string) {
  return id.replace(/^NAME\s+/, "").replace(/^\*\s+/, "").replace(/\s+/g, " ").trim();
}

type TapJson = { metadata?: { name: string }[]; data?: unknown[][] };

/** Parses a SIMBAD TAP JSON response into SkyObjects (ids left blank for the route to assign). */
export function parseSimbad(json: unknown): SkyObject[] {
  const t = json as TapJson;
  if (!t?.metadata || !Array.isArray(t.data)) throw new Error("unexpected SIMBAD response");
  const col = Object.fromEntries(t.metadata.map((m, i) => [m.name, i]));
  const out: SkyObject[] = [];
  for (const row of t.data) {
    const get = (k: string) => row[col[k]];
    const ra = get("ra"), dec = get("dec");
    if (typeof ra !== "number" || typeof dec !== "number") continue;
    const mainId = String(get("main_id") ?? "").trim();
    if (!mainId || !Number.isFinite(ra) || !Number.isFinite(dec)) continue;
    const otype = String(get("otype") ?? "").trim();
    const props: Record<string, string | number> = { "SIMBAD id": mainId, "object type": otype };
    const vmag = get("vmag"), nbref = get("nbref"), size = get("galdim_majaxis"), sp = get("sp_type"), z = get("rvz_redshift"), plx = get("plx_value");
    if (typeof vmag === "number") props["V mag"] = +vmag.toFixed(2);
    if (typeof sp === "string" && sp) props["spectral type"] = sp;
    if (typeof size === "number") props["major axis (arcmin)"] = +size.toFixed(2);
    if (typeof z === "number" && categoryOf(otype) === "galaxy") props.redshift = +z.toPrecision(3);
    // Parallax -> distance only when it's large enough to mean something (> 0.5 mas, i.e. < ~6,500 ly).
    if (typeof plx === "number" && plx > 0.5) { props["parallax (mas)"] = +plx.toFixed(3); props["distance (ly)"] = Math.round(3261.56 / plx); }
    if (typeof nbref === "number") props["papers citing"] = nbref;
    out.push({
      id: "", name: tidyName(mainId), type: LABEL[otype] ?? otype, category: categoryOf(otype), ra, dec, source: "simbad",
      url: `https://simbad.cds.unistra.fr/simbad/sim-id?Ident=${encodeURIComponent(mainId)}`, props,
    });
  }
  return out;
}
