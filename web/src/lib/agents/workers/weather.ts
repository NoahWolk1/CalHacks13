import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";

// Open-Meteo (no key, global): 7-day forecast + ~30 years of ERA5 reanalysis daily highs for heat history.
interface Forecast {
  timezone: string;
  daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_sum: number[]; precipitation_probability_max: (number | null)[]; wind_gusts_10m_max: number[]; uv_index_max: number[] };
}
interface Archive { daily: { time: string[]; temperature_2m_max: (number | null)[] } }

const HOT_F = 90;
const WARM_F = 85;

export const weatherWorker: Worker = {
  id: "weather-outlook",
  name: "Front Line",
  description: "7-day weather outlook (highs, rain, wind gusts, UV) plus 30 years of heat history: hot days per year then vs now and the record high for the area.",
  vehicle: "satellite",
  color: "#d8c57c",
  tools: ["http_get"],
  dataSources: ["Open-Meteo Forecast API", "Open-Meteo Historical Weather (ERA5)"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const [lng, lat] = task.region.center;
    const pt = { type: "Point" as const, coordinates: task.region.center };
    const y1 = new Date().getUTCFullYear() - 1;
    log("Fetching 7-day forecast + 30-year heat history…");
    const [fc, ar] = await Promise.allSettled([
      getJson<Forecast>(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,uv_index_max&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=auto&forecast_days=7`, { signal, timeoutMs: 12_000 }),
      getJson<Archive>(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(3)}&longitude=${lng.toFixed(3)}&start_date=${y1 - 29}-01-01&end_date=${y1}-12-31&daily=temperature_2m_max&temperature_unit=fahrenheit&timezone=auto`, { signal, timeoutMs: 20_000 }),
    ]);

    if (fc.status === "fulfilled") {
      const d = fc.value.daily;
      const n = d.time.length;
      const hi = Math.max(...d.temperature_2m_max), lo = Math.min(...d.temperature_2m_min);
      const rain = d.precipitation_sum.reduce((s, v) => s + (v ?? 0), 0);
      const gust = Math.max(...d.wind_gusts_10m_max);
      const gustDay = d.time[d.wind_gusts_10m_max.indexOf(gust)];
      const hotDays = d.time.filter((_, i) => d.temperature_2m_max[i] >= HOT_F);
      const wetDays = d.time.filter((_, i) => (d.precipitation_sum[i] ?? 0) >= 0.1);
      const uv = Math.max(...d.uv_index_max);
      const flags = [hotDays.length && `${hotDays.length} day(s) ≥ ${HOT_F}°F`, gust >= 40 && `gusts to ${Math.round(gust)} mph on ${gustDay.slice(5)}`, rain >= 1 && `${rain.toFixed(1)} in of rain`].filter(Boolean);
      emit({
        claim: `7-day outlook: highs ${Math.round(Math.min(...d.temperature_2m_max))}–${Math.round(hi)}°F, lows down to ${Math.round(lo)}°F, ${rain < 0.05 ? "dry" : wetDays.length ? `${rain.toFixed(2)} in of rain over ${wetDays.length} day(s)` : `mostly dry (${rain.toFixed(2)} in total)`}, peak gusts ${Math.round(gust)} mph (${gustDay.slice(5)}), max UV ${Math.round(uv)}${flags.length ? `. Watch: ${flags.join(", ")}` : ""}`,
        geometry: pt, source_url: "https://open-meteo.com/en/docs", source_type: "weather_forecast", observed_at: d.time[0], confidence: 0.75,
        category: "weather", severity: +Math.min(0.9, 0.1 + (hotDays.length ? 0.35 : 0) + (gust >= 40 ? 0.25 : gust >= 30 ? 0.1 : 0) + (rain >= 1 ? 0.25 : rain >= 0.25 ? 0.1 : 0)).toFixed(2),
        props: { areaLevel: true, kind: "forecast", days: n, maxF: hi, minF: lo, rainIn: +rain.toFixed(2), maxGustMph: gust, maxUv: uv, hotDays, wetDays, timezone: fc.value.timezone },
      });
      // One pin-less finding per notable day so the timeline has texture (only days that matter).
      for (let i = 0; i < n; i++) {
        const t = d.temperature_2m_max[i], p = d.precipitation_sum[i] ?? 0, g = d.wind_gusts_10m_max[i];
        const why = [t >= WARM_F && `high ${Math.round(t)}°F`, p >= 0.25 && `${p.toFixed(2)} in rain (${d.precipitation_probability_max[i] ?? "?"}% chance)`, g >= 35 && `gusts ${Math.round(g)} mph`].filter(Boolean);
        if (!why.length) continue;
        emit({
          claim: `${d.time[i]}: ${why.join(", ")}`,
          geometry: pt, source_url: "https://open-meteo.com/en/docs", source_type: "weather_forecast", observed_at: d.time[i], confidence: 0.7,
          category: "weather", severity: +Math.min(0.8, 0.2 + (t >= HOT_F ? 0.35 : t >= WARM_F ? 0.15 : 0) + (p >= 0.5 ? 0.25 : p >= 0.25 ? 0.1 : 0) + (g >= 40 ? 0.25 : g >= 35 ? 0.1 : 0)).toFixed(2),
          props: { areaLevel: true, kind: "forecast_day", date: d.time[i], maxF: t, rainIn: p, gustMph: g },
        });
      }
    } else log(`Forecast failed: ${fc.reason}`);

    if (ar.status === "fulfilled") {
      const { time, temperature_2m_max: tx } = ar.value.daily;
      const byYear = new Map<number, { hot: number; warm: number }>();
      let rec = { t: -Infinity, d: "" };
      for (let i = 0; i < time.length; i++) {
        const t = tx[i];
        if (t == null) continue;
        const y = +time[i].slice(0, 4);
        const e = byYear.get(y) ?? { hot: 0, warm: 0 };
        if (t >= HOT_F) e.hot++;
        if (t >= WARM_F) e.warm++;
        byYear.set(y, e);
        if (t > rec.t) rec = { t, d: time[i] };
      }
      const years = [...byYear.keys()].sort();
      const avg = (ys: number[], k: "hot" | "warm") => ys.reduce((s, y) => s + byYear.get(y)![k], 0) / Math.max(1, ys.length);
      const early = years.slice(0, 10), late = years.slice(-10);
      const [hotE, hotL, warmE, warmL] = [avg(early, "hot"), avg(late, "hot"), avg(early, "warm"), avg(late, "warm")];
      const k: "hot" | "warm" = hotL >= 2 ? "hot" : "warm";
      const [e, l, thr] = k === "hot" ? [hotE, hotL, HOT_F] : [warmE, warmL, WARM_F];
      const change = l - e;
      emit({
        claim: `Heat history (ERA5, ${years[0]}–${years[years.length - 1]}): ${l.toFixed(1)} days/yr ≥ ${thr}°F in the last decade vs ${e.toFixed(1)} in ${early[0]}–${early[early.length - 1]} (${change >= 0 ? "+" : ""}${change.toFixed(1)}). Hottest day: ${Math.round(rec.t)}°F on ${rec.d}`,
        geometry: pt, source_url: "https://open-meteo.com/en/docs/historical-weather-api", source_type: "weather_history", confidence: 0.75,
        category: "heat", severity: +Math.min(0.85, 0.1 + Math.min(0.4, hotL / 50) + Math.max(0, Math.min(0.3, change / 15))).toFixed(2),
        props: { areaLevel: true, kind: "heat_history", thresholdF: thr, daysPerYearRecent: +l.toFixed(1), daysPerYearEarly: +e.toFixed(1), hotDaysPerYearRecent: +hotL.toFixed(1), recordHighF: rec.t, recordHighDate: rec.d, perYear: Object.fromEntries([...byYear].map(([y, v]) => [y, v[k]])) },
      });
    } else log(`Heat history failed: ${ar.reason}`);
  },
};
