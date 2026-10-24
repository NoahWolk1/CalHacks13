import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import { regionWkt, touchesSF } from "@/lib/geo";

// SF Dept. of Building Inspection permits via DataSF (Socrata). No key needed at demo volume.
const URL_ = "https://data.sf.gov/resource/i98e-djp9.json";

interface Permit {
  permit_number: string; permit_type_definition?: string; description?: string; status?: string;
  filed_date?: string; issued_date?: string; status_date?: string; street_number?: string; street_name?: string; street_suffix?: string;
  estimated_cost?: string; revised_cost?: string; number_of_proposed_stories?: string; number_of_existing_stories?: string; proposed_units?: string; existing_units?: string;
  proposed_use?: string; location?: { type: "Point"; coordinates: [number, number] };
}

export const permitsWorker: Worker = {
  id: "sf-permits",
  name: "Permit Patrol",
  description: "Finds recent building permits (new construction, major additions, demolitions) and what's planned, with cost, stories and units. San Francisco only.",
  vehicle: "car",
  color: "#f59e0b",
  tools: ["http_get"],
  dataSources: ["SF Dept. of Building Inspection permits (DataSF)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    if (!touchesSF(task.region)) {
      log("Outside San Francisco: no permit feed for this area yet.");
      return;
    }
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365 * 2).toISOString().slice(0, 10) + "T00:00:00"; // day-aligned: stable cache key
    // Cost columns are text in this dataset, so the "major project" filter runs here, not in SoQL.
    const where = `within_polygon(location, '${regionWkt(task.region)}') AND filed_date > '${since}' AND permit_type_definition != 'otc alterations permit'`;
    const qs = new URLSearchParams({ $where: where, $order: "filed_date DESC", $limit: "2000" });
    log("Pulling 24 months of permits from DBI…");
    const all = await getJson<Permit[]>(`${URL_}?${qs}`, { signal });
    const cost = (p: Permit) => Number(p.revised_cost ?? p.estimated_cost ?? 0);
    const rows = all
      .filter((p) => /new construction|demolition/.test(p.permit_type_definition ?? "") || cost(p) > 250_000 || Number(p.number_of_proposed_stories ?? 0) > Number(p.number_of_existing_stories ?? 0))
      .sort((a, b) => cost(b) - cost(a))
      .slice(0, 60);
    log(`${all.length} permits filed; ${rows.length} are major projects`);
    const seen = new Set<string>();
    for (const p of rows) {
      if (!p.location || seen.has(p.permit_number)) continue;
      seen.add(p.permit_number);
      const addr = [p.street_number, p.street_name, p.street_suffix].filter(Boolean).join(" ");
      const usd = cost(p);
      const stories = Number(p.number_of_proposed_stories ?? 0);
      const units = Number(p.proposed_units ?? 0);
      const type = p.permit_type_definition ?? "permit";
      const isNew = type.startsWith("new construction");
      const sev = Math.min(1, (isNew ? 0.5 : 0.2) + Math.min(0.3, usd / 2e7) + Math.min(0.2, stories / 30));
      const bits = [
        stories ? `${stories}-story` : "", units > 1 ? `${units} units` : "", p.proposed_use ?? "",
      ].filter(Boolean).join(", ");
      emit({
        claim: `${addr}: ${type}${bits ? ` (${bits})` : ""}, ${p.status ?? "filed"}${usd ? `, $${(usd / 1e6).toFixed(usd > 1e6 ? 1 : 2)}M` : ""}`,
        geometry: p.location,
        source_url: `https://dbiweb02.sfgov.org/dbipts/default.aspx?page=Permit&PermitNumber=${p.permit_number}`,
        source_type: "permit_record",
        observed_at: (p.status_date ?? p.filed_date)?.slice(0, 10),
        confidence: 0.9,
        category: "permit",
        severity: sev,
        props: { permit: p.permit_number, type, status: p.status, cost: usd, stories, units, use: p.proposed_use, description: p.description?.slice(0, 300), filed: p.filed_date?.slice(0, 10) },
      });
    }
  },
};
