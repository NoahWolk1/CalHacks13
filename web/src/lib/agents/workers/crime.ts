import type { Worker } from "@/lib/types";
import { touchesSF } from "@/lib/geo";
import { clamp01, datasetUrl, day, daysAgo, fmt, month, num, pt, ratioText, recordUrl, soda, sodaUrl, title, todayIso, vsCity, within } from "./sfdata";

// SFPD Incident Reports, 2018 to present (DataSF). Updated daily, ~1 day lag.
// One incident can have several rows (one per offense code), so counts use count(distinct incident_id).
const ID = "wg3w-h783";
const VIOLENT = ["Assault", "Robbery", "Homicide", "Rape", "Sex Offense", "Weapons Offense", "Weapons Carrying Etc", "Human Trafficking (A), Commercial Sex Acts"];
const PROPERTY = ["Larceny Theft", "Burglary", "Motor Vehicle Theft", "Malicious Mischief", "Vandalism", "Arson", "Stolen Property"];
const list = (xs: string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(", ");

interface Row {
  incident_id: string; incident_datetime: string; incident_category?: string; incident_subcategory?: string; incident_description?: string;
  intersection?: string; resolution?: string; analysis_neighborhood?: string; latitude?: string; longitude?: string;
}

export const crimeWorker: Worker = {
  id: "sf-crime",
  name: "Beat Cop",
  description: "SFPD incident reports for the last 90 days: total and rate vs. the SF average, violent vs. property split, top categories, hotspot intersections and recent violent incidents. San Francisco only.",
  vehicle: "car",
  color: "#cf8a8a",
  tools: ["http_get"],
  dataSources: ["SFPD Incident Reports 2018-present (DataSF wg3w-h783)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!touchesSF(r)) { log("Outside San Francisco: no SFPD incident feed here."); return; }
    const since = daysAgo(90);
    const geo = `${within("point", r)} AND incident_datetime > '${since}'`;
    log("Pulling 90 days of SFPD incident reports…");
    const [cats, city, hot, recent] = await Promise.all([
      soda<{ incident_category?: string; n: string }[]>(ID, { $select: "incident_category, count(distinct incident_id) as n", $where: geo, $group: "incident_category", $order: "n DESC", $limit: "60" }, signal),
      soda<{ n: string }[]>(ID, { $select: "count(distinct incident_id) as n", $where: `incident_datetime > '${since}'` }, signal),
      soda<{ intersection?: string; lat: string; lng: string; n: string }[]>(ID, {
        $select: "intersection, avg(latitude) as lat, avg(longitude) as lng, count(distinct incident_id) as n",
        $where: `${geo} AND intersection IS NOT NULL AND incident_category in (${list([...VIOLENT, ...PROPERTY])})`,
        $group: "intersection", $order: "n DESC", $limit: "8",
      }, signal),
      soda<Row[]>(ID, { $where: `${geo} AND latitude IS NOT NULL AND incident_category in (${list(VIOLENT)})`, $order: "incident_datetime DESC", $limit: "80" }, signal),
    ]);
    const total = cats.reduce((s, c) => s + num(c.n), 0);
    log(`${fmt(total)} incidents in 90 days`);
    if (!total) return;
    const sum = (set: string[]) => cats.filter((c) => set.includes(c.incident_category ?? "")).reduce((s, c) => s + num(c.n), 0);
    const violent = sum(VIOLENT), property = sum(PROPERTY);
    const cmp = vsCity(total, num(city[0]?.n), r);
    const top = cats.filter((c) => c.incident_category && !/non-criminal|other|lost property|case closure|courtesy/i.test(c.incident_category)).slice(0, 4);
    emit({
      claim: `${fmt(total)} SFPD incidents in the last 90 days (${fmt(cmp.perKm2)}/km², ${ratioText(cmp.ratio)}): ${fmt(violent)} violent, ${fmt(property)} property. Top: ${top.map((c) => `${c.incident_category} (${c.n})`).join(", ")}`,
      geometry: pt(...r.center), source_url: datasetUrl(ID), source_type: "sfpd_incident_aggregate", observed_at: day(todayIso()),
      confidence: 0.85, category: "crime", severity: clamp01(0.2 + 0.25 * cmp.ratio),
      props: { areaLevel: true, total, violent, property, perKm2: Math.round(cmp.perKm2), cityPerKm2: Math.round(cmp.cityPerKm2), ratioVsCity: +cmp.ratio.toFixed(2), windowDays: 90, breakdown: Object.fromEntries(cats.slice(0, 12).map((c) => [c.incident_category ?? "Unknown", num(c.n)])) },
    });

    for (const h of hot) {
      const n = num(h.n);
      if (n < 3 || !num(h.lat)) continue;
      emit({
        claim: `Crime hotspot: ${street(h.intersection)}, ${n} violent/property incidents in 90 days`,
        geometry: pt(h.lng, h.lat), source_url: sodaUrl90(h.intersection ?? "", since), source_type: "sfpd_hotspot", observed_at: day(todayIso()),
        confidence: 0.8, category: "crime", severity: clamp01(0.3 + n / 80), props: { hotspot: true, intersection: h.intersection, incidents90d: n },
      });
    }

    const seen = new Set<string>();
    for (const x of recent) {
      if (seen.has(x.incident_id) || seen.size >= 12) continue;
      seen.add(x.incident_id);
      const sev = /Homicide|Rape|Robbery|Weapons/.test(x.incident_category ?? "") ? 0.75 : /Aggravated/.test(x.incident_subcategory ?? "") ? 0.65 : 0.45;
      emit({
        claim: `${x.incident_category}${x.incident_description ? ` (${x.incident_description})` : ""} at ${street(x.intersection) || "nearby"}, ${month(x.incident_datetime)}`,
        geometry: pt(x.longitude!, x.latitude!), source_url: recordUrl(ID, "incident_id", x.incident_id), source_type: "sfpd_incident",
        observed_at: day(x.incident_datetime), confidence: 0.85, category: "crime", severity: sev,
        props: { violent: true, category: x.incident_category, subcategory: x.incident_subcategory, resolution: x.resolution, neighborhood: x.analysis_neighborhood },
      });
    }
  },
};

/** SFPD writes intersections as "MARKET ST \ 5TH ST". */
const street = (s?: string) => title(s?.replace(/\s*\\\s*/g, " & "));
const sodaUrl90 = (intersection: string, since: string) =>
  sodaUrl(ID, { $where: `intersection='${intersection.replace(/'/g, "''")}' AND incident_datetime > '${since}'` });
