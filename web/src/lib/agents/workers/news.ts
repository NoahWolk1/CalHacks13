import type { Worker } from "@/lib/types";
import { getText } from "@/lib/http";
import { XMLParser } from "fast-xml-parser";

// Local news via Google News RSS search on the area's name. No key.
export const newsWorker: Worker = {
  id: "local-news",
  name: "News Uplink",
  description: "Searches recent local news coverage about the area (development fights, closures, crime, disasters, openings).",
  vehicle: "satellite",
  color: "#a28be6",
  tools: ["search"],
  dataSources: ["Google News RSS"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const place = task.region.label;
    if (!place) { log("No place name for this area; skipping news."); return; }
    const topic = task.focus ?? "";
    const q = `"${place.split(",")[0]}"${topic ? ` ${topic}` : ""} when:365d`;
    log(`Searching news: ${q}`);
    const xml = await getText(`https://news.google.com/rss/search?${new URLSearchParams({ q, hl: "en-US", gl: "US", ceid: "US:en" })}`, { signal });
    const items = [new XMLParser().parse(xml)?.rss?.channel?.item ?? []].flat() as { title: string; link: string; pubDate: string; source?: string | { "#text": string } }[];
    log(`${items.length} articles`);
    for (const it of items.slice(0, 8)) {
      const when = new Date(it.pubDate);
      emit({
        claim: String(it.title),
        geometry: { type: "Point", coordinates: task.region.center },
        source_url: it.link, source_type: "news_article", observed_at: Number.isNaN(when.getTime()) ? undefined : when.toISOString().slice(0, 10),
        confidence: 0.6, category: "news", severity: 0.3, props: { areaLevel: true },
      });
    }
  },
};
