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

  it("caps the number of links and keeps the most severe", () => {
    const zone = box("cgs-ground-hazards", "liquefaction", -122.40, 37.77);
    const permits = Array.from({ length: 6 }, (_, i) => pt("sf-permits", "permit", -122.40, 37.77, { units: 30 }, `${i} A St: new`));
    const links = crossReference([zone, ...permits]);
    expect(links.length).toBeLessThanOrEqual(MAX_LINKS);
    expect(links[0].severity).toBeGreaterThanOrEqual(links[links.length - 1].severity);
  });
});
