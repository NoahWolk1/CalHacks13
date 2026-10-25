import type { Worker } from "@/lib/types";
import { regionAreaKm2, inRegion } from "@/lib/geo";
import { runActor } from "@/lib/sponsors/apify";
import { missingEnv, needsLog } from "@/lib/sponsors/keys";
import { businessCategory, median } from "@/lib/sponsors/topic";

// Google Maps businesses for the question's category via the Apify Google Maps Scraper
// (compass/crawler-google-places), restricted to the selected polygon with customGeolocation.
// Search-results only by default (no detail pages): fast and ~$0.0015/place, capped at 30 places.
const ACTOR = () => process.env.APIFY_MAPS_ACTOR?.trim() || "compass/crawler-google-places";
const MAX_PLACES = 30;
const TIMEOUT_S = 25;

export interface MapsPlace {
  title?: string;
  categoryName?: string;
  address?: string;
  totalScore?: number | null;
  reviewsCount?: number | null;
  price?: string | null;
  location?: { lat: number; lng: number };
  url?: string;
  website?: string;
  permanentlyClosed?: boolean;
  temporarilyClosed?: boolean;
  popularTimesLiveText?: string | null;
  popularTimesLivePercent?: number | null;
}

export function summarizePlaces(places: MapsPlace[], areaKm2: number) {
  const rated = places.filter((p) => typeof p.totalScore === "number" && p.totalScore > 0 && (p.reviewsCount ?? 0) > 0);
  const open = places.filter((p) => !p.permanentlyClosed);
  const closed = places.length - open.length;
  const avg = rated.length ? rated.reduce((s, p) => s + p.totalScore!, 0) / rated.length : NaN;
  const weak = rated.filter((p) => p.totalScore! < 4.0);
  const strong = rated.filter((p) => p.totalScore! >= 4.5 && (p.reviewsCount ?? 0) >= 100);
  const prices: Record<string, number> = {};
  for (const p of open) if (p.price) prices[p.price] = (prices[p.price] ?? 0) + 1;
  const density = open.length / Math.max(areaKm2, 0.05);
  return { count: places.length, open: open.length, closed, avg, medianReviews: median(rated.map((p) => p.reviewsCount!)), weak, strong, prices, density };
}

export const reviewsWorker: Worker = {
  id: "apify-reviews",
  name: "Review Radar",
  description: "Live Google Maps ratings, review counts, price levels and closures for one business category (cafés, restaurants, bars, gyms…) in the area: competition saturation and ratings gaps. Via Apify.",
  vehicle: "drone",
  color: "#7fd1b9",
  tools: ["scrape"],
  dataSources: ["Google Maps via Apify (compass/crawler-google-places)"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const missing = missingEnv(reviewsWorker);
    if (missing.length) { log(needsLog(missing)); return; }
    const category = businessCategory(task.question, task.focus) ?? "restaurant";
    const { region } = task;
    log(`Apify ${ACTOR()}: "${category}" inside the area (≤${MAX_PLACES} places, ${TIMEOUT_S}s budget)…`);
    const geom = region.polygon.geometry;
    const items = await runActor<MapsPlace>(ACTOR(), {
      searchStringsArray: [category],
      customGeolocation: geom,
      maxCrawledPlacesPerSearch: MAX_PLACES,
      language: "en",
      scrapePlaceDetailPage: process.env.REVIEW_RADAR_DETAILS === "1", // popular times need detail pages (+cost, slower)
      maxReviews: 0,
      maxImages: 0,
      skipClosedPlaces: false,
    }, { signal, timeoutSec: TIMEOUT_S, maxItems: MAX_PLACES, maxTotalChargeUsd: 0.25 });
    // customGeolocation is a search hint; keep only what is actually inside (with a small tolerance via the bbox).
    const places = items.filter((p) => p.location && p.title && inRegion(region, p.location.lng, p.location.lat)).slice(0, MAX_PLACES);
    log(`${items.length} places returned, ${places.length} inside the area`);
    if (!places.length) {
      emit({
        claim: `No Google Maps listings for "${category}" inside this area: no direct competition found.`,
        geometry: { type: "Point", coordinates: region.center }, source_type: "google_maps_apify", confidence: 0.55,
        category: "reviews", severity: 0.5, props: { areaLevel: true, category, observed: "live" },
        source_url: `https://www.google.com/maps/search/${encodeURIComponent(category)}/@${region.center[1]},${region.center[0]},16z`,
      });
      return;
    }
    const s = summarizePlaces(places, regionAreaKm2(region));
    const priceMix = Object.entries(s.prices).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(", ");
    const parts = [
      `${s.open} open ${category} listings on Google Maps (${s.density.toFixed(1)}/km²)`,
      Number.isFinite(s.avg) ? `avg rating ${s.avg.toFixed(2)}★, median ${Math.round(s.medianReviews)} reviews` : "",
      s.strong.length ? `${s.strong.length} entrenched leaders (≥4.5★, 100+ reviews)` : "no entrenched leader (≥4.5★ with 100+ reviews)",
      s.weak.length ? `${s.weak.length} rated under 4.0★ (ratings gap)` : "",
      s.closed ? `${s.closed} permanently closed` : "",
      priceMix ? `price ${priceMix}` : "",
    ].filter(Boolean);
    emit({
      claim: parts.join("; "),
      geometry: { type: "Point", coordinates: region.center },
      source_url: `https://www.google.com/maps/search/${encodeURIComponent(category)}/@${region.center[1]},${region.center[0]},16z`,
      source_type: "google_maps_apify", observed_at: new Date().toISOString().slice(0, 10), confidence: 0.8, category: "reviews",
      // Saturated + well-rated = hard to break in; sparse or weak = opportunity. Either way it matters.
      severity: Math.min(1, 0.35 + s.density / 40 + s.strong.length * 0.05),
      props: { areaLevel: true, category, open: s.open, closed: s.closed, avgRating: s.avg, medianReviews: s.medianReviews, perKm2: s.density, leaders: s.strong.length, weak: s.weak.length, prices: s.prices },
    });
    for (const p of places) {
      const closed = p.permanentlyClosed ? "PERMANENTLY CLOSED" : p.temporarilyClosed ? "temporarily closed" : "";
      const rating = typeof p.totalScore === "number" && p.totalScore > 0 ? `${p.totalScore}★ (${p.reviewsCount ?? 0} reviews)` : "no rating yet";
      emit({
        claim: [p.title, rating, p.price, p.popularTimesLiveText, closed].filter(Boolean).join(" · "),
        geometry: { type: "Point", coordinates: [p.location!.lng, p.location!.lat] },
        source_url: p.url, source_type: "google_maps_place", observed_at: new Date().toISOString().slice(0, 10),
        confidence: 0.85, category: "reviews",
        severity: p.permanentlyClosed ? 0.6 : typeof p.totalScore === "number" && p.totalScore >= 4.5 && (p.reviewsCount ?? 0) >= 100 ? 0.5 : 0.25,
        props: { name: p.title, category: p.categoryName, rating: p.totalScore, reviews: p.reviewsCount, price: p.price, address: p.address, busyNow: p.popularTimesLivePercent, website: p.website, closed: !!p.permanentlyClosed },
      });
    }
  },
};
