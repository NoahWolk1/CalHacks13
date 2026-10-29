// Observer agent: fetches a real DSS2 colour cutout of the cone (CDS hips2fits) and has Claude look
// at it alongside the catalog results, reporting a few visual observations tied to result ids.
// Ids that don't exist are dropped (same rule as summary.ts); observations citing nothing are kept
// only when they never claimed an id (pure visual description), so made-up citations can't survive.
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getBuffer } from "@/lib/http";
import { FALLBACK, llm, WORKER_MODEL, logUsage } from "@/lib/llm";
import { formatDec, formatRa } from "./geom";
import { compactObjects } from "./summary";
import type { Cone, SkyObject, SkyObserver } from "./types";

export const HIPS2FITS = "https://alasky.cds.unistra.fr/hips-image-services/hips2fits";
export const CUTOUT_PX = 512;
export const CUTOUT_TIMEOUT_MS = 8_000;

export function cutoutUrl(c: Cone, px = CUTOUT_PX) {
  const q = new URLSearchParams({
    hips: "CDS/P/DSS2/color", width: String(px), height: String(px), fov: (2 * c.radius).toFixed(5),
    projection: "TAN", coordsys: "icrs", ra: c.ra.toFixed(5), dec: c.dec.toFixed(5), format: "jpg",
  });
  return `${HIPS2FITS}?${q}`;
}

export const ObserverSchema = z.object({
  observations: z.array(z.object({ text: z.string(), ids: z.array(z.string()) })),
});
export type RawObserver = z.infer<typeof ObserverSchema>;

/** Drops ids that aren't real results (and inline [ID] markers for them). An observation that
 *  cited ids but has none left is dropped; one that never cited any is kept as pure description. */
export function filterObservations(raw: RawObserver, valid: Set<string>) {
  let dropped = 0;
  const observations = raw.observations.flatMap((o) => {
    const claimed = o.ids.map((x) => x.replace(/[[\]\s]/g, "")).filter(Boolean);
    const ids = [...new Set(claimed.filter((x) => valid.has(x)))];
    const text = o.text.replace(/\s*\[([A-Z]\d+)\]/g, (m, id: string) => (valid.has(id) ? m : "")).trim();
    if (!text || (claimed.length && !ids.length)) { dropped++; return []; }
    return [{ text, ids }];
  }).slice(0, 5);
  return { observations, dropped };
}

export async function skyObserver(c: Cone, objects: SkyObject[], signal: AbortSignal): Promise<SkyObserver> {
  const image = cutoutUrl(c);
  const buf = await getBuffer(image, { timeoutMs: CUTOUT_TIMEOUT_MS, signal });
  const data = Buffer.from(buf).toString("base64");
  // Catalog objects inside the cutout, nearest-first as the agents returned them; skip broad archive summaries.
  const listed = objects.filter((o) => o.category !== "observation").slice(0, 40);
  const res = await llm()!.beta.messages.create({
    model: WORKER_MODEL,
    max_tokens: 1200,
    output_config: { effort: "low", format: betaZodOutputFormat(ObserverSchema) },
    ...FALLBACK,
    system: "You are an observational astronomer looking at a Digitized Sky Survey (DSS2, optical colour) image of one region of sky. North is up, east is left; the image spans the full diameter of the search cone. Report 3-5 concise visual observations (each at most 30 words): morphology, dust lanes, nebulosity and its colour, star density, bright stars, notable features or artefacts. Describe only what is visible in the image. Where a feature corresponds to a catalog object in the list, put its exact id (e.g. S1) in `ids`; leave `ids` empty for purely visual remarks. Never cite an id that isn't in the list. No preamble.",
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
        { type: "text", text: `IMAGE: ${CUTOUT_PX}x${CUTOUT_PX} px, centred RA ${c.ra.toFixed(4)}° (${formatRa(c.ra)}), Dec ${c.dec.toFixed(4)}° (${formatDec(c.dec)}), field of view ${(2 * c.radius).toFixed(3)}°.\n\nCATALOG OBJECTS IN THIS FIELD\n${compactObjects(listed) || "(none)"}` },
      ],
    }],
  }, { signal });
  logUsage("sky:observer", WORKER_MODEL, res.usage);
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = ObserverSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("observer output did not match schema");
  return { ...filterObservations(parsed.data, new Set(objects.map((o) => o.id))), image, model: WORKER_MODEL };
}
