// Shared helpers for the DataSF (Socrata SODA) workers. No key needed at demo volume.
import type { Point } from "geojson";
import type { Region } from "@/lib/types";
import { getJson } from "@/lib/http";
import { regionAreaKm2, regionWkt } from "@/lib/geo";

/** Land area of San Francisco, for "vs. city average" density comparisons. */
export const SF_LAND_KM2 = 121.4;

export const sodaUrl = (id: string, params: Record<string, string>) => `https://data.sf.gov/resource/${id}.json?${new URLSearchParams(params)}`;
/** Human-facing dataset page. */
export const datasetUrl = (id: string) => `https://data.sf.gov/d/${id}`;
/** Record-level JSON link (one row by its key), used as a finding's source_url. */
export const recordUrl = (id: string, key: string, value: string) => sodaUrl(id, { [key]: value });

export function soda<T>(id: string, params: Record<string, string>, signal: AbortSignal, timeoutMs = 10_000): Promise<T> {
  return getJson<T>(sodaUrl(id, params), { signal, timeoutMs });
}

/** `within_polygon(field, region)` SoQL clause. */
export const within = (field: string, r: Region) => `within_polygon(${field}, '${regionWkt(r)}')`;

/** Day-aligned floating timestamp N days ago (stable cache key across a demo day). */
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10) + "T00:00:00";
export const todayIso = () => new Date().toISOString().slice(0, 10) + "T00:00:00";

export const num = (s: unknown) => { const n = Number(s ?? 0); return Number.isFinite(n) ? n : 0; };
export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
export const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "0%");
export const pt = (lng: number | string, lat: number | string): Point => ({ type: "Point", coordinates: [Number(lng), Number(lat)] });
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const day = (s?: string) => s?.slice(0, 10);
/** "Oct 2026" style label. */
export const month = (s?: string) => (s ? new Date(s.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" }) : "");
export const title = (s?: string) => (s ?? "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** Region area in km², floored so tiny pin regions don't explode density ratios. */
export const areaKm2 = (r: Region) => Math.max(0.05, regionAreaKm2(r));

/** Density in the region vs. the citywide density: 1.0 = city average. */
export function vsCity(regionCount: number, cityCount: number, r: Region) {
  const local = regionCount / areaKm2(r);
  const city = cityCount / SF_LAND_KM2;
  return { perKm2: local, cityPerKm2: city, ratio: city ? local / city : 0 };
}

export const ratioText = (ratio: number) =>
  ratio >= 1.15 ? `${ratio.toFixed(1)}× the SF average` : ratio <= 0.87 ? `${Math.round(100 * (1 - ratio))}% below the SF average` : "about the SF average";
