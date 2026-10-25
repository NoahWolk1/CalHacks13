import type { Worker } from "@/lib/types";
import { distanceM } from "@/lib/geo";
import { unlock } from "@/lib/sponsors/brightdata";
import { missingEnv, needsLog } from "@/lib/sponsors/keys";
import { median } from "@/lib/sponsors/topic";

// Live apartment listings around the area from Craigslist's public search page, fetched through
// Bright Data Web Unlocker (Craigslist blocks datacenter IPs). The page carries a JSON-LD ItemList
// (lat/lng, bedrooms) and a static result list (price, link) in the same order; we zip the two.
// Public, no-login pages only; robots.txt allows /search.

const METROS: { site: string; center: [number, number] }[] = [
  { site: "sfbay", center: [-122.42, 37.77] }, { site: "losangeles", center: [-118.25, 34.05] },
  { site: "sandiego", center: [-117.16, 32.72] }, { site: "seattle", center: [-122.33, 47.61] },
  { site: "portland", center: [-122.68, 45.52] }, { site: "newyork", center: [-73.99, 40.73] },
  { site: "boston", center: [-71.06, 42.36] }, { site: "chicago", center: [-87.63, 41.88] },
  { site: "washingtondc", center: [-77.04, 38.9] }, { site: "austin", center: [-97.74, 30.27] },
  { site: "denver", center: [-104.99, 39.74] }, { site: "sacramento", center: [-121.49, 38.58] },
  { site: "miami", center: [-80.19, 25.76] }, { site: "atlanta", center: [-84.39, 33.75] },
  { site: "philadelphia", center: [-75.16, 39.95] },
];

export interface Listing { title: string; url: string; price?: number; beds?: number; baths?: number; lng?: number; lat?: number }

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

/** Parse a Craigslist search results page (housing). */
export function parseCraigslist(html: string): Listing[] {
  const ld = html.match(/id="ld_searchpage_results"\s*>([\s\S]*?)<\/script>/);
  type Item = { name?: string; latitude?: number; longitude?: number; numberOfBedrooms?: number; numberOfBathroomsTotal?: number };
  let items: Item[] = [];
  if (ld) {
    try { items = (JSON.parse(ld[1]).itemListElement ?? []).map((e: { item?: Item }) => e.item ?? {}); } catch { items = []; }
  }
  const rows = [...html.matchAll(/<li class="cl-static-search-result"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => {
    const body = m[1];
    return {
      url: body.match(/href="([^"]+)"/)?.[1],
      title: decode(body.match(/<div class="title">([\s\S]*?)<\/div>/)?.[1] ?? ""),
      price: Number((body.match(/<div class="price">\s*\$([\d,]+)/)?.[1] ?? "").replace(/,/g, "")) || undefined,
    };
  });
  const out: Listing[] = [];
  rows.forEach((r, i) => {
    if (!r.url || !r.title) return;
    // Same order in both blocks; only trust coordinates when the names agree.
    const it = items[i];
    const same = it?.name && decode(it.name) === r.title;
    out.push({ title: r.title, url: decode(r.url), price: r.price, beds: same ? it.numberOfBedrooms : undefined, baths: same ? it.numberOfBathroomsTotal : undefined, lng: same ? it.longitude : undefined, lat: same ? it.latitude : undefined });
  });
  return out;
}

export function rentStats(listings: Listing[]) {
  const priced = listings.filter((l) => l.price && l.price >= 400 && l.price <= 30_000);
  const byBeds: Record<string, number> = {};
  for (const b of [0, 1, 2, 3]) {
    const xs = priced.filter((l) => (b === 3 ? (l.beds ?? -1) >= 3 : l.beds === b)).map((l) => l.price!);
    if (xs.length >= 2) byBeds[b === 0 ? "studio" : b === 3 ? "3+bd" : `${b}bd`] = median(xs);
  }
  return { n: priced.length, median: median(priced.map((l) => l.price!)), byBeds };
}

export const rentWorker: Worker = {
  id: "brightdata-rent",
  name: "Rent Scout",
  description: "Live asking rents near the area from current public apartment listings (median rent overall and by bedroom count, listing pins with links). Via Bright Data Web Unlocker.",
  vehicle: "car",
  color: "#9aa8f0",
  tools: ["scrape"],
  dataSources: ["Craigslist apartment listings via Bright Data Web Unlocker"],
  coverage: "US",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const missing = missingEnv(rentWorker);
    if (missing.length) { log(needsLog(missing)); return; }
    const { region } = task;
    const metro = METROS.map((m) => ({ ...m, d: distanceM(m.center, region.center) })).sort((a, b) => a.d - b.d)[0];
    if (metro.d > 90_000) { log("No Craigslist metro mapped near this area; skipping."); return; }
    // Search radius: the area's half-diagonal, at least 0.4 mi so a single block still gets comps.
    const [a, b, c, d] = region.bbox;
    const miles = Math.min(3, Math.max(0.4, distanceM([a, b], [c, d]) / 2 / 1609));
    const url = `https://${metro.site}.craigslist.org/search/apa?${new URLSearchParams({ lat: region.center[1].toFixed(5), lon: region.center[0].toFixed(5), search_distance: miles.toFixed(1) })}`;
    log(`Bright Data Web Unlocker → ${metro.site}.craigslist.org (${miles.toFixed(1)} mi radius)…`);
    const html = await unlock(url, { signal, as: "raw", country: "us", timeoutMs: 25_000 });
    const listings = parseCraigslist(html);
    const s = rentStats(listings);
    log(`${listings.length} listings parsed, ${s.n} with a usable price`);
    if (!s.n) { log("No priced listings in the results."); return; }
    const beds = Object.entries(s.byBeds).map(([k, v]) => `${k} $${Math.round(v).toLocaleString()}`).join(", ");
    const today = new Date().toISOString().slice(0, 10);
    emit({
      claim: `Median asking rent within ${miles.toFixed(1)} mi: $${Math.round(s.median).toLocaleString()}/mo across ${s.n} live listings${beds ? ` (${beds})` : ""}`,
      geometry: { type: "Point", coordinates: region.center }, source_url: url, source_type: "rental_listings_brightdata",
      observed_at: today, confidence: 0.75, category: "rent", severity: 0.45,
      props: { areaLevel: true, medianRent: s.median, listings: s.n, byBedrooms: s.byBeds, radiusMi: miles, site: metro.site },
    });
    const pinned = listings.filter((l) => l.lng != null && l.lat != null && l.price).slice(0, 25);
    for (const l of pinned) {
      const rel = l.price! / s.median;
      emit({
        claim: `$${l.price!.toLocaleString()}/mo${l.beds != null ? ` · ${l.beds === 0 ? "studio" : `${l.beds}bd`}` : ""}${l.baths ? `/${l.baths}ba` : ""} · ${l.title}`,
        geometry: { type: "Point", coordinates: [l.lng!, l.lat!] }, source_url: l.url, source_type: "rental_listing",
        observed_at: today, confidence: 0.7, category: "rent", severity: Math.min(0.7, 0.2 + Math.abs(rel - 1) * 0.5),
        props: { price: l.price, beds: l.beds, baths: l.baths, vsMedian: rel },
      });
    }
  },
};
