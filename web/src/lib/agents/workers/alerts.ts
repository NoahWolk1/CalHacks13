import type { Worker } from "@/lib/types";
import { getJson } from "@/lib/http";

// Live conditions: NWS active alerts (US) + Open-Meteo air quality (global). No keys.
export const alertsWorker: Worker = {
  id: "live-conditions",
  name: "Sky Sentinel",
  description: "Checks live conditions right now: active National Weather Service alerts (fire, flood, heat, wind) and current air quality.",
  vehicle: "drone",
  color: "#a9cbe8",
  tools: ["http_get"],
  dataSources: ["NWS Alerts API", "Open-Meteo Air Quality"],
  coverage: "US alerts, global air quality",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const [lng, lat] = task.region.center;
    log("Checking NWS alerts + air quality…");
    const [alerts, aq] = await Promise.allSettled([
      getJson<{ features: { properties: { event: string; headline: string; severity: string; effective: string; id: string } }[] }>(
        `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`, { signal, init: { headers: { Accept: "application/geo+json" } } }),
      getJson<{ current: { us_aqi: number; pm2_5: number } }>(
        `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5`, { signal }),
    ]);
    if (alerts.status === "fulfilled") {
      const list = alerts.value.features ?? [];
      log(`${list.length} active alerts`);
      for (const a of list.slice(0, 5)) {
        emit({
          claim: `Active alert: ${a.properties.headline ?? a.properties.event}`,
          geometry: { type: "Point", coordinates: task.region.center },
          source_url: a.properties.id, source_type: "nws_alert", observed_at: a.properties.effective?.slice(0, 10), confidence: 0.95,
          category: "alert", severity: a.properties.severity === "Extreme" ? 1 : a.properties.severity === "Severe" ? 0.8 : 0.5, props: { areaLevel: true },
        });
      }
      if (!list.length) emit({ claim: "No active weather/hazard alerts right now", geometry: { type: "Point", coordinates: task.region.center }, source_url: "https://alerts.weather.gov", source_type: "nws_alert", confidence: 0.9, category: "alert", severity: 0.05, props: { areaLevel: true } });
    }
    if (aq.status === "fulfilled" && aq.value.current) {
      const { us_aqi, pm2_5 } = aq.value.current;
      const lvl = us_aqi <= 50 ? "good" : us_aqi <= 100 ? "moderate" : us_aqi <= 150 ? "unhealthy for sensitive groups" : "unhealthy";
      emit({
        claim: `Air quality now: US AQI ${us_aqi} (${lvl}), PM2.5 ${pm2_5} µg/m³`,
        geometry: { type: "Point", coordinates: task.region.center },
        source_url: "https://open-meteo.com/en/docs/air-quality-api", source_type: "air_quality", observed_at: new Date().toISOString().slice(0, 10),
        confidence: 0.8, category: "alert", severity: Math.min(1, us_aqi / 200), props: { areaLevel: true, us_aqi, pm2_5 },
      });
    }
  },
};
