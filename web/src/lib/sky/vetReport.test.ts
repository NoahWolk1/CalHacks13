import { describe, expect, it } from "vitest";
import { csvLine, parseCtois } from "./hostStar";
import {
  centralDuration, combine, densityFromTransit, detrendMasked, fitEphemeris, fitTrapezoid, inOutShift, measureEvent, minPeriodFromCoverage,
  minPeriodFromDuration, redNoise, rhoOf, timeEvent, trapezoid,
} from "./transitFit";
import { aliasWindows } from "./vetReport";
import { parseVetInput, reportText, tierOf, vetInputFrom, type VetCheck, type VetReport } from "./vetShared";
import type { SkyObject } from "./types";

// Deterministic noise: a small LCG + Box-Muller.
function rng(seed = 1) {
  let s = seed;
  const u = () => ((s = (s * 1664525 + 1013904223) % 4294967296) + 0.5) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

/** Two 27-day "sectors" at 10-min cadence: a slow trend, white noise, and trapezoid transits. */
function lightCurve(opts: { P?: number; t0?: number; depth?: number; T14?: number; T12?: number; noise?: number; trend?: number; times?: number[] } = {}) {
  const { P = 3.3, t0 = 2001.2, depth = 2e-3, T14 = 0.15, T12 = 0.02, noise = 5e-4, trend = 4e-3 } = opts;
  const g = rng(7), t: number[] = [], f: number[] = [];
  for (const start of [2000, 2030]) for (let x = start; x < start + 27; x += 10 / 1440) {
    const dt = opts.times ? Math.min(...opts.times.map((tc) => Math.abs(x - tc))) : Math.abs(x - t0 - Math.round((x - t0) / P) * P);
    t.push(x);
    f.push((1 + trend * Math.sin(x / 1.7)) * (1 - depth * trapezoid(dt, T14, T12)) + noise * g());
  }
  return { t: Float64Array.from(t), f: Float64Array.from(f) };
}

describe("masked detrending and transit measurements", () => {
  it("removes a slow trend but keeps each transit's full depth, with both methods", () => {
    const s = lightCurve();
    const windows = Array.from({ length: 20 }, (_, n) => ({ t: 2001.2 + n * 3.3, duration: 0.15 }));
    for (const kind of ["median", "loess"] as const) {
      const flat = detrendMasked(s, windows, { kind, window: 1 }, 2);
      const ms = windows.flatMap((w) => { const m = measureEvent(flat, w.t, 0.15, 10 / 1440); return m && m.coverage > 0.5 ? [m] : []; });
      const c = combine(ms);
      expect(ms.length).toBeGreaterThan(10);
      // A box over the trapezoid averages the ingress in: slightly under the 2 ppt bottom.
      expect(c.depth).toBeGreaterThan(1.6e-3);
      expect(c.depth).toBeLessThan(2.1e-3);
      expect(c.snr).toBeGreaterThan(20);
    }
  });
  it("finds no red noise in white noise", () => {
    const s = lightCurve({ depth: 0, trend: 0 });
    expect(redNoise(s, 0.15)).toBeLessThan(1.3);
  });
  it("tells a flat-bottomed transit from a V-shaped eclipse", () => {
    const fit = (T12: number) => {
      const s = lightCurve({ T12, depth: 4e-3, trend: 0 });
      const dt: number[] = [], f: number[] = [];
      for (let i = 0; i < s.t.length; i++) { const x = s.t[i] - 2001.2 - Math.round((s.t[i] - 2001.2) / 3.3) * 3.3; if (Math.abs(x) < 0.4) { dt.push(x); f.push(s.f[i]); } }
      return fitTrapezoid(Float64Array.from(dt), Float64Array.from(f), 5e-4, 0.15)!;
    };
    const u = fit(0.015), v = fit(0.075);
    expect(u.vRatio).toBeLessThan(0.5);
    expect(u.dChi2V).toBeLessThan(0);
    expect(v.vRatio).toBeGreaterThanOrEqual(0.8);
    expect(v.dChi2V).toBeGreaterThan(9);
    expect(Math.abs(u.T14 - 0.15)).toBeLessThan(0.02);
  });
  it("times transits and fits a linear ephemeris", () => {
    const s = lightCurve({ depth: 5e-3, trend: 0, noise: 4e-4 });
    const shape = { depth: 5e-3, T14: 0.15, T12: 0.02 };
    const timed = Array.from({ length: 16 }, (_, n) => n).flatMap((n) => {
      const tm = timeEvent(s, 2001.2 + n * 3.3 + 0.003, shape, 4e-4, 10 / 1440);
      return tm ? [{ n, ...tm }] : [];
    });
    expect(timed.length).toBeGreaterThan(10);
    const e = fitEphemeris(timed)!;
    expect(Math.abs(e.P - 3.3)).toBeLessThan(3 * e.errP + 1e-4);
    expect(Math.abs(e.t0 - 2001.2)).toBeLessThan(3 * e.errT0 + 1e-3);
    expect(e.chi2 / e.dof).toBeLessThan(4);
  });
  it("sees a centroid that moves only in transit", () => {
    const g = rng(3), t: number[] = [], x: number[] = [];
    const times = [2001, 2005, 2009, 2013];
    for (let v = 2000; v < 2015; v += 2 / 1440) { t.push(v); x.push(100 + 1e-3 * g() + (times.some((tc) => Math.abs(v - tc) < 0.05) ? 4e-3 : 0)); }
    const r = inOutShift(Float64Array.from(t), Float64Array.from(x), times, 0.1)!;
    expect(r.events).toBe(4);
    expect(r.shift / r.err).toBeGreaterThan(10);
    expect(Math.abs(r.shift - 4e-3)).toBeLessThan(1e-3);
  });
});

describe("star and orbit", () => {
  it("gets the stellar density back from a transit's shape", () => {
    // Sun-like star, P = 10 d: a/R from Kepler's law, then T14 and T23 for b = 0.3, k = 0.1.
    const P = 10, k = 0.1, b = 0.3, aR = 215 * Math.cbrt((P / 365.25) ** 2);
    const T = (x: number) => (P / Math.PI) * Math.asin(Math.sqrt(x ** 2 - b * b) / aR / Math.sin(Math.acos(b / aR)));
    const T14 = T(1 + k), T23 = T(1 - k);
    const d = densityFromTransit(P, k * k, T14, (T14 - T23) / 2)!;
    expect(d.rho).toBeGreaterThan(0.9);
    expect(d.rho).toBeLessThan(1.1);
    expect(Math.abs(d.b - b)).toBeLessThan(0.05);
  });
  it("bounds the period of a lone transit by its duration", () => {
    for (const P of [20, 200]) {
      const T = centralDuration(P, 1, 1, 0.05);
      expect(minPeriodFromDuration(T, rhoOf(1, 1), 0.05) / P).toBeGreaterThan(0.97);
      expect(minPeriodFromDuration(T, rhoOf(1, 1), 0.05) / P).toBeLessThan(1.03);
    }
  });
  it("bounds a lone transit's period by the data around it", () => {
    expect(minPeriodFromCoverage(2010, [[2000, 2013], [2013.5, 2027], [2100, 2120]], 0.2)).toBeCloseTo(16.9, 1);
  });
  it("groups alias periods that predict the same next transit", () => {
    // Every alias Δt/n of a duotransit predicts a transit at t2 + Δt: one night tests them all.
    expect(aliasWindows([676.4, 338.2, 225.47], 3678.336, 4340)).toEqual([{ t: expect.closeTo(4354.74, 1), periods: [225.47, 338.2, 676.4] }]);
    // Before then, the shortest alias has an earlier window of its own.
    expect(aliasWindows([676.4, 225.47], 3678.336, 3700)[0]).toEqual({ t: expect.closeTo(3903.806, 2), periods: [225.47] });
  });
});

describe("triage", () => {
  const c = (stage: VetCheck["stage"], status: VetCheck["status"], name = `check ${stage}`): VetCheck => ({ id: name, stage, name, status, detail: "why" });
  it("ranks a report by its worst checks and its number of transits", () => {
    expect(tierOf([c(0, "pass"), c(1, "pass")], 5, "TOI-1.01 is this signal").tier).toBe("K");
    expect(tierOf([c(0, "pass"), c(2, "fail", "Odd/even depths")], 5).reason).toMatch(/^Odd\/even depths/);
    expect(tierOf([c(1, "pass"), c(2, "pass"), c(3, "pass")], 5).tier).toBe("A");
    expect(tierOf([c(1, "pass"), c(3, "not-run")], 5).tier).toBe("B");
    expect(tierOf([c(1, "flag"), c(2, "flag")], 2).tier).toBe("B");
    expect(tierOf([c(1, "flag"), c(2, "flag"), c(3, "flag")], 6).tier).toBe("C");
    expect(tierOf([c(1, "pass")], 1).tier).toBe("C");
    // Stage 4 recommendations are never open items.
    expect(tierOf([c(1, "pass"), c(4, "not-run")], 4)).toMatchObject({ tier: "A", open: [] });
  });
  it("logs every check in the plain-text report, the ones not run included", () => {
    const r: VetReport = {
      input: { tic: "1", ra: 0, dec: 0, kind: "single", times: [2001.5], duration: 0.2, depth: 1e-3 }, checks: [c(1, "pass", "Detrending sensitivity"), c(3, "not-run", "Difference imaging")],
      events: [{ n: 1, t: 2001.5, sector: 5, pipeline: "SPOC", depth: 1e-3, err: 1e-4, snr: 10, coverage: 1 }], tier: "C", tierReason: "one transit", open: ["Difference imaging: not run (why)"], submit: "Not ready.", sectors: [5], lightCurves: 1, gated: false, ms: 1,
    };
    const text = reportText(r);
    expect(text).toMatch(/\[NOT RUN\] Difference imaging/);
    expect(text).toMatch(/\[PASS\] Detrending sensitivity/);
    expect(text).toMatch(/#1 2001\.500 s5 SPOC/);
  });
});

describe("vetting inputs", () => {
  const obj = (props: Record<string, string | number>, category: SkyObject["category"] = "candidate"): SkyObject => ({ id: "C1", name: "x", type: "Single-transit event", category, ra: 90, dec: -66, source: "lightcurves", url: "", props: { TIC: "40976339", "depth (ppt)": 2.8, "duration (hours)": 8, SNR: 8.2, ...props } });
  it("reads a periodic signal, a duotransit and a single dip from a find's props", () => {
    expect(vetInputFrom(obj({ "period (days)": 3.2, "first transit (BTJD)": 2000.1, "transits observed": 7 }))).toMatchObject({ kind: "periodic", period: 3.2, t0: 2000.1, transits: 7, depth: 2.8e-3 });
    expect(vetInputFrom(obj({ "times (BTJD)": "3001.937, 3678.336" }))).toMatchObject({ kind: "duo", times: [3001.937, 3678.336] });
    expect(vetInputFrom(obj({ "time (BTJD)": 3733.23 }))).toMatchObject({ kind: "single", times: [3733.23], duration: 8 / 24 });
    expect(vetInputFrom(obj({ "period (days)": 3.2 }, "variable"))).toBeNull();
  });
  it("validates what the route accepts", () => {
    const ok = { tic: "40976339", ra: 90, dec: -66, kind: "single", times: [3733.2], duration: 0.3, depth: 3e-3 };
    expect(parseVetInput(ok)).toMatchObject({ kind: "single", times: [3733.2] });
    expect(parseVetInput({ ...ok, tic: "40976339; drop" })).toBeNull();
    expect(parseVetInput({ ...ok, kind: "periodic" })).toBeNull(); // no period
    expect(parseVetInput({ ...ok, depth: 2 })).toBeNull();
    expect(parseVetInput({ ...ok, kind: "duo" })).toBeNull(); // one time
  });
  it("parses the CTOI table, quoted commas included", () => {
    expect(csvLine('1,"a, b",3,"say ""hi"""')).toEqual(["1", "a, b", "3", 'say "hi"']);
    const m = parseCtois('TIC ID,CTOI,Transit Epoch (BJD),Period (days),Depth ppm,Duration (hrs),User Disposition,TFOPWG Disposition,Notes\n17361,17361.01,2458596.9598,3.60677,10036,2.1,PC,,"new CTOI, Montalto"\n');
    expect(m.get("17361")).toEqual([{ name: "CTOI 17361.01", period: 3.60677, epoch: expect.closeTo(1596.9598, 4), depthPpm: 10036, durationH: 2.1, disposition: "PC" }]);
  });
});
