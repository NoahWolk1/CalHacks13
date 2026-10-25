// Name lookup for the sky search: CDS Sesame (SIMBAD/NED/VizieR name resolver) for anything
// outside the solar system. Plain-text output: "%J ra dec" (J2000 degrees), "%C.0 otype", "%I.0 main id".
import { getText } from "@/lib/http";
import { LABEL, categoryOf, tidyName } from "./simbad";
import type { SkyCategory } from "./types";

export const SESAME = "https://cds.unistra.fr/cgi-bin/nph-sesame/-oI/SNV";

export type SkyHit = { name: string; type: string; category: SkyCategory; ra: number; dec: number; source: string };

export function parseSesame(text: string, query: string): SkyHit | null {
  const j = text.match(/^%J\s+([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)/m);
  if (!j) return null;
  const ra = Number(j[1]), dec = Number(j[2]);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) return null;
  const otype = text.match(/^%C\.0\s+(\S+)/m)?.[1] ?? "";
  const main = text.match(/^%I\.0\s+(.+)$/m)?.[1]?.trim();
  const via = text.match(/^#=\w+=(\w+)/m)?.[1] ?? "Simbad";
  return {
    name: query.trim(),
    type: [LABEL[otype] ?? (otype ? otype : "Object"), main && main.toLowerCase() !== query.trim().toLowerCase() ? tidyName(main) : ""].filter(Boolean).join(" · "),
    category: otype ? categoryOf(otype) : "other",
    ra, dec, source: via,
  };
}

export async function resolveName(q: string, signal?: AbortSignal): Promise<SkyHit | null> {
  const text = await getText(`${SESAME}?${encodeURIComponent(q.trim())}`, { signal, timeoutMs: 8_000, retries: 1 });
  return parseSesame(text, q);
}
