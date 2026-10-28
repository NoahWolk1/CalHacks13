import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTessEbPage } from "./hostStar";
import { eventUniqueness } from "./robust";

const page = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");

describe("TESS EB catalog pages (Villanova)", () => {
  it("reads period, t0, morphology and the eclipse depths and phases", () => {
    expect(parseTessEbPage(page("tessebs-91961.html"))).toMatchObject({ period: 5.282624782288264, t0: 1602.8226998335715, morph: 0.175, depth: 0.22, secDepth: 0.085, secPhase: 0.5 });
  });
  it("keeps a binary whose secondary isn't listed (an eccentric 41.6 d system)", () => {
    const e = parseTessEbPage(page("tessebs-258826816.html"));
    expect(e).toMatchObject({ period: 41.642341631837, morph: 0.038, depth: 0.158 });
    expect(e?.secPhase).toBeUndefined();
  });
  it("returns null for a star that isn't in the catalog, and throws on anything else", () => {
    expect(parseTessEbPage(page("tessebs-1.html"))).toBeNull();
    expect(() => parseTessEbPage("<html>Just a moment...</html>")).toThrow();
  });
});

/** Deterministic gaussian noise (mulberry32 + Box-Muller) so the tests never flake. */
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}
/** 27 d of 10-min flattened flux with box dips at `dips` (time, depth). */
function part(seed: number, dips: [number, number][], from = 2000) {
  const g = rng(seed), t: number[] = [], f: number[] = [];
  for (let x = from; x < from + 27; x += 10 / 1440) {
    t.push(x); f.push(1 + 1e-3 * g() - dips.reduce((k, [tc, d]) => k + (Math.abs(x - tc) < 0.08 ? d : 0), 0));
  }
  return { flat: { t: Float64Array.from(t), f: Float64Array.from(f) }, cadence: 10 / 1440 };
}

describe("single-event uniqueness", () => {
  it("passes a real dip: far above the false-alarm threshold, no other dip", () => {
    const u = eventUniqueness([part(1, [[2010, 3e-3]]), part(2, [], 2030)], [2010], 0.16)!;
    expect(u.event.snr / u.fred).toBeGreaterThan(u.fa + 3);
    expect(u.other.snr / u.fred).toBeLessThan(u.fa);
    expect(u.fred).toBeLessThan(1.3);
  });
  it("fails noise: a 'dip' picked at a random time is under the threshold", () => {
    const u = eventUniqueness([part(3, []), part(4, [], 2030)], [2010], 0.16)!;
    expect(u.event.snr / u.fred).toBeLessThan(u.fa);
  });
  it("finds a second eclipse elsewhere in the data", () => {
    const u = eventUniqueness([part(5, [[2010, 3e-3]]), part(6, [[2041.3, 1.5e-3]], 2030)], [2010], 0.16)!;
    expect(Math.abs(u.other.t - 2041.3)).toBeLessThan(0.1);
    expect(u.other.snr / u.fred).toBeGreaterThan(u.fa);
  });
});
