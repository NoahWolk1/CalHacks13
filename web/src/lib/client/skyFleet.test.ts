import { describe, expect, it } from "vitest";
import { clampDisc, SkyFleet, toDisc, type SkyActivity } from "./skyFleet";
import type { SkyObject } from "@/lib/sky/types";

const cone = { ra: 87.0846, dec: 0.2857, radius: 3 };
const obj = (id: string, source: SkyObject["source"], ra: number, dec: number, category: SkyObject["category"] = "star", type = "Star"): SkyObject =>
  ({ id, name: id, type, category, ra, dec, source, url: "", props: {} });

describe("sky fleet", () => {
  it("maps sky positions into the cone's unit disc and clamps outsiders to the rim", () => {
    expect(toDisc(cone, cone.ra, cone.dec)).toEqual([0, 0]);
    const north = toDisc(cone, cone.ra, cone.dec + 1.5);
    expect(north[0]).toBeCloseTo(0);
    expect(north[1]).toBeCloseTo(0.5);
    expect(Math.hypot(...toDisc(cone, cone.ra + 20, cone.dec))).toBeLessThanOrEqual(0.94 + 1e-9);
    expect(toDisc({ ra: 359.5, dec: 0, radius: 1 }, 0.5, 0)[0]).toBeCloseTo(0.94); // across RA 0°, clamped
    expect(clampDisc([3, 4], 1)).toEqual([0.6, 0.8]);
  });

  it("summons every agent from the command post and keeps all of them inside the cone", () => {
    const f = new SkyFleet();
    const stars = Array.from({ length: 6 }, (_, i) => ({ tic: String(i), name: `TIC ${i}`, otype: "", ra: cone.ra + (i - 3) * 0.7, dec: cone.dec + (i % 3) - 1, pipeline: "SPOC", sector: 33, sectors: [33], heldOut: 0, playbook: "census" as const, why: "", masked: [] }));
    const a: SkyActivity = { run: 1, status: "running", sources: [], objects: [], stars: [], starResults: [], analysisDone: false, observer: "idle" };
    let now = 0;
    f.sync(a, cone, now);
    expect([...f.probes.keys()]).toEqual(["simbad", "exoplanets", "horizons", "telescopes"]);
    const objects = [obj("S1", "simbad", cone.ra + 2, cone.dec), obj("S2", "simbad", cone.ra + 9, cone.dec + 9)];
    const later: SkyActivity = {
      ...a, status: "summarising", objects, stars, observer: "working",
      sources: [{ source: "simbad", label: "SIMBAD", endpoint: "", status: "ok", count: 2, ms: 1 }, { source: "telescopes", label: "MAST", endpoint: "", status: "error", count: 0, ms: 1 }],
      starResults: [{ tic: "2", status: "ok", ms: 1, transit: { period: 3, t0: 0, duration: 0.1, depth: 1e-3, snr: 12, sde: 11, transits: 5, oddEven: 0, oddEvenSigma: 0, secondary: 0, secondarySigma: 0, detected: true } }],
    };
    for (let i = 0; i < 1200; i++) {
      now += 1 / 60;
      if (i === 30) f.sync(later, cone, now);
      if (i === 600) f.sync({ ...later, analysisDone: true, observer: "done", objects: [...objects, obj("C1", "lightcurves", stars[2].ra, stars[2].dec, "candidate", "Unvetted transit candidate")] }, cone, now);
      f.tick(now, 1 / 60);
      for (const p of f.probes.values()) {
        expect(Math.hypot(...p.pos)).toBeLessThanOrEqual(0.94 + 1e-9);
        for (const b of p.beams) expect(Math.hypot(...b.to)).toBeLessThanOrEqual(0.94 + 1e-9);
      }
    }
    expect([...f.probes.keys()].sort()).toEqual(["exoplanets", "horizons", "observer", "simbad", "telescopes", "transits", "variability", "vetting"]);
    expect(f.probes.get("telescopes")!.mode).toBe("error");
    expect(f.probes.get("vetting")!.mode).toBe("done");
    expect(f.marks.some((m) => m.strong)).toBe(true); // the unvetted candidate keeps a pulsing marker
  });

  it("starts over on a new run", () => {
    const f = new SkyFleet();
    const a: SkyActivity = { run: 1, status: "running", sources: [], objects: [], stars: [], starResults: [], analysisDone: false, observer: "idle" };
    f.sync(a, cone, 0);
    f.sync({ ...a, run: 2, status: "idle" }, cone, 1);
    expect(f.probes.size).toBe(0);
  });
});
