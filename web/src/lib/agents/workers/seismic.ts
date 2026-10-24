import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import { distanceM } from "@/lib/geo";

// USGS ComCat earthquake catalog (no key) + magnitude-weighted shaking history.
export const seismicWorker: Worker = {
  id: "usgs-seismic",
  name: "Quake Watch",
  description: "Pulls 25 years of USGS earthquake history (M2.5+) within 40 km and summarizes seismic exposure and recent activity.",
  vehicle: "satellite",
  color: "#f87171",
  tools: ["http_get"],
  dataSources: ["USGS Earthquake Catalog"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const [lng, lat] = task.region.center;
    // Year-aligned start keeps the URL (and so the on-disk cache key) stable from day to day.
    const start = `${new Date().getFullYear() - 25}-01-01`;
    log("Querying USGS catalog (25 yrs, 40 km)…");
    const fc = await getJson<{ features: { id: string; properties: { mag: number; place: string; time: number; url: string }; geometry: { type: "Point"; coordinates: number[] } }[] }>(
      `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${lat}&longitude=${lng}&maxradiuskm=40&minmagnitude=2.5&starttime=${start}&orderby=magnitude`,
      // No `limit`: USGS currently 504s on orderby=magnitude&limit=… (and the CDN caches the 504).
      { signal, timeoutMs: 20_000 },
    );
    const qs = fc.features;
    log(`${qs.length} events M2.5+`);
    const big = qs.filter((q) => q.properties.mag >= 4);
    const nearest = qs.reduce<{ d: number; q?: (typeof qs)[number] }>((acc, q) => {
      const d = distanceM([lng, lat], q.geometry.coordinates.slice(0, 2) as [number, number]);
      return d < acc.d ? { d, q } : acc;
    }, { d: Infinity });
    emit({
      claim: `${qs.length} earthquakes M2.5+ within 40 km since ${start.slice(0, 4)}; ${big.length} were M4+${qs[0] ? `. Largest: M${qs[0].properties.mag} ${qs[0].properties.place}` : ""}`,
      geometry: { type: "Point", coordinates: task.region.center },
      source_url: "https://earthquake.usgs.gov/earthquakes/search/", source_type: "usgs_catalog", confidence: 0.95, category: "seismic",
      severity: Math.min(1, big.length / 10 + qs.length / 400), props: { areaLevel: true, count: qs.length, m4plus: big.length, nearestKm: nearest.q ? +(nearest.d / 1000).toFixed(1) : null },
    });
    for (const q of qs.slice(0, 8)) {
      emit({
        claim: `M${q.properties.mag} earthquake, ${q.properties.place}`,
        geometry: { type: "Point", coordinates: q.geometry.coordinates.slice(0, 2) },
        source_url: q.properties.url, source_type: "usgs_event", observed_at: new Date(q.properties.time).toISOString().slice(0, 10),
        confidence: 0.95, category: "seismic", severity: Math.min(1, (q.properties.mag - 2.5) / 3.5), props: { mag: q.properties.mag, offRegion: true },
      });
    }
  },
};
