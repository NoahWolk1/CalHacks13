// Deterministic spatial cross-referencing. These joins give the LLM grounded candidate
// connections (and power Insights mode on their own when no LLM key is set).

import * as turf from "@turf/turf";
import type { Finding, Insight } from "@/lib/types";
import { anchorOf, distanceM } from "@/lib/geo";

export interface Link {
  kind: Insight["kind"];
  title: string;
  body: string;
  severity: number;
  findingIds: string[];
}

const SFHA = new Set(["A", "AE", "AO", "AH", "V", "VE", "STORM100"]);
const zoneName = (z: unknown) => (z === "STORM100" ? "SFPUC 100-year storm flood" : `FEMA ${z}`);
const isPoly = (f: Finding) => f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon";
const pointIn = (p: [number, number], f: Finding) =>
  turf.booleanPointInPolygon(p, { type: "Feature", geometry: f.geometry as never, properties: {} });

export function crossReference(findings: Finding[]): Link[] {
  const links: Link[] = [];
  const floodZones = findings.filter((f) => f.category === "flood" && isPoly(f) && SFHA.has(String(f.props?.zone)));
  const permits = findings.filter((f) => f.category === "permit");
  const lowGround = findings.filter((f) => f.category === "terrain" && !f.props?.areaLevel && Number(f.props?.elevationM) <= 5);
  const floodReports = findings.filter((f) => f.category === "flood_report");
  const civic = findings.filter((f) => f.category === "places" && f.props?.group === "civic");

  // 1. Investment × hazard: permits inside FEMA special flood hazard areas.
  const permitsInZone: { p: Finding; z: Finding }[] = [];
  for (const p of permits) {
    const z = floodZones.find((z) => pointIn(anchorOf(p.geometry), z));
    if (z) permitsInZone.push({ p, z });
  }
  if (permitsInZone.length) {
    const cost = permitsInZone.reduce((s, { p }) => s + Number(p.props?.cost ?? 0), 0);
    links.push({
      kind: "risk",
      title: `${permitsInZone.length} permitted project${permitsInZone.length > 1 ? "s" : ""} inside a mapped flood zone`,
      body: `${permitsInZone.map(({ p }) => p.claim.split(":")[0]).slice(0, 4).join("; ")}${permitsInZone.length > 4 ? "…" : ""} sit inside ${[...new Set(permitsInZone.map(({ z }) => zoneName(z.props?.zone)))].join(" / ")} zones${cost ? ` (≈$${(cost / 1e6).toFixed(1)}M of permitted work)` : ""}.`,
      severity: Math.min(1, 0.7 + permitsInZone.length * 0.05),
      findingIds: [...new Set(permitsInZone.flatMap(({ p, z }) => [p.id, z.id]))],
    });
  }

  // 2. Investment × low ground: permits within 150 m of ground ≤5 m (outside mapped zones too).
  const nearLow = permits
    .filter((p) => !permitsInZone.some((x) => x.p.id === p.id))
    .map((p) => ({ p, l: lowGround.find((l) => distanceM(anchorOf(p.geometry), anchorOf(l.geometry)) < 150) }))
    .filter((x) => x.l);
  if (nearLow.length) {
    links.push({
      kind: "risk",
      title: `${nearLow.length} project${nearLow.length > 1 ? "s" : ""} on low-lying ground outside mapped flood zones`,
      body: `These permits aren't in a mapped flood zone, but sit within 150 m of ground ≤5 m above sea level, exposed to sea-level rise that current FEMA maps don't model.`,
      severity: 0.6,
      findingIds: [...new Set(nearLow.flatMap(({ p, l }) => [p.id, l!.id]))],
    });
  }

  // 2b. Investment × filled land: permits on former lagoons/marsh (settlement + liquefaction).
  const fill = findings.filter((f) => f.category === "history" && isPoly(f));
  const onFill = permits.filter((p) => fill.some((w) => pointIn(anchorOf(p.geometry), w)));
  if (onFill.length) {
    links.push({
      kind: "risk",
      title: `${onFill.length} project${onFill.length > 1 ? "s" : ""} built on filled-in former water`,
      body: `These permits sit on historical lagoon/marsh fill, ground prone to settlement and liquefaction in an earthquake, and to ponding in storms.`,
      severity: 0.7,
      findingIds: [...onFill.map((p) => p.id), ...fill.slice(0, 2).map((w) => w.id)],
    });
  }

  // 3. Corroboration: 311 flooding/sewer reports inside or near hazard areas.
  const corroborating = floodReports.filter((r) => floodZones.some((z) => pointIn(anchorOf(r.geometry), z)) || lowGround.some((l) => distanceM(anchorOf(r.geometry), anchorOf(l.geometry)) < 200));
  if (corroborating.length) {
    links.push({
      kind: "note",
      title: "Residents are already reporting flooding here",
      body: `${corroborating.length} recent 311 sewer/flooding report(s) fall inside mapped flood zones or on low ground: on-the-ground evidence backing the hazard maps.`,
      severity: 0.55,
      findingIds: corroborating.map((r) => r.id).concat(floodZones.slice(0, 2).map((z) => z.id)),
    });
  }

  // 4. Conflict: official map says minimal hazard, but other evidence says otherwise.
  const noZone = findings.find((f) => f.category === "flood" && f.props?.areaLevel);
  if (noZone && (floodReports.length >= 2 || lowGround.length >= 3)) {
    links.push({
      kind: "conflict",
      title: "FEMA map vs. ground truth disagree",
      body: `FEMA shows no special flood hazard here, yet ${floodReports.length} flooding/sewer reports and ${lowGround.length} low-elevation samples suggest real exposure. FEMA maps are regulatory and can lag; treat as elevated risk.`,
      severity: 0.65,
      findingIds: [noZone.id, ...floodReports.slice(0, 4).map((f) => f.id), ...lowGround.slice(0, 3).map((f) => f.id)],
    });
  }

  // 5. Critical facilities in hazard zones.
  const civicIn = civic.filter((c) => floodZones.some((z) => pointIn(anchorOf(c.geometry), z)));
  if (civicIn.length) {
    links.push({
      kind: "risk",
      title: `${civicIn.length} civic facilit${civicIn.length > 1 ? "ies" : "y"} in a flood zone`,
      body: civicIn.map((c) => c.claim).join("; "),
      severity: 0.75,
      findingIds: civicIn.map((c) => c.id).concat(floodZones.slice(0, 1).map((z) => z.id)),
    });
  }

  // 6. Opportunity: new housing → future customers near amenities.
  const units = permits.reduce((s, p) => s + Math.max(0, Number(p.props?.units ?? 0)), 0);
  if (units >= 20) {
    links.push({
      kind: "opportunity",
      title: `~${units} new housing units in the pipeline`,
      body: `Permitted residential projects in this area add roughly ${units} units, a growing customer base for local businesses.`,
      severity: 0.5,
      findingIds: permits.filter((p) => Number(p.props?.units) > 1).slice(0, 8).map((p) => p.id),
    });
  }

  // 7. Space: NASA EONET wildfires nearby × current air quality.
  const events = findings.filter((f) => f.category === "earth_event" && !f.props?.areaLevel);
  const fires = events.filter((f) => f.props?.eventCategory === "wildfires" && Number(f.props?.distanceKm) <= 150 && Number(f.props?.ageDays) <= 30);
  const aq = findings.find((f) => f.source_type === "air_quality");
  if (fires.length) {
    const near = fires.reduce((m, f) => (Number(f.props?.distanceKm) < Number(m.props?.distanceKm) ? f : m));
    links.push({
      kind: "note",
      title: `Satellite-tracked wildfire ${near.props?.distanceKm} km away this month`,
      body: `NASA EONET logged ${fires.length} wildfire${fires.length > 1 ? "s" : ""} within 150 km in the last 30 days (nearest: ${near.claim.split(" (")[0].replace(/^Wildfires: /, "")}, ${near.observed_at}).${aq ? ` Current air quality: US AQI ${aq.props?.us_aqi}${Number(aq.props?.us_aqi) > 100 ? ", likely smoke-affected" : ", no smoke impact showing yet"}.` : ""}`,
      severity: Math.min(0.75, 0.4 + 0.3 * (1 - Number(near.props?.distanceKm) / 150) + (near.props?.open ? 0.05 : 0)),
      findingIds: [...fires.slice(0, 4).map((f) => f.id), ...(aq ? [aq.id] : [])],
    });
  }

  // 8. Space: regional flood events on record × mapped flood zones here.
  const floodEvents = events.filter((f) => f.props?.eventCategory === "floods" || f.props?.eventCategory === "severeStorms");
  if (floodEvents.length && floodZones.length) {
    links.push({
      kind: "note",
      title: "Regional flood/storm activity on record, and this area has mapped flood zones",
      body: `NASA EONET tracked ${floodEvents.length} flood or severe-storm event${floodEvents.length > 1 ? "s" : ""} within ~150 km in the past year, and this area contains ${[...new Set(floodZones.map((z) => zoneName(z.props?.zone)))].join(" / ")} zones.`,
      severity: 0.45,
      findingIds: [...floodEvents.slice(0, 3).map((f) => f.id), ...floodZones.slice(0, 2).map((z) => z.id)],
    });
  }

  // 9. Space: how fresh is the overhead picture, and when is the next one?
  const lastImage = findings.find((f) => f.source_type === "sentinel2_stac" && f.props?.ageDays != null);
  const nextPass = findings.find((f) => f.category === "orbit" && f.props?.areaLevel && f.props?.nextPass);
  if (lastImage && nextPass) {
    links.push({
      kind: "note",
      title: `Newest clear satellite image is ${lastImage.props?.ageDays} days old; next pass in ${Math.round(Number(nextPass.props?.hoursUntil))}h`,
      body: `Last cloud-free Sentinel-2 view: ${String(lastImage.props?.acquired).slice(0, 10)} (${lastImage.props?.satellite}). Orbit propagation puts ${nextPass.props?.nextSatellite} over the area next, so fresh 10–30 m imagery is possible then, if skies are clear.`,
      severity: 0.3,
      findingIds: [lastImage.id, nextPass.id],
    });
  }

  // 10. Space: coastal scene × coastal flood zones (scene-level water share, so stated as context only).
  const scene = findings.find((f) => f.source_type === "sentinel2_scl");
  const coastal = floodZones.filter((z) => String(z.props?.zone).startsWith("V"));
  if (scene && Number(scene.props?.waterPct) >= 30 && coastal.length) {
    links.push({
      kind: "note",
      title: "Satellite scene confirms open water next to coastal flood zones",
      body: `${scene.props?.waterPct}% of the surrounding Sentinel-2 tile is open water, and the area includes FEMA coastal high-hazard (V) zones: exposure to bay/ocean surge, not just rainfall.`,
      severity: 0.35,
      findingIds: [scene.id, ...coastal.slice(0, 2).map((z) => z.id)],
    });
  }

  return links.sort((a, b) => b.severity - a.severity);
}

/** Permits worth a closer look by the terrain drone (re-dispatch targets). */
export function redispatchTargets(findings: Finding[]) {
  const floodZones = findings.filter((f) => f.category === "flood" && isPoly(f));
  return findings
    .filter((f) => f.category === "permit" && (f.severity ?? 0) >= 0.4)
    .map((p) => ({ p, inZone: floodZones.some((z) => pointIn(anchorOf(p.geometry), z)) }))
    .sort((a, b) => Number(b.inZone) - Number(a.inZone) || (b.p.severity ?? 0) - (a.p.severity ?? 0))
    .slice(0, 12)
    .map(({ p }) => {
      const [lng, lat] = anchorOf(p.geometry);
      return { id: p.id, lng, lat, label: p.claim.split(":")[0] };
    });
}
