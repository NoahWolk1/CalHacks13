import { describe, expect, it } from "vitest";
import { radiusFromLuminosity } from "./hostStar";
import { knownTransitAt, knownTransitLabel, transitVariability, unreliableHost, type KnownSignal } from "./vetting";

describe("radius from luminosity (no TIC radius)", () => {
  it("gives the Sun 1 R☉ and eps Aur a supergiant's radius", () => {
    expect(radiusFromLuminosity(4.3, 10, 5772)).toBeCloseTo(1, 2);
    const epsAur = radiusFromLuminosity(2.32, 625, 7395)!;
    expect(epsAur).toBeGreaterThan(60);
    expect(epsAur).toBeLessThan(200);
  });
  it("needs a distance and a sane Teff", () => {
    expect(radiusFromLuminosity(8, 0, 5800)).toBeUndefined();
    expect(radiusFromLuminosity(8, 100, 0)).toBeUndefined();
  });
});

describe("lone dips that are known transits", () => {
  const toi: KnownSignal = { tic: "430099722", name: "TOI-5336.01", period: 4.0153167, t0: 2520.536355, duration: 3.825 / 24, sigmaP: 0.001535, sigmaT0: 0.004122, ra: 96.234561, dec: 23.657844, kind: "toi", disposition: "PC" };
  const star = { tic: "430099722", ra: 96.234561, dec: 23.657844 };
  it("matches TOI-5336.01's transit 0.27 d after its drifted prediction", () => {
    const m = knownTransitAt(star, 3251.59, 0.175, [toi])!;
    expect(m.self).toBe(true);
    expect(knownTransitLabel(m).label).toBe("Known TOI transit: TOI-5336.01 (planet candidate)");
    expect(knownTransitLabel(m).reason).toMatch(/h after its catalog prediction/);
  });
  it("a precise ephemeris doesn't claim a dip half an orbit away; a neighbour's transit is contamination", () => {
    expect(knownTransitAt(star, 3251.59 + 2, 0.175, [{ ...toi, sigmaP: 1e-6, sigmaT0: 1e-4 }])).toBeUndefined();
    const near = knownTransitAt({ tic: "1", ra: 96.234561, dec: 23.657844 + 1.5 / 60 }, 3251.59, 0.175, [toi])!;
    expect(knownTransitLabel(near).label).toMatch(/^Light from TOI-5336.01's host, 1.5′ away/);
  });
});

describe("hosts where a lone dip isn't a candidate", () => {
  it("saturated stars and big giants", () => {
    expect(unreliableHost({ tmag: 2.3 })?.label).toBe("Unreliable dip (saturated star)");
    expect(unreliableHost({ vmag: 3.0 })?.label).toBe("Unreliable dip (saturated star)");
    expect(unreliableHost({ tmag: 9, radius: 40 })?.label).toBe("Single dip on a giant star");
    expect(unreliableHost({ tmag: 9, radius: 1.1, logg: 4.4 })).toBeUndefined();
  });
});

describe("variability at a transit period", () => {
  const toi: KnownSignal = { tic: "430099722", name: "TOI-5336.01", period: 4.0153167, ra: 96.2, dec: 23.6, kind: "toi" };
  const star = { tic: "430099722", ra: 96.2, dec: 23.6 };
  it("a 3.84 d period over one sector is the TOI's 4.015 d within the resolution; 2.5 d isn't", () => {
    expect(transitVariability(star, 3.84, 27, [toi])).toMatch(/TOI-5336.01/);
    expect(transitVariability(star, 2.0, 27, [toi])).toMatch(/TOI-5336.01/); // half the period
    expect(transitVariability(star, 2.5, 27, [toi])).toBeUndefined();
    expect(transitVariability(star, 3.1, 27, [], [{ period: 3.1 }])).toMatch(/this search's transit signal/);
  });
});
