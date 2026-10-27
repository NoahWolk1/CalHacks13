import { describe, expect, it } from "vitest";
import { bandFlux, starFromGaia, eclipseLoss, falsePositiveProbability, limbDarkening, mainSequence, mulberry32, occultedFlux, semiMajor, type Eclipse, type FppData, type FppInput } from "./fpp";

const RSUN = 6.957e10;

/** Gaussian noise from the module's own seeded RNG (Box-Muller). */
function gauss(seed: number) {
  const u = mulberry32(seed);
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

/** Binned light curve over ±half days from the given model loss (p: at the transit, s: at phase 0.5). */
function bins(e: Eclipse, half: number, n: number, noise: number, seed: number, part: "p" | "s"): FppData {
  const g = gauss(seed), dt = new Float64Array(n), f = new Float64Array(n), err = new Float64Array(n).fill(noise);
  for (let i = 0; i < n; i++) { dt[i] = -half + ((i + 0.5) * 2 * half) / n; f[i] = 1 - eclipseLoss(e, dt[i])[part] + noise * g(); }
  return { dt, f, err };
}

const sun = { radius: 1, mass: 1, teff: 5772, tmag: 10, distance: 100 };
const u = limbDarkening(5772);
const durationOf = (e: Eclipse) => (e.P / Math.PI) * Math.asin(Math.sqrt((1 + e.k) ** 2 - e.b ** 2) / e.aR);

function planetCase(k: number, snr: number): FppInput {
  const P = 5, aR = semiMajor(1, P) / RSUN;
  const e: Eclipse = { P, aR, b: 0.3, k, uH: u, uO: [0, 0], wH: 1, wO: 0 };
  const T14 = durationOf(e), depth = eclipseLoss(e, 0).p, nIn = 100 / 5;
  const noise = (depth * Math.sqrt(nIn)) / snr;
  return {
    P, T14, depth, star: sun, neighbours: [], background: { count: 20, radiusArcsec: 120, tmags: [14, 15, 16, 16.5, 17, 17.5, 18, 18.5, 19, 19.5] },
    primary: bins(e, 2.5 * T14, 100, noise, 3, "p"), secondary: bins(e, 2.5 * T14, 100, noise, 4, "s"), oddEven: { diff: 0, err: depth / 20 },
  };
}

describe("eclipse model", () => {
  it("matches the small-planet limit and full overlap", () => {
    // Central small planet: depth ≈ k² I(0) / ⟨I⟩.
    const [u1, u2] = u, k = 0.01;
    expect(occultedFlux(0, k, u1, u2) / (k * k / (1 - u1 / 3 - u2 / 6))).toBeCloseTo(1, 3);
    expect(occultedFlux(0, 2, u1, u2)).toBeCloseTo(1, 2);
    expect(occultedFlux(1.2, 0.1, u1, u2)).toBe(0);
    expect(occultedFlux(0, 0.1, 0, 0)).toBeCloseTo(0.01, 4);
    // Dimmer, smaller companions.
    expect(bandFlux(mainSequence(0.5).R, mainSequence(0.5).T)).toBeLessThan(bandFlux(1, 5772) / 10);
  });
});

describe("falsePositiveProbability", () => {
  it("a clean planet-like transit on a Sun-like star is most likely a planet", () => {
    const t0 = performance.now();
    const r = falsePositiveProbability(planetCase(0.036, 40));
    const ms = performance.now() - t0;
    expect(r.best === "TP" || r.best === "PTP").toBe(true);
    expect(r.scenarios[0].id).toBe("TP");
    expect(r.fpp).toBeLessThan(0.1);
    expect(r.nfpp).toBe(0);
    expect(r.scenarios.reduce((a, s) => a + s.prob, 0)).toBeCloseTo(1, 9);
    expect(ms).toBeLessThan(4000);
  });

  it("a deep V-shaped eclipse with a secondary is an eclipsing binary", () => {
    const P = 5, c = mainSequence(0.6), F2 = bandFlux(c.R, c.T) / bandFlux(1, 5772);
    const k = c.R, aR = semiMajor(1 + c.M, P) / RSUN;
    const e: Eclipse = { P, aR, b: 0.93, k, uH: u, uO: limbDarkening(c.T), wH: 1 / (1 + F2), wO: F2 / (1 + F2) };
    const depth = eclipseLoss(e, 0).p, sDepth = eclipseLoss(e, 0).s, T14 = durationOf(e);
    expect(depth).toBeGreaterThan(0.15);
    expect(depth).toBeLessThan(0.25);
    expect(sDepth).toBeGreaterThan(0.03);
    const r = falsePositiveProbability({
      P, T14, depth, star: sun, neighbours: [], background: { count: 20, radiusArcsec: 120, tmags: [14, 15, 16, 17, 18] },
      primary: bins(e, 2.5 * T14, 100, 1e-3, 5, "p"), secondary: bins(e, 2.5 * T14, 100, 1e-3, 6, "s"), oddEven: { diff: 0, err: 2e-3 },
    });
    expect(r.best).toBe("EB");
    expect(r.fpp).toBeGreaterThan(0.9);
  });

  it("a resolved neighbour carries the false-positive weight only while pixels leave it in play", () => {
    const base = planetCase(0.02, 25);
    const nb = { id: "123", label: "TIC 123", sep: 10, tmag: sun.tmag + 2 };
    const open = falsePositiveProbability({ ...base, neighbours: [{ ...nb, weight: 1 }] });
    const shut = falsePositiveProbability({ ...base, neighbours: [{ ...nb, weight: 0 }] });
    expect(open.scenarios.some((s) => s.id === "NTP:123")).toBe(true);
    expect(open.nfpp).toBeGreaterThan(0.05);
    expect(shut.nfpp).toBe(0);
    expect(shut.scenarios.some((s) => s.id.startsWith("N"))).toBe(false);
    expect(shut.notes.some((n) => /excluded by pixel/.test(n))).toBe(true);
  });

  it("is deterministic for a seed", () => {
    const x = { ...planetCase(0.03, 30), samples: 500 };
    expect(falsePositiveProbability({ ...x, seed: 7 })).toEqual(falsePositiveProbability({ ...x, seed: 7 }));
    expect(falsePositiveProbability({ ...x, seed: 8 }).scenarios[0].lnZ).not.toBe(falsePositiveProbability({ ...x, seed: 7 }).scenarios[0].lnZ);
  });

  it("a big neighbour can make a long eclipse a Sun-sized one cannot", () => {
    // A star: 2.5 R☉, P = 0.57 d, 3.1 h, 0.05 ppt. The neighbour needs a 1% eclipse.
    const P = 0.57, star = { radius: 2.5, mass: 2, teff: 8000, tmag: 7, distance: 300 }, uA = limbDarkening(8000);
    const aR = semiMajor(2, P) / (2.5 * RSUN), k = 0.0063;
    let b = 0;
    const e: Eclipse = { P, aR, b, k, uH: uA, uO: [0, 0], wH: 1, wO: 0 };
    for (; b < 1; b += 0.005) if (durationOf({ ...e, b }) <= 3.1 / 24) break;
    e.b = b;
    const T14 = durationOf(e), depth = eclipseLoss(e, 0).p, fr = depth / (0.01 - depth);
    expect(T14 * 24).toBeCloseTo(3.1, 1);
    expect(depth).toBeGreaterThan(4e-5);
    expect(depth).toBeLessThan(6e-5);
    const nb = { id: "7", label: "Gaia 7", sep: 7, tmag: star.tmag - 2.5 * Math.log10(fr), weight: 1 };
    const base: FppInput = {
      P, T14, depth, star, neighbours: [], background: { count: 0, radiusArcsec: 60, tmags: [] }, samples: 3000,
      primary: bins(e, 2.5 * T14, 100, (depth * Math.sqrt(20)) / 15, 9, "p"),
    };
    const generic = falsePositiveProbability({ ...base, neighbours: [nb] });
    const sized = falsePositiveProbability({ ...base, neighbours: [{ ...nb, radius: 2.5, mass: 3, teff: 6000 }] });
    const pOf = (r: typeof generic, id: string) => r.scenarios.find((s) => s.id === id)?.prob ?? 0;
    expect(pOf(sized, "NEB:7")).toBeGreaterThan(10 * pOf(generic, "NEB:7"));
    expect(sized.nfpp).toBeGreaterThan(generic.nfpp);
  });
});

describe("starFromGaia", () => {
  it("sizes stars from colour and parallax", () => {
    expect(starFromGaia(10, undefined, 5)).toBeUndefined();
    // Sun at 10 pc: G ≈ 4.67, BP−RP ≈ 0.82.
    const sun = starFromGaia(4.67, 0.82, 100)!;
    expect(sun.teff).toBeGreaterThan(5600);
    expect(sun.teff).toBeLessThan(5900);
    expect(sun.radius).toBeCloseTo(1, 0);
    // The 7″ neighbour: G = 13.3 at 0.71 mas is luminous.
    const far = starFromGaia(13.3, 0.8, 0.71)!;
    expect(far.radius).toBeGreaterThan(1.5);
    expect(far.mass).toBeLessThanOrEqual(3);
    // No parallax: main-sequence radius; an M dwarf is small.
    expect(starFromGaia(15, 2.5, undefined)!.radius).toBeLessThan(0.6);
    expect(starFromGaia(15, 9, undefined)!.teff).toBe(3000);
    expect(starFromGaia(15, 9, 1000)!.radius).toBeGreaterThanOrEqual(0.1);
  });
});
