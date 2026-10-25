import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import { sampleGrid } from "@/lib/geo";

// Open-Meteo elevation (Copernicus 90m DEM). Free, no key. Flags low-lying ground exposed to
// sea-level rise / ponding: something FEMA's current maps don't capture.
export const terrainWorker: Worker = {
  id: "terrain-elevation",
  name: "Terrain Scanner",
  description: "Samples ground elevation across the area to find low-lying spots exposed to sea-level rise and ponding; can inspect specific parcels.",
  vehicle: "drone",
  color: "#bd9c7b",
  tools: ["http_get"],
  dataSources: ["Open-Meteo Elevation API (Copernicus DEM)"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const pts: { lng: number; lat: number; label?: string; id?: string }[] = task.targets?.length
      ? task.targets
      : sampleGrid(task.region, 60).map(([lng, lat]) => ({ lng, lat }));
    log(`Sampling elevation at ${pts.length} ${task.targets?.length ? "target parcels" : "grid points"}…`);
    const elev: number[] = [];
    for (let i = 0; i < pts.length; i += 100) {
      const chunk = pts.slice(i, i + 100);
      const r = await getJson<{ elevation: number[] }>(
        `https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((p) => p.lat.toFixed(5)).join(",")}&longitude=${chunk.map((p) => p.lng.toFixed(5)).join(",")}`,
        { signal },
      );
      elev.push(...r.elevation);
    }
    if (!elev.length) return;
    const sorted = [...elev].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    log(`Elevation range ${sorted[0]}–${sorted[sorted.length - 1]} m, median ${median} m`);

    if (task.targets?.length) {
      pts.forEach((p, i) => {
        const e = elev[i];
        const sev = e <= 3 ? 0.95 : e <= 6 ? 0.7 : e <= 10 ? 0.4 : 0.1;
        emit({
          claim: `${p.label ?? "Target"} sits at ${e} m elevation${e <= 3 ? ": within reach of 2100 sea-level-rise projections + storm surge" : e <= 6 ? ": low-lying, exposed to extreme storm surge" : ""}`,
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          source_url: "https://open-meteo.com/en/docs/elevation-api", source_type: "elevation_dem", confidence: 0.75,
          category: "terrain", severity: sev, props: { elevationM: e, targetId: p.id },
        });
      });
      return;
    }

    // Grid mode: report only notably low points plus one area summary.
    let lows = 0;
    pts.forEach((p, i) => {
      const e = elev[i];
      if (e <= 5 && lows < 15) {
        lows++;
        emit({
          claim: `Low-lying ground: ${e} m above sea level`,
          geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          source_url: "https://open-meteo.com/en/docs/elevation-api", source_type: "elevation_dem", confidence: 0.7,
          category: "terrain", severity: e <= 2 ? 0.9 : 0.65, props: { elevationM: e },
        });
      }
    });
    emit({
      claim: `Terrain: elevation ${sorted[0]}–${sorted[sorted.length - 1]} m (median ${median} m); ${Math.round((elev.filter((e) => e <= 5).length / elev.length) * 100)}% of sampled ground is ≤5 m`,
      geometry: { type: "Point", coordinates: task.region.center },
      source_url: "https://open-meteo.com/en/docs/elevation-api", source_type: "elevation_dem", confidence: 0.7,
      category: "terrain", severity: elev.filter((e) => e <= 5).length / elev.length, props: { areaLevel: true, min: sorted[0], max: sorted[sorted.length - 1], median },
    });
  },
};
