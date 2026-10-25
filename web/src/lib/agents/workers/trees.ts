import type { Worker } from "@/lib/types";
import { inRegion, touchesSF } from "@/lib/geo";
import { areaKm2, clamp01, datasetUrl, fmt, num, pct, pt, ratioText, recordUrl, SF_LAND_KM2, soda } from "./sfdata";

// SF Public Works street tree inventory (DataSF, ~145k trees, updated monthly). Its point column is
// text, so the spatial filter is the region bbox on latitude/longitude; pins are re-checked against
// the exact polygon. Street-tree density is the greenness/canopy proxy (no canopy raster needed).
const ID = "tkzw-k3nq";

interface Tree { treeid: string; species?: string; legalstatus?: string; mapdbh?: string; planteddate?: string; latitude?: string; longitude?: string; onstreet?: string; crossstreet?: string; siteinfo?: string }
const common = (s?: string) => (s ?? "").split("::").pop()?.trim() || "Unknown species";

export const treesWorker: Worker = {
  id: "sf-trees",
  name: "Canopy Counter",
  description: "Street trees from the SF urban forest inventory: tree count and density vs. the SF average (greenness/shade proxy), top species, recent plantings, and pins for landmark/significant and largest trees. San Francisco only.",
  vehicle: "drone",
  color: "#7fbf95",
  tools: ["http_get"],
  dataSources: ["SF Street Tree Inventory (DataSF tkzw-k3nq)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!touchesSF(r)) { log("Outside San Francisco: no street tree inventory here."); return; }
    const [a, b, c, d] = r.bbox;
    const box = `latitude between ${b} and ${d} and longitude between ${a} and ${c}`;
    const since5y = `${new Date().getFullYear() - 5}-01-01`;
    log("Counting street trees…");
    const [agg, city, species, status, recent, big, notable] = await Promise.all([
      soda<{ n: string; planted: string }[]>(ID, { $select: `count(*) as n, sum(case(planteddate >= '${since5y}', 1, true, 0)) as planted`, $where: box }, signal),
      soda<{ n: string }[]>(ID, { $select: "count(*) as n", $where: "latitude IS NOT NULL" }, signal),
      soda<{ s?: string; n: string }[]>(ID, { $select: "species as s, count(*) as n", $where: box, $group: "s", $order: "n DESC", $limit: "8" }, signal),
      soda<{ s?: string; n: string }[]>(ID, { $select: "legalstatus as s, count(*) as n", $where: box, $group: "s", $order: "n DESC" }, signal),
      soda<{ y: string; n: string }[]>(ID, { $select: "substring(planteddate, 1, 4) as y, count(*) as n", $where: `${box} AND planteddate >= '${since5y}'`, $group: "y", $order: "y" }, signal).catch(() => []),
      soda<Tree[]>(ID, { $where: `${box} AND mapdbh::number < 150`, $order: "mapdbh::number DESC", $limit: "20" }, signal).catch(() => [] as Tree[]),
      soda<Tree[]>(ID, { $where: `${box} AND legalstatus in ('Landmark tree', 'Significant Tree', 'Section 143')`, $order: "mapdbh::number DESC", $limit: "40" }, signal).catch(() => [] as Tree[]),
    ]);
    const n = num(agg[0]?.n);
    log(`${fmt(n)} street trees in the area's bounding box`);
    if (!n) {
      emit({ claim: "No inventoried street trees in this area", geometry: pt(...r.center), source_url: datasetUrl(ID), source_type: "street_tree_aggregate", confidence: 0.6, category: "trees", severity: 0.4, props: { areaLevel: true, trees: 0 } });
      return;
    }
    // Density uses the bbox area since the count does too.
    const bboxKm2 = Math.max(areaKm2(r), ((c - a) * 88.2) * ((d - b) * 111.1));
    const perKm2 = n / bboxKm2, cityPerKm2 = num(city[0]?.n) / SF_LAND_KM2, ratio = cityPerKm2 ? perKm2 / cityPerKm2 : 1;
    const realSpecies = species.filter((s) => !/vacant|unknown|^tree\(s\)/i.test(s.s ?? ""));
    const planted = num(agg[0]?.planted);
    emit({
      claim: `${fmt(n)} street trees (${fmt(perKm2)}/km², ${ratioText(ratio)}). ${fmt(planted)} planted since ${since5y.slice(0, 4)} (${pct(planted, n)}). Top species: ${realSpecies.slice(0, 4).map((s) => `${common(s.s)} (${s.n})`).join(", ")}`,
      geometry: pt(...r.center), source_url: datasetUrl(ID), source_type: "street_tree_aggregate", observed_at: new Date().toISOString().slice(0, 10),
      // Sparse canopy is the notable condition (heat, stormwater runoff), so severity rises as density falls.
      confidence: 0.8, category: "trees", severity: clamp01(0.75 - 0.3 * ratio),
      props: { areaLevel: true, trees: n, perKm2: Math.round(perKm2), cityPerKm2: Math.round(cityPerKm2), ratioVsCity: +ratio.toFixed(2), plantedLast5y: planted, plantedByYear: Object.fromEntries(recent.map((x) => [x.y, num(x.n)])), species: Object.fromEntries(species.map((s) => [common(s.s), num(s.n)])), legalStatus: Object.fromEntries(status.map((s) => [s.s ?? "Unknown", num(s.n)])) },
    });

    const seen = new Set<string>();
    const pin = (t: Tree, why: string, sev: number, max: number) => {
      if (seen.has(t.treeid) || seen.size >= max || !num(t.latitude) || !inRegion(r, num(t.longitude), num(t.latitude))) return;
      seen.add(t.treeid);
      const dbh = num(t.mapdbh);
      emit({
        claim: `${why}: ${common(t.species)}${dbh ? `, ${dbh} in. trunk diameter` : ""}${t.onstreet ? ` on ${t.onstreet}` : ""}${t.planteddate ? ` (planted ${t.planteddate.slice(0, 4)})` : ""}`,
        geometry: pt(t.longitude!, t.latitude!), source_url: recordUrl(ID, "treeid", t.treeid), source_type: "street_tree",
        observed_at: t.planteddate?.slice(0, 10), confidence: 0.85, category: "trees", severity: sev,
        props: { treeId: t.treeid, species: t.species, dbhIn: dbh, legalStatus: t.legalstatus, site: t.siteinfo },
      });
    };
    for (const t of notable) pin(t, t.legalstatus === "Landmark tree" ? "Landmark tree" : "Protected significant tree", 0.45, 10);
    for (const t of big) pin(t, "One of the largest street trees here", 0.35, 18);
  },
};
