import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";
import type { MultiPolygon, Polygon } from "geojson";
import { areaM2, arcgisQuery, bboxIntersects, clipToRegion } from "./kit";

// Environmental burden.
// - CalEnviroScreen 4.0 (OEHHA, census tracts, California): pollution burden + population vulnerability
//   percentiles (diesel PM, traffic, toxic cleanups, asthma, poverty...). EPA EJScreen was retired in 2025;
//   this is California's official equivalent.
// - Open-Meteo Air Quality (global, no key): PM2.5 over the past 7 days at the area center.
const CES = "https://services1.arcgis.com/PCHfdHz4GlDNAhBb/arcgis/rest/services/CalEnviroScreen_4_0_Results_/FeatureServer/0";
const CA: [number, number, number, number] = [-124.5, 32.5, -114.1, 42.1];
const INDICATORS: [string, string][] = [
  ["dieselP", "diesel particulates"], ["pmP", "PM2.5"], ["ozoneP", "ozone"], ["trafficP", "traffic"], ["leadP", "lead risk in housing"],
  ["cleanupsP", "toxic cleanup sites"], ["gwthreatsP", "groundwater threats"], ["hazP", "hazardous waste"], ["RSEIhazP", "toxic releases"],
  ["iwbP", "impaired water"], ["swisP", "solid waste sites"], ["pestP", "pesticides"], ["drinkP", "drinking water contaminants"],
  ["asthmaP", "asthma ER visits"], ["cvdP", "cardiovascular disease"], ["lbwP", "low birth weight"], ["povP", "poverty"],
  ["housingBP", "housing burden"], ["lingP", "linguistic isolation"], ["unempP", "unemployment"], ["eduP", "low educational attainment"],
];

export const envBurdenWorker: Worker = {
  id: "env-burden",
  name: "Clean Air Patrol",
  description: "Environmental justice screen: CalEnviroScreen 4.0 pollution-burden and vulnerability percentiles by census tract (diesel, traffic, toxic sites, asthma, poverty) plus the past week of PM2.5 air quality.",
  vehicle: "drone",
  color: "#b6bf7a",
  tools: ["http_get"],
  dataSources: ["OEHHA CalEnviroScreen 4.0", "Open-Meteo Air Quality (CAMS)"],
  coverage: "California (CalEnviroScreen); global (PM2.5)",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const r = task.region;
    const [lng, lat] = r.center;
    log("Querying CalEnviroScreen tracts + 7-day PM2.5…");
    const [tracts, aq] = await Promise.all([
      bboxIntersects(r.bbox, CA)
        ? arcgisQuery<Polygon | MultiPolygon>(CES, r.bbox, { outFields: "*", offset: 0.00005, signal }).catch((e) => { log(`CalEnviroScreen: ${(e as Error).message}`); return []; })
        : Promise.resolve([]),
      getJson<{ hourly: { time: string[]; pm2_5: (number | null)[]; us_aqi: (number | null)[] } }>(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&hourly=pm2_5,us_aqi&past_days=7&forecast_days=1&timezone=auto`, { signal, timeoutMs: 12_000 },
      ).catch((e) => { log(`Air quality: ${(e as Error).message}`); return null; }),
    ]);

    // Tracts: clip, weight by area-in-region × population for the summary.
    const rows = tracts.map((f) => {
      const g = f.geometry ? clipToRegion(r, f.geometry) : null;
      return { g, m2: areaM2(g), p: (f.properties ?? {}) as Record<string, number | string | null> };
    }).filter((t) => t.g && t.m2 > 2000 && Number(t.p.CIscoreP) >= 0);
    log(`${rows.length} census tracts in the area`);
    if (rows.length) {
      const w = (t: (typeof rows)[number]) => t.m2 * Math.max(1, Number(t.p.ACS2019TotalPop) || 1);
      const W = rows.reduce((s, t) => s + w(t), 0);
      const avg = (k: string) => rows.reduce((s, t) => s + w(t) * (Number(t.p[k]) || 0), 0) / W;
      const ci = avg("CIscoreP");
      const top = INDICATORS.map(([k, label]) => ({ k, label, v: avg(k) })).filter((x) => x.v >= 75).sort((a, b) => b.v - a.v).slice(0, 4);
      const dac = rows.filter((t) => Number(t.p.CIscoreP) >= 75);
      const pop = rows.reduce((s, t) => s + (Number(t.p.ACS2019TotalPop) || 0), 0);
      emit({
        claim: `CalEnviroScreen 4.0: area averages the ${ordinal(ci)} percentile statewide for cumulative pollution + vulnerability${dac.length ? `; ${dac.length} of ${rows.length} tracts are in the top 25% (SB 535 disadvantaged-community range)` : ""}${top.length ? `. Highest burdens: ${top.map((x) => `${x.label} (${ordinal(x.v)})`).join(", ")}` : ""}`,
        geometry: { type: "Point", coordinates: r.center },
        source_url: "https://oehha.ca.gov/calenviroscreen/report/calenviroscreen-40", source_type: "calenviroscreen", observed_at: "2021-10", confidence: 0.85,
        category: "env_burden", severity: +Math.min(0.95, 0.1 + (ci / 100) * 0.8).toFixed(2),
        props: { areaLevel: true, ciPercentile: Math.round(ci), tracts: rows.length, disadvantagedTracts: dac.length, population: pop, topBurdens: Object.fromEntries(top.map((x) => [x.k, Math.round(x.v)])), pollutionPercentile: Math.round(avg("PollutionP")), popCharPercentile: Math.round(avg("PopCharP")) },
      });
      for (const t of rows.sort((a, b) => Number(b.p.CIscoreP) - Number(a.p.CIscoreP)).slice(0, 12)) {
        const tc = Number(t.p.CIscoreP);
        const hi = INDICATORS.map(([k, label]) => ({ label, v: Number(t.p[k]) || 0 })).sort((a, b) => b.v - a.v).slice(0, 3);
        emit({
          claim: `Tract ${t.p.tract} (${Number(t.p.ACS2019TotalPop).toLocaleString()} people): CalEnviroScreen ${ordinal(tc)} percentile${tc >= 75 ? ", disadvantaged community" : ""}. Top burdens: ${hi.map((x) => `${x.label} ${ordinal(x.v)}`).join(", ")}`,
          geometry: t.g!,
          source_url: "https://experience.arcgis.com/experience/11d2f52282a54ceebcac7428e6184203", source_type: "calenviroscreen", observed_at: "2021-10", confidence: 0.85,
          category: "env_burden", severity: +Math.min(0.95, 0.1 + (tc / 100) * 0.8).toFixed(2),
          props: { tract: String(t.p.tract), ciPercentile: Math.round(tc), disadvantaged: tc >= 75, population: t.p.ACS2019TotalPop, dieselP: t.p.dieselP, pmP: t.p.pmP, trafficP: t.p.trafficP, asthmaP: t.p.asthmaP, povertyP: t.p.povP, cleanupsP: t.p.cleanupsP, areaM2: Math.round(t.m2) },
        });
      }
    }

    if (aq?.hourly?.time?.length) {
      const { time, pm2_5, us_aqi } = aq.hourly;
      const now = Date.now();
      const past = time.map((t, i) => ({ t, pm: pm2_5[i], aqi: us_aqi[i] })).filter((x) => x.pm != null && Date.parse(x.t) <= now);
      const days = new Map<string, number[]>();
      for (const x of past) days.set(x.t.slice(0, 10), [...(days.get(x.t.slice(0, 10)) ?? []), x.pm!]);
      const daily = [...days].map(([d, v]) => ({ d, avg: v.reduce((s, n) => s + n, 0) / v.length })).filter((x) => days.get(x.d)!.length >= 12);
      if (daily.length >= 3) {
        const mean = daily.reduce((s, x) => s + x.avg, 0) / daily.length;
        const worst = [...daily].sort((a, b) => b.avg - a.avg)[0];
        const trend = daily[daily.length - 1].avg - daily[0].avg;
        const over = daily.filter((x) => x.avg > 35).length; // EPA 24-h PM2.5 standard
        emit({
          claim: `PM2.5 past ${daily.length} days: average ${mean.toFixed(1)} µg/m³ (worst day ${worst.d.slice(5)} at ${worst.avg.toFixed(1)}), ${trend > 1 ? "rising" : trend < -1 ? "falling" : "flat"} trend${over ? `; ${over} day(s) above the EPA 24-hour standard (35 µg/m³)` : "; no days above the EPA 24-hour standard"}`,
          geometry: { type: "Point", coordinates: r.center },
          source_url: "https://open-meteo.com/en/docs/air-quality-api", source_type: "air_quality", observed_at: daily[daily.length - 1].d, confidence: 0.7,
          category: "air_quality", severity: +Math.min(0.9, 0.05 + mean / 50 + over * 0.1).toFixed(2),
          props: { areaLevel: true, pm25Mean7d: +mean.toFixed(1), pm25WorstDay: worst.d, pm25WorstAvg: +worst.avg.toFixed(1), daysOverStandard: over, daily: Object.fromEntries(daily.map((x) => [x.d, +x.avg.toFixed(1)])) },
        });
      }
    }
  },
};

function ordinal(v: number) {
  const n = Math.round(v);
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}
