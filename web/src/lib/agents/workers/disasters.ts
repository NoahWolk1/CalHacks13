import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import { touchesUS } from "@/lib/geo";

// Federal disaster declaration history for the county (OpenFEMA, no key) + county lookup (FCC Area API).
interface Decl { disasterNumber: number; declarationDate: string; incidentType: string; declarationTitle: string; declarationType: string; incidentBeginDate: string }
const TYPE: Record<string, string> = { DR: "major disaster", EM: "emergency", FM: "fire management" };

export const disastersWorker: Worker = {
  id: "fema-disasters",
  name: "Archivist",
  description: "Pulls the county's federal disaster declaration history from OpenFEMA (storms, floods, fires, earthquakes, pandemics since 1953): how often, what kind, and the most recent.",
  vehicle: "satellite",
  color: "#b9a6a0",
  tools: ["http_get"],
  dataSources: ["OpenFEMA Disaster Declarations Summaries v2", "FCC Area API (county lookup)"],
  coverage: "US",
  builtin: true,
  async run({ task, emit, log, signal }) {
    if (!touchesUS(task.region)) { log("Outside the US: no FEMA declarations."); return; }
    const [lng, lat] = task.region.center;
    const area = await getJson<{ results: { county_fips: string; county_name: string; state_code: string }[] }>(`https://geo.fcc.gov/api/census/area?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&format=json`, { signal, timeoutMs: 10_000 });
    const c = area.results?.[0];
    if (!c) { log("No county found for this point."); return; }
    log(`Reading OpenFEMA declarations for ${c.county_name}, ${c.state_code}…`);
    const filter = `fipsStateCode eq '${c.county_fips.slice(0, 2)}' and fipsCountyCode eq '${c.county_fips.slice(2)}'`;
    const res = await getJson<{ DisasterDeclarationsSummaries: Decl[] }>(
      `https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries?$filter=${encodeURIComponent(filter)}&$orderby=declarationDate%20desc&$top=1000&$select=disasterNumber,declarationDate,incidentType,declarationTitle,declarationType,incidentBeginDate`,
      { signal, timeoutMs: 15_000 },
    );
    // One row per program/area: keep one per disaster number.
    const byNum = new Map<number, Decl>();
    for (const d of res.DisasterDeclarationsSummaries ?? []) if (!byNum.has(d.disasterNumber)) byNum.set(d.disasterNumber, d);
    const all = [...byNum.values()].sort((a, b) => b.declarationDate.localeCompare(a.declarationDate));
    log(`${all.length} declarations`);
    const pt = { type: "Point" as const, coordinates: task.region.center };
    const src = `https://www.fema.gov/disaster/declarations?field_dv2_state_territory_tribal_value=${c.state_code}`;
    if (!all.length) {
      emit({ claim: `No federal disaster declarations on record for ${c.county_name}`, geometry: pt, source_url: src, source_type: "openfema", confidence: 0.85, category: "disaster_history", severity: 0.05, props: { areaLevel: true, county: c.county_name, total: 0 } });
      return;
    }
    const types: Record<string, number> = {};
    for (const d of all) types[d.incidentType] = (types[d.incidentType] ?? 0) + 1;
    const since = new Date().getUTCFullYear() - 20;
    const recent = all.filter((d) => +d.declarationDate.slice(0, 4) >= since);
    const major = all.filter((d) => d.declarationType === "DR");
    emit({
      claim: `${c.county_name} has ${all.length} federal disaster declarations since ${all[all.length - 1].declarationDate.slice(0, 4)} (${major.length} major), ${recent.length} in the last 20 years. By type: ${Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k.toLowerCase()} ${n}`).join(", ")}. Latest: ${titleCase(all[0].declarationTitle)} (${all[0].declarationDate.slice(0, 10)})`,
      geometry: pt, source_url: src, source_type: "openfema", observed_at: all[0].declarationDate.slice(0, 10), confidence: 0.9, category: "disaster_history",
      severity: +Math.min(0.8, 0.1 + recent.length / 25).toFixed(2),
      props: { areaLevel: true, county: c.county_name, countyFips: c.county_fips, total: all.length, major: major.length, last20y: recent.length, byType: types },
    });
    for (const d of all.slice(0, 6)) {
      emit({
        claim: `FEMA ${TYPE[d.declarationType] ?? d.declarationType} declaration #${d.disasterNumber}: ${titleCase(d.declarationTitle)} (${d.incidentType}, declared ${d.declarationDate.slice(0, 10)})`,
        geometry: pt, source_url: `https://www.fema.gov/disaster/${d.disasterNumber}`, source_type: "openfema", observed_at: d.declarationDate.slice(0, 10), confidence: 0.9,
        category: "disaster_history", severity: +(d.declarationType === "DR" ? 0.45 : 0.3).toFixed(2),
        props: { areaLevel: true, disasterNumber: d.disasterNumber, incidentType: d.incidentType, declarationType: d.declarationType, incidentBegin: d.incidentBeginDate?.slice(0, 10) },
      });
    }
  },
};

const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
