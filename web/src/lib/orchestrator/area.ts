// Area context for prompts and dispatch: machine-checkable worker coverage, the area's size/span
// (so a reverse-geocoded center label isn't read as the whole box), and a cheap need-similarity check
// used to avoid spawning two agents for the same gap in one run.
import type { Region, Worker } from "@/lib/types";

type Box = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

const US: Box[] = [[-125, 24.4, -66.9, 49.5], [-170, 51, -129, 71.5], [-161, 18.9, -154.8, 22.3], [-67.3, 17.9, -65.2, 18.6]];
const PLACES: { re: RegExp; boxes: Box[] }[] = [
  { re: /\bglobal|worldwide|anywhere\b/i, boxes: [] }, // [] = everywhere
  { re: /\b(us|usa|united states|u\.s\.)\b/i, boxes: US },
  { re: /\bcalifornia\b|\bca\b/i, boxes: [[-124.5, 32.5, -114.1, 42.05]] },
  { re: /bay area/i, boxes: [[-123.1, 36.9, -121.5, 38.4]] },
  { re: /\b(san francisco|sf)\b/i, boxes: [[-122.52, 37.70, -122.35, 37.84]] },
  { re: /\boakland\b/i, boxes: [[-122.36, 37.69, -122.11, 37.89]] },
  { re: /\b(la|los angeles)\b/i, boxes: [[-118.95, 33.7, -117.6, 34.35]] },
  { re: /\bsan diego\b/i, boxes: [[-117.35, 32.5, -116.9, 33.15]] },
  { re: /\b(nyc|new york)\b/i, boxes: [[-74.27, 40.48, -73.68, 40.93]] },
  { re: /\bseattle\b/i, boxes: [[-122.45, 47.48, -122.22, 47.74]] },
  { re: /\bchicago\b/i, boxes: [[-87.95, 41.64, -87.52, 42.03]] },
  { re: /\bboston\b/i, boxes: [[-71.2, 42.22, -70.98, 42.4]] },
];

const overlaps = ([a, b, c, d]: Box, [x0, y0, x1, y1]: Box) => !(c < x0 || a > x1 || d < y0 || b > y1);

/** Boxes a coverage string covers; null = global or unrecognized (unknown strings never block a worker). */
export function coverageBoxes(coverage: string): Box[] | null {
  const boxes: Box[] = [];
  // "SF Bay Area (inundation); US coasts (tide gauge)" → parts "SF Bay Area", "US coasts".
  for (const part of coverage.replace(/\([^)]*\)/g, "").split(/[;,]| and /)) {
    const p = part.trim();
    if (!p) continue;
    const hit = PLACES.find((x) => x.re.test(p));
    if (!hit || !hit.boxes.length) return null; // a global or unknown part: covers everywhere
    boxes.push(...hit.boxes);
  }
  return boxes.length ? boxes : null;
}

/** Does this coverage string reach the region's bbox? */
export function coversBox(coverage: string, bbox: Box) {
  const boxes = coverageBoxes(coverage || "Global");
  return !boxes || boxes.some((b) => overlaps(bbox, b));
}
export const covers = (w: Pick<Worker, "coverage">, r: Pick<Region, "bbox">) => coversBox(w.coverage, r.bbox as Box);

/** Rule-based profile for Insights + Auto: site-risk's team is SF/CA/US hazard layers, so only use it for US towns and cities. */
export function insightsProfile(r: Pick<Region, "bbox">, urban: boolean) {
  const us = US.some((b) => overlaps(r.bbox as Box, b));
  return us && urban ? "site-risk" : "general";
}

const STOP = new Set("a an the of in on at for to and or with by from near area areas data agent agents this that which what who how find get list report scrape local nearby within around box region".split(" "));
const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).map((t) => t.replace(/(ies|es|s)$/, "")).filter((t) => t.length > 2 && !STOP.has(t)));

/** Overlap coefficient of content words (0–1): |A∩B| / min(|A|,|B|). */
export function needSimilarity(a: string, b: string) {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  return n / Math.min(A.size, B.size);
}
export const SIMILAR_NEED = 0.5;

/** Width × height of a bbox in km. */
export function bboxKm([a, b, c, d]: Box) {
  const lat = ((b + d) / 2) * Math.PI / 180;
  return { w: (c - a) * 111.32 * Math.cos(lat), h: (d - b) * 110.57 };
}

/** "a, b and c" */
export const joinNames = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
