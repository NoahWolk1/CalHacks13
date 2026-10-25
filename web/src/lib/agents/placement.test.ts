import { describe, expect, it, vi } from "vitest";
import { regionFromBox } from "@/lib/geo";
import { placeFinding } from "./placement";

// A ~1 km box in the Mission, SF.
const region = regionFromBox([-122.425, 37.755], [-122.413, 37.765]);
const base = { claim: "Café X scored 92", source_url: "https://data.sfgov.org/x", source_type: "health_inspection", confidence: 0.8 };
const noGeocode = vi.fn(async () => null);

describe("placeFinding", () => {
  it("uses coordinates the agent supplied when they fall in the region", async () => {
    const f = await placeFinding(region, { ...base, lng: -122.419, lat: 37.76 }, noGeocode);
    expect(f?.geometry).toEqual({ type: "Point", coordinates: [-122.419, 37.76] });
    expect(f?.confidence).toBe(0.8);
    expect(f?.category).toBe("custom");
    expect(noGeocode).not.toHaveBeenCalled();
  });

  it("drops findings that land well outside the region", async () => {
    expect(await placeFinding(region, { ...base, lng: -122.27, lat: 37.80 }, noGeocode)).toBeNull(); // Oakland
  });

  it("keeps findings just outside the edge", async () => {
    expect(await placeFinding(region, { ...base, lng: -122.4265, lat: 37.76 }, noGeocode)).not.toBeNull();
  });

  it("geocodes an address when no coordinates are given", async () => {
    const geocode = vi.fn(async () => [-122.418, 37.758] as [number, number]);
    const f = await placeFinding(region, { ...base, address: "3100 24th St" }, geocode);
    expect(geocode).toHaveBeenCalledWith("3100 24th St", region);
    expect(f?.geometry).toEqual({ type: "Point", coordinates: [-122.418, 37.758] });
  });

  it("falls back to the region center at lower confidence when it can't place the finding", async () => {
    const f = await placeFinding(region, { ...base, address: "nowhere" }, noGeocode);
    expect(f?.geometry).toEqual({ type: "Point", coordinates: region.center });
    expect(f?.confidence).toBeLessThan(0.8);
    expect(f?.props?.approximate).toBe(true);
  });

  it("clamps confidence and severity into 0..1", async () => {
    const f = await placeFinding(region, { ...base, confidence: 7, severity: -2, lng: -122.419, lat: 37.76 }, noGeocode);
    expect(f?.confidence).toBe(1);
    expect(f?.severity).toBe(0);
  });
});
