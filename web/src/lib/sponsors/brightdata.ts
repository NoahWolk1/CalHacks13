// Bright Data: live public web data for Rent Scout (Web Unlocker), Local Pulse (SERP API) and the
// generated agents' page-fetch tool. One endpoint for both products (docs.brightdata.com):
//   POST https://api.brightdata.com/request   Authorization: Bearer <BRIGHTDATA_API_TOKEN>
//   { zone, url, format: "raw", data_format?: "markdown" | "parsed_light" }
// The same body shape the official Bright Data MCP server sends. Responses go through lib/http's
// cache (keyed by url + body, never the token), so a repeated demo run doesn't re-bill.

import { getText } from "@/lib/http";

const ENDPOINT = "https://api.brightdata.com/request";

const env = (k: string) => process.env[k]?.trim() || undefined;
export const brightData = {
  token: () => env("BRIGHTDATA_API_TOKEN"),
  unlockerZone: () => env("BRIGHTDATA_UNLOCKER_ZONE"),
  /** SERP zone; Bright Data also serves Google SERPs through an Unlocker zone, so fall back to it. */
  serpZone: () => env("BRIGHTDATA_SERP_ZONE") ?? env("BRIGHTDATA_UNLOCKER_ZONE"),
};

/** Env vars still missing for each Bright Data product (empty = ready). */
export const brightDataMissing = {
  unlocker: () => [!brightData.token() && "BRIGHTDATA_API_TOKEN", !brightData.unlockerZone() && "BRIGHTDATA_UNLOCKER_ZONE"].filter(Boolean) as string[],
  serp: () => [!brightData.token() && "BRIGHTDATA_API_TOKEN", !brightData.serpZone() && "BRIGHTDATA_SERP_ZONE"].filter(Boolean) as string[],
};

type Opts = { signal?: AbortSignal; timeoutMs?: number; retries?: number };

async function request(body: Record<string, string>, opts: Opts): Promise<string> {
  const token = brightData.token();
  if (!token) throw new Error("needs BRIGHTDATA_API_TOKEN");
  return getText(ENDPOINT, {
    signal: opts.signal,
    timeoutMs: opts.timeoutMs ?? 25_000,
    retries: opts.retries ?? 1, // Unlocker already retries upstream; one more try covers a dropped connection
    init: { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) },
  });
}

/** Fetch a public page through Web Unlocker (handles blocks/CAPTCHAs). `markdown` for LLM reading, `raw` for parsing HTML. */
export async function unlock(url: string, opts: Opts & { as?: "raw" | "markdown"; country?: string } = {}): Promise<string> {
  const zone = brightData.unlockerZone();
  if (!zone) throw new Error("needs BRIGHTDATA_UNLOCKER_ZONE");
  const body: Record<string, string> = { zone, url, format: "raw" };
  if (opts.as === "markdown") body.data_format = "markdown";
  if (opts.country) body.country = opts.country;
  return request(body, opts);
}

export interface SerpResult { title: string; link: string; description?: string; source?: string; date?: string; kind: "organic" | "news" }

/** Google search through the SERP API, parsed to JSON (brd_json=1 + parsed_light). */
export async function googleSearch(q: string, opts: Opts & { recency?: "d" | "w" | "m" | "y"; num?: number } = {}): Promise<SerpResult[]> {
  const zone = brightData.serpZone();
  if (!zone) throw new Error("needs BRIGHTDATA_SERP_ZONE");
  const params = new URLSearchParams({ q, hl: "en", gl: "us", num: String(opts.num ?? 10) });
  if (opts.recency) params.set("tbs", `qdr:${opts.recency}`);
  // SERP latency varies 4-15 s; a short timeout and no retry keep the agent inside its 30 s budget.
  // country=us routes through US IPs so results are localized (otherwise a random country, e.g. Romania).
  const raw = await request({ zone, url: `https://www.google.com/search?${params}&brd_json=1`, format: "raw", data_format: "parsed_light", country: "us" }, { timeoutMs: 20_000, retries: 0, ...opts });
  return parseSerp(raw);
}

/** Parsed SERP JSON → flat results. Tolerates both light and full JSON shapes. */
export function parseSerp(raw: string): SerpResult[] {
  let j: { organic?: unknown[]; news?: unknown[]; top_stories?: unknown[] };
  try { j = JSON.parse(raw); } catch { throw new Error(`SERP API returned non-JSON (${raw.slice(0, 60)})`); }
  const out: SerpResult[] = [];
  const take = (rows: unknown[] | undefined, kind: SerpResult["kind"]) => {
    for (const r of rows ?? []) {
      const o = r as Record<string, unknown>;
      if (typeof o.link !== "string" || typeof o.title !== "string") continue;
      out.push({ kind, title: o.title, link: o.link, description: typeof o.description === "string" ? o.description : undefined, source: typeof o.source === "string" ? o.source : undefined, date: typeof o.date === "string" ? o.date : undefined });
    }
  };
  take(j.news ?? j.top_stories, "news");
  take(j.organic, "organic");
  return out;
}
