import { describe, expect, it } from "vitest";
import { coversBox, insightsProfile, needSimilarity, SIMILAR_NEED } from "./area";

const SF_MISSION: [number, number, number, number] = [-122.425, 37.755, -122.405, 37.77];
const YOSEMITE: [number, number, number, number] = [-119.7, 37.7, -119.5, 37.8];
const LAGOS: [number, number, number, number] = [3.38, 6.43, 3.42, 6.47];
const AUSTIN: [number, number, number, number] = [-97.76, 30.25, -97.72, 30.29];

describe("coversBox", () => {
  it("handles SF / California / US / Bay Area / city lists / global", () => {
    expect(coversBox("San Francisco", SF_MISSION)).toBe(true);
    expect(coversBox("San Francisco", YOSEMITE)).toBe(false);
    expect(coversBox("California", YOSEMITE)).toBe(true);
    expect(coversBox("California", LAGOS)).toBe(false);
    expect(coversBox("California", AUSTIN)).toBe(false);
    expect(coversBox("US", AUSTIN)).toBe(true);
    expect(coversBox("US", LAGOS)).toBe(false);
    expect(coversBox("SF Bay Area, LA, San Diego, NYC, Seattle, Chicago, Boston", SF_MISSION)).toBe(true);
    expect(coversBox("SF Bay Area, LA, San Diego, NYC, Seattle, Chicago, Boston", AUSTIN)).toBe(false);
    expect(coversBox("SF Bay Area (inundation); US coasts (tide gauge)", LAGOS)).toBe(false);
    expect(coversBox("Global", LAGOS)).toBe(true);
    expect(coversBox("US alerts, global air quality", LAGOS)).toBe(true);
    expect(coversBox("California public schools; global (OSM schools & childcare)", LAGOS)).toBe(true);
    expect(coversBox("", LAGOS)).toBe(true);
    expect(coversBox("Somewhere unknown", LAGOS)).toBe(true); // unknown never blocks
  });
});

describe("insightsProfile", () => {
  it("site-risk only for US urban areas", () => {
    expect(insightsProfile({ bbox: SF_MISSION }, true)).toBe("site-risk");
    expect(insightsProfile({ bbox: YOSEMITE }, false)).toBe("general");
    expect(insightsProfile({ bbox: LAGOS }, true)).toBe("general");
  });
});

describe("needSimilarity", () => {
  it("flags near-duplicate gap specs and not unrelated ones", () => {
    expect(needSimilarity("monsoon rainfall and waterlogging reports for Dharavi", "Monsoon waterlogging reports in Dharavi")).toBeGreaterThanOrEqual(SIMILAR_NEED);
    expect(needSimilarity("land cover classification from ESA WorldCover", "land cover map for the area")).toBeGreaterThanOrEqual(SIMILAR_NEED);
    expect(needSimilarity("land cover classification", "mining concessions registry")).toBeLessThan(SIMILAR_NEED);
    expect(needSimilarity("", "anything")).toBe(0);
  });
});
