// Display-only listing of the /sky agents for the /agents library page. These are not Earth workers:
// they are not in the worker registry or planner, so Earth runs are unaffected.
export type SkyAgentCard = { id: string; name: string; description: string; source: string; sourceUrl: string; color: string };

export const SKY_AGENTS: SkyAgentCard[] = [
  { id: "simbad", name: "SIMBAD", description: "Finds the most-studied stars, galaxies, nebulae and clusters in the cone, with type, magnitude and distance.", source: "SIMBAD TAP (CDS Strasbourg)", sourceUrl: "https://simbad.cds.unistra.fr/simbad/", color: "#8fb3ff" },
  { id: "exoplanets", name: "Exoplanet Archive", description: "Lists confirmed exoplanets whose host stars sit in the cone: radius, mass, period, temperature, discovery.", source: "NASA Exoplanet Archive TAP (pscomppars)", sourceUrl: "https://exoplanetarchive.ipac.caltech.edu/", color: "#6dbf8b" },
  { id: "horizons", name: "Horizons", description: "Checks where the Sun, Moon and planets are right now and reports any that fall inside the cone.", source: "JPL Horizons API", sourceUrl: "https://ssd.jpl.nasa.gov/horizons/", color: "#e8853d" },
  { id: "telescopes", name: "Telescope Archive", description: "Summarises real telescope observations of the region by mission (HST, JWST, TESS, K2, Swift, ...): counts, instruments, filters, latest date, programs.", source: "MAST CAOM (STScI)", sourceUrl: "https://mast.stsci.edu/", color: "#5ec8d8" },
  { id: "observer", name: "Observer", description: "Looks at a DSS2 colour image of the cone with Claude vision and reports visual features, tied to catalog results.", source: "CDS hips2fits (DSS2 colour) + Claude", sourceUrl: "https://alasky.cds.unistra.fr/hips-image-services/hips2fits", color: "#e58fb5" },
];
