// Coordinate visual tokens: "night survey sheet" direction (see design notes).
// UI chrome is warm graphite and nearly monochrome; colour is reserved for data
// (agents, insight kinds) plus one accent, sodium orange, that marks *your* area and live state.
// Used by globals.css (mirrored tokens), mapStyle.ts, MapView layers, RightPanel kinds and the
// per-worker `color` fields (which copy AGENT_COLORS).

export type RGB = [number, number, number];

export function hex(h: string): RGB {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** UI tokens. Mirrors the CSS custom properties in globals.css. */
export const UI = {
  bg: "#0e0e0d", // app + map background
  panel: "#151514", // docked panels (solid, no blur)
  raised: "#1c1b19", // hover, inputs
  active: "#24231f", // selected row / pressed
  line: "#2a2925", // hairline borders
  lineStrong: "#3a3833",
  fg1: "#ecebe6", // primary text
  fg2: "#b3afa6", // secondary text
  fg3: "#7d796f", // labels, meta
  fg4: "#57544d", // disabled, placeholders
  accent: "#e8853d", // sodium orange: AOI, live, command post, focus
  accentInk: "#1b1008", // text on accent
  live: "#e8853d",
  error: "#e5675a",
} as const;

/** Categorical agent colours, keyed by worker id. Tuned for a dark graphite map: similar
 *  lightness (OKLCH L ~0.72-0.82), moderate chroma, hues spread around the wheel and kept
 *  clear of the accent's orange. All pass >= 6:1 against UI.panel. */
// With 36 agents, hues repeat; the ones that share an orchestrator's survey team are kept >= ~0.055 apart in OKLab.
export const AGENT_COLORS: Record<string, string> = {
  "fema-flood": "#6f9de0", // cornflower: water hazard
  "sf-stormwater": "#62a89c", // sea green: drainage
  "live-conditions": "#a9cbe8", // pale sky: weather/air
  "osm-places": "#8cc27c", // leaf: businesses/amenities
  "sf-permits": "#d2c162", // mustard: construction
  "terrain-elevation": "#bd9c7b", // clay: ground
  "usgs-seismic": "#e2715f", // brick: quakes
  "sf-311": "#e48bb0", // rose: street complaints
  "local-news": "#a28be6", // violet: news
  "census-demographics": "#d4d0c4", // stone: population
  "sentinel-imagery": "#94a7e6", // periwinkle: satellite scenes
  "nasa-eonet": "#cf9be6", // orchid: natural events
  "orbit-passes": "#aebccc", // silver: orbital passes
  "apify-reviews": "#7fd1b9", // mint: Google Maps ratings (Apify)
  "brightdata-rent": "#9aa8f0", // periwinkle: rental listings (Bright Data)
  "brightdata-pulse": "#d6dc8a", // pale chartreuse: web + resident chatter (Bright Data SERP)
  "apify-planning-notices": "#f0d48a", // pale gold: planning hearings (custom Apify Actor)
  // DataSF city-data agents
  "sf-crime": "#cf8a8a", // dusty red: SFPD incidents
  "sf-evictions": "#c3a3d6", // lavender: eviction notices
  "sf-business": "#b9cf9a", // sage: business openings/closures
  "sf-crashes": "#e3b5c8", // blush: injury crashes
  "sf-zoning": "#b7b0e0", // iris: zoning + height limits
  "sf-property": "#cdb59a", // sand: assessor roll
  "sf-fire-ems": "#e09486", // salmon: fire/EMS calls
  "sf-street-work": "#b8ae86", // khaki: street-use permits
  "sf-transit": "#7fb8d6", // steel blue: Muni/BART
  "sf-trees": "#7fbf95", // fern: street trees
  // Hazard / environment / context agents
  "cgs-ground-hazards": "#a3b06a", // moss: liquefaction/landslide/tsunami zones
  "sea-level-rise": "#4fb2c4", // lagoon teal: sea-level rise + tides
  "calfire-fhsz": "#e39a7b", // apricot: wildfire hazard zones
  "weather-outlook": "#d8c57c", // straw: forecast + heat history
  "wiki-landmarks": "#d7a8e8", // lilac: Wikipedia landmarks
  "short-term-rentals": "#e6b98f", // peach: Airbnb listings
  "ca-schools": "#b0e0d0", // pale aqua: schools + childcare
  "env-burden": "#b6bf7a", // olive: CalEnviroScreen + PM2.5
  "fema-disasters": "#b9a6a0", // taupe: disaster declaration history
  "osm-settlements": "#e0b26a", // ochre: cities, towns, villages
};
export const AGENT_FALLBACK = "#a7a399";
export const agentColor = (id: string, fallback?: string) => AGENT_COLORS[id] ?? fallback ?? AGENT_FALLBACK;

/** Insight kinds. Shown as a small square swatch + label, never as tinted card borders. */
export const KIND_COLORS = {
  risk: "#e5675a",
  opportunity: "#6dbf8b",
  conflict: "#b593e6",
  note: "#8ea4bc",
} as const;

/** Map palette (deck.gl RGB tuples + basemap tints). */
export const MAP = {
  accent: hex(UI.accent),
  halo: hex(UI.bg), // pin strokes, text outlines
  label: hex("#d9d6ce"), // vehicle labels: neutral, not agent-coloured
  arc: hex("#ecebe6"), // insight links: paper white, kind colour only when selected
  flood: {
    VE: hex("#4f7fd0"), V: hex("#4f7fd0"),
    AE: hex("#6f9de0"), A: hex("#6f9de0"),
    AO: hex("#9dbbe6"), AH: hex("#9dbbe6"),
    X: hex("#6b6860"),
    STORM100: hex("#62a89c"),
    FILL: hex("#c9a46e"),
  } as Record<string, RGB>,
} as const;

/** OpenFreeMap "dark" layer re-tints: neutral graphite land, cooler darker water, quiet roads. */
export const BASEMAP: [layer: string, prop: string, value: string][] = [
  ["background", "background-color", "#121211"],
  ["water", "fill-color", "#0b0d10"],
  ["waterway", "line-color", "#0b0d10"],
  ["water_name", "text-color", "#4a5058"],
  ["landuse_residential", "fill-color", "#141413"],
  ["landuse_park", "fill-color", "#151813"],
  ["landcover_wood", "fill-color", "#151813"],
  ["highway_path", "line-color", "#1d1d1b"],
  ["highway_minor", "line-color", "#1f1f1d"],
  ["highway_major_casing", "line-color", "#2a2926"],
  ["highway_major_inner", "line-color", "#232220"],
  ["highway_major_subtle", "line-color", "#262523"],
  ["highway_motorway_casing", "line-color", "#33312d"],
  ["highway_motorway_inner", "line-color", "#2c2b27"],
  ["highway_motorway_subtle", "line-color", "#2c2b27"],
  ["railway_transit", "line-color", "#24231f"],
  ["railway", "line-color", "#24231f"],
  ["highway_name_other", "text-color", "#4a4843"],
  ["highway_name_motorway", "text-color", "#6b675e"],
  ["place_other", "text-color", "#6b675e"],
  ["place_suburb", "text-color", "#7d796f"],
  ["place_city", "text-color", "#a39f95"],
];

/** 3D buildings: graphite ramp by height. */
export const BUILDING_RAMP = ["#141414", 40, "#181817", 120, "#1f1e1c"] as const;
/** Flat, dim extrusion lighting so buildings read as texture, not as grey slabs. */
export const MAP_LIGHT = { anchor: "viewport", color: "#ffffff", intensity: 0.18, position: [1.15, 210, 30] } as const;
export const BASEMAP_HALO = "#121211"; // text-halo-color for street/place labels
