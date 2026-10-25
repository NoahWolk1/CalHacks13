import type { Worker } from "@/lib/types";
import { touchesSF } from "@/lib/geo";
import { clamp01, datasetUrl, daysAgo, day, fmt, month, num, pt, ratioText, recordUrl, soda, title, vsCity, within } from "./sfdata";

// SFFD dispatched calls for service (one row per unit dispatched; updated daily) and
// SFFD fire incident reports (NFIRS; lags a month or two) on DataSF.
const CALLS = "nuek-vuh3";
const FIRES = "wr8u-xric";

interface Call {
  incident_number: string; call_type?: string; received_dttm: string; on_scene_dttm?: string; address?: string; call_final_disposition?: string;
  number_of_alarms?: string; case_location?: { type: "Point"; coordinates: [number, number] };
}
interface Fire {
  id: string; incident_number: string; incident_date: string; address?: string; primary_situation?: string; property_use?: string;
  estimated_property_loss?: string; estimated_contents_loss?: string; civilian_injuries?: string; civilian_fatalities?: string; number_of_alarms?: string;
  point?: { type: "Point"; coordinates: [number, number] };
}

export const fireEmsWorker: Worker = {
  id: "sf-fire-ems",
  name: "Engine Company",
  description: "SF Fire Department calls for service over the last 90 days (medical, fire, alarms; rate vs. the SF average), median emergency response time, recent fire calls, and reported fires with dollar losses over the past year. San Francisco only.",
  vehicle: "car",
  color: "#e09486",
  tools: ["http_get"],
  dataSources: ["SFFD Calls for Service (DataSF nuek-vuh3)", "SFFD Fire Incidents (DataSF wr8u-xric)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!touchesSF(r)) { log("Outside San Francisco: no SFFD dispatch data here."); return; }
    const since = daysAgo(90);
    const geo = `${within("case_location", r)} AND received_dttm > '${since}'`;
    log("Pulling 90 days of SFFD dispatches…");
    const [types, city, resp, fireCalls, fires] = await Promise.all([
      soda<{ t?: string; g?: string; n: string }[]>(CALLS, { $select: "call_type as t, call_type_group as g, count(distinct incident_number) as n", $where: geo, $group: "t, g", $order: "n DESC", $limit: "40" }, signal),
      soda<{ n: string }[]>(CALLS, { $select: "count(distinct incident_number) as n", $where: `received_dttm > '${since}'` }, signal, 12_000),
      // First unit on emergency (priority 3, "Code 3") calls: received → on scene.
      soda<{ received_dttm: string; on_scene_dttm: string }[]>(CALLS, { $select: "received_dttm, on_scene_dttm", $where: `${geo} AND unit_sequence_in_call_dispatch = 1 AND priority = '3' AND on_scene_dttm IS NOT NULL`, $limit: "5000" }, signal),
      soda<Call[]>(CALLS, { $where: `${geo} AND call_type_group = 'Fire' AND unit_sequence_in_call_dispatch = 1 AND case_location IS NOT NULL`, $order: "received_dttm DESC", $limit: "60" }, signal),
      soda<Fire[]>(FIRES, { $where: `${within("point", r)} AND incident_date > '${daysAgo(365)}' AND (estimated_property_loss > 0 OR estimated_contents_loss > 0 OR civilian_injuries > 0)`, $limit: "200" }, signal).catch(() => [] as Fire[]),
    ]);
    // The same call type can appear under several priority groups; merge for the top list.
    const merged = new Map<string, number>();
    for (const t of types) merged.set(t.t ?? "Other", (merged.get(t.t ?? "Other") ?? 0) + num(t.n));
    const topTypes = [...merged.entries()].sort((a, b) => b[1] - a[1]);
    const total = types.reduce((s, t) => s + num(t.n), 0);
    log(`${fmt(total)} incidents dispatched in 90 days`);
    if (total) {
      const byGroup = new Map<string, number>();
      for (const t of types) byGroup.set(t.g ?? "Other", (byGroup.get(t.g ?? "Other") ?? 0) + num(t.n));
      const medical = types.filter((t) => /Medical/i.test(t.t ?? "")).reduce((s, t) => s + num(t.n), 0);
      const fire = byGroup.get("Fire") ?? 0;
      const cmp = vsCity(total, num(city[0]?.n), r);
      const mins = resp.map((x) => (Date.parse(x.on_scene_dttm) - Date.parse(x.received_dttm)) / 60_000).filter((m) => m > 0 && m < 60).sort((a, b) => a - b);
      const median = mins.length ? mins[Math.floor(mins.length / 2)] : 0;
      emit({
        claim: `${fmt(total)} fire/EMS incidents in 90 days (${ratioText(cmp.ratio)}): ${fmt(medical)} medical, ${fmt(fire)} fire calls. Top: ${topTypes.slice(0, 4).map(([t, n]) => `${t} (${fmt(n)})`).join(", ")}${median ? `. Median emergency response ${median.toFixed(1)} min (${mins.length} calls)` : ""}`,
        geometry: pt(...r.center), source_url: datasetUrl(CALLS), source_type: "sffd_calls_aggregate", observed_at: day(new Date().toISOString()),
        confidence: 0.85, category: "fire_ems", severity: clamp01(0.2 + 0.2 * cmp.ratio + (median > 8 ? 0.2 : 0)),
        props: { areaLevel: true, total, medical, fire, ratioVsCity: +cmp.ratio.toFixed(2), medianResponseMin: +median.toFixed(1), responseSample: mins.length, byGroup: Object.fromEntries(byGroup), byType: Object.fromEntries(topTypes.slice(0, 12)) },
      });
    }

    const seen = new Set<string>();
    const ranked = [...fireCalls].sort((a, b) => Number(/Structure/.test(b.call_type ?? "")) - Number(/Structure/.test(a.call_type ?? "")));
    for (const c of ranked) {
      if (seen.has(c.incident_number) || seen.size >= 12 || !c.case_location) continue;
      seen.add(c.incident_number);
      const structure = /Structure/.test(c.call_type ?? "");
      emit({
        claim: `${c.call_type ?? "Fire call"} at ${title(c.address)}, ${month(c.received_dttm)}${c.call_final_disposition ? ` (${c.call_final_disposition})` : ""}`,
        geometry: c.case_location, source_url: recordUrl(CALLS, "incident_number", c.incident_number), source_type: "sffd_call", observed_at: day(c.received_dttm),
        confidence: 0.8, category: "fire_ems", severity: structure ? 0.65 : 0.4, props: { callType: c.call_type, disposition: c.call_final_disposition, alarms: num(c.number_of_alarms) },
      });
    }
    const lossOf = (f: Fire) => num(f.estimated_property_loss) + num(f.estimated_contents_loss);
    for (const f of fires.filter((x) => lossOf(x) >= 1000 || num(x.civilian_injuries) > 0).sort((x, y) => lossOf(y) - lossOf(x)).slice(0, 6)) {
      if (!f.point) continue;
      const loss = lossOf(f);
      emit({
        claim: `Fire report: ${f.primary_situation?.replace(/^\d+\s*/, "") ?? "fire"} at ${title(f.address)} (${month(f.incident_date)})${loss ? `, $${fmt(loss)} estimated loss` : ""}${num(f.civilian_injuries) ? `, ${f.civilian_injuries} injured` : ""}`,
        geometry: f.point, source_url: recordUrl(FIRES, "id", f.id), source_type: "sffd_fire_incident", observed_at: day(f.incident_date),
        confidence: 0.85, category: "fire_ems", severity: clamp01(0.5 + loss / 2e6 + num(f.civilian_injuries) * 0.1),
        props: { fireIncident: true, situation: f.primary_situation, propertyUse: f.property_use, lossUsd: loss, injuries: num(f.civilian_injuries), fatalities: num(f.civilian_fatalities) },
      });
    }
  },
};
