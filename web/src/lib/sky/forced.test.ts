import { describe, expect, it } from "vitest";
import { forcedCheck } from "./analysis";

/** Deterministic gaussian noise (mulberry32 + Box-Muller) so the tests never flake. */
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

/** One 27-d sector of 10-min cadences (as a light-curve file) with a box transit of `depth`. */
function lc(depth: number, seed: number, t0 = 2001.37) {
  const g = rng(seed), time: number[] = [], flux: number[] = [];
  for (let x = 2000; x < 2027; x += 10 / 1440) {
    if (x > 2013 && x < 2014) continue;
    const dt = x - t0 - Math.round((x - t0) / 3.1) * 3.1;
    time.push(x); flux.push(1 + 6.7e-4 * g() - (Math.abs(dt) < 0.06 ? depth : 0));
  }
  return { time: Float64Array.from(time), flux: Float64Array.from(flux), quality: new Float64Array(time.length) };
}

// The signal as another season found it: a phase from that season, which a forced check must not rely on.
const known = (depth: number) => ({ period: 3.1004, duration: 0.12, depth });

describe("forced check of a known signal", () => {
  it("recovers a signal that clears the detection bar", () => {
    const r = forcedCheck([lc(1.2e-3, 1)], known(1.2e-3));
    expect(r.result).toBe("recovered");
    expect(r.depth).toBeGreaterThan(0.8e-3);
  });
  it("calls a consistent but sub-threshold dip weak, not missing", () => {
    const r = forcedCheck([lc(3e-4, 2)], known(3e-4));
    expect(r.result).toBe("weak");
  });
  it("calls it absent when a dip that deep would have shown", () => {
    const r = forcedCheck([lc(0, 3)], known(1.2e-3));
    expect(r.result).toBe("absent");
    expect(r.depth).toBeLessThan(0.5e-3);
  });
});
