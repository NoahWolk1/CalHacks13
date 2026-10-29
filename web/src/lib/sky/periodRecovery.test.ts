import { describe, expect, it } from "vitest";
import type { ZtfPoint } from "./archives";
import { measureEvent } from "./transitFit";
import { bestPeriods, coverageAllows, eventAliases, findRepeats, periodGrid, periodPosterior, ztfSearch, ztfSeries } from "./periodRecovery";

/** Deterministic gaussian noise (mulberry32 + Box-Muller) so the tests never flake. */
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { g: () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()), u };
}
/** 27 d of 10-min flattened flux with box dips (time, depth) of 0.16 d. */
function part(seed: number, from: number, dips: [number, number][]) {
  const { g } = rng(seed), t: number[] = [], f: number[] = [];
  for (let x = from; x < from + 27; x += 10 / 1440) {
    t.push(x); f.push(1 + 1e-3 * g() - dips.reduce((k, [tc, d]) => k + (Math.abs(x - tc) < 0.08 ? d : 0), 0));
  }
  return { flat: { t: Float64Array.from(t), f: Float64Array.from(f) }, cadence: 10 / 1440 };
}
/** ZTF-like sampling: one g and one r point most nights over ~5 years, 1% errors, a box transit. */
function ztf(seed: number, P: number | null, t0: number, depth: number, T14: number): ZtfPoint[] {
  const { g, u } = rng(seed), out: ZtfPoint[] = [];
  for (let night = 0; night < 1800; night++) {
    if (u() < 0.35) continue; // weather, moon, season
    for (const band of ["g", "r"] as const) {
      const t = 1200 + night + 0.15 + 0.25 * u();
      const ph = P ? (((t - t0) / P) % 1 + 1) % 1 : 0.5;
      const inT = P !== null && Math.min(ph, 1 - ph) * P < T14 / 2;
      const flux = 1 - (inT ? depth : 0) + 0.01 * g();
      out.push({ t, mag: 15 - 2.5 * Math.log10(flux), err: 0.0108, band, oid: band });
    }
  }
  return out;
}

describe("repeat transits in TESS", () => {
  it("finds the same transit in another sector and ignores a dip of a different depth", () => {
    const parts = [part(1, 2000, [[2010, 3e-3]]), part(2, 2030, [[2041.3, 3e-3]]), part(3, 2060, [[2071, 1e-3]])].map((p) => ({ ...p, beta: 1 }));
    const r = findRepeats(parts, [2010], 0.16, 3e-3);
    expect(r.events).toHaveLength(1);
    expect(Math.abs(r.events[0].t - 2041.3)).toBeLessThan(0.06);
  });
  it("finds nothing in noise", () => {
    const parts = [part(4, 2000, [[2010, 3e-3]]), part(5, 2030, [])].map((p) => ({ ...p, beta: 1 }));
    expect(findRepeats(parts, [2010], 0.16, 3e-3).events).toHaveLength(0);
  });
});

describe("periods through the events", () => {
  it("three transits: the period, its fractions ruled out by the coverage", () => {
    const cov: [number, number][] = [[2000, 2027], [2030, 2057], [2060, 2087]];
    const al = eventAliases([2010, 2041.3, 2072.6], 0.16, cov);
    expect(al[0]).toBeCloseTo(31.3, 3);
    // P/2 puts transits at 2025.65 and 2056.95 (inside the coverage): ruled out.
    expect(al.some((p) => Math.abs(p - 15.65) < 0.01)).toBe(false);
  });
  it("a dip off the integer epochs fits no period", () => {
    // Short periods could fit all three, but TESS watched in between and saw no other dip.
    expect(eventAliases([2010, 2041.3, 2061.0], 0.16, [[2000, 2027], [2030, 2057], [2060, 2087]], 1)).toHaveLength(0);
  });
  it("coverage: a period that puts a transit inside the data is not allowed", () => {
    expect(coverageAllows(10, 2010, 0.16, [[2000, 2027]], [2010])).toBe(false);
    expect(coverageAllows(30, 2010, 0.16, [[2000, 2027]], [2010])).toBe(true);
  });
});

describe("a single transit's period from ZTF", () => {
  const t1 = 2010, T14 = 0.25, depth = 0.04;
  const grid = periodGrid(20, 300, T14, 1200);
  const allowed = grid.map(() => true);
  it("recovers the period from years of sparse ground photometry", () => {
    const P = 47.31, z = ztfSeries(ztf(7, P, t1, depth, T14))!;
    const r = ztfSearch(z, t1, T14, depth, grid, allowed);
    expect(r.best).toBeDefined();
    expect(Math.abs(r.best!.period / P - 1)).toBeLessThan(0.001);
    expect(r.rivals).toHaveLength(0);
    // Most periods are ruled out: ZTF saw no dip where they predict one.
    expect(r.excluded.filter(Boolean).length / grid.length).toBeGreaterThan(0.5);
  });
  it("detects nothing in ZTF data without a transit", () => {
    const z = ztfSeries(ztf(8, null, t1, depth, T14))!;
    expect(ztfSearch(z, t1, T14, depth, grid, allowed).best).toBeUndefined();
  });
  it("most probable period: allowed periods weighted by transit probability and the shape", () => {
    const g = periodGrid(10, 1000, 0.2, 100);
    const post = periodPosterior(g, g.map(() => true), g.map(() => false), 60)!;
    expect(post.median).toBeGreaterThan(30);
    expect(post.median).toBeLessThan(90);
    expect(post.lo).toBeLessThan(post.median);
    expect(post.hi).toBeGreaterThan(post.median);
  });
});

describe("the period through repeats", () => {
  it("picks the period that explains the most dips, ignoring a stray one, and merges near-copies", () => {
    // Four sectors; the transit every 31.3 d from 2010, plus a stray dip at 2075.
    const P = 31.3, depth = 3e-3;
    const parts = [2000, 2030, 2060].map((from, i) => part(10 + i, from, [...[0, 1, 2].map((k) => [2010 + k * P, depth] as [number, number]), [2075, depth]]));
    const at = (t: number) => { const p = parts.find((q) => t >= q.flat.t[0] && t <= q.flat.t[q.flat.t.length - 1]); return p ? measureEvent(p.flat, t, 0.16, p.cadence) : null; };
    const fits = bestPeriods(2010, [2041.3, 2072.6, 2075], depth, 5, [2000, 2087], at);
    expect(fits).toHaveLength(1);
    expect(fits[0].period).toBeCloseTo(P, 2);
    expect(fits[0].hits).toHaveLength(3);
  });
});
