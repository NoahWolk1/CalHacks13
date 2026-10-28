import { LOCATE_MAX_B64, LOCATE_TYPES, locateImage, type LocateArea, type LocateType } from "@/lib/locate";
import { llm } from "@/lib/llm";
import { liveStore } from "@/lib/server/liveRun";
import { decideLlm } from "@/lib/server/llmQuota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST {image: base64, mediaType, area?: {bbox, center}} → {summary, guesses: [{name, detail, center, bbox?, precision, confidence, clues}]}.
// With an area, the photo is searched for within it at street level (see locate.ts). Counts against the same hourly Claude caps as research runs.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { image?: unknown; mediaType?: unknown; area?: unknown } | null;
  const image = typeof body?.image === "string" ? body.image.replace(/^data:[^,]*,/, "") : "";
  const mediaType = body?.mediaType as LocateType;
  if (!image || !LOCATE_TYPES.includes(mediaType)) return Response.json({ error: "body must be {image: base64, mediaType: image/jpeg|png|webp|gif}" }, { status: 400 });
  if (image.length > LOCATE_MAX_B64) return Response.json({ error: "Image too large (max ~3 MB)." }, { status: 413 });
  const area = parseArea(body?.area);
  if (body?.area && !area) return Response.json({ error: "area must be {bbox: [minLng, minLat, maxLng, maxLat], center: [lng, lat]}, at most 0.5° across" }, { status: 400 });
  if (!llm()) return Response.json({ error: "No Claude key configured: photo search is unavailable." }, { status: 503 });
  const decision = await decideLlm(req, liveStore());
  if (!decision.llm) return Response.json({ error: "Hourly Claude limit reached: try again later." }, { status: 429 });
  try {
    return Response.json(await locateImage(image, mediaType, req.signal, area ?? undefined));
  } catch (e) {
    console.warn("[locate] failed:", (e as Error).message);
    return Response.json({ error: "Couldn't analyse that image." }, { status: 502 });
  }
}

/** A selected area small enough to read street names for (0.5° ≈ 50 km). */
function parseArea(v: unknown): LocateArea | null {
  const a = v as { bbox?: unknown; center?: unknown } | null;
  const bbox = a?.bbox, center = a?.center;
  const nums = (x: unknown, n: number): x is number[] => Array.isArray(x) && x.length === n && x.every((k) => typeof k === "number" && Number.isFinite(k));
  if (!nums(bbox, 4) || !nums(center, 2)) return null;
  const [x0, y0, x1, y1] = bbox;
  if (x1 <= x0 || y1 <= y0 || x1 - x0 > 0.5 || y1 - y0 > 0.5 || y0 < -85 || y1 > 85) return null;
  return { bbox: [x0, y0, x1, y1], center: [center[0], center[1]] };
}
