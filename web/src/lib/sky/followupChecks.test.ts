import { describe, expect, it } from "vitest";
import { dipCensus, dumpNear, edgeDistance, magellanicHost, scatteredLightAt, variabilityAt } from "./followupChecks";

// Deterministic Gaussian noise.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    const u = (s + 1) / 2147483649;
    s = (s * 1103515245 + 12345) % 2147483648;
    const v = (s + 1) / 2147483649;
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}
const series = (n: number, cad: number, f: (t: number) => number, sigma: number, seed = 1) => {
  const g = rng(seed);
  const t = Float64Array.from({ length: n }, (_, i) => 1000 + i * cad);
  return { t, f: Float64Array.from(t, (x) => 1 + f(x) + sigma * g()) };
};
const box = (tc: number, dur: number, depth: number) => (t: number) => (Math.abs(t - tc) < dur / 2 ? -depth : 0);

describe("dipCensus", () => {
  it("finds a lone transit unique in quiet data", () => {
    const s = series(9000, 2 / 1440, box(1006, 0.15, 0.004), 0.001);
    const c = dipCensus([s], [1006], 0.15)!;
    expect(c.sig).toBeGreaterThan(5);
    expect(c.dips).toBeLessThan(2);
    expect(c.ups).toBe(0);
  });
  it("counts brightenings as often as dips when the event is noise", () => {
    // Red noise: a random walk of hour-scale wiggles, and the "event" one of its dips.
    const g = rng(7);
    let w = 0;
    const t = Float64Array.from({ length: 20000 }, (_, i) => 1000 + i * (2 / 1440));
    const f = Float64Array.from(t, () => { w = 0.97 * w + 0.0006 * g(); return 1 + w + 0.0005 * g(); });
    const ev = 1015;
    const c = dipCensus([{ t, f }], [ev], 0.15)!;
    // Whatever the event's own significance, both signs show up at it.
    if (c.dips >= 3) expect(c.ups).toBeGreaterThan(0.3 * c.dips);
  });
});

describe("variabilityAt", () => {
  it("puts a dip at the bottom of a rotation trough", () => {
    const P = 6, A = 0.035;
    const s = series(8000, 10 / 1440, (t) => -A * Math.cos((2 * Math.PI * (t - 1020)) / P), 0.0005);
    const v = variabilityAt(s, 1020.05, 0.33, 0.002)!;
    expect(v.atMinimum).toBe(true);
  });
  it("sees a flare beside the dip", () => {
    const flare = (t: number) => (t > 1010 ? 0.03 * Math.exp(-(t - 1010) / 0.08) : 0);
    const s = series(4000, 10 / 1440, flare, 0.0005);
    const v = variabilityAt(s, 1010.3, 0.25, 0.003)!;
    expect(v.brightening).toBeDefined();
  });
  it("leaves a transit on a quiet star alone", () => {
    const s = series(4000, 10 / 1440, box(1012, 0.2, 0.004), 0.0005);
    const v = variabilityAt(s, 1012, 0.2, 0.004)!;
    expect(v.atMinimum).toBe(false);
    expect(v.brightening).toBeUndefined();
  });
});

describe("detector state", () => {
  it("reads SPOC's scattered-light flag and a momentum dump", () => {
    const time = Float64Array.from({ length: 2000 }, (_, i) => 1000 + i * (2 / 1440));
    const quality = Float64Array.from(time, (t) => (Math.abs(t - 1001) < 0.3 ? 4096 : Math.abs(t - 1002) < 0.001 ? 32 : 0));
    expect(scatteredLightAt({ time, quality }, 1001, 0.2).flagged).toBe(1);
    expect(dumpNear({ time, quality }, 1002.05, 0.1)).toBeCloseTo(1002, 2);
    expect(dumpNear({ time, quality }, 1001.5, 0.1)).toBeUndefined();
  });
  it("measures the distance to a data gap", () => {
    const t = [1, 1.1, 1.2, 2, 2.1];
    expect(edgeDistance(t, 1.15)).toBeCloseTo(0.05);
    expect(edgeDistance(t, 1.6)).toBeCloseTo(0.4);
  });
});

describe("magellanicHost", () => {
  it("places an LMC member at 49.6 kpc and sizes it from its luminosity", () => {
    // TIC 404970655 (OGLE LMC-ECL-37031): G 13.29, BP-RP 0.04, parallax 0.009, pm (1.89, 0.69), 24.5 kK.
    const m = magellanicHost(85.306, -70.493, { g: 13.29, bpRp: 0.035, parallax: 0.009, parallaxErr: 0.015, pmra: 1.888, pmdec: 0.693 }, 24500)!;
    expect(m.cloud).toMatch(/Large/);
    expect(m.absG).toBeLessThan(-5);
    expect(m.radius!).toBeGreaterThan(10);
  });
  it("leaves a foreground star in the LMC's direction alone (WASP-126)", () => {
    expect(magellanicHost(63.37, -69.23, { g: 10.9, bpRp: 0.8, parallax: 6.4, parallaxErr: 0.01, pmra: -20, pmdec: 30 }, 5800)).toBeNull();
  });
});
