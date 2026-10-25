import type { Worker, Region } from "@/lib/types";
import type { MultiPolygon, Polygon } from "geojson";
import * as turf from "@turf/turf";
import { regionWkt, touchesSF } from "@/lib/geo";
import { clamp01, datasetUrl, num, pt, soda, title } from "./sfdata";

// SF Planning zoning map layers on DataSF (updated with each zoning ordinance).
const ZONING = "3i4a-hu95";
const HEIGHT = "h9wh-cg3m";

const clip = (g: Polygon | MultiPolygon, r: Region) => {
  try { return turf.intersect(turf.featureCollection([turf.feature(g), r.polygon as never]))?.geometry as Polygon | MultiPolygon | undefined; }
  catch { return undefined; }
};

export const zoningWorker: Worker = {
  id: "sf-zoning",
  name: "Zoning Clerk",
  description: "SF Planning zoning districts (residential, neighborhood-commercial, mixed-use, PDR/industrial) and height & bulk limits covering the area: share of land by district, max allowed height, with district polygons. San Francisco only.",
  vehicle: "drone",
  color: "#b7b0e0",
  tools: ["http_get"],
  dataSources: ["SF Planning Zoning Districts (DataSF 3i4a-hu95)", "SF Planning Height & Bulk Districts (DataSF h9wh-cg3m)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!touchesSF(r)) { log("Outside San Francisco: no SF Planning zoning map here."); return; }
    const where = `intersects(the_geom, '${regionWkt(r)}')`;
    log("Fetching zoning and height districts…");
    const [zones, heights] = await Promise.all([
      soda<{ zoning?: string; districtna?: string; gen?: string; url?: string; g?: MultiPolygon }[]>(ZONING, { $select: "zoning, districtna, gen, url, simplify_preserve_topology(the_geom, 0.00002) as g", $where: where, $limit: "1500" }, signal, 12_000),
      soda<{ height?: string; gen_hght?: string; g?: MultiPolygon }[]>(HEIGHT, { $select: "height, gen_hght, simplify_preserve_topology(the_geom, 0.00002) as g", $where: where, $limit: "1500" }, signal, 12_000),
    ]);
    log(`${zones.length} zoning parcels/pieces, ${heights.length} height-district pieces`);

    // ── Zoning: area share per district code ──
    const byZone = new Map<string, { name: string; gen: string; url?: string; m2: number; parts: { g: Polygon | MultiPolygon; m2: number }[] }>();
    for (const z of zones) {
      if (!z.g || !z.zoning) continue;
      const g = clip(z.g, r);
      if (!g) continue;
      const m2 = turf.area(g);
      const e = byZone.get(z.zoning) ?? { name: z.districtna ?? z.zoning, gen: z.gen ?? "", url: z.url, m2: 0, parts: [] };
      e.m2 += m2; e.parts.push({ g, m2 });
      byZone.set(z.zoning, e);
    }
    const zTotal = [...byZone.values()].reduce((s, e) => s + e.m2, 0);
    const zRank = [...byZone.entries()].sort((a, b) => b[1].m2 - a[1].m2);
    const byGen = new Map<string, number>();
    for (const [, e] of zRank) byGen.set(e.gen || "Other", (byGen.get(e.gen || "Other") ?? 0) + e.m2);
    if (zTotal > 0) {
      const share = (m2: number) => `${Math.round((100 * m2) / zTotal)}%`;
      emit({
        claim: `Zoning: ${zRank.slice(0, 4).map(([code, e]) => `${code} ${title(e.name)} ${share(e.m2)}`).join("; ")}. By type: ${[...byGen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([g, m]) => `${g} ${share(m)}`).join(", ")}`,
        geometry: pt(...r.center), source_url: datasetUrl(ZONING), source_type: "zoning_aggregate", confidence: 0.9, category: "zoning", severity: 0.4,
        props: { areaLevel: true, districts: Object.fromEntries(zRank.map(([c, e]) => [c, { name: e.name, type: e.gen, sharePct: +((100 * e.m2) / zTotal).toFixed(1) }])), byType: Object.fromEntries([...byGen.entries()].map(([g, m]) => [g, +((100 * m) / zTotal).toFixed(1)])) },
      });
    }
    // One polygon finding per district code (largest pieces merged as a MultiPolygon), top 12 codes.
    for (const [code, e] of zRank.slice(0, 12)) {
      const parts = e.parts.sort((a, b) => b.m2 - a.m2).slice(0, 40);
      const coords = parts.flatMap((p) => (p.g.type === "Polygon" ? [p.g.coordinates] : p.g.coordinates));
      if (e.m2 < 300) continue;
      const commercial = /commercial|mixed|downtown|NCT|NC-/i.test(`${e.gen} ${e.name} ${code}`);
      emit({
        claim: `Zoned ${code} (${title(e.name)}, ${e.gen || "district"}): ${Math.round((100 * e.m2) / zTotal)}% of the area, ${Math.round(e.m2).toLocaleString("en-US")} m²`,
        geometry: { type: "MultiPolygon", coordinates: coords }, source_url: e.url || datasetUrl(ZONING), source_type: "zoning_district", confidence: 0.9,
        category: "zoning", severity: commercial ? 0.45 : 0.3, props: { zoning: code, district: e.name, type: e.gen, areaM2: Math.round(e.m2), commercial },
      });
    }

    // ── Height & bulk ──
    const byH = new Map<string, { ft: number; m2: number; parts: (Polygon | MultiPolygon)[] }>();
    for (const h of heights) {
      if (!h.g || !h.height) continue;
      const g = clip(h.g, r);
      if (!g) continue;
      const e = byH.get(h.height) ?? { ft: num(h.gen_hght), m2: 0, parts: [] };
      e.m2 += turf.area(g); e.parts.push(g);
      byH.set(h.height, e);
    }
    const hTotal = [...byH.values()].reduce((s, e) => s + e.m2, 0);
    if (!hTotal) return;
    const hRank = [...byH.entries()].sort((a, b) => b[1].m2 - a[1].m2);
    const tallest = [...byH.entries()].filter(([, e]) => e.m2 > 300).sort((a, b) => b[1].ft - a[1].ft);
    const maxFt = tallest[0]?.[1].ft ?? 0;
    const wAvg = [...byH.values()].reduce((s, e) => s + e.ft * e.m2, 0) / hTotal;
    emit({
      claim: `Height limits: ${hRank.slice(0, 4).map(([k, e]) => `${k} (${e.ft} ft) ${Math.round((100 * e.m2) / hTotal)}%`).join(", ")}. Tallest allowed: ${maxFt} ft; area-weighted average ${Math.round(wAvg)} ft`,
      geometry: pt(...r.center), source_url: datasetUrl(HEIGHT), source_type: "height_bulk_aggregate", confidence: 0.9, category: "zoning",
      severity: clamp01(0.3 + maxFt / 400), props: { areaLevel: true, heightLimits: true, maxHeightFt: maxFt, avgHeightFt: Math.round(wAvg), districts: Object.fromEntries(hRank.map(([k, e]) => [k, { ft: e.ft, sharePct: +((100 * e.m2) / hTotal).toFixed(1) }])) },
    });
    for (const [k, e] of tallest.slice(0, 4)) {
      if (e.ft <= 40 && tallest.length > 1) continue; // 40-X is the default residential cap; only taller districts are notable
      const coords = e.parts.flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates));
      emit({
        claim: `Height district ${k}: buildings up to ${e.ft} ft allowed here (${Math.round(e.m2).toLocaleString("en-US")} m²)`,
        geometry: { type: "MultiPolygon", coordinates: coords }, source_url: datasetUrl(HEIGHT), source_type: "height_bulk_district", confidence: 0.9,
        category: "zoning", severity: clamp01(0.25 + e.ft / 300), props: { heightLimits: true, district: k, heightFt: e.ft, areaM2: Math.round(e.m2) },
      });
    }
  },
};
