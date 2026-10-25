"use client";
// Client-side Nominatim helpers (search + reverse). Cached so the demo doesn't hammer the API.

const NOMINATIM = "https://nominatim.openstreetmap.org";

export interface Place { name: string; detail: string; center: [number, number]; bbox?: [number, number, number, number] }

interface NomResult {
  display_name: string; name?: string; lat: string; lon: string; boundingbox?: [string, string, string, string];
  address?: Record<string, string>;
}

const searchCache = new Map<string, Place[]>();
export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const key = q.trim().toLowerCase();
  if (searchCache.has(key)) return searchCache.get(key)!;
  const r = await fetch(`${NOMINATIM}/search?format=json&limit=5&q=${encodeURIComponent(q)}`, { signal, headers: { "Accept-Language": "en" } });
  if (!r.ok) throw new Error(`geocode ${r.status}`);
  const rows = (await r.json()) as NomResult[];
  const out = rows.map((x): Place => {
    const parts = x.display_name.split(",").map((s) => s.trim());
    const bb = x.boundingbox?.map(Number);
    return {
      name: x.name || parts[0],
      detail: parts.slice(1, 4).join(", "),
      center: [Number(x.lon), Number(x.lat)],
      bbox: bb && bb.every(Number.isFinite) ? [bb[2], bb[0], bb[3], bb[1]] : undefined,
    };
  });
  searchCache.set(key, out);
  return out;
}

const reverseCache = new Map<string, string | null>();
export async function reverseLabel(center: [number, number], signal?: AbortSignal): Promise<string | null> {
  const key = center.map((v) => v.toFixed(4)).join(",");
  if (reverseCache.has(key)) return reverseCache.get(key)!;
  const r = await fetch(`${NOMINATIM}/reverse?format=json&zoom=16&lat=${center[1]}&lon=${center[0]}`, { signal, headers: { "Accept-Language": "en" } });
  if (!r.ok) return null;
  const j = (await r.json()) as NomResult;
  const a = j.address ?? {};
  const area = a.neighbourhood || a.suburb || a.quarter || a.city_district || a.road;
  const city = a.city || a.town || a.village || a.county;
  const label = [area, city].filter(Boolean).join(", ") || null;
  reverseCache.set(key, label);
  return label;
}
