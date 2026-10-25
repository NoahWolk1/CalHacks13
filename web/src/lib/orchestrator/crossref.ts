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

  links.push(...cityDataLinks(findings));
  // Strongest first; one card per title; bounded so the insight list (and the LLM prompt) stays readable.
  const seen = new Set<string>();
  return links.sort((a, b) => b.severity - a.severity).filter((l) => !seen.has(l.title) && seen.add(l.title)).slice(0, MAX_LINKS);
}

export const MAX_LINKS = 12;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Short label: the place's own name when the agent gives one, else the claim up to its first ":" or "(". */
const first = (f: Finding) => {
  // Business and crime-hotspot pins carry raw registry casing in props; their claims are title-cased.
  if (f.category === "business") return f.claim.split(": ")[1]?.split(" (")[0] ?? f.claim;
  if (f.props?.hotspot) return f.claim.replace(/^Crime hotspot: /, "").split(",")[0];
  return String(f.props?.name ?? f.props?.title ?? f.claim.split(/[:(]/)[0]).trim();
};
const more = (n: number, shown: number) => (n > shown ? ` and ${n - shown} more` : "");
const names = (fs: Finding[], n = 3) => `${fs.slice(0, n).map(first).join("; ")}${fs.length > n ? "…" : ""}`;
const uniq = (ids: string[]) => [...new Set(ids)];
/** 81 → "81st", 82 → "82nd", 13 → "13th". */
const ordinal = (n: number) => `${n}${[11, 12, 13].includes(n % 100) ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** Joins between the DataSF city-data and hazard/context agents (each rule pairs two different agents). */
function cityDataLinks(findings: Finding[]): Link[] {
  const links: Link[] = [];
  // pointOnFeature is costly for polygons; every rule below reuses one anchor per finding.
  const anchors = new Map<string, [number, number]>();
  const at = (f: Finding) => anchors.get(f.id) ?? anchors.set(f.id, anchorOf(f.geometry)).get(f.id)!;
  const inAny = (f: Finding, zones: Finding[]) => zones.find((z) => pointIn(at(f), z));
  const near = (f: Finding, others: Finding[], m: number) => others.filter((o) => distanceM(at(f), at(o)) <= m);
  const pins = (cat: string, ok: (f: Finding) => boolean = () => true) => findings.filter((f) => f.category === cat && !f.props?.areaLevel && ok(f));
  const summary = (cat: string, ok: (f: Finding) => boolean = () => true) => findings.find((f) => f.category === cat && f.props?.areaLevel && ok(f));
  const num = (f: Finding | undefined, k: string) => Number(f?.props?.[k] ?? 0);

  const permits = pins("permit");
  const liquefaction = findings.filter((f) => f.category === "liquefaction" && isPoly(f));
  const tsunami = findings.filter((f) => f.category === "tsunami" && isPoly(f));
  const slr = findings.filter((f) => f.category === "slr" && isPoly(f) && Number(f.props?.scenarioCm) <= 75);
  const fireZones = findings.filter((f) => f.category === "wildfire" && isPoly(f) && f.props?.inside);
  const sfha = findings.filter((f) => f.category === "flood" && isPoly(f) && SFHA.has(String(f.props?.zone)));
  const schools = pins("school");
  // For zone joins: state-listed K-12 schools and childcare, not every OSM "school" tag (arts centres, foundations).
  const k12 = schools.filter((s) => !s.props?.offRegion && (s.source_type === "cde_schools" || !!s.props?.childcare));
  const tracts = findings.filter((f) => f.category === "env_burden" && isPoly(f));

  // A. Investment × CGS liquefaction zone.
  const onLiq = permits.filter((p) => inAny(p, liquefaction));
  if (onLiq.length) {
    const units = onLiq.reduce((s, p) => s + Math.max(0, num(p, "units")), 0);
    links.push({
      kind: "risk",
      title: `${plural(onLiq.length, "permitted project")} in a state liquefaction zone`,
      body: `${names(onLiq)} sit inside a California Geological Survey liquefaction hazard zone${units ? ` (${units} units)` : ""}, where state law requires a site-specific geotechnical report and foundations designed for ground failure in a large quake.`,
      severity: Math.min(0.9, 0.7 + onLiq.length * 0.05),
      findingIds: uniq([...onLiq.slice(0, 8).map((p) => p.id), ...liquefaction.slice(0, 1).map((z) => z.id)]),
    });
  }

  // B. Investment × sea-level rise (≤2.5 ft scenario), flagging the ones that are also on liquefiable fill.
  // Each project belongs to its lowest intersecting scenario, regardless of finding order.
  const byScenario = [...slr].sort((a, b) => Number(a.props?.scenarioCm) - Number(b.props?.scenarioCm));
  const exposed = permits.map((p) => ({ p, z: inAny(p, byScenario) })).filter((x) => x.z);
  for (const lowest of [...new Set(exposed.map((x) => Number(x.z!.props?.scenarioFt)))].sort((a, b) => a - b)) {
    const inSlr = exposed.filter((x) => Number(x.z!.props?.scenarioFt) === lowest);
    const both = inSlr.filter((x) => onLiq.includes(x.p)).length;
    links.push({
      kind: "risk",
      title: `${plural(inSlr.length, "permitted project")} ${inSlr.length === 1 ? "floods" : "flood"} with ${lowest} ft of sea-level rise`,
      body: `${names(inSlr.map((x) => x.p))} ${inSlr.length === 1 ? "falls" : "fall"} inside the Bay sea-level-rise inundation extent at ${lowest} ft, a level state guidance expects around 2050–2070${both ? `; ${both} of them ${both === 1 ? "is" : "are"} also in a liquefaction zone (Bay fill carries both risks)` : ""}.`,
      severity: Math.min(0.9, 0.65 + inSlr.length * 0.04 + (both ? 0.05 : 0)),
      findingIds: uniq([...inSlr.slice(0, 8).map((x) => x.p.id), ...inSlr.slice(0, 2).map((x) => x.z!.id)]),
    });
  }

  // C. Sensitive sites × hazard zones (schools and childcare from the schools agent, zones from the hazard agents).
  const zoneSets: [string, Finding[]][] = [["liquefaction", liquefaction], ["tsunami evacuation", tsunami], ["sea-level-rise", slr], ["wildfire hazard", fireZones], ["100-year flood", sfha]];
  const schoolHits = k12.map((s) => ({ s, hz: zoneSets.filter(([, zs]) => inAny(s, zs)).map(([n]) => n) })).filter((x) => x.hz.length);
  if (schoolHits.length) {
    const kinds = uniq(schoolHits.flatMap((x) => x.hz));
    const pupils = schoolHits.reduce((t, x) => t + num(x.s, "enrollment"), 0);
    links.push({
      kind: "risk",
      title: schoolHits.length === 1 ? `${schoolHits[0].s.props?.name ?? "A school"} sits in a ${kinds.join(" + ")} zone` : `${schoolHits.length} schools/childcare sites sit in ${kinds.join(", ")} zones`,
      body: `${schoolHits.slice(0, 4).map((x) => `${first(x.s)} (${x.hz.join(", ")})`).join("; ")}${more(schoolHits.length, 4)}${pupils ? `, about ${pupils.toLocaleString()} enrolled students` : ""}. Children are a priority population for evacuation and shelter planning.`,
      severity: Math.min(0.85, 0.6 + schoolHits.length * 0.04 + (kinds.length > 1 ? 0.05 : 0)),
      findingIds: uniq([...schoolHits.slice(0, 6).map((x) => x.s.id), ...zoneSets.flatMap(([n, zs]) => (kinds.includes(n) ? zs.slice(0, 1).map((z) => z.id) : []))]),
    });
  }

  // D. Severe/fatal crashes near schools (school-zone traffic safety).
  const badCrashes = pins("crash", (f) => /fatal|severe/i.test(String(f.props?.severity ?? "")));
  const crashSchool = badCrashes.map((c) => ({ c, s: near(c, schools, 150) })).filter((x) => x.s.length);
  if (crashSchool.length) {
    const fatal = crashSchool.filter((x) => /fatal/i.test(String(x.c.props?.severity))).length;
    const walkers = crashSchool.filter((x) => /pedestrian|bicycle/i.test(String(x.c.props?.mode ?? ""))).length;
    const sites = uniq(crashSchool.flatMap((x) => x.s.map((s) => String(s.props?.name ?? first(s)))));
    links.push({
      kind: "risk",
      title: `${plural(crashSchool.length, "severe or fatal crash", "severe or fatal crashes")} within 150 m of a school`,
      body: `${fatal ? `${fatal} fatal, ` : ""}${walkers ? `${walkers} involving a pedestrian or cyclist, ` : ""}near ${sites.slice(0, 3).join(", ")}${sites.length > 3 ? ` and ${sites.length - 3} more` : ""} (SF injury-crash data, last 2 years).`,
      severity: Math.min(0.85, 0.55 + crashSchool.length * 0.04 + (fatal ? 0.1 : 0)),
      findingIds: uniq([...crashSchool.slice(0, 6).flatMap((x) => [x.c.id, x.s[0].id])]),
    });
  }

  // E. No-fault evictions × entire-home short-term rentals.
  const ev = summary("eviction", (f) => num(f, "total") > 0);
  const str = summary("str", (f) => num(f, "listings") > 0);
  const nfPins = pins("eviction", (f) => !!f.props?.noFault);
  const listings = pins("str", (f) => f.props?.roomType === "Entire home/apt");
  const evNearStr = nfPins.filter((e) => near(e, listings, 75).length);
  if (ev && str && num(ev, "noFault") >= 5 && num(str, "entireHomeShare") >= 0.5) {
    links.push({
      kind: "conflict",
      title: "No-fault evictions alongside entire-home Airbnbs",
      body: `${num(ev, "noFault")} no-fault eviction notices (${num(ev, "ellis")} Ellis Act, ${num(ev, "ownerMoveIn")} owner move-in) in 3 years, while ${Math.round(num(str, "entireHomeShare") * 100)}% of the ${num(str, "listings")} Airbnb listings here are entire homes${evNearStr.length ? `; ${evNearStr.length} eviction notice${evNearStr.length > 1 ? "s are" : " is"} within 75 m of one` : ""}. Correlation, not proof that units were converted.`,
      severity: Math.min(0.8, 0.5 + num(ev, "noFault") / 100 + num(str, "multiListingHostShare") * 0.2),
      findingIds: uniq([ev.id, str.id, ...evNearStr.slice(0, 4).map((e) => e.id)]),
    });
  }

  // F. Displacement pressure: no-fault evictions × recent sale prices far above the assessed roll.
  const sales = summary("property", (f) => !!f.props?.salesProxy);
  const roll = summary("property", (f) => num(f, "medianAssessedPerSqft") > 0);
  const premium = sales && roll ? num(sales, "medianSalePerSqft") / num(roll, "medianAssessedPerSqft") : 0;
  if (ev && num(ev, "noFault") >= 10 && premium >= 1.5) {
    links.push({
      kind: "conflict",
      title: "Displacement pressure: no-fault evictions where sale prices outrun the tax roll",
      body: `Homes that sold recently go for a median $${num(sales, "medianSalePerSqft")}/sq ft, ${premium.toFixed(1)}× the area's median assessed $${num(roll, "medianAssessedPerSqft")}/sq ft (long-held Prop 13 parcels), and ${num(ev, "noFault")} no-fault evictions were filed here in 3 years.`,
      severity: Math.min(0.8, 0.55 + (premium - 1.5) * 0.1 + num(ev, "noFault") / 200),
      findingIds: [ev.id, sales!.id, roll!.id],
    });
  }

  // G. New storefronts × crime hotspots within a block.
  const opened = pins("business", (f) => f.props?.event === "opened");
  const hotspots = pins("crime", (f) => !!f.props?.hotspot);
  const openNearHot = opened.map((b) => ({ b, h: near(b, hotspots, 75) })).filter((x) => x.h.length);
  if (openNearHot.length) {
    const spots = uniq(openNearHot.flatMap((x) => x.h.map(first)));
    links.push({
      kind: "risk",
      title: `${plural(openNearHot.length, "new storefront")} within a block of a crime hotspot`,
      body: `${names(openNearHot.map((x) => x.b))} opened within 75 m of ${spots.slice(0, 2).join(" and ")}${spots.length > 2 ? ` (+${spots.length - 2})` : ""}, among the area's busiest SFPD incident intersections over the last 90 days.`,
      severity: Math.min(0.8, 0.55 + openNearHot.length * 0.05),
      findingIds: uniq(openNearHot.slice(0, 6).flatMap((x) => [x.b.id, x.h[0].id])),
    });
  }

  // H. Storefront momentum × transit access.
  const shop = summary("business", (f) => !!f.props?.storefront);
  const transit = summary("transit", (f) => f.props?.transitScore != null);
  const bart = pins("transit", (f) => !!f.props?.bart && num(f, "distanceM") <= 400)[0];
  if (shop && transit && (num(transit, "transitScore") >= 0.5 || bart)) {
    const net = num(shop, "net");
    const lines = Array.isArray(transit.props?.lines) ? (transit.props!.lines as unknown[]).length : 0;
    const access = `${lines} Muni line${lines === 1 ? "" : "s"}${bart ? `, ${bart.props?.station} BART ${num(bart, "distanceM") ? `${num(bart, "distanceM")} m away` : "inside the area"}` : ""}`;
    if (net > 0) {
      links.push({
        kind: "opportunity",
        title: `Growing storefront corridor with strong transit (+${net} in 12 months)`,
        body: `${num(shop, "opened")} storefronts opened vs. ${num(shop, "closed")} closed in the last year, served by ${access}: demand and foot-traffic access line up.`,
        severity: Math.min(0.75, 0.5 + net / 100 + num(transit, "transitScore") * 0.1),
        findingIds: uniq([shop.id, transit.id, ...(bart ? [bart.id] : [])]),
      });
    } else if (net < 0) {
      links.push({
        kind: "conflict",
        title: `Storefronts closing despite strong transit (${net} net in 12 months)`,
        body: `${num(shop, "closed")} storefronts closed vs. ${num(shop, "opened")} opened even with ${access}: access isn't the constraint here; look at rents, street conditions or competition.`,
        severity: Math.min(0.7, 0.5 + -net / 100),
        findingIds: uniq([shop.id, transit.id, ...(bart ? [bart.id] : [])]),
      });
    }
  }

  // I. Active street digs in front of new storefronts.
  const digs = pins("street_work", (f) => !!f.props?.active && !f.props?.moratorium);
  const dug = opened.map((b) => ({ b, d: near(b, digs, 40) })).filter((x) => x.d.length);
  if (dug.length) {
    const ends = dug.flatMap((x) => x.d.map((d) => String(d.props?.end ?? ""))).filter(Boolean).sort();
    links.push({
      kind: "risk",
      title: `${plural(dug.length, "new storefront")} with active street work out front`,
      body: `${names(dug.map((x) => x.b))} opened within 40 m of active street-use permits (${uniq(dug.flatMap((x) => x.d.map((d) => String(d.props?.contractor ?? d.props?.type ?? "work")))).slice(0, 2).join(", ")})${ends.length ? `, running until ${ends[ends.length - 1]}` : ""}: blocked sidewalks and noise during their first months.`,
      severity: Math.min(0.6, 0.4 + dug.length * 0.05),
      findingIds: uniq(dug.slice(0, 6).flatMap((x) => [x.b.id, x.d[0].id])),
    });
  }

  // J. New housing × environmental burden (CalEnviroScreen tract polygons).
  const burdened = tracts.filter((t) => num(t, "ciPercentile") >= 75);
  const homesIn = permits.filter((p) => num(p, "units") > 0).map((p) => ({ p, t: inAny(p, burdened) })).filter((x) => x.t);
  if (homesIn.length) {
    const units = homesIn.reduce((s, x) => s + num(x.p, "units"), 0);
    const worst = homesIn.reduce((m, x) => (num(x.t, "ciPercentile") > num(m.t, "ciPercentile") ? x : m));
    links.push({
      kind: "risk",
      title: `${units} new homes planned in top-quartile pollution-burden tracts`,
      body: `${plural(homesIn.length, "permitted residential project")} sit in CalEnviroScreen tracts at the ${ordinal(num(worst.t, "ciPercentile"))} percentile statewide (diesel ${ordinal(num(worst.t, "dieselP"))}, asthma ${ordinal(num(worst.t, "asthmaP"))}): new residents move into a disadvantaged-community burden.`,
      severity: Math.min(0.75, 0.5 + homesIn.length * 0.03 + (num(worst.t, "ciPercentile") - 75) / 100),
      findingIds: uniq([...homesIn.slice(0, 6).map((x) => x.p.id), worst.t!.id]),
    });
  }

  // K. Schools × diesel / pollution burden.
  const dirty = tracts.filter((t) => num(t, "dieselP") >= 90 || num(t, "ciPercentile") >= 75);
  const schoolsDirty = k12.map((s) => ({ s, t: inAny(s, dirty) })).filter((x) => x.t);
  if (schoolsDirty.length) {
    const maxDiesel = Math.max(...schoolsDirty.map((x) => num(x.t, "dieselP")));
    links.push({
      kind: "risk",
      title: `${plural(schoolsDirty.length, "school")} in tracts with ${maxDiesel >= 90 ? "top-10% diesel exposure" : "top-quartile pollution burden"}`,
      body: `${schoolsDirty.slice(0, 4).map((x) => first(x.s)).join("; ")}${more(schoolsDirty.length, 4)} sit in CalEnviroScreen tracts up to the ${ordinal(maxDiesel)} diesel-PM percentile: children are the most exposed group.`,
      severity: Math.min(0.75, 0.5 + schoolsDirty.length * 0.03),
      findingIds: uniq([...schoolsDirty.slice(0, 6).map((x) => x.s.id), ...uniq(schoolsDirty.map((x) => x.t!.id)).slice(0, 2)]),
    });
  }

  // L. Historic landmarks on liquefiable ground or in the sea-level-rise extent.
  const historic = pins("landmark", (f) => !!f.props?.historic);
  const lmZones: [string, Finding[]][] = [["liquefaction", liquefaction], ["sea-level-rise", slr], ["tsunami", tsunami]];
  const lmHits = historic.map((l) => {
    const zs = lmZones.map(([n, z]) => [n, inAny(l, z)] as const).filter(([, z]) => z);
    return { l, hz: zs.map(([n]) => n), zones: zs.map(([, z]) => z!.id) };
  }).filter((x) => x.hz.length);
  if (lmHits.length) {
    links.push({
      kind: "note",
      title: lmHits.length === 1 ? `Historic ${lmHits[0].l.props?.title ?? first(lmHits[0].l)} sits in a ${lmHits[0].hz.join(" + ")} zone` : `${lmHits.length} historic landmarks sit in mapped hazard zones`,
      body: `${lmHits.slice(0, 4).map((x) => `${first(x.l)} (${x.hz.join(", ")})`).join("; ")}${more(lmHits.length, 4)}: older structures are the hardest to retrofit or relocate.`,
      severity: Math.min(0.55, 0.4 + lmHits.length * 0.03),
      findingIds: uniq([...lmHits.slice(0, 5).map((x) => x.l.id), ...lmHits.flatMap((x) => x.zones).slice(0, 2)]),
    });
  }

  return links;
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
