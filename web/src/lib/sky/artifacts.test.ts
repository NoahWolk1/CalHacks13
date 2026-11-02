import { describe, expect, it } from "vitest";
import { confirmation, ENGINEERING_FLAG, localDepth, maskEngineering, pixelPhotometry } from "./artifacts";
import { psf } from "./pixels";

/** Deterministic gaussian noise (mulberry32 + Box-Muller). */
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

const TC = 2000, DUR = 0.125;
const inBox = (t: number) => Math.abs(t - TC) < DUR / 2;

/** 3 days of 10-min flux around TC: a slow trend, noise, and optionally a dip from the star or from the background. */
function series(opts: { star?: number; viaBkg?: number; seed?: number }) {
  const g = rng(opts.seed ?? 1), t: number[] = [], f: number[] = [], b: number[] = [];
  for (let x = TC - 1.5; x < TC + 1.5; x += 10 / 1440) {
    // Background wanders (scattered light); a background error of size viaBkg lands in the flux with the opposite sign.
    const bg = 0.02 * Math.sin(x * 0.5) + 0.004 * g() + (inBox(x) ? (opts.viaBkg ?? 0) : 0);
    t.push(x);
    b.push(bg);
    // The pipeline subtracted a background estimate that is off by `bg` (wandering, plus any error in transit).
    f.push(1 + 0.001 * (x - TC) + 3e-4 * g() - (inBox(x) ? (opts.star ?? 0) : 0) - bg);
  }
  return { t: Float64Array.from(t), f: Float64Array.from(f), b: Float64Array.from(b) };
}

describe("local depth and the background test", () => {
  it("recovers a dip on the star, and keeps it with the background regressed out", () => {
    const d = localDepth(series({ star: 3e-3 }), TC, DUR)!;
    // Plain: the background's wander is noise on top (~1e-3 over a 3 h box); regressed out, it's gone.
    expect(Math.abs(d.plain.depth - 3e-3)).toBeLessThan(1.5e-3);
    expect(Math.abs(d.decorrelated!.depth - 3e-3)).toBeLessThan(3e-4);
    expect(d.decorrelated!.depth / d.decorrelated!.err).toBeGreaterThan(10);
  });
  it("loses a dip made by a background error once the background is regressed out", () => {
    const d = localDepth(series({ viaBkg: 5e-3 }), TC, DUR)!;
    expect(d.plain.depth).toBeGreaterThan(3e-3);
    expect(Math.abs(d.decorrelated!.depth)).toBeLessThan(1e-3);
    expect(Math.abs(d.corr!)).toBeGreaterThan(0.5);
  });
});

describe("confirmation", () => {
  it("says confirmed, absent or unclear", () => {
    expect(confirmation({ depth: 2.8e-3, err: 3e-4, points: 9 }, 3e-3)).toBe("confirmed");
    expect(confirmation({ depth: 2e-4, err: 3e-4, points: 9 }, 3e-3)).toBe("absent");
    expect(confirmation({ depth: 1e-3, err: 1e-3, points: 9 }, 3e-3)).toBe("unclear");
  });
});

/** An 11x11 px cutout, 30-min frames over 4 days: a star at the centre, sky, noise, and optionally a
 *  real transit, an offset down the star's column, or dead (zero) columns. */
function cutout(opts: { transit?: number; columnOffset?: number; deadFrom?: number }) {
  const nx = 11, ny = 11, np = nx * ny, g = rng(7);
  const t: number[] = [];
  for (let x = TC - 2; x < TC + 2; x += 1 / 48) t.push(x);
  const flux = new Float32Array(t.length * np);
  const star = psf(nx, ny, 5, 5, 0.9).map((v) => v * 20_000);
  t.forEach((x, i) => {
    for (let p = 0; p < np; p++) {
      const col = p % nx;
      let v = 90 + star[p] * (1 - (inBox(x) ? (opts.transit ?? 0) : 0)) + 3 * g();
      if (inBox(x) && col === 5) v -= opts.columnOffset ?? 0;
      if (opts.deadFrom !== undefined && col >= opts.deadFrom) v = 0;
      flux[i * np + p] = v;
    }
  });
  return {
    sector: 20, nx, ny, t: Float64Array.from(t), quality: new Float64Array(t.length), flux,
    wcs: { crval1: 100, crval2: -60, crpix1: 6, crpix2: 6, cd: [-21 / 3600, 0, 0, 21 / 3600] as [number, number, number, number] },
  };
}

describe("own pixel photometry", () => {
  it("sees a real transit in the pixels, with or without the column correction", () => {
    const c = cutout({ transit: 0.01 });
    for (const column of [true, false]) {
      const ph = pixelPhotometry(c, 100, -60, { column })!;
      const d = localDepth(ph, TC, DUR)!;
      expect(d.plain.depth).toBeGreaterThan(0.008);
      expect(confirmation(d.plain, 0.01)).toBe("confirmed");
    }
  });
  it("removes a dip that is an offset down the star's column", () => {
    // Every pixel in the column drops by 30 e/s: 7 aperture pixels in it give a ~1% "dip".
    const c = cutout({ columnOffset: 30 });
    const plain = localDepth(pixelPhotometry(c, 100, -60, { column: false })!, TC, DUR)!;
    const fixed = localDepth(pixelPhotometry(c, 100, -60)!, TC, DUR)!;
    expect(plain.plain.depth).toBeGreaterThan(0.004);
    expect(Math.abs(fixed.plain.depth)).toBeLessThan(1e-3);
    expect(confirmation(fixed.plain, plain.plain.depth)).toBe("absent");
  });
  it("measures the distance to the CCD edge (dead columns)", () => {
    expect(pixelPhotometry(cutout({}), 100, -60)!.edge).toBe(Infinity);
    expect(pixelPhotometry(cutout({ deadFrom: 8 }), 100, -60)!.edge).toBeCloseTo(3, 1);
  });
});

describe("engineering data", () => {
  it("flags Sector 3's attitude-test cadences, and only in Sector 3", () => {
    const t = [1384.5, 1385.0, 1386.0, 1400, 1406.5];
    expect([...maskEngineering(t, new Float64Array(5), 3)].map((q) => q === ENGINEERING_FLAG)).toEqual([true, true, false, false, true]);
    expect([...maskEngineering(t, new Float64Array(5), 2)].every((q) => q === 0)).toBe(true);
    // An existing flag is kept.
    expect(maskEngineering([1384.5], [4], 3)[0]).toBe(4);
  });
});
