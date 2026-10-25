// Apify: run an Actor synchronously and get its dataset items in one call (docs.apify.com/api/v2):
//   POST https://api.apify.com/v2/acts/<user>~<actor>/run-sync-get-dataset-items?timeout=&memory=&maxItems=&maxTotalChargeUsd=
//   Authorization: Bearer <APIFY_TOKEN>, JSON body = Actor input.
// The token goes in the header, never the URL, so lib/http's disk cache never stores it. Cached results
// (same actor + input) are reused for 6 h: cheap repeat demo runs, still real scraped data.

import { getJson } from "@/lib/http";

export const apifyToken = () => process.env.APIFY_TOKEN?.trim() || undefined;

export interface ActorRunOpts {
  signal?: AbortSignal;
  /** Actor run timeout (s). The HTTP wait gets +8 s on top. */
  timeoutSec: number;
  memoryMb?: number;
  /** Cost caps for pay-per-result / pay-per-event actors. */
  maxItems?: number;
  maxTotalChargeUsd?: number;
}

/** `user/actor` or `user~actor` → API path id. */
export const actorPath = (actor: string) => encodeURIComponent(actor.trim().replace("/", "~"));

export async function runActor<T>(actor: string, input: unknown, opts: ActorRunOpts): Promise<T[]> {
  const token = apifyToken();
  if (!token) throw new Error("needs APIFY_TOKEN");
  const q = new URLSearchParams({ timeout: String(opts.timeoutSec), clean: "1", format: "json" });
  if (opts.memoryMb) q.set("memory", String(opts.memoryMb));
  if (opts.maxItems) q.set("maxItems", String(opts.maxItems));
  // Apify rejects caps below $0.50 per run (it is a ceiling, not the expected cost).
  if (opts.maxTotalChargeUsd) q.set("maxTotalChargeUsd", String(Math.max(0.5, opts.maxTotalChargeUsd)));
  const items = await getJson<T[]>(`https://api.apify.com/v2/acts/${actorPath(actor)}/run-sync-get-dataset-items?${q}`, {
    signal: opts.signal,
    timeoutMs: (opts.timeoutSec + 8) * 1000,
    retries: 0, // every attempt is a billed actor run
    init: { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(input) },
  });
  if (!Array.isArray(items)) throw new Error("Apify returned no dataset items");
  return items;
}
