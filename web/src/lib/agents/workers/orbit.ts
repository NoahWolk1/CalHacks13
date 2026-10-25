import type { Region, Worker } from "@/lib/types";
import { getText } from "@/lib/http";
import { inRegion, touchesUS } from "@/lib/geo";
import * as satellite from "satellite.js";

// CelesTrak TLEs (no key) propagated with SGP4 (satellite.js) to predict when imaging satellites next
// pass within sensor swath of the area, and when the ISS is visible overhead.

const IMAGING_DAYS = 8;
interface Sat { id: number; name: string; swathKm?: number; horizonH: number }
const SATS: Sat[] = [
  { id: 40697, name: "Sentinel-2A", swathKm: 290, horizonH: IMAGING_DAYS * 24 },
  { id: 42063, name: "Sentinel-2B", swathKm: 290, horizonH: IMAGING_DAYS * 24 },
  { id: 60989, name: "Sentinel-2C", swathKm: 290, horizonH: IMAGING_DAYS * 24 },
  { id: 39084, name: "Landsat 8", swathKm: 185, horizonH: IMAGING_DAYS * 24 },
  { id: 49260, name: "Landsat 9", swathKm: 185, horizonH: IMAGING_DAYS * 24 },
  { id: 25544, name: "ISS", horizonH: 48 },
];
const STEP_S = 30;
const TRACK_HALF_MIN = 6;
const RE = 6371;
const rad = Math.PI / 180;

type V3 = { x: number; y: number; z: number };
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: V3) => Math.hypot(a.x, a.y, a.z);

/** Low-precision solar direction in ECI (Astronomical Almanac, ~0.01°). */
function sunEci(t: Date): V3 {
  const n = t.getTime() / 86_400_000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) * rad, g = (357.528 + 0.9856003 * n) * rad;
  const lam = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 4e-7 * n) * rad;
  return { x: Math.cos(lam), y: Math.cos(eps) * Math.sin(lam), z: Math.sin(eps) * Math.sin(lam) };
}

function sunElevationDeg(t: Date, lng: number, lat: number) {
  const up = satellite.ecfToEci(satellite.geodeticToEcf({ longitude: lng * rad, latitude: lat * rad, height: 0 }), satellite.gstime(t));
  return Math.asin(dot(up, sunEci(t)) / norm(up)) / rad;
}

function sunlit(r: V3, t: Date) {
  const s = sunEci(t), d = dot(r, s);
  return d > 0 || Math.hypot(r.x - d * s.x, r.y - d * s.y, r.z - d * s.z) > RE;
}

function haversineKm(a: [number, number], b: [number, number]) {
  const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * RE * Math.asin(Math.sqrt(h));
}

interface State { t: Date; eci: V3; sub: [number, number]; km: number }
function stateAt(rec: satellite.SatRec, t: Date, center: [number, number]): State | null {
  const pv = satellite.propagate(rec, t);
  if (typeof pv.position === "boolean") return null;
  const gd = satellite.eciToGeodetic(pv.position, satellite.gstime(t));
  const sub: [number, number] = [satellite.degreesLong(gd.longitude), satellite.degreesLat(gd.latitude)];
  return { t, eci: pv.position, sub, km: haversineKm(sub, center) };
}

function lookAngles(rec: satellite.SatRec, t: Date, [lng, lat]: [number, number]) {
  const pv = satellite.propagate(rec, t);
  if (typeof pv.position === "boolean") return { el: -90, az: 0 };
  const look = satellite.ecfToLookAngles({ longitude: lng * rad, latitude: lat * rad, height: 0 }, satellite.eciToEcf(pv.position, satellite.gstime(t)));
  return { el: look.elevation / rad, az: ((look.azimuth / rad) + 360) % 360 };
}
const compass = (az: number) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(az / 45) % 8];

/** Local minima of sub-satellite distance to the center (each one is a pass), refined to 1 s. */
function closestApproaches(rec: satellite.SatRec, center: [number, number], start: number, hours: number, maxKm: number) {
  const out: State[] = [];
  let prev2: State | null = null, prev: State | null = null;
  for (let s = 0; s <= hours * 3600; s += STEP_S) {
    const cur = stateAt(rec, new Date(start + s * 1000), center);
    if (!cur) { prev2 = prev = null; continue; }
    if (prev2 && prev && prev.km <= prev2.km && prev.km < cur.km && prev.km < maxKm) {
      let best = prev;
      for (let k = -STEP_S; k <= STEP_S; k++) {
        const st = stateAt(rec, new Date(prev.t.getTime() + k * 1000), center);
        if (st && st.km < best.km) best = st;
      }
      out.push(best);
    }
    prev2 = prev; prev = cur;
  }
  return out;
}

function groundTrack(rec: satellite.SatRec, t: Date, center: [number, number]) {
  const pts: [number, number][] = [];
  for (let s = -TRACK_HALF_MIN * 60; s <= TRACK_HALF_MIN * 60; s += STEP_S) {
    const st = stateAt(rec, new Date(t.getTime() + s * 1000), center);
    if (st) pts.push([+st.sub[0].toFixed(4), +st.sub[1].toFixed(4)]);
  }
  return pts;
}

/** Best-effort display timezone: US regions get their zone (by longitude), elsewhere UTC. */
function timeZoneFor(r: Region) {
  const [lng, lat] = r.center;
  if (!touchesUS(r)) return "UTC";
  if (lat < 23 && lng < -154) return "Pacific/Honolulu";
  if (lat > 51 && lng < -129) return "America/Anchorage";
  return lng < -114.5 ? "America/Los_Angeles" : lng < -102 ? "America/Denver" : lng < -87.5 ? "America/Chicago" : "America/New_York";
}

function inHours(t: Date) {
  const h = (t.getTime() - Date.now()) / 3_600_000;
  return h < 1 ? `in ${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `in ${Math.round(h)}h` : `in ${(h / 24).toFixed(1)} days`;
}

export const orbitWorker: Worker = {
  id: "orbit-passes",
  name: "Orbit Planner",
  description: "Propagates live CelesTrak orbital elements (SGP4) for Sentinel-2A/B/C, Landsat 8/9 and the ISS to predict when the next satellite imaging pass will cover the area and when the ISS is visible overhead.",
  vehicle: "satellite",
  color: "#aebccc",
  tools: ["http_get"],
  dataSources: ["CelesTrak GP element sets (TLE)", "SGP4 propagation (satellite.js)"],
  coverage: "Global",
  builtin: true,
  async run({ task, emit, log, signal }) {
    const region = task.region;
    const center = region.center;
    const tz = timeZoneFor(region);
    const near = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    const far = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    const fmt = { format: (t: Date) => (t.getTime() - Date.now() > 48 * 3_600_000 ? far : near).format(t) };
    log("Fetching TLEs from CelesTrak…");
    const tles = await Promise.allSettled(SATS.map((s) =>
      getText(`https://celestrak.org/NORAD/elements/gp.php?CATNR=${s.id}&FORMAT=tle`, { signal, timeoutMs: 12_000 })));
    const recs = SATS.flatMap((s, i) => {
      const r = tles[i];
      const lines = r.status === "fulfilled" ? r.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
      const l1 = lines.find((l) => l.startsWith("1 ")), l2 = lines.find((l) => l.startsWith("2 "));
      if (!l1 || !l2) { log(`No TLE for ${s.name}`); return []; }
      return [{ sat: s, rec: satellite.twoline2satrec(l1, l2), epoch: l1.slice(18, 32) }];
    });
    if (!recs.length) throw new Error("CelesTrak returned no element sets");
    log(`Propagating ${recs.length} orbits (SGP4, ${STEP_S}s steps)…`);
    const start = Date.now();
    const imaging: { name: string; t: Date; km: number; finding: Parameters<typeof emit>[0] }[] = [];

    for (const { sat, rec } of recs) {
      if (signal.aborted) return;
      if (sat.swathKm) {
        const half = sat.swathKm / 2;
        // Optical imagers only collect on the sunlit (descending) side of the orbit.
        const pass = closestApproaches(rec, center, start, sat.horizonH, half).find((p) => {
          const next = stateAt(rec, new Date(p.t.getTime() + 10_000), center);
          return next && next.sub[1] < p.sub[1] && sunElevationDeg(p.t, center[0], center[1]) > 5;
        });
        if (!pass) { log(`${sat.name}: no imaging pass in the next ${sat.horizonH / 24} days`); continue; }
        const sunEl = sunElevationDeg(pass.t, center[0], center[1]);
        imaging.push({
          name: sat.name, t: pass.t, km: pass.km,
          finding: {
            claim: `Next ${sat.name} imaging pass: ${fmt.format(pass.t)} (${inHours(pass.t)}), ground track ${Math.round(pass.km)} km from the area, inside its ${sat.swathKm} km swath`,
            geometry: { type: "Point", coordinates: [+pass.sub[0].toFixed(4), +pass.sub[1].toFixed(4)] },
            source_url: `https://celestrak.org/NORAD/elements/gp.php?CATNR=${sat.id}&FORMAT=tle`, source_type: "orbit_prediction",
            observed_at: pass.t.toISOString(), confidence: 0.8, category: "orbit", severity: +Math.min(0.5, 0.2 + 0.3 * Math.exp(-(pass.t.getTime() - start) / 86_400_000)).toFixed(2),
            props: {
              satellite: sat.name, noradId: sat.id, passTime: pass.t.toISOString(), crossTrackKm: Math.round(pass.km), swathKm: sat.swathKm,
              direction: "descending", sunElevation: +sunEl.toFixed(1), groundTrack: groundTrack(rec, pass.t, center),
              offRegion: !inRegion(region, pass.sub[0], pass.sub[1]), timeZone: tz,
            },
          },
        });
      } else {
        // ISS: passes with ≥10° elevation; "visible" = observer in darkness and station sunlit.
        const passes = closestApproaches(rec, center, start, sat.horizonH, 2300)
          .map((p) => ({ p, ...lookAngles(rec, p.t, center), sun: sunElevationDeg(p.t, center[0], center[1]), lit: sunlit(p.eci, p.t) }))
          .filter((x) => x.el >= 10);
        const visible = passes.filter((x) => x.sun < -6 && x.lit);
        const pick = (visible.length ? visible : passes.filter((x) => x.el >= 30)).slice(0, 2);
        for (const x of pick) {
          const isVis = x.sun < -6 && x.lit;
          emit({
            claim: isVis
              ? `ISS visible from here ${fmt.format(x.p.t)} (${inHours(x.p.t)}), peaking ${Math.round(x.el)}° above the ${compass(x.az)} horizon`
              : `ISS passes over ${fmt.format(x.p.t)} (${inHours(x.p.t)}), peaking ${Math.round(x.el)}° above the ${compass(x.az)} horizon, not visible to the eye (${x.sun >= -6 ? "daylight" : "station in Earth's shadow"})`,
            geometry: { type: "Point", coordinates: [+x.p.sub[0].toFixed(4), +x.p.sub[1].toFixed(4)] },
            source_url: `https://celestrak.org/NORAD/elements/gp.php?CATNR=${sat.id}&FORMAT=tle`, source_type: "orbit_prediction",
            observed_at: x.p.t.toISOString(), confidence: 0.75, category: "orbit", severity: 0.15,
            props: {
              satellite: "ISS", noradId: sat.id, passTime: x.p.t.toISOString(), maxElevation: Math.round(x.el), azimuth: Math.round(x.az), visible: isVis,
              crossTrackKm: Math.round(x.p.km), groundTrack: groundTrack(rec, x.p.t, center), offRegion: !inRegion(region, x.p.sub[0], x.p.sub[1]), timeZone: tz,
            },
          });
        }
        log(`ISS: ${passes.length} passes ≥10° in 48h, ${visible.length} visible`);
      }
    }

    imaging.sort((p, q) => p.t.getTime() - q.t.getTime());
    if (imaging.length) {
      const first = imaging[0];
      emit({
        claim: `Next fresh satellite image: ${first.name} at ${fmt.format(first.t)} (${inHours(first.t)}); ${imaging.length} of ${recs.filter((r) => r.sat.swathKm).length} imaging satellites cover the area in the next ${IMAGING_DAYS} days`,
        geometry: { type: "Point", coordinates: center },
        source_url: "https://celestrak.org/", source_type: "orbit_prediction", confidence: 0.8, category: "orbit", severity: 0.3,
        props: { areaLevel: true, nextPass: first.t.toISOString(), nextSatellite: first.name, hoursUntil: +((first.t.getTime() - start) / 3_600_000).toFixed(1), schedule: imaging.map((i) => ({ satellite: i.name, passTime: i.t.toISOString(), crossTrackKm: Math.round(i.km) })), timeZone: tz },
      });
    }
    for (const i of imaging) emit(i.finding);
  },
};
