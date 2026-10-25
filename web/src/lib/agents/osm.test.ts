import { describe, expect, it } from "vitest";
import type { Feature } from "geojson";
import { regionFromBox } from "@/lib/geo";
import { chooseZoom, clipToRegion, dedupe, matches, parseOsmInput, summarize, toItem, type OsmItem } from "./osm";

const pt = (lng: number, lat: number, props: Record<string, unknown>, id?: number): Feature =>
  ({ type: "Feature", id, geometry: { type: "Point", coordinates: [lng, lat] }, properties: props });
const square = (lng: number, lat: number, s: number, props: Record<string, unknown>, id?: number): Feature =>
  ({ type: "Feature", id, geometry: { type: "Polygon", coordinates: [[[lng, lat], [lng + s, lat], [lng + s, lat + s], [lng, lat + s], [lng, lat]]] }, properties: props });

const region = regionFromBox([0, 0], [1, 1]);

describe("chooseZoom", () => {
  it("reads POIs at z14 and samples a big area within the budget", () => {
    const p = chooseZoom("poi", [26.3, -6.13, 27.3, -4.61], [26.8, -5.37]);
    expect(p.z).toBe(14);
    expect(p.sampled).toBe(true);
    expect(p.tiles.length).toBeLessThanOrEqual(48);
  });
  it("reads a small area's POIs in full at z14", () => {
    const p = chooseZoom("poi", [-122.425, 37.755, -122.405, 37.77], [-122.415, 37.762]);
    expect(p).toMatchObject({ z: 14, sampled: false });
  });
  it("reads places at the highest zoom that fits instead of sampling", () => {
    const p = chooseZoom("place", [26.3, -6.13, 27.3, -4.61], [26.8, -5.37]);
    expect(p.z).toBe(11);
    expect(p.sampled).toBe(false);
    expect(p.tiles.length).toBeLessThanOrEqual(64);
    expect(chooseZoom("place", [4.8, 45.73, 4.9, 45.79], [4.85, 45.76]).z).toBe(11);
  });
});

describe("clip, items, dedupe", () => {
  it("clips points and polygons to the region", () => {
    expect(clipToRegion(region, pt(0.5, 0.5, {}).geometry)).toEqual([0.5, 0.5]);
    expect(clipToRegion(region, pt(1.5, 0.5, {}).geometry)).toBeNull();
    expect(clipToRegion(region, square(0.9, 0.9, 0.5, {}).geometry)).not.toBeNull();
    expect(clipToRegion(region, square(2, 2, 0.5, {}).geometry)).toBeNull();
  });
  it("dedupes by OSM id, else by name+class+rounded coords, and sums split polygon areas", () => {
    const items = [
      toItem(pt(0.5, 0.5, { class: "village", name: "Kala" }), "place"),
      toItem(pt(0.50001, 0.50001, { class: "village", name: "Kala" }), "place"),
      toItem(pt(0.2, 0.2, { class: "village", name: "Kala" }), "place"),
      toItem(square(0.1, 0.1, 0.01, { class: "school" }, 42), "landuse"),
      toItem(square(0.11, 0.1, 0.01, { class: "school" }, 42), "landuse"),
    ].filter(Boolean) as OsmItem[];
    const out = dedupe(items);
    expect(out.filter((i) => i.name === "Kala")).toHaveLength(2);
    const river = (x: number) => toItem({ type: "Feature", geometry: { type: "LineString", coordinates: [[x, 0.1], [x + 0.1, 0.2]] }, properties: { class: "river", name: "Lomami" } }, "waterway") as OsmItem;
    expect(dedupe([river(0.1), river(0.5)])).toHaveLength(1);
    const school = out.find((i) => i.class === "school")!;
    expect(school.areaM2).toBeCloseTo(items[3].areaM2! * 2, -2);
  });
  it("matches class against class or subclass, and name substrings", () => {
    const school = toItem(pt(0, 0, { class: "school", subclass: "kindergarten", name: "École Pasteur" }), "poi") as OsmItem;
    expect(matches(school, { class: ["kindergarten"] })).toBe(true);
    expect(matches(school, { class: ["hospital"] })).toBe(false);
    expect(matches(school, { nameContains: "pasteur" })).toBe(true);
  });
});

describe("summarize", () => {
  it("returns counts, named features first, and a lower-bound note at reduced zoom", () => {
    const raw = [
      pt(0.5, 0.5, { class: "village", name: "Kala" }, 1), pt(0.5, 0.5, { class: "village", name: "Kala" }, 1),
      pt(0.6, 0.6, { class: "village" }, 2), pt(0.7, 0.7, { class: "town", name: "Bena", rank: 5 }, 3), pt(3, 3, { class: "village", name: "Out" }, 4),
    ];
    const plan = { z: 10, tiles: [[0, 0]] as [number, number][], total: 1, sampled: false };
    const out = summarize(raw, "place", region, plan, parseOsmInput({ layer: "place", filter: { class: ["village"] } }));
    expect(out.total).toBe(2);
    expect(out.byClass).toEqual({ village: 2 });
    expect(out.layerClasses).toEqual({ village: 2, town: 1 });
    expect(out.features[0]).toMatchObject({ name: "Kala", lng: 0.5, lat: 0.5 });
    expect(out.note).toMatch(/lower bound/);
    expect(summarize(raw, "place", region, plan, { layer: "place", countOnly: true }).features).toEqual([]);
  });
  it("extrapolates an estimate when tiles were sampled", () => {
    const plan = { z: 14, tiles: [[0, 0], [1, 1]] as [number, number][], total: 20, sampled: true };
    const out = summarize([pt(0.5, 0.5, { class: "school", subclass: "school", name: "A" }, 9)], "poi", region, plan, { layer: "poi" });
    expect(out.estimatedTotal).toBe(10);
  });
});
