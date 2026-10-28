import { LOCATE_MAX_B64, LOCATE_TYPES, locateImage, type LocateType } from "@/lib/locate";
import { llm } from "@/lib/llm";
import { liveStore } from "@/lib/server/liveRun";
import { decideLlm } from "@/lib/server/llmQuota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST {image: base64, mediaType} → {summary, guesses: [{name, detail, center, bbox?, precision, confidence, clues}]}.
// Counts against the same hourly Claude caps as research runs.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { image?: unknown; mediaType?: unknown } | null;
  const image = typeof body?.image === "string" ? body.image.replace(/^data:[^,]*,/, "") : "";
  const mediaType = body?.mediaType as LocateType;
  if (!image || !LOCATE_TYPES.includes(mediaType)) return Response.json({ error: "body must be {image: base64, mediaType: image/jpeg|png|webp|gif}" }, { status: 400 });
  if (image.length > LOCATE_MAX_B64) return Response.json({ error: "Image too large (max ~3 MB)." }, { status: 413 });
  if (!llm()) return Response.json({ error: "No Claude key configured: photo search is unavailable." }, { status: 503 });
  const decision = await decideLlm(req, liveStore());
  if (!decision.llm) return Response.json({ error: "Hourly Claude limit reached: try again later." }, { status: 429 });
  try {
    return Response.json(await locateImage(image, mediaType, req.signal));
  } catch (e) {
    console.warn("[locate] failed:", (e as Error).message);
    return Response.json({ error: "Couldn't analyse that image." }, { status: 502 });
  }
}
