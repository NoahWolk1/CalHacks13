// JPL Horizons: where the Sun, Moon and planets are right now (geocentric apparent RA/Dec), so the
// sky search can say which of them sit inside or near the selected cone.
import { separation } from "./geom";
import type { Cone, SkyObject } from "./types";

export const HORIZONS_API = "https://ssd.jpl.nasa.gov/api/horizons.api";

export const BODIES: { id: string; name: string; type: string }[] = [
  { id: "10", name: "Sun", type: "Star (Sun)" },
  { id: "301", name: "Moon", type: "Moon" },
  { id: "199", name: "Mercury", type: "Planet" },
  { id: "299", name: "Venus", type: "Planet" },
  { id: "499", name: "Mars", type: "Planet" },
  { id: "599", name: "Jupiter", type: "Planet" },
  { id: "699", name: "Saturn", type: "Planet" },
  { id: "799", name: "Uranus", type: "Planet" },
  { id: "899", name: "Neptune", type: "Planet" },
];

/** "Near" margin beyond the cone edge, degrees. */
export const NEAR_MARGIN = 5;

const pad = (n: number) => String(n).padStart(2, "0");
/** Horizons time string, floored to the hour so repeat runs share the HTTP cache. */
export function horizonsTime(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`;
}

export function horizonsUrl(bodyId: string, at: Date) {
  const start = horizonsTime(at);
  const stop = horizonsTime(new Date(at.getTime() + 3600_000));
  const p = new URLSearchParams({
    format: "json", COMMAND: `'${bodyId}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'", CENTER: "'500@399'",
    START_TIME: `'${start}'`, STOP_TIME: `'${stop}'`, STEP_SIZE: "'1 h'", QUANTITIES: "'1,9'", ANG_FORMAT: "'DEG'",
  });
  return `${HORIZONS_API}?${p}`;
}

/** First ephemeris row of a Horizons observer table: { ra, dec, mag? } (degrees). */
export function parseHorizons(json: unknown): { ra: number; dec: number; mag?: number; time: string } {
  const result = (json as { result?: unknown })?.result;
  if (typeof result !== "string") throw new Error("unexpected Horizons response");
  const soe = result.indexOf("$$SOE"), eoe = result.indexOf("$$EOE");
  if (soe < 0 || eoe < soe) throw new Error(`no ephemeris in Horizons response: ${result.slice(0, 120).trim()}`);
  const line = result.slice(soe + 5, eoe).split("\n").map((l) => l.trim()).find(Boolean);
  if (!line) throw new Error("empty Horizons ephemeris");
  const m = line.match(/^(\d{4}-\w{3}-\d{2} \d{2}:\d{2})/);
  // After the timestamp come optional solar/lunar presence flags (*, C, N, A, m, r...), then numbers.
  const nums = line.slice(m ? m[0].length : 0).trim().split(/\s+/).filter((t) => /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)).map(Number);
  if (nums.length < 2) throw new Error("unparseable Horizons row");
  return { ra: nums[0], dec: nums[1], mag: nums.length > 2 && Number.isFinite(nums[2]) ? nums[2] : undefined, time: m?.[1] ?? "" };
}

export function bodyObject(body: (typeof BODIES)[number], pos: ReturnType<typeof parseHorizons>, c: Cone): SkyObject | null {
  const sep = separation(c.ra, c.dec, pos.ra, pos.dec);
  if (sep > c.radius + NEAR_MARGIN) return null;
  const inside = sep <= c.radius;
  const props: Record<string, string | number> = {
    position: inside ? "inside the selected region" : `near: ${(sep - c.radius).toFixed(1)}° outside the edge`,
    "separation from center (deg)": +sep.toFixed(2),
    "ephemeris time (UT)": pos.time,
  };
  if (pos.mag !== undefined) props["apparent mag"] = pos.mag;
  return {
    id: "", name: body.name, type: body.type, category: "solar-system", ra: pos.ra, dec: pos.dec, source: "horizons",
    url: "https://ssd.jpl.nasa.gov/horizons/app.html", props,
  };
}
