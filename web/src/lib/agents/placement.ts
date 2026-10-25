// Turns what a generated agent reports into a map-ready Finding: coordinates if it gave them,
// otherwise a geocoded address, otherwise the region center at reduced confidence.

import type { Finding, Region } from "@/lib/types";

export interface RawFinding {
  claim: string;
  source_url: string;
  source_type: string;
  observed_at?: string;
  confidence: number;
  severity?: number;
  lng?: number;
  lat?: number;
  address?: string;
}

export type Geocode = (address: string, region: Region) => Promise<[number, number] | null>;

/** How far past the region's bbox a finding may land, as a fraction of the bbox size. */
const EDGE_SLACK = 0.25;
const APPROXIMATE_PENALTY = 0.6;

const clamp01 = (n: number) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

function nearRegion(r: Region, [lng, lat]: [number, number]) {
  const [minX, minY, maxX, maxY] = r.bbox;
  const dx = (maxX - minX) * EDGE_SLACK, dy = (maxY - minY) * EDGE_SLACK;
  return lng >= minX - dx && lng <= maxX + dx && lat >= minY - dy && lat <= maxY + dy;
}

/** Returns null when the finding is clearly outside the selected area. */
export async function placeFinding(region: Region, raw: RawFinding, geocode: Geocode): Promise<Omit<Finding, "id" | "worker_id"> | null> {
  let point: [number, number] | null = null;
  if (Number.isFinite(raw.lng) && Number.isFinite(raw.lat)) point = [raw.lng!, raw.lat!];
  else if (raw.address?.trim()) point = await geocode(raw.address.trim(), region).catch(() => null);

  const approximate = !point;
  if (point && !nearRegion(region, point)) return null;
  return {
    claim: raw.claim,
    geometry: { type: "Point", coordinates: point ?? region.center },
    source_url: raw.source_url || undefined,
    source_type: raw.source_type || "web",
    observed_at: raw.observed_at || undefined,
    confidence: clamp01(raw.confidence) * (approximate ? APPROXIMATE_PENALTY : 1),
    severity: raw.severity === undefined ? undefined : clamp01(raw.severity),
    category: "custom",
    props: { ...(raw.address ? { address: raw.address } : {}), ...(approximate ? { approximate: true, areaLevel: true } : {}) },
  };
}
