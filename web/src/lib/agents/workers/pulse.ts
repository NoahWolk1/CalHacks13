import type { Worker } from "@/lib/types";
import { googleSearch, type SerpResult } from "@/lib/sponsors/brightdata";
import { missingEnv, needsLog } from "@/lib/sponsors/keys";
import { placeParts, searchTopic } from "@/lib/sponsors/topic";

// What people are saying about the area right now: live Google results through the Bright Data
// SERP API, one news/web query on the question's topic and one restricted to community threads
// (Reddit, Nextdoor public posts). Area-level findings with links.

const COMMUNITY = /(^|\.)(reddit\.com|nextdoor\.com)$/i;
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export function pickPulse(web: SerpResult[], community: SerpResult[], max = 8): (SerpResult & { community: boolean })[] {
  const seen = new Set<string>();
  const out: (SerpResult & { community: boolean })[] = [];
  const add = (r: SerpResult) => {
    const key = r.link.split("#")[0].replace(/\/$/, "");
    if (seen.has(key) || /google\.com\/(search|maps)/.test(r.link)) return;
    seen.add(key);
    out.push({ ...r, community: COMMUNITY.test(host(r.link)) });
  };
  // Interleave so a question gets both press coverage and resident threads.
  const c = community.filter((r) => COMMUNITY.test(host(r.link)));
  for (let i = 0; out.length < max && (i < web.length || i < c.length); i++) {
    if (web[i]) add(web[i]);
    if (out.length < max && c[i]) add(c[i]);
  }
  return out.slice(0, max);
}

export const pulseWorker: Worker = {
  id: "brightdata-pulse",
  name: "Local Pulse",
  description: "Live Google search of news and resident discussion (Reddit, Nextdoor) about the neighborhood and the question's topic: closures, openings, complaints, flooding, safety, development fights. Via Bright Data SERP API.",
  vehicle: "satellite",
  color: "#d6dc8a",
  tools: ["search"],
  dataSources: ["Google Search via Bright Data SERP API", "Reddit / Nextdoor public threads (via Google)"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const missing = missingEnv(pulseWorker);
    if (missing.length) { log(needsLog(missing)); return; }
    const { place, city } = placeParts(task.region.label);
    if (!place) { log("No place name for this area; skipping."); return; }
    const where = `"${place}"${city && city !== place ? ` ${city}` : ""}`;
    const topic = searchTopic(task.question, task.focus);
    const q1 = `${where} ${topic}`.trim();
    const q2 = `${where} ${topic} (site:reddit.com OR site:nextdoor.com)`.replace(/\s+/g, " ");
    log(`Bright Data SERP: ${q1}`);
    log(`Bright Data SERP: ${q2}`);
    const [web, community] = await Promise.all([
      googleSearch(q1, { signal, recency: "y" }),
      googleSearch(q2, { signal }).catch((e) => { log(`Community search failed: ${(e as Error).message.slice(0, 80)}`); return []; }),
    ]);
    const picks = pickPulse(web, community);
    log(`${web.length} web + ${community.length} community results → ${picks.length} kept`);
    if (!picks.length) { log("No results for this area and topic."); return; }
    for (const r of picks) {
      const src = r.source ?? host(r.link);
      emit({
        claim: `${r.community ? "Resident thread" : "Web"} (${src}): ${r.title}${r.description ? ` — ${r.description.slice(0, 180)}` : ""}`,
        geometry: { type: "Point", coordinates: task.region.center },
        source_url: r.link, source_type: r.community ? "community_thread" : r.kind === "news" ? "news_article" : "web_page",
        observed_at: r.date && !Number.isNaN(Date.parse(r.date)) ? new Date(r.date).toISOString().slice(0, 10) : undefined,
        confidence: r.community ? 0.5 : 0.6, category: "pulse", severity: r.community ? 0.4 : 0.35,
        props: { areaLevel: true, query: r.community ? q2 : q1, source: src },
      });
    }
  },
};
