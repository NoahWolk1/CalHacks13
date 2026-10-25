import type { Worker } from "@/lib/types";
import type { MultiLineString, Position } from "geojson";
import { regionWkt, touchesSF } from "@/lib/geo";
import { clamp01, datasetUrl, daysAgo, day, fmt, month, num, pt, ratioText, recordUrl, soda, title, vsCity, within } from "./sfdata";

// SF Traffic Crashes Resulting in Injury (SFPD/DPH Vision Zero, DataSF). Lags ~1-2 months.
const ID = "ubvf-ztfx";
// Vision Zero 2024 High Injury Network: the ~13% of streets with ~68% of severe/fatal injuries.
const HIN = "enwt-3u8m";

interface Crash {
  unique_id: string; collision_datetime: string; collision_severity: string; primary_rd?: string; secondary_rd?: string;
  dph_col_grp_description?: string; vz_pcf_description?: string; type_of_collision?: string; number_killed?: string; number_injured?: string;
  lighting?: string; point?: { type: "Point"; coordinates: [number, number] };
}

export const crashesWorker: Worker = {
  id: "sf-crashes",
  name: "Vision Zero",
  description: "Injury traffic crashes over the last 2 years (fatal/severe counts, pedestrian and cyclist share, rate vs. the SF average), pins for fatal and severe crashes, and the Vision Zero High Injury Network streets in the area. San Francisco only.",
  vehicle: "car",
  color: "#e3b5c8",
  tools: ["http_get"],
  dataSources: ["SF Traffic Crashes Resulting in Injury (DataSF ubvf-ztfx)", "Vision Zero 2024 High Injury Network (DataSF enwt-3u8m)"],
  coverage: "San Francisco",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    if (!touchesSF(r)) { log("Outside San Francisco: no Vision Zero crash data here."); return; }
    const since = daysAgo(730);
    const geo = `${within("point", r)} AND collision_datetime > '${since}'`;
    log("Pulling 2 years of injury crashes and the High Injury Network…");
    const [bySev, byGroup, city, severe, hin] = await Promise.all([
      soda<{ s: string; n: string; k: string; i: string }[]>(ID, { $select: "collision_severity as s, count(*) as n, sum(number_killed) as k, sum(number_injured) as i", $where: geo, $group: "s" }, signal),
      soda<{ g?: string; n: string }[]>(ID, { $select: "dph_col_grp_description as g, count(*) as n", $where: geo, $group: "g", $order: "n DESC" }, signal),
      soda<{ n: string }[]>(ID, { $select: "count(*) as n", $where: `collision_datetime > '${since}'` }, signal),
      soda<Crash[]>(ID, { $where: `${geo} AND collision_severity in ('Fatal', 'Injury (Severe)') AND point IS NOT NULL`, $order: "collision_datetime DESC", $limit: "40" }, signal),
      soda<{ full_street_name?: string; corrected_length_miles?: string; g?: MultiLineString }[]>(HIN, {
        $select: "full_street_name, corrected_length_miles, simplify_preserve_topology(geom, 0.00003) as g", $where: `intersects(geom, '${regionWkt(r)}')`, $limit: "400",
      }, signal).catch(() => []),
    ]);
    const total = bySev.reduce((s, x) => s + num(x.n), 0);
    const killed = bySev.reduce((s, x) => s + num(x.k), 0);
    const injured = bySev.reduce((s, x) => s + num(x.i), 0);
    const nSevere = num(bySev.find((x) => x.s === "Injury (Severe)")?.n), nFatal = num(bySev.find((x) => x.s === "Fatal")?.n);
    const ped = byGroup.filter((x) => /Pedestrian/.test(x.g ?? "")).reduce((s, x) => s + num(x.n), 0);
    const bike = byGroup.filter((x) => /Bicycle/.test(x.g ?? "") && !/Pedestrian/.test(x.g ?? "")).reduce((s, x) => s + num(x.n), 0);
    const cmp = vsCity(total, num(city[0]?.n), r);
    log(`${total} injury crashes, ${killed} killed`);
    if (total) {
      emit({
        claim: `${fmt(total)} injury crashes in 2 years (${ratioText(cmp.ratio)}): ${nFatal} fatal, ${nSevere} severe; ${fmt(injured)} people injured, ${killed} killed. ${ped} involved pedestrians, ${bike} cyclists`,
        geometry: pt(...r.center), source_url: datasetUrl(ID), source_type: "crash_aggregate", observed_at: day(new Date().toISOString()),
        confidence: 0.85, category: "crash", severity: clamp01(0.2 + 0.2 * cmp.ratio + 0.1 * nFatal + 0.02 * nSevere),
        props: { areaLevel: true, total, fatal: nFatal, severe: nSevere, killed, injured, pedestrian: ped, bicycle: bike, ratioVsCity: +cmp.ratio.toFixed(2), windowDays: 730, byType: Object.fromEntries(byGroup.map((x) => [x.g ?? "Unknown", num(x.n)])) },
      });
    }

    for (const c of severe.slice(0, 18)) {
      if (!c.point) continue;
      const fatal = c.collision_severity === "Fatal";
      const where = [c.primary_rd, c.secondary_rd].filter(Boolean).map(title).join(" & ");
      emit({
        claim: `${fatal ? "Fatal" : "Severe-injury"} crash (${c.dph_col_grp_description ?? c.type_of_collision ?? "collision"}) at ${where || "nearby"}, ${month(c.collision_datetime)}${c.vz_pcf_description && c.vz_pcf_description !== "Unknown" ? `: ${c.vz_pcf_description}` : ""}`,
        geometry: c.point, source_url: recordUrl(ID, "unique_id", c.unique_id), source_type: "crash_report", observed_at: day(c.collision_datetime),
        confidence: 0.9, category: "crash", severity: fatal ? 0.95 : 0.75,
        props: { severity: c.collision_severity, mode: c.dph_col_grp_description, cause: c.vz_pcf_description, killed: num(c.number_killed), injured: num(c.number_injured), lighting: c.lighting },
      });
    }

    // High Injury Network: merge segments per street, keep only vertices near the region.
    const [a, b, cx, d] = r.bbox, pad = 0.0005;
    const inBox = ([x, y]: Position) => x >= a - pad && x <= cx + pad && y >= b - pad && y <= d + pad;
    const streets = new Map<string, { miles: number; lines: Position[][] }>();
    for (const s of hin) {
      const name = s.full_street_name ?? "Unnamed street";
      const e = streets.get(name) ?? { miles: 0, lines: [] };
      e.miles += num(s.corrected_length_miles);
      for (const l of s.g?.coordinates ?? []) { const k = l.filter(inBox); if (k.length >= 2) e.lines.push(k); }
      streets.set(name, e);
    }
    const ranked = [...streets.entries()].filter(([, e]) => e.lines.length).sort((x, y) => y[1].miles - x[1].miles);
    if (ranked.length) {
      emit({
        claim: `${ranked.length} Vision Zero High Injury Network streets cross the area: ${ranked.slice(0, 6).map(([n]) => title(n)).join(", ")}`,
        geometry: pt(...r.center), source_url: datasetUrl(HIN), source_type: "high_injury_network", observed_at: "2024-01-01",
        confidence: 0.9, category: "crash", severity: clamp01(0.4 + ranked.length / 20), props: { areaLevel: true, hin: true, streets: ranked.map(([n]) => n) },
      });
    }
    for (const [name, e] of ranked.slice(0, 6)) {
      emit({
        claim: `${title(name)} is on SF's High Injury Network (streets with most severe/fatal crashes)`,
        geometry: { type: "MultiLineString", coordinates: e.lines }, source_url: datasetUrl(HIN), source_type: "high_injury_network", observed_at: "2024-01-01",
        confidence: 0.9, category: "crash", severity: 0.6, props: { hin: true, street: name },
      });
    }
  },
};
