import { describe, expect, it } from "vitest";
import type { Finding } from "@/lib/types";
import { crossReference, MAX_LINKS } from "./crossref";

let n = 0;
const base = { source_url: "https://example.org", source_type: "test", confidence: 0.9 };
const pt = (worker_id: string, category: string, lng: number, lat: number, props: Record<string, unknown> = {}, claim = `${category} pin`): Finding =>
  ({ ...base, id: `F${++n}`, worker_id, category, claim, geometry: { type: "Point", coordinates: [lng, lat] }, props });
const area = (worker_id: string, category: string, props: Record<string, unknown>): Finding =>
  ({ ...base, id: `F${++n}`, worker_id, category, claim: `${category} summary`, geometry: { type: "Point", coordinates: [-122.41, 37.76] }, props: { areaLevel: true, ...props } });
// A ~110 m square around (lng, lat).
const box = (worker_id: string, category: string, lng: number, lat: number, props: Record<string, unknown> = {}): Finding => {
  const d = 0.0005;
  return {
    ...base, id: `F${++n}`, worker_id, category, claim: `${category} zone`, props,
    geometry: { type: "Polygon", coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]] },
  };
};
const titles = (fs: Finding[]) => crossReference(fs).map((l) => l.title);

describe("crossReference: city-data and hazard joins", () => {
  it("flags permits inside a CGS liquefaction zone, citing both agents", () => {
    const zone = box("cgs-ground-hazards", "liquefaction", -122.40, 37.77, { hazard: "liquefaction" });
    const inside = pt("sf-permits", "permit", -122.40, 37.77, { units: 40 }, "100 Main St: new construction");
    const outside = pt("sf-permits", "permit", -122.39, 37.78, { units: 5 }, "9 Far St: addition");
    const links = crossReference([zone, inside, outside]);
    const l = links.find((x) => x.title.includes("liquefaction zone"));
    expect(l?.title).toBe("1 permitted project in a state liquefaction zone");
    expect(l?.body).toContain("100 Main St");
    expect(l?.body).toContain("40 units");
    expect(l?.findingIds).toEqual([inside.id, zone.id]);
  });

  it("names a school inside hazard zones and lists every zone it falls in", () => {
    const liq = box("cgs-ground-hazards", "liquefaction", -122.40, 37.77);
    const slr = box("sea-level-rise", "slr", -122.40, 37.77, { scenarioCm: 75, scenarioFt: 2.5 });
    const slrHigh = box("sea-level-rise", "slr", -122.40, 37.77, { scenarioCm: 150, scenarioFt: 4.9 }); // beyond the 2.5 ft cut-off
    const school = { ...pt("ca-schools", "school", -122.40, 37.77, { name: "Bayview Elementary", enrollment: 320, sensitiveSite: true }), source_type: "cde_schools" };
    const osmTag = pt("ca-schools", "school", -122.40, 37.77, { name: "Arts Foundation", kind: "school", sensitiveSite: true }); // OSM tag, not K-12
    const offRegion = pt("ca-schools", "school", -122.40, 37.77, { name: "Next Door High", offRegion: true });
    const l = crossReference([liq, slr, slrHigh, school, osmTag, offRegion]).find((x) => x.findingIds.includes(school.id));
    expect(l?.title).toBe("Bayview Elementary sits in a liquefaction + sea-level-rise zone");
    expect(l?.body).toContain("320 enrolled students");
    expect(l?.findingIds).not.toContain(offRegion.id);
    expect(l?.findingIds).not.toContain(osmTag.id);
    expect(l?.findingIds).not.toContain(slrHigh.id);
  });

  it("joins new storefronts to crime hotspots within a block, not farther", () => {
    const hot = pt("sf-crime", "crime", -122.4190, 37.7650, { hotspot: true, intersection: "16TH ST \\ MISSION ST", incidents90d: 60 }, "Crime hotspot: 16th St & Mission St, 60 violent/property incidents in 90 days");
    const near = pt("sf-business", "business", -122.4192, 37.7652, { event: "opened", name: "RITUAL COFFEE" }, "Opened Sep 2026: Ritual Coffee (Food Services), 1026 Valencia St"); // ~30 m
    const far = pt("sf-business", "business", -122.4150, 37.7680, { event: "opened", name: "Far Bakery" }); // ~450 m
    const closed = pt("sf-business", "business", -122.4190, 37.7651, { event: "closed", name: "Gone Shop" });
    const l = crossReference([hot, near, far, closed]).find((x) => x.title.includes("crime hotspot"));
    expect(l?.title).toBe("1 new storefront within a block of a crime hotspot");
    expect(l?.body).toContain("Ritual Coffee");
    expect(l?.body).toContain("16th St & Mission St");
    expect(l?.findingIds.sort()).toEqual([hot.id, near.id].sort());
  });

  it("reads storefront growth × transit as an opportunity and closures × transit as a conflict", () => {
    const transit = area("sf-transit", "transit", { transitScore: 0.8, lines: ["14", "49", "J"] });
    const growing = area("sf-business", "business", { storefront: true, opened: 30, closed: 18, net: 12 });
    const up = crossReference([transit, growing]).find((x) => x.title.includes("transit"));
    expect(up?.kind).toBe("opportunity");
    expect(up?.title).toBe("Growing storefront corridor with strong transit (+12 in 12 months)");
    expect(up?.body).toContain("3 Muni lines");

    const shrinking = area("sf-business", "business", { storefront: true, opened: 5, closed: 15, net: -10 });
    expect(crossReference([transit, shrinking]).find((x) => x.title.includes("transit"))?.kind).toBe("conflict");
    // Weak transit and no BART: no link either way.
    expect(titles([area("sf-transit", "transit", { transitScore: 0.2, lines: [] }), growing]).some((t) => t.includes("transit"))).toBe(false);
  });

  it("flags permits in the ≤2.5 ft sea-level-rise extent and counts those also on liquefiable fill", () => {
    const slr = box("sea-level-rise", "slr", -122.40, 37.77, { scenarioCm: 75, scenarioFt: 2.5 });
    const liq = box("cgs-ground-hazards", "liquefaction", -122.40, 37.77);
    const permit = pt("sf-permits", "permit", -122.40, 37.77, {}, "1 Bay St: new construction");
    const l = crossReference([slr, liq, permit]).find((x) => x.title.includes("sea-level rise"));
    expect(l?.title).toBe("1 permitted project floods with 2.5 ft of sea-level rise");
    expect(l?.body).toContain("1 of them is also in a liquefaction zone");
    expect(l?.findingIds).toEqual([permit.id, slr.id]);
    // Higher scenarios are out of scope.
    expect(titles([box("sea-level-rise", "slr", -122.40, 37.77, { scenarioCm: 150, scenarioFt: 4.9 }), permit]).some((t) => t.includes("sea-level rise"))).toBe(false);
  });

  it.each([false, true])("groups permits by their lowest flood scenario regardless of zone order (reversed=%s)", (reverse) => {
    const low = box("sea-level-rise", "slr", -122.40, 37.77, { scenarioCm: 50, scenarioFt: 1.6 });
    const overlappingHigh = box("sea-level-rise", "slr", -122.40, 37.77, { scenarioCm: 75, scenarioFt: 2.5 });
    const high = box("sea-level-rise", "slr", -122.39, 37.78, { scenarioCm: 75, scenarioFt: 2.5 });
    const early = pt("sf-permits", "permit", -122.40, 37.77, {}, "1 Early St: new construction");
    const later = pt("sf-permits", "permit", -122.39, 37.78, {}, "2 Later St: new construction");
    const zones = [low, overlappingHigh, high];
    const links = crossReference([...(reverse ? zones.reverse() : zones), early, later]).filter((l) => l.title.includes("sea-level rise"));
    expect(links).toHaveLength(2);
    const first = links.find((l) => l.title.includes("1.6 ft"));
    const second = links.find((l) => l.title.includes("2.5 ft"));
    expect(first?.title).toBe("1 permitted project floods with 1.6 ft of sea-level rise");
    expect(first?.findingIds).toEqual([early.id, low.id]);
    expect(first?.body).not.toContain("Later St");
    expect(second?.findingIds).toEqual([later.id, high.id]);
    expect(second?.body).not.toContain("Early St");
  });

  it("joins severe/fatal crashes to schools within 150 m, ignoring minor crashes", () => {
    const school = pt("ca-schools", "school", -122.4100, 37.7600, { name: "Mission High" });
    const crash = pt("sf-crashes", "crash", -122.4102, 37.7602, { severity: "Fatal", mode: "Pedestrian" }); // ~30 m
    const l = crossReference([school, crash]).find((x) => x.title.includes("of a school"));
    expect(l?.title).toBe("1 severe or fatal crash within 150 m of a school");
    expect(l?.body).toContain("1 fatal, 1 involving a pedestrian or cyclist, near Mission High");
    expect(l?.findingIds).toEqual([crash.id, school.id]);
    const minor = pt("sf-crashes", "crash", -122.4102, 37.7602, { severity: "Complaint of pain" });
    expect(titles([school, minor]).some((t) => t.includes("of a school"))).toBe(false);
  });

  it("pairs no-fault evictions with an entire-home Airbnb market, only above the thresholds", () => {
    const ev = area("sf-evictions", "eviction", { total: 20, noFault: 8, ellis: 3, ownerMoveIn: 2 });
    const str = area("sf-str", "str", { listings: 50, entireHomeShare: 0.6 });
    const notice = pt("sf-evictions", "eviction", -122.4100, 37.7600, { noFault: true });
    const listing = pt("sf-str", "str", -122.4101, 37.7601, { roomType: "Entire home/apt" }); // ~15 m
    const l = crossReference([ev, str, notice, listing]).find((x) => x.title.includes("Airbnbs"));
    expect(l?.kind).toBe("conflict");
    expect(l?.body).toContain("60% of the 50 Airbnb listings");
    expect(l?.body).toContain("1 eviction notice is within 75 m of one");
    expect(l?.findingIds).toEqual([ev.id, str.id, notice.id]);
    expect(titles([ev, area("sf-str", "str", { listings: 50, entireHomeShare: 0.3 })]).some((t) => t.includes("Airbnbs"))).toBe(false);
  });

  it("flags displacement pressure when sale prices outrun the assessed roll", () => {
    const ev = area("sf-evictions", "eviction", { total: 30, noFault: 12 });
    const sales = area("sf-property", "property", { salesProxy: true, medianSalePerSqft: 1200 });
    const roll = area("sf-property", "property", { medianAssessedPerSqft: 400 });
    const l = crossReference([ev, sales, roll]).find((x) => x.title.startsWith("Displacement pressure"));
    expect(l?.body).toContain("3.0×");
    expect(l?.findingIds).toEqual([ev.id, sales.id, roll.id]);
    const cheap = area("sf-property", "property", { salesProxy: true, medianSalePerSqft: 480 }); // 1.2×
    expect(titles([ev, cheap, roll]).some((t) => t.startsWith("Displacement pressure"))).toBe(false);
  });

  it("flags active street digs in front of new storefronts, skipping moratorium blocks", () => {
    const shop = pt("sf-business", "business", -122.4100, 37.7600, { event: "opened" }, "Opened Sep 2026: Tartine (Food Services), 600 Guerrero St");
    const dig = pt("sf-street-work", "street_work", -122.4101, 37.7601, { active: true, contractor: "PG&E", end: "2026-12-01" }); // ~15 m
    const l = crossReference([shop, dig]).find((x) => x.title.includes("street work"));
    expect(l?.title).toBe("1 new storefront with active street work out front");
    expect(l?.body).toContain("Tartine");
    expect(l?.body).toContain("(PG&E), running until 2026-12-01");
    expect(l?.findingIds).toEqual([shop.id, dig.id]);
    const moratorium = pt("sf-street-work", "street_work", -122.4101, 37.7601, { active: true, moratorium: true });
    expect(titles([shop, moratorium]).some((t) => t.includes("street work"))).toBe(false);
  });

  it("counts new homes in top-quartile CalEnviroScreen tracts only", () => {
    const tract = box("calenviroscreen", "env_burden", -122.40, 37.77, { ciPercentile: 82, dieselP: 70, asthmaP: 88 });
    const homes = pt("sf-permits", "permit", -122.40, 37.77, { units: 12 });
    const l = crossReference([tract, homes]).find((x) => x.title.includes("pollution-burden"));
    expect(l?.title).toBe("12 new homes planned in top-quartile pollution-burden tracts");
    expect(l?.body).toContain("82nd percentile");
    expect(l?.findingIds).toEqual([homes.id, tract.id]);
    expect(titles([box("calenviroscreen", "env_burden", -122.40, 37.77, { ciPercentile: 60 }), homes]).some((t) => t.includes("pollution-burden"))).toBe(false);
  });

  it("flags K-12 schools in top-10% diesel tracts, not OSM-tagged sites", () => {
    const tract = box("calenviroscreen", "env_burden", -122.40, 37.77, { ciPercentile: 50, dieselP: 95 });
    const school = { ...pt("ca-schools", "school", -122.40, 37.77, { name: "Bessie Carmichael" }), source_type: "cde_schools" };
    const l = crossReference([tract, school]).find((x) => x.title.includes("diesel"));
    expect(l?.title).toBe("1 school in tracts with top-10% diesel exposure");
    expect(l?.findingIds).toEqual([school.id, tract.id]);
    const osmTag = pt("ca-schools", "school", -122.40, 37.77, { name: "Arts Foundation" });
    expect(titles([tract, osmTag]).some((t) => t.includes("diesel"))).toBe(false);
  });

  it("names a historic landmark in each hazard zone it falls in", () => {
    const liq = box("cgs-ground-hazards", "liquefaction", -122.40, 37.77);
    const tsu = box("cgs-ground-hazards", "tsunami", -122.40, 37.77);
    const lm = pt("sf-landmarks", "landmark", -122.40, 37.77, { historic: true, title: "Ferry Building" });
    const l = crossReference([liq, tsu, lm]).find((x) => x.findingIds.includes(lm.id));
    expect(l?.title).toBe("Historic Ferry Building sits in a liquefaction + tsunami zone");
    expect(l?.findingIds).toEqual([lm.id, liq.id, tsu.id]);
    const plain = pt("sf-landmarks", "landmark", -122.40, 37.77, { title: "Some Shed" });
    expect(titles([liq, plain]).some((t) => t.includes("Some Shed"))).toBe(false);
  });

  it("caps the number of links and keeps the most severe", () => {
    const zone = box("cgs-ground-hazards", "liquefaction", -122.40, 37.77);
    const permits = Array.from({ length: 6 }, (_, i) => pt("sf-permits", "permit", -122.40, 37.77, { units: 30 }, `${i} A St: new`));
    const links = crossReference([zone, ...permits]);
    expect(links.length).toBeLessThanOrEqual(MAX_LINKS);
    expect(links[0].severity).toBeGreaterThanOrEqual(links[links.length - 1].severity);
  });
});
