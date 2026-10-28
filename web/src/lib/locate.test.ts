import { describe, expect, it } from "vitest";
import { placeGuess } from "./locate";

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
