import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import { distanceM, inRegion } from "@/lib/geo";

// Wikipedia GeoSearch (no key, global): geotagged articles inside the area, ranked by recent pageviews,
// with a short intro extract. Good for "what is this place known for" and historic context.
const API = "https://en.wikipedia.org/w/api.php";
const SKIP = /congressional district|assembly district|senate district|census|zip code|electoral|unincorporated|human settlement/i;
const HISTORIC = /histor|landmark|national register|built in|founded|established|\b1[6-9]\d\d\b|church|theat(er|re)|monument|museum|memorial|mural/i;

interface Geo { pageid: number; title: string; lat: number; lon: number }
interface Page { pageid: number; title: string; description?: string; extract?: string; pageviews?: Record<string, number | null> }

export const landmarksWorker: Worker = {
  id: "wiki-landmarks",
  name: "Chronicle",
  description: "Finds notable places and history in the area from geotagged Wikipedia articles (landmarks, historic buildings, venues, institutions), ranked by how much people read about them.",
  vehicle: "drone",
  color: "#d7a8e8",
  tools: ["http_get"],
  dataSources: ["Wikipedia GeoSearch + extracts + pageviews"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    const [a, b, c, d] = r.bbox;
    const big = distanceM([a, b], [c, d]) > 14_000;
    const geoQs = big
      ? `gscoord=${r.center[1]}|${r.center[0]}&gsradius=10000`
      : `gsbbox=${d}|${a}|${b}|${c}`;
    log("Searching geotagged Wikipedia articles…");
    const gs = await getJson<{ query?: { geosearch: Geo[] }; error?: { info: string } }>(`${API}?action=query&list=geosearch&${geoQs}&gslimit=150&gsprimary=primary&format=json&origin=*`, { signal });
    if (gs.error) throw new Error(`Wikipedia: ${gs.error.info}`);
    const hits = (gs.query?.geosearch ?? []).filter((g) => inRegion(r, g.lon, g.lat));
    log(`${hits.length} articles inside the area`);
    if (!hits.length) {
      emit({ claim: "No geotagged Wikipedia articles inside this area", geometry: { type: "Point", coordinates: r.center }, source_url: "https://en.wikipedia.org/wiki/Special:Nearby", source_type: "wikipedia", confidence: 0.6, category: "landmark", severity: 0.05, props: { areaLevel: true, count: 0 } });
      return;
    }
    // Details in batches of 20 (the extracts limit).
    const batches: Geo[][] = [];
    for (let i = 0; i < Math.min(hits.length, 100); i += 20) batches.push(hits.slice(i, i + 20));
    const pages = new Map<number, Page>();
    await Promise.all(batches.map(async (bt) => {
      const res = await getJson<{ query?: { pages: Page[] } }>(
        `${API}?action=query&pageids=${bt.map((g) => g.pageid).join("|")}&prop=description|extracts|pageviews&exintro=1&explaintext=1&exsentences=2&exlimit=20&pvipdays=30&format=json&formatversion=2&origin=*`, { signal },
      ).catch(() => null);
      for (const p of res?.query?.pages ?? []) pages.set(p.pageid, p);
    }));
    const rows = hits.map((g) => {
      const p = pages.get(g.pageid);
      const views = Object.values(p?.pageviews ?? {}).reduce<number>((s, v) => s + (v ?? 0), 0);
      return { g, p, views, desc: p?.description ?? "", extract: (p?.extract ?? "").replace(/\s+/g, " ").trim() };
    }).filter((x) => !SKIP.test(`${x.desc} ${x.g.title}`));
    rows.sort((x, y) => y.views - x.views);
    const maxViews = Math.max(1, rows[0]?.views ?? 1);
    const historic = rows.filter((x) => HISTORIC.test(`${x.desc} ${x.extract}`));
    emit({
      claim: `${rows.length} notable places with Wikipedia articles in the area${historic.length ? ` (${historic.length} historic or cultural)` : ""}. Most-read: ${rows.slice(0, 5).map((x) => x.g.title).join(", ")}`,
      geometry: { type: "Point", coordinates: r.center },
      source_url: `https://en.wikipedia.org/wiki/Special:Nearby#/coord/${r.center[1]},${r.center[0]}`, source_type: "wikipedia", confidence: 0.8,
      category: "landmark", severity: +Math.min(0.6, 0.15 + rows.length / 100).toFixed(2),
      props: { areaLevel: true, count: rows.length, historicCount: historic.length, top: rows.slice(0, 10).map((x) => x.g.title) },
    });
    for (const x of rows.slice(0, 22)) {
      const ex = x.extract.length > 260 ? `${x.extract.slice(0, 257).replace(/\s\S*$/, "")}…` : x.extract;
      emit({
        claim: `${x.g.title}${x.desc ? ` (${x.desc})` : ""}${ex ? `: ${ex}` : ""}`,
        geometry: { type: "Point", coordinates: [x.g.lon, x.g.lat] },
        source_url: `https://en.wikipedia.org/?curid=${x.g.pageid}`, source_type: "wikipedia", confidence: 0.8, category: "landmark",
        severity: +(0.15 + 0.55 * Math.sqrt(x.views / maxViews)).toFixed(2),
        props: { title: x.g.title, description: x.desc || null, pageviews30d: x.views, historic: HISTORIC.test(`${x.desc} ${x.extract}`), pageid: x.g.pageid },
      });
    }
  },
};
