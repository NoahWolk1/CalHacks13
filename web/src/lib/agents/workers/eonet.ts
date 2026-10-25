import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import { distanceM, inRegion } from "@/lib/geo";
import * as turf from "@turf/turf";

// NASA EONET v3: natural events (wildfires, storms, floods, volcanoes…) curated from satellite-driven feeds. No key.
interface EonetEvent {
  id: string;
  title: string;
  link: string;
  closed: string | null;
  categories: { id: string; title: string }[];
  sources: { id: string; url: string }[];
  geometry: { date: string; type: "Point" | "Polygon"; coordinates: number[] | number[][][]; magnitudeValue?: number | null; magnitudeUnit?: string | null }[];
}

const PAD = 1.5; // degrees around the selection (~150 km)

export const eonetWorker: Worker = {
  id: "nasa-eonet",
  name: "Earth Events",
  description: "Scans NASA's Earth Observatory Natural Event Tracker (EONET) for wildfires, severe storms, floods, volcanoes and other satellite-tracked events within ~150 km over the past year.",
  vehicle: "satellite",
  color: "#d38fd0",
  tools: ["http_get"],
  dataSources: ["NASA EONET v3"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const [a, b, c, d] = task.region.bbox;
    const center = task.region.center;
    // EONET bbox order is minLon,maxLat,maxLon,minLat.
    const bbox = [a - PAD, Math.min(90, d + PAD), c + PAD, Math.max(-90, b - PAD)].map((v) => v.toFixed(3)).join(",");
    log("Querying NASA EONET (past 365 days, ~150 km)…");
    const res = await getJson<{ events: EonetEvent[] }>(`https://eonet.gsfc.nasa.gov/api/v3/events?status=all&days=365&bbox=${bbox}`, { signal, timeoutMs: 20_000 });
    const events = (res.events ?? []).map((e) => {
      const g = e.geometry[e.geometry.length - 1];
      const pt = (g.type === "Point" ? g.coordinates : turf.centroid({ type: "Polygon", coordinates: g.coordinates as number[][][] }).geometry.coordinates) as [number, number];
      const km = distanceM(center, pt) / 1000;
      const age = Math.max(0, (Date.now() - Date.parse(g.date)) / 86_400_000);
      const cat = e.categories[0] ?? { id: "other", title: "Event" };
      // Closer and more recent = more notable; still-open events get a bump.
      const severity = Math.min(1, 0.15 + 0.45 * Math.max(0, 1 - km / 200) + 0.3 * Math.exp(-age / 45) + (e.closed ? 0 : 0.1));
      return { e, g, pt, km, age, cat, severity };
    });
    log(`${events.length} events in the search box`);
    // Some fires are listed twice (IRWIN + another feed): keep one per title+date.
    const seen = new Set<string>();
    const uniq = events.filter((x) => { const k = `${x.e.title.toLowerCase().replace(/wildfire/g, "").split(/[\s,]+/).filter(Boolean).sort().join(" ")}|${x.g.date.slice(0, 10)}`; if (seen.has(k)) return false; seen.add(k); return true; });
    const byCat = new Map<string, number>();
    for (const x of uniq) byCat.set(x.cat.title, (byCat.get(x.cat.title) ?? 0) + 1);
    const nearest = [...uniq].sort((p, q) => p.km - q.km)[0];
    emit({
      claim: uniq.length
        ? `${uniq.length} NASA EONET event${uniq.length === 1 ? "" : "s"} within ~150 km in the past year (${[...byCat].map(([k, n]) => `${n} ${n === 1 ? k.toLowerCase().replace(/s$/, "") : k.toLowerCase()}`).join(", ")}). Nearest: ${nearest.e.title}, ${Math.round(nearest.km)} km away (${nearest.g.date.slice(0, 10)})`
        : "No NASA EONET natural events (fires, storms, floods, volcanoes) tracked within ~150 km in the past year",
      geometry: { type: "Point", coordinates: center },
      source_url: "https://eonet.gsfc.nasa.gov/", source_type: "nasa_eonet", confidence: 0.85, category: "earth_event",
      severity: uniq.length ? +Math.min(0.8, Math.max(...uniq.map((x) => x.severity)) * 0.8).toFixed(2) : 0.05,
      props: { areaLevel: true, count: uniq.length, byCategory: Object.fromEntries(byCat), nearestKm: nearest ? Math.round(nearest.km) : null },
    });
    for (const x of [...uniq].sort((p, q) => q.severity - p.severity).slice(0, 8)) {
      const mag = x.g.magnitudeValue != null ? ` · ${x.g.magnitudeValue.toLocaleString()} ${x.g.magnitudeUnit ?? ""}`.trimEnd() : "";
      // IRWIN incident pages need a login; prefer a public source (GDACS, InciWeb…) and fall back to the EONET record.
      const pub = x.e.sources.find((s) => !/irwin\.doi\.gov/.test(s.url))?.url;
      emit({
        claim: `${new RegExp(x.cat.title.replace(/s$/, ""), "i").test(x.e.title) ? "" : `${x.cat.title}: `}${x.e.title} (${x.g.date.slice(0, 10)}${mag}), ${Math.round(x.km)} km from the area${x.e.closed ? "" : ", not yet closed in EONET"}`,
        geometry: { type: "Point", coordinates: x.pt },
        source_url: pub ?? x.e.link, source_type: "nasa_eonet", observed_at: x.g.date.slice(0, 10), confidence: 0.85, category: "earth_event",
        severity: +x.severity.toFixed(2),
        props: {
          eventId: x.e.id, eventCategory: x.cat.id, distanceKm: Math.round(x.km), ageDays: Math.round(x.age), open: !x.e.closed,
          magnitude: x.g.magnitudeValue ?? null, magnitudeUnit: x.g.magnitudeUnit ?? null, sources: x.e.sources.map((s) => s.url), eonet: x.e.link,
          offRegion: !inRegion(task.region, x.pt[0], x.pt[1]),
        },
      });
    }
  },
};
