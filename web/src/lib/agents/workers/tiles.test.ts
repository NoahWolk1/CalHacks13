import { describe, expect, it } from "vitest";
import { lng2x, planTiles } from "./tiles";

describe("planTiles", () => {
  it("reads every tile of a small area at the top zoom", () => {
    const p = planTiles([-122.42, 37.76, -122.41, 37.77], [-122.415, 37.765], { maxZ: 14, maxTiles: 16 });
    expect(p).toMatchObject({ z: 14, sampled: false });
    expect(p.tiles.length).toBe(p.total);
  });

  it("drops zoom to fit a big area in the budget", () => {
    const p = planTiles([26.3024, -6.1349, 27.3064, -4.6109], [26.8, -5.37], { maxZ: 12, minZ: 6, maxTiles: 64 });
    expect(p.z).toBe(11);
    expect(p.sampled).toBe(false);
    expect(p.tiles.length).toBeLessThanOrEqual(64);
  });

  it("spreads samples across a huge area at a fixed zoom", () => {
    const bbox = [26.3024, -6.1349, 27.3064, -4.6109];
    const p = planTiles(bbox, [26.8, -5.37], { maxZ: 14, maxTiles: 16 });
    expect(p.sampled).toBe(true);
    expect(p.tiles.length).toBeLessThanOrEqual(16);
    expect(p.tiles.length).toBeGreaterThanOrEqual(12);
    const xs = p.tiles.map((t) => t[0]);
    // Spread: the sample spans most of the box's width, not just its middle.
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.5 * (lng2x(bbox[2], 14) - lng2x(bbox[0], 14)));
  });
});
