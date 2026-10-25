// One Claude call that writes a short, cited summary of what the sky agents found. Citations must
// be real result ids: unknown ids are dropped and a bullet left citing nothing is dropped (mirrors
// the orchestrator's insight-citation check).
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { FALLBACK, llm, MODEL } from "@/lib/llm";
import { formatDec, formatRa } from "./geom";
import type { Cone, SkyObject, SkySourceReport, SkySummary } from "./types";

export const SummarySchema = z.object({
  headline: z.string(),
  bullets: z.array(z.object({ text: z.string(), ids: z.array(z.string()) })),
});
export type RawSummary = z.infer<typeof SummarySchema>;

/** Keeps only citations that name a real result; drops bullets with none left. */
export function filterCitations(raw: RawSummary, valid: Set<string>): SkySummary {
  let dropped = 0;
  const bullets = raw.bullets.flatMap((b) => {
    const ids = [...new Set(b.ids.map((x) => x.replace(/[[\]\s]/g, "")).filter((x) => valid.has(x)))];
    // Inline [ID] markers that don't exist are stripped from the text too.
    const text = b.text.replace(/\s*\[([A-Z]\d+)\]/g, (m, id: string) => (valid.has(id) ? m : "")).trim();
    if (!ids.length) { dropped++; return []; }
    return [{ text, ids }];
  });
  return { headline: raw.headline.trim(), bullets, dropped };
}

export function compactObjects(objects: SkyObject[]) {
  return objects.map((o) => {
    const p = Object.entries(o.props).slice(0, 6).map(([k, v]) => `${k}=${v}`).join("; ");
    return `[${o.id}] ${o.name} (${o.type}) RA ${o.ra.toFixed(3)} Dec ${o.dec.toFixed(3)} · ${p}`;
  }).join("\n");
}

export async function skySummary(c: Cone, objects: SkyObject[], sources: SkySourceReport[], signal: AbortSignal): Promise<SkySummary> {
  const coverage = sources.map((s) => `- ${s.label}: ${s.status === "error" ? `FAILED (${s.error})` : `${s.count} results`}`).join("\n");
  const res = await llm()!.beta.messages.create({
    model: MODEL,
    max_tokens: 1500,
    output_config: { effort: "low", format: betaZodOutputFormat(SummarySchema) },
    ...FALLBACK,
    system: "You are an astronomy research assistant. Several agents queried public catalogs (SIMBAD, NASA Exoplanet Archive, JPL Horizons) for one region of the sky. Write a short briefing for a curious non-expert: a one-sentence headline naming what this patch of sky is, then 3–5 bullets (each at most 35 words) on the most interesting objects and what makes them notable (type, distance, brightness, planets). Every bullet cites the result ids it rests on in `ids` (exact ids like S1, X2, J1). Use only facts in the results; general astronomy context is fine but never invent numbers. If a source failed or found nothing, say so in one bullet citing the closest relevant result, or omit it. No preamble.",
    messages: [{
      role: "user",
      content: `REGION: cone centered RA ${c.ra.toFixed(4)}° (${formatRa(c.ra)}), Dec ${c.dec.toFixed(4)}° (${formatDec(c.dec)}), radius ${c.radius.toFixed(3)}°\n\nCOVERAGE\n${coverage}\n\nRESULTS\n${compactObjects(objects.slice(0, 80))}`,
    }],
  }, { signal });
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const parsed = SummarySchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("summary did not match schema");
  return filterCitations(parsed.data, new Set(objects.map((o) => o.id)));
}
