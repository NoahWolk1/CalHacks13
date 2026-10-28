import { describe, expect, it } from "vitest";
import { buildGazetteer, placeFromMap, placeGuess } from "./locate";

const row = { lat: "37.8199", lon: "-122.4783", display_name: "Golden Gate Bridge, Presidio, San Francisco, California, USA", boundingbox: ["37.8100", "37.8300", "-122.4800", "-122.4700"] };
const guess = { name: "Golden Gate Bridge", query: "Golden Gate Bridge, San Francisco", confidence: "high" as const, clues: "Orange suspension bridge" };

describe("photo guesses on the map", () => {
  it("keeps the geocoder's box for an exact guess", () => {
    const g = placeGuess({ ...guess, precision: "exact" }, row)!;
    expect(g.center).toEqual([-122.4783, 37.8199]);
    expect(g.bbox).toEqual([-122.48, 37.81, -122.47, 37.83]);
    expect(g.detail).toBe("Presidio, San Francisco, California");
  });
  it("never zooms a city-level guess to street level", () => {
    const g = placeGuess({ ...guess, precision: "city" }, row)!;
    expect(g.bbox![2] - g.bbox![0]).toBeGreaterThanOrEqual(0.08);
  });
  it("drops a row without coordinates", () => {
    expect(placeGuess({ ...guess, precision: "exact" }, { ...row, lat: "x" })).toBeNull();
  });
});

describe("photo guesses inside a selected area", () => {
  const box: [number, number, number, number] = [-122.43, 37.75, -122.41, 37.77];
  const line = (name: string, coords: number[][]) => ({ type: "Feature" as const, properties: { name }, geometry: { type: "LineString" as const, coordinates: coords } });
  const poi = (name: string, at: number[]) => ({ type: "Feature" as const, properties: { name, subclass: "cafe" }, geometry: { type: "Point" as const, coordinates: at } });
  const gaz = buildGazetteer(
    [line("Valencia Street", [[-122.4215, 37.755], [-122.4215, 37.765]]), line("18th Street", [[-122.428, 37.7617], [-122.415, 37.7617]]), line("Far Road", [[-122.5, 37.7], [-122.49, 37.7]])],
    [poi("Tartine", [-122.4241, 37.7614]), poi("Outside", [-122.3, 37.76])], box);
  it("keeps only names inside the area", () => {
    expect([...gaz.streets.keys()].sort()).toEqual(["18th Street", "Valencia Street"]);
    expect(gaz.places.map((p) => p.name)).toEqual(["Tartine"]);
  });
  it("puts a named place at its map position", () => {
    expect(placeFromMap({ place: "tartine", streets: [] }, gaz)).toMatchObject({ center: [-122.4241, 37.7614], precision: "exact" });
  });
  it("puts two streets at their crossing", () => {
    const p = placeFromMap({ place: "", streets: ["Valencia Street", "18th Street"] }, gaz)!;
    expect(p.precision).toBe("exact");
    expect(Math.abs(p.center[1] - 37.7617)).toBeLessThan(0.001);
  });
  it("one street: the whole street, and unknown names: nothing", () => {
    expect(placeFromMap({ place: "", streets: ["Valencia Street"] }, gaz)?.precision).toBe("street");
    expect(placeFromMap({ place: "Nowhere", streets: ["Made Up St"] }, gaz)).toBeNull();
  });
});
