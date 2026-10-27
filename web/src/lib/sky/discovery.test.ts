import { describe, expect, it } from "vitest";
import { analyseStar, recheckSignal } from "./analysis";
import { sectorsFor, type LcProduct } from "./lightcurves";
import { singleEvents } from "./singles";
import { acceptPlan, heuristicFollowups, heuristicPlan, prospects } from "./strategy";
import { binSeries, clipUpper, flatten, maskTransits, stitch } from "./timeseries";
import { maxTransitDuration, vetSignal, type KnownSignal } from "./vetting";
import { isEclipsingType, parseVsx, vsxEntry } from "./vsx";
import type { SkyObject } from "./types";

/** Deterministic gaussian noise (mulberry32 + Box-Muller) so the tests never flake. */
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

type Transit = { P: number; t0: number; dur: number; depth: number };

/** Raw SPOC-like columns for one 27 d sector at 2-min cadence starting at `from` (BTJD), with the
 *  mid-sector downlink gap, flux around 1000 e/s. */
function rawSector(from: number, opts: { noise: number; seed: number; transits?: Transit[]; dips?: { t: number; dur: number; depth: number }[] }) {
  const g = rng(opts.seed);
  const time: number[] = [], flux: number[] = [];
  for (let x = from; x < from + 27; x += 2 / 1440) {
    if (x > from + 13 && x < from + 14) continue;
    let v = 1 + opts.noise * g();
    for (const tr of opts.transits ?? []) {
      const dt = x - tr.t0 - Math.round((x - tr.t0) / tr.P) * tr.P;
      if (Math.abs(dt) < tr.dur / 2) v -= tr.depth;
    }
    for (const d of opts.dips ?? []) if (Math.abs(x - d.t) < d.dur / 2) v -= d.depth;
    time.push(x); flux.push(1000 * v);
  }
  return { time: Float64Array.from(time), flux: Float64Array.from(flux), quality: new Float64Array(time.length) };
}

describe("multi-sector discovery searches", () => {
  it("finds a 22-day planet only by stitching sectors, within a CPU budget", () => {
    const planet = { P: 22.3, t0: 2005.4, dur: 0.22, depth: 1.5e-3 };
    const parts = [2000, 2027.5, 2055, 2082.5].map((f, i) => rawSector(f, { noise: 1e-3, seed: 10 + i, transits: [planet] }));
    const t = Date.now();
    const a = analyseStar(parts);
    const ms = Date.now() - t;
    expect(a.signals.length).toBeGreaterThan(0);
    expect(Math.abs(a.signals[0].period / planet.P - 1)).toBeLessThan(0.01);
    expect(a.days).toBeGreaterThan(100);
    expect(ms).toBeLessThan(15_000);
    // One sector alone holds a single transit: no periodic detection.
    expect(analyseStar([parts[0]]).signals.find((s) => Math.abs(s.period / planet.P - 1) < 0.02)).toBeUndefined();
  }, 30_000);

  it("masks a known planet and finds its smaller sibling", () => {
    const hot = { P: 3.1, t0: 2001.1, dur: 0.12, depth: 8e-3 }, sib = { P: 7.7, t0: 2003.2, dur: 0.15, depth: 1.2e-3 };
    const parts = [2000, 2027.5].map((f, i) => rawSector(f, { noise: 8e-4, seed: 30 + i, transits: [hot, sib] }));
    const a = analyseStar(parts, [{ period: hot.P, t0: hot.t0, duration: hot.dur }]);
    expect(a.signals.some((s) => Math.abs(s.period / hot.P - 1) < 0.01 || Math.abs(s.period / (hot.P * 2) - 1) < 0.01)).toBe(false);
    expect(Math.abs(a.signals[0].period / sib.P - 1)).toBeLessThan(0.01);
  }, 20_000);

  it("iterates past the strongest signal to a second planet without a mask", () => {
    const b = { P: 2.4, t0: 2000.7, dur: 0.1, depth: 4e-3 }, c = { P: 5.9, t0: 2002.1, dur: 0.13, depth: 1.6e-3 };
    const a = analyseStar([rawSector(2000, { noise: 6e-4, seed: 50, transits: [b, c] }), rawSector(2027.5, { noise: 6e-4, seed: 51, transits: [b, c] })]);
    const ps = a.signals.map((s) => s.period);
    expect(ps.some((p) => Math.abs(p / b.P - 1) < 0.01)).toBe(true);
    expect(ps.some((p) => Math.abs(p / c.P - 1) < 0.01)).toBe(true);
  }, 20_000);

  it("re-checks a signal on an independent sector", () => {
    const tr = { P: 4.2, t0: 2001.3, dur: 0.12, depth: 2e-3 };
    expect(recheckSignal([rawSector(2100, { noise: 8e-4, seed: 70, transits: [tr] })], tr.P, tr.depth).recovered).toBe(true);
    expect(recheckSignal([rawSector(2100, { noise: 8e-4, seed: 71 })], tr.P, tr.depth).recovered).toBe(false);
  });
});

describe("regressions from live fields", () => {
  it("reports a hot Jupiter once, not again for its secondary eclipse (WASP-18-like)", () => {
    const pl = { P: 0.94, t0: 2000.3, dur: 0.09, depth: 9e-3 }, occ = { P: 0.94, t0: 2000.3 + 0.47, dur: 0.09, depth: 4e-4 };
    const a = analyseStar([rawSector(2000, { noise: 5e-4, seed: 110, transits: [pl, occ] })]);
    expect(a.signals.filter((x) => [1, 2, 0.5].some((m) => Math.abs(x.period / (pl.P * m) - 1) < 0.01))).toHaveLength(1);
    // Masked as a known planet: neither transit nor occultation comes back.
    const m = analyseStar([rawSector(2000, { noise: 5e-4, seed: 110, transits: [pl, occ] })], [{ period: pl.P, t0: pl.t0, duration: pl.dur }]);
    expect(m.signals).toHaveLength(0);
  }, 20_000);
  it("prewhitens a δ Scuti pulsation instead of reporting its dips as transits", () => {
    const r = rawSector(2000, { noise: 5e-4, seed: 120 });
    const flux = Float64Array.from(r.flux, (v, i) => v + 1000 * (3e-3 * Math.sin((2 * Math.PI * r.time[i]) / 0.179) + 1e-3 * Math.sin((2 * Math.PI * r.time[i]) / 0.113)));
    const a = analyseStar([{ ...r, flux }]);
    expect(a.prewhitened.length).toBeGreaterThan(0);
    expect(a.signals).toHaveLength(0);
    expect(vetSignal({ ...planet0, period: 0.179 * 3 }, { star: { tic: "1", ra: 0, dec: 0, otype: "" }, known: [], neighbours: [], others: [], ls: { ...a.ls, period: 0.179, fap: 1e-9, amplitude: 3e-3 } }).kind).toBe("variability");
  }, 20_000);
});

const planet0 = { period: 3.5, depth: 1e-3, oddEven: 0, oddEvenSigma: 0, secondary: 0, secondarySigma: 0, duration: 0.12 };

describe("single-transit hunter", () => {
  const flat = (r: ReturnType<typeof rawSector>) => {
    const s = stitch([binSeries({ t: r.time, f: Float64Array.from(r.flux, (v) => v / 1000) }, 10 / 1440)]);
    return clipUpper(flatten(s, 1));
  };
  it("finds one lone 4-hour dip and nothing in pure noise", () => {
    const ev = singleEvents(flat(rawSector(2000, { noise: 1e-3, seed: 90, dips: [{ t: 2009.2, dur: 4 / 24, depth: 2.5e-3 }] })));
    expect(ev.length).toBeGreaterThan(0);
    expect(Math.abs(ev[0].t - 2009.2)).toBeLessThan(0.1);
    for (const seed of [91, 92, 93]) expect(singleEvents(flat(rawSector(2000, { noise: 1e-3, seed })))).toEqual([]);
  });
  it("ignores dips at the edge of a data gap (thermal ramps)", () => {
    expect(singleEvents(flat(rawSector(2000, { noise: 1e-3, seed: 94, dips: [{ t: 2014.05, dur: 4 / 24, depth: 4e-3 }] })))).toEqual([]);
  });
  it("masks periodic transits so their dips aren't singles", () => {
    const s = { t: Float64Array.from([0, 1, 2, 3, 4]), f: Float64Array.from([1, 1, 1, 1, 1]) };
    expect([...maskTransits(s, [{ period: 2, t0: 0, duration: 0.2 }]).t]).toEqual([1, 3]);
  });
});

describe("Vetter and Variable Census additions", () => {
  const star = { tic: "1", ra: 10, dec: 20, otype: "" };
  const base = { star, known: [], neighbours: [], others: [], vsx: [] };
  const planet = { period: 3.5, depth: 1e-3, oddEven: 0, oddEvenSigma: 0, secondary: 0, secondarySigma: 0, duration: 0.12 };

  it("calls an EB no catalog lists an uncatalogued eclipsing binary, and a catalogued one known", () => {
    const eb = { ...planet, oddEven: 0.5, oddEvenSigma: 9 };
    expect(vetSignal(eb, base).kind).toBe("new-eb");
    expect(vetSignal(eb, { ...base, vsx: [{ name: "ASASSN-V J0040", type: "EA", ra: 10.0005, dec: 20.0005, period: 7 }] }).label).toBe("Known eclipsing binary");
    // VSX unavailable: can't claim it's new.
    expect(vetSignal(eb, { ...base, vsx: undefined }).kind).toBe("eclipsing-binary");
  });
  it("attributes a period to a VSX variable leaking in from a neighbour", () => {
    const v = vetSignal(planet, { ...base, vsx: [{ name: "V0123 Xyz", type: "EW", ra: 10.02, dec: 20, period: 7.0 }] });
    expect(v.kind).toBe("contamination");
    expect(v.label).toMatch(/V0123 Xyz/);
  });
  it("rejects a dip too long for a planet's transit on this star", () => {
    // Sun-like star, 1-day period: a central transit lasts ~1.8 h at most.
    expect(maxTransitDuration(1, 1, 4.44) * 24).toBeCloseTo(1.8, 1);
    expect(vetSignal({ ...planet, period: 1, duration: 10 / 24 }, { ...base, starRadius: 1, logg: 4.44 }).kind).toBe("eclipsing-binary");
    expect(vetSignal({ ...planet, period: 1, duration: 2 / 24 }, { ...base, starRadius: 1, logg: 4.44 }).kind).toBe("candidate");
  });
  it("parses VSX and recognises eclipsing types", () => {
    const rows = parseVsx({ metadata: ["Name", "Type", "Period", "RAJ2000", "DEJ2000"].map((name) => ({ name })), data: [["CG Ori   ", "EA/DM ", 2.1, 83.9, -6.3], ["X", "ROT", null, 1, 2]] });
    expect(rows[0]).toEqual({ name: "CG Ori", type: "EA/DM", period: 2.1, ra: 83.9, dec: -6.3 });
    expect(rows[1].period).toBeUndefined();
    expect(["EA", "EB:", "EW|ROT", "E", "ELL", "EP"].every(isEclipsingType)).toBe(true);
    expect(["ROT", "DSCT", "EXOR", "ELL:"].map(isEclipsingType)).toEqual([false, false, false, true]);
    expect(vsxEntry({ ra: 83.9001, dec: -6.3 }, rows)?.name).toBe("CG Ori");
    expect(vsxEntry({ ra: 83.95, dec: -6.3 }, rows)).toBeUndefined();
  });
});

describe("Strategist", () => {
  const cone = { ra: 10, dec: 20, radius: 1 };
  const p = (tic: string, pipeline: LcProduct["pipeline"], sector: number): LcProduct => ({ tic, pipeline, sector, cadence: 120, uri: `${tic}-${sector}` });
  const stars = [
    { tic: "1", name: "Bright SPOC", otype: "*", ra: 10, dec: 20, vmag: 8 },
    { tic: "2", name: "Planet host", otype: "*", ra: 10.2, dec: 20, vmag: 10 },
    { tic: "3", name: "FFI only", otype: "*", ra: 10.3, dec: 20, vmag: 11 },
    { tic: "4", name: "CVZ star", otype: "*", ra: 10.4, dec: 20, vmag: 10.5 },
    { tic: "5", name: "Known EB", otype: "EB*", ra: 10.5, dec: 20, vmag: 9 },
  ];
  const products = [p("1", "SPOC", 40), p("2", "SPOC", 40), p("3", "QLP", 40), ...[10, 11, 12, 13, 14, 40].map((s) => p("4", "SPOC", s)), p("5", "SPOC", 40)];
  const known: KnownSignal[] = [{ tic: "2", name: "X-1 b", period: 3, ra: 10.2, dec: 20, kind: "planet", t0: 1, duration: 0.1 }];

  it("ranks stars by discovery potential and assigns playbooks", () => {
    const pool = prospects(cone, stars, products, known, []);
    const by = new Map(pool.map((x) => [x.star.tic, x]));
    expect(pool[0].star.tic).toBe("2");
    expect(by.get("2")!.playbook).toBe("multi-planet");
    expect(by.get("4")!.playbook).toBe("long-period");
    expect(by.get("3")!.playbook).toBe("deep-search");
    expect(by.get("1")!.playbook).toBe("census");
    expect(by.get("5")!.catalogued).toMatch(/SIMBAD/);
    expect(by.get("5")!.score).toBeLessThan(by.get("1")!.score);
    expect(heuristicPlan(pool, 3).map((x) => x.prospect.star.tic)).toEqual(["2", "4", "3"]);
  });
  it("keeps Claude's valid picks, drops unknown TICs and fills from the heuristic", () => {
    const pool = prospects(cone, stars, products, known, []);
    const out = acceptPlan(pool, [{ tic: "TIC 999", playbook: "census", why: "x" }, { tic: "TIC 5", playbook: "census", why: "check EB" }, { tic: "1", playbook: "multi-planet", why: "no known planet" }], 3);
    expect(out.map((x) => x.prospect.star.tic)).toEqual(["5", "1", "2"]);
    expect(out[1].playbook).toBe("census"); // multi-planet needs something to mask
  });
  it("stitches the densest run of sectors and holds the rest out", () => {
    const { use, heldOut } = sectorsFor(products, "4", 3);
    expect(use.map((u) => u.sector)).toEqual([12, 13, 14]);
    expect(heldOut.map((u) => u.sector)).toEqual([40, 11, 10]);
  });
  it("follows up periodic finds on held-out sectors and extends single dips", () => {
    const o = (id: string, type: string) => ({ id, type } as SkyObject);
    const acts = heuristicFollowups([
      { object: o("C1", "Unvetted transit candidate"), canRecheck: true, canExtend: true },
      { object: o("C2", "Single-transit event"), canRecheck: false, canExtend: true },
      { object: o("C3", "Unvetted transit candidate"), canRecheck: false, canExtend: false },
    ], 5);
    expect(acts.map((a) => `${a.action} ${a.id}`)).toEqual(["recheck C1", "extend C2"]);
  });
});
