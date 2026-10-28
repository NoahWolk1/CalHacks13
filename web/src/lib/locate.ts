// Photo → place: Claude reads the visual clues in an uploaded image (landmarks, signs, script,
// architecture, terrain, vegetation, road markings) and names the places it could be; each guess is
// placed on the map so it can fly there.
// - Anywhere: guesses are geocoded with Nominatim.
// - Within a selected area: the area's OpenStreetMap street and place names (OpenFreeMap vector tiles)
//   go to Claude as a gazetteer, so a sign or shop front can be matched to a street, a crossing or a
//   named place, and placed at street level from the map data itself.
// Places only: people in the photo are never identified. A photo with people in it, or taken inside a
// private home, is capped at city level by the server (whatever the model says), so it can't be used
// to find where someone lives or is.
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Feature, Position } from "geojson";
import { getJson, sleep } from "@/lib/http";
import { FALLBACK, llm, WORKER_MODEL } from "@/lib/llm";
import { planTiles, readTileLayers } from "@/lib/agents/workers/tiles";

export const LOCATE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type LocateType = (typeof LOCATE_TYPES)[number];
/** Base64 length cap (~3 MB of image), under Vercel's 4.5 MB request body limit. */
export const LOCATE_MAX_B64 = 4_000_000;
type BBox = [number, number, number, number];
/** The selected area, for searching within it: bbox [minLng, minLat, maxLng, maxLat] and centre. */
export type LocateArea = { bbox: BBox; center: [number, number] };

const Precision = z.enum(["exact", "street", "city", "region", "country"]);
export const LocateSchema = z.object({
  summary: z.string(),
  peopleVisible: z.boolean(),
  privateInterior: z.boolean(),
  guesses: z.array(z.object({
    name: z.string(),
    query: z.string(),
    /** Area mode: names copied exactly from the area's lists ("" / [] when none fits). */
    place: z.string(),
    streets: z.array(z.string()),
    precision: Precision,
    confidence: z.enum(["high", "medium", "low"]),
    clues: z.string(),
  })),
});
export type RawLocate = z.infer<typeof LocateSchema>;
type RawGuess = RawLocate["guesses"][number];

export type LocateGuess = {
  name: string; detail: string; center: [number, number]; bbox?: BBox;
  precision: z.infer<typeof Precision>; confidence: RawGuess["confidence"]; clues: string;
  /** How it was placed: a named place or street crossing from the area's map data, or the geocoder. */
  via: "map" | "geocoder";
};
export type LocateResult = { summary: string; guesses: LocateGuess[]; model: string; area?: { streets: number; places: number; sampled: boolean }; /** Why precision was capped at city level: people in the photo, or a private home's interior. */
  capped?: "people" | "home" };

const SYSTEM = `You are a geolocation analyst. Work out where a photo was taken from what is visible in it: landmarks, signs and shop names, house numbers, language and script, licence plates, road markings and which side traffic drives on, architecture, utility poles, terrain, vegetation, weather and sun position, coastline or skyline shapes.

Return up to 3 guesses, most likely first. For each:
- name: the place as a person would say it (e.g. "Golden Gate Bridge, San Francisco", "Corner of Valencia St and 18th St, San Francisco").
- query: a search string a geocoder (OpenStreetMap Nominatim) will resolve, e.g. "Golden Gate Bridge, San Francisco, USA" or "Hallstatt, Austria". No coordinates.
- place and streets: only when you're given the area's map names (otherwise "" and []); see below.
- precision: how narrowly you can place it (exact spot, street, city, region, country).
- confidence: high only for a recognisable landmark or a legible sign that names the place.
- clues: the specific visual evidence, at most 30 words.
summary: one or two sentences on what the photo shows and how sure you are.
peopleVisible: true if any person (or a recognisable part of one) is visible.
privateInterior: true if the photo was taken inside a private home (including the view out of its window).

Places only, never people: don't identify, name or describe anyone in the photo. If there are no usable clues, return no guesses and say so in the summary. Don't invent clues that aren't visible.`;

const AREA_RULES = `The photo was taken somewhere inside the area below. Its OpenStreetMap street and place names are listed. Match what you can read or recognise (street signs, shop names, landmarks, the road layout) against them:
- place: a name copied exactly from PLACES when the photo shows that place (or is taken right in front of it).
- streets: one street name copied exactly from STREETS for the street the photo is on, or two for the crossing it shows.
Only use names from the lists, exactly as written; put guesses inside the area first.`;

// ── the selected area's gazetteer ───────────────────────────────────────────────

/** streets: each name's polylines (clipped to the area's vertices). */
export type Gazetteer = { streets: Map<string, Position[][]>; places: { name: string; kind: string; at: Position }[]; sampled: boolean; bbox: BBox };
const inBox = ([x, y]: Position, [a, b, c, d]: BBox) => x >= a && x <= c && y >= b && y <= d;
/** A feature's lines (each a vertex run); points and polygons count as one run of their vertices. */
const runs = (f: Feature): Position[][] => {
  const g = f.geometry;
  if (g.type === "LineString") return [g.coordinates];
  if (g.type === "MultiLineString") return g.coordinates;
  return [vertices(f)];
};
const vertices = (f: Feature): Position[] => {
  const g = f.geometry;
  if (g.type === "Point") return [g.coordinates];
  if (g.type === "LineString" || g.type === "MultiPoint") return g.coordinates;
  if (g.type === "MultiLineString" || g.type === "Polygon") return g.coordinates.flat();
  if (g.type === "MultiPolygon") return g.coordinates.flat(2);
  return [];
};

export function buildGazetteer(streets: Feature[], pois: Feature[], bbox: BBox, sampled = false): Gazetteer {
  const out: Gazetteer = { streets: new Map(), places: [], sampled, bbox };
  for (const f of streets) {
    const name = String(f.properties?.name ?? "").trim();
    const lines = runs(f).filter((l) => l.some((p) => inBox(p, bbox)));
    if (!name || !lines.length) continue;
    const have = out.streets.get(name);
    if (have) { if (have.length < 200) have.push(...lines); } else out.streets.set(name, lines);
  }
  const seen = new Set<string>();
  for (const f of pois) {
    const name = String(f.properties?.name ?? "").trim();
    const at = vertices(f)[0];
    if (!name || !at || !inBox(at, bbox)) continue;
    const key = `${name}|${at[0].toFixed(4)},${at[1].toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.places.push({ name, kind: String(f.properties?.subclass ?? f.properties?.class ?? ""), at });
  }
  return out;
}

async function areaGazetteer(area: LocateArea, signal: AbortSignal): Promise<Gazetteer> {
  const plan = planTiles(area.bbox, area.center, { maxZ: 14, maxTiles: 36 });
  const { features } = await readTileLayers(plan, ["transportation_name", "poi"], signal);
  return buildGazetteer(features.transportation_name, features.poi, area.bbox, plan.sampled);
}

const STREET_CAP = 400, PLACE_CAP = 400;
function gazetteerText(g: Gazetteer) {
  const streets = [...g.streets.keys()].sort().slice(0, STREET_CAP);
  const places = g.places.slice(0, PLACE_CAP).map((p) => (p.kind ? `${p.name} (${p.kind.replace(/_/g, " ")})` : p.name));
  return `STREETS (${streets.length})\n${streets.join("; ") || "(none)"}\n\nPLACES (${places.length})\n${places.join("; ") || "(none)"}`;
}

const metres = (p: Position, q: Position) => Math.hypot((p[0] - q[0]) * 111_320 * Math.cos((p[1] * Math.PI) / 180), (p[1] - q[1]) * 110_540);
const boxAround = ([x, y]: Position, m: number): BBox => {
  const dx = m / (111_320 * Math.cos((y * Math.PI) / 180)), dy = m / 110_540;
  return [x - dx, y - dy, x + dx, y + dy];
};
/** Nearest points of two polylines: an actual crossing (distance 0) or the closest vertex-to-segment approach. */
function nearest(a: Position[][], b: Position[][]): [number, Position] | null {
  const sx = (p: Position) => p[0] * Math.cos((p[1] * Math.PI) / 180);
  let best: [number, Position] | null = null;
  const consider = (d: number, at: Position) => { if (!best || d < best[0]) best = [d, at]; };
  const onSeg = (p: Position, q: Position, r: Position): Position => {
    const dx = sx(r) - sx(q), dy = r[1] - q[1], L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((sx(p) - sx(q)) * dx + (p[1] - q[1]) * dy) / L)) : 0;
    return [q[0] + t * (r[0] - q[0]), q[1] + t * (r[1] - q[1])];
  };
  for (const la of a) for (const lb of b) {
    for (let i = 1; i < la.length; i++) for (let j = 1; j < lb.length; j++) {
      const [p1, p2, q1, q2] = [la[i - 1], la[i], lb[j - 1], lb[j]];
      const d1x = sx(p2) - sx(p1), d1y = p2[1] - p1[1], d2x = sx(q2) - sx(q1), d2y = q2[1] - q1[1];
      const den = d1x * d2y - d1y * d2x;
      if (den) {
        const t = ((sx(q1) - sx(p1)) * d2y - (q1[1] - p1[1]) * d2x) / den, u = ((sx(q1) - sx(p1)) * d1y - (q1[1] - p1[1]) * d1x) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) { consider(0, [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * d1y]); continue; }
      }
      for (const [p, q, r] of [[p1, q1, q2], [p2, q1, q2], [q1, p1, p2], [q2, p1, p2]] as Position[][]) {
        const at = onSeg(p, q, r);
        consider(metres(p, at), [(p[0] + at[0]) / 2, (p[1] + at[1]) / 2]);
      }
    }
  }
  return best;
}
const boxOf = (pts: Position[]): BBox => [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
const lookup = <T>(m: Map<string, T>, name: string) => m.get(name) ?? [...m.entries()].find(([k]) => k.toLowerCase() === name.trim().toLowerCase())?.[1];

/** Where a guess's map names put it: a named place, the crossing of two streets (their nearest
 *  crossing or nearest approach, within 120 m), or a whole street. Null when the names aren't in the area's map data. */
export function placeFromMap(g: Pick<RawGuess, "place" | "streets">, gaz: Gazetteer): { center: [number, number]; bbox: BBox; precision: LocateGuess["precision"] } | null {
  if (g.place) {
    const p = gaz.places.find((x) => x.name === g.place) ?? gaz.places.find((x) => x.name.toLowerCase() === g.place.trim().toLowerCase());
    if (p) return { center: [p.at[0], p.at[1]], bbox: boxAround(p.at, 80), precision: "exact" };
  }
  const lines = g.streets.map((s) => lookup(gaz.streets, s)).filter((x): x is Position[][] => !!x);
  if (lines.length >= 2) {
    const best = nearest(lines[0], lines[1]);
    if (best && best[0] < 120) return { center: [best[1][0], best[1][1]], bbox: boxAround(best[1], 90), precision: "exact" };
  }
  if (lines.length) {
    const b = boxOf(lines[0].flat().filter((p) => inBox(p, gaz.bbox)));
    return { center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], bbox: b, precision: "street" };
  }
  return null;
}

// ── geocoding ─────────────────────────────────────────────────────────────────

/** Nominatim allows 1 request/second: lookups are serialized process-wide. */
let queue: Promise<unknown> = Promise.resolve();
type NomRow = { lat: string; lon: string; display_name: string; name?: string; boundingbox?: string[] };
function nominatim(query: string, signal?: AbortSignal, within?: BBox): Promise<NomRow | null> {
  const job = queue.then(async () => {
    const q = new URLSearchParams({ q: query, format: "json", limit: "1" });
    if (within) { q.set("viewbox", [within[0], within[3], within[2], within[1]].join(",")); q.set("bounded", "1"); }
    try {
      const rows = await getJson<NomRow[]>(`https://nominatim.openstreetmap.org/search?${q}`, { timeoutMs: 6000, signal });
      return rows[0] ?? null;
    } catch { return null; } finally { await sleep(1100); }
  });
  queue = job.catch(() => null);
  return job;
}

/** Smallest map box per precision: a city-level or broader guess never zooms to street level. */
const ZOOM_MIN_SPAN: Record<LocateGuess["precision"], number> = { exact: 0, street: 0, city: 0.08, region: 0.6, country: 3 };
const RANK: LocateGuess["precision"][] = ["exact", "street", "city", "region", "country"];
const widen = (p: LocateGuess["precision"], floor: LocateGuess["precision"]) => (RANK.indexOf(p) < RANK.indexOf(floor) ? floor : p);

function fitBox(center: [number, number], bbox: BBox | undefined, precision: LocateGuess["precision"]): BBox | undefined {
  const span = ZOOM_MIN_SPAN[precision];
  if (span && (!bbox || bbox[2] - bbox[0] < span)) return [center[0] - span / 2, center[1] - span / 2, center[0] + span / 2, center[1] + span / 2];
  return bbox;
}

export function placeGuess(g: Pick<RawGuess, "name" | "precision" | "confidence" | "clues">, row: NomRow): LocateGuess | null {
  const lon = Number(row.lon), lat = Number(row.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const bb = row.boundingbox?.map(Number);
  const raw: BBox | undefined = bb?.length === 4 && bb.every(Number.isFinite) ? [bb[2], bb[0], bb[3], bb[1]] : undefined;
  const parts = row.display_name.split(",").map((s) => s.trim());
  return { name: g.name, detail: parts.slice(1, 4).join(", ") || parts[0], center: [lon, lat], bbox: fitBox([lon, lat], raw, g.precision), precision: g.precision, confidence: g.confidence, clues: g.clues, via: "geocoder" };
}

// ── the request ────────────────────────────────────────────────────────────────

export async function locateImage(data: string, mediaType: LocateType, signal: AbortSignal, area?: LocateArea): Promise<LocateResult> {
  const gaz = area ? await areaGazetteer(area, signal).catch(() => null) : null;
  const ask = area
    ? `Where in this area was this photo taken?\n\n${AREA_RULES}\n\nAREA: lng ${area.bbox[0].toFixed(5)} to ${area.bbox[2].toFixed(5)}, lat ${area.bbox[1].toFixed(5)} to ${area.bbox[3].toFixed(5)}.\n\n${gaz ? gazetteerText(gaz) : "(the area's map names couldn't be loaded: use query only)"}`
    : "Where was this photo taken?";
  const res = await llm()!.beta.messages.create({
    model: WORKER_MODEL,
    max_tokens: 2000,
    output_config: { effort: "medium", format: betaZodOutputFormat(LocateSchema) },
    ...FALLBACK,
    system: SYSTEM,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      { type: "text", text: ask },
    ] }],
  }, { signal });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = LocateSchema.safeParse(JSON.parse(text || "{}"));
  if (!parsed.success) throw new Error("locate output did not match schema");
  // People in the photo, or a private home's interior: city level at most, enforced here.
  const capped = parsed.data.peopleVisible ? "people" as const : parsed.data.privateInterior ? "home" as const : undefined;
  const guesses: LocateGuess[] = [];
  for (const raw of parsed.data.guesses.slice(0, 3)) {
    const g = capped ? { ...raw, precision: widen(raw.precision, "city"), place: "", streets: [] } : raw;
    const fromMap = gaz && placeFromMap(g, gaz);
    if (fromMap) {
      guesses.push({ name: g.name, detail: g.streets.length ? g.streets.join(" & ") : g.place, center: fromMap.center, bbox: fromMap.bbox, precision: fromMap.precision, confidence: g.confidence, clues: g.clues, via: "map" });
      continue;
    }
    const row = await nominatim(g.query, signal, area?.bbox) ?? (area ? await nominatim(g.query, signal) : null);
    const p = row && placeGuess(g, row);
    if (p) guesses.push(p);
  }
  return {
    summary: parsed.data.summary, guesses, model: WORKER_MODEL, ...(capped ? { capped } : {}),
    ...(gaz ? { area: { streets: gaz.streets.size, places: gaz.places.length, sampled: gaz.sampled } } : {}),
  };
}
