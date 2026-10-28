// Photo → place: Claude reads the visual clues in an uploaded image (landmarks, signs, script,
// architecture, terrain, vegetation, road markings) and names the places it could be; each guess is
// geocoded with Nominatim so the map can fly there. Places only: people in the photo are never
// identified, and photos of private homes resolve to a town or region, never an address.
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getJson, sleep } from "@/lib/http";
import { FALLBACK, llm, WORKER_MODEL } from "@/lib/llm";

export const LOCATE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type LocateType = (typeof LOCATE_TYPES)[number];
/** Base64 length cap (~3 MB of image), under Vercel's 4.5 MB request body limit. */
export const LOCATE_MAX_B64 = 4_000_000;

export const LocateSchema = z.object({
  summary: z.string(),
  guesses: z.array(z.object({
    name: z.string(),
    query: z.string(),
    precision: z.enum(["exact", "street", "city", "region", "country"]),
    confidence: z.enum(["high", "medium", "low"]),
    clues: z.string(),
  })),
});
export type RawLocate = z.infer<typeof LocateSchema>;

export type LocateGuess = {
  name: string; detail: string; center: [number, number]; bbox?: [number, number, number, number];
  precision: RawLocate["guesses"][number]["precision"]; confidence: RawLocate["guesses"][number]["confidence"]; clues: string;
};
export type LocateResult = { summary: string; guesses: LocateGuess[]; model: string };

const SYSTEM = `You are a geolocation analyst. Work out where a photo was taken from what is visible in it: landmarks, signs and shop names, language and script, licence plates, road markings and which side traffic drives on, architecture, utility poles, terrain, vegetation, weather and sun position, coastline or skyline shapes.

Return up to 3 guesses, most likely first. For each:
- name: the place as a person would say it (e.g. "Golden Gate Bridge, San Francisco").
- query: a search string a geocoder (OpenStreetMap Nominatim) will resolve, e.g. "Golden Gate Bridge, San Francisco, USA" or "Hallstatt, Austria". No coordinates.
- precision: how narrowly you can place it (exact landmark, street, city, region, country).
- confidence: high only for a recognisable landmark or legible sign that names the place.
- clues: the specific visual evidence, at most 30 words.
summary: one or two sentences on what the photo shows and how sure you are.

Places only, never people: don't identify, name or describe anyone in the photo. If the photo shows the inside or outside of what looks like a private home, or seems aimed at finding where a particular person lives or is right now, give at most the city or region (precision "city" or broader) and never a street or address. If there are no usable clues, return no guesses and say so in the summary. Don't invent clues that aren't visible.`;

/** Nominatim allows 1 request/second: lookups are serialized process-wide. */
let queue: Promise<unknown> = Promise.resolve();
type NomRow = { lat: string; lon: string; display_name: string; name?: string; boundingbox?: string[] };
function nominatim(query: string, signal?: AbortSignal): Promise<NomRow | null> {
  const job = queue.then(async () => {
    try {
      const rows = await getJson<NomRow[]>(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: "json", limit: "1" })}`, { timeoutMs: 6000, signal });
      return rows[0] ?? null;
    } catch { return null; } finally { await sleep(1100); }
  });
  queue = job.catch(() => null);
  return job;
}

/** Caps a guess's precision: a guess the model marked city-level or broader never gets a street-level box. */
const ZOOM_MIN_SPAN: Record<LocateGuess["precision"], number> = { exact: 0, street: 0, city: 0.08, region: 0.6, country: 3 };

export function placeGuess(g: RawLocate["guesses"][number], row: NomRow): LocateGuess | null {
  const lon = Number(row.lon), lat = Number(row.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const bb = row.boundingbox?.map(Number);
  let bbox: [number, number, number, number] | undefined = bb?.length === 4 && bb.every(Number.isFinite) ? [bb[2], bb[0], bb[3], bb[1]] : undefined;
  const span = ZOOM_MIN_SPAN[g.precision];
  if (span && (!bbox || bbox[2] - bbox[0] < span)) bbox = [lon - span / 2, lat - span / 2, lon + span / 2, lat + span / 2];
  const parts = row.display_name.split(",").map((s) => s.trim());
  return { name: g.name, detail: parts.slice(1, 4).join(", ") || parts[0], center: [lon, lat], bbox, precision: g.precision, confidence: g.confidence, clues: g.clues };
}

export async function locateImage(data: string, mediaType: LocateType, signal?: AbortSignal): Promise<LocateResult> {
  const res = await llm()!.beta.messages.create({
    model: WORKER_MODEL,
    max_tokens: 1500,
    output_config: { effort: "medium", format: betaZodOutputFormat(LocateSchema) },
    ...FALLBACK,
    system: SYSTEM,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      { type: "text", text: "Where was this photo taken?" },
    ] }],
  }, { signal });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = LocateSchema.safeParse(JSON.parse(text || "{}"));
  if (!parsed.success) throw new Error("locate output did not match schema");
  const guesses: LocateGuess[] = [];
  for (const g of parsed.data.guesses.slice(0, 3)) {
    const row = await nominatim(g.query, signal);
    const p = row && placeGuess(g, row);
    if (p) guesses.push(p);
  }
  return { summary: parsed.data.summary, guesses, model: WORKER_MODEL };
}
