import { describe, expect, it } from "vitest";
import { ephemerisSigma, maskTransits, refineOnData } from "./timeseries";
import { ephemeris, knownTransitAt, type KnownSignal } from "./vetting";

/** Deterministic noise, a sector of 10-min flux from `from`, box transits every P from tc. */
function sector(from: number, P: number, tc: number, depth: number, dur: number, seed = 1) {
  let a = seed;
  const u = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const t: number[] = [], f: number[] = [];
  for (let x = from; x < from + 27; x += 10 / 1440) {
    const dt = x - tc - Math.round((x - tc) / P) * P;
    t.push(x); f.push(1 + 1e-3 * (u() + u() + u() - 1.5) * 2 - (Math.abs(dt) < dur / 2 ? depth : 0));
  }
  return { t, f };
}

describe("known transits on a drifted ephemeris", () => {
  // TOI-5336.01-like: P 4.0153167 ± 0.0015 d from BTJD 2520.54; 182 orbits later the real transits sit 0.27 d late.
  const cat = { period: 4.0153167, t0: 2520.536, duration: 0.16, sigmaP: 0.0015, sigmaT0: 0.004 };
  const late = 0.27;
  const a = sector(2510, cat.period, cat.t0, 0.013, 0.16, 3), b = sector(3238, cat.period, cat.t0 + late, 0.013, 0.16, 4);
  const s = { t: Float64Array.from([...a.t, ...b.t]), f: Float64Array.from([...a.f, ...b.f]) };

  it("projects the period error to the epoch", () => {
    expect(ephemerisSigma(cat, 3251.6)).toBeCloseTo(Math.hypot(0.004, 182 * 0.0015), 4);
  });
  it("re-centres the mask on the transits in each stretch of data", () => {
    const eph = refineOnData(s, cat);
    expect(eph).toHaveLength(2);
    expect(eph[0].t0).toBeCloseTo(cat.t0, 1); // near t0: the catalog is good there
    const near = (eph[1].t0 - (cat.t0 + late)) / cat.period;
    expect(Math.abs((near - Math.round(near)) * cat.period)).toBeLessThan(0.03);
    // Masked at the catalog times the late transits survive; re-centred they're gone.
    const left = (e: typeof eph) => { const m = maskTransits(s, e); let n = 0; for (let i = 0; i < m.t.length; i++) if (m.f[i] < 0.993) n++; return n; };
    expect(left([cat])).toBeGreaterThan(50);
    expect(left(eph)).toBeLessThan(5);
  });
});

describe("pre-TESS catalog epochs", () => {
  // K2-289 b (NASA Exoplanet Archive, Livingston et al. 2019): its K2 epoch is before BTJD 0. Dropping it
  // left the planet without a transit time, and a TESS single on it was vetted as new (tier B).
  const eph = ephemeris(2456897.14325, 4.032, 0.000047, 0.00097);
  it("keeps an epoch before BTJD 0 as a negative t0", () => {
    expect(eph.t0).toBeCloseTo(-102.85675, 5);
    expect(eph.sigmaP).toBe(0.000047);
    expect(ephemeris(0, 3)).toEqual({});
  });
  it("matches the TESS sector 91 transit 295 orbits later", () => {
    const k2: KnownSignal = { tic: "413753029", name: "K2-289 b", period: 13.156969, ra: 246.643, dec: -15.7925, kind: "planet", ...eph };
    const m = knownTransitAt({ tic: "413753029", ra: 246.643, dec: -15.7925 }, 3778.472, 0.125, [k2]);
    expect(m?.k.name).toBe("K2-289 b");
    expect(m?.self).toBe(true);
  });
});
