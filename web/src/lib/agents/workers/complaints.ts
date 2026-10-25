import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import { regionWkt, touchesSF } from "@/lib/geo";

// SF 311 service requests via DataSF. Street-level signal: noise, flooding, encampments, blight.
const URL_ = "https://data.sf.gov/resource/vw6y-z8j6.json";

const NOTABLE = /flood|sewer|noise|encampment|graffiti|street defect|sidewalk|abandoned|tree|blocked|illegal|homeless|parking/i;

export const complaintsWorker: Worker = {
  id: "sf-311",
  name: "Street Pulse",
  description: "Reads the last 90 days of 311 service requests (noise, sewer backups/flooding, encampments, street defects) to gauge street-level conditions. San Francisco only.",
  vehicle: "car",
  color: "#e48bb0",
  tools: ["http_get"],
  dataSources: ["SF 311 Cases (DataSF)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    if (!touchesSF(task.region)) { log("Outside San Francisco: no 311 feed for this area yet."); return; }
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString().slice(0, 10) + "T00:00:00"; // day-aligned: stable cache key
    const geo = `within_polygon(point_geom, '${regionWkt(task.region)}') AND requested_datetime > '${since}'`;
    log("Aggregating 90 days of 311 cases…");
    const counts = await getJson<{ service_name: string; n: string }[]>(
      `${URL_}?${new URLSearchParams({ $select: "service_name, count(*) as n", $where: geo, $group: "service_name", $order: "n DESC", $limit: "12" })}`,
      { signal },
    );
    const total = counts.reduce((s, c) => s + Number(c.n), 0);
    log(`${total} cases across ${counts.length} categories`);
    if (!total) return;
    emit({
      claim: `${total.toLocaleString()} 311 reports in the last 90 days. Top: ${counts.slice(0, 4).map((c) => `${c.service_name} (${c.n})`).join(", ")}`,
      geometry: { type: "Point", coordinates: task.region.center },
      source_url: "https://data.sf.gov/d/vw6y-z8j6", source_type: "311_aggregate", confidence: 0.85, category: "street",
      severity: Math.min(1, total / 3000), props: { areaLevel: true, breakdown: Object.fromEntries(counts.map((c) => [c.service_name, Number(c.n)])) },
    });

    // Individual recent cases of notable types become pins.
    const rows = await getJson<{ service_request_id: string; service_name: string; service_subtype?: string; service_details?: string; address?: string; requested_datetime: string; status_description?: string; point_geom?: { type: "Point"; coordinates: [number, number] } }[]>(
      `${URL_}?${new URLSearchParams({ $where: geo, $order: "requested_datetime DESC", $limit: "400" })}`,
      { signal },
    );
    const picked = rows.filter((r) => r.point_geom && NOTABLE.test(`${r.service_name} ${r.service_subtype} ${r.service_details}`));
    // Spread pins out: keep at most 4 per category.
    const perCat = new Map<string, number>();
    for (const r of picked) {
      const k = r.service_subtype ?? r.service_name;
      if ((perCat.get(k) ?? 0) >= 4) continue;
      perCat.set(k, (perCat.get(k) ?? 0) + 1);
      const flood = /flood|sewer|catch basin|water/i.test(`${r.service_name} ${r.service_subtype} ${r.service_details}`);
      emit({
        claim: `311: ${r.service_name}${r.service_subtype ? ` / ${r.service_subtype}` : ""}${r.address ? ` at ${r.address.split(",")[0]}` : ""}`,
        geometry: r.point_geom!,
        source_url: `https://mobile311.sfgov.org/reports/${r.service_request_id}`,
        source_type: "311_case", observed_at: r.requested_datetime.slice(0, 10), confidence: 0.7,
        category: flood ? "flood_report" : "street", severity: flood ? 0.7 : 0.35,
        props: { details: r.service_details, status: r.status_description },
      });
      if (perCat.size > 10 && [...perCat.values()].reduce((a, b) => a + b, 0) > 30) break;
    }
  },
};
