import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fileVetStore } from "./vetStore";
import { sameFind, type VetInput, type VetReport } from "./vetShared";

const input = (extra: Partial<VetInput> = {}): VetInput => ({ tic: "440445671", ra: 90.3, dec: 45.2, kind: "periodic", period: 0.5692, t0: 3286.25, duration: 0.083, depth: 7.8e-5, ...extra });
const report = (i: VetInput, tier: VetReport["tier"]) => ({ input: i, tier, checks: [], events: [] } as unknown as VetReport);

describe("saved vetting reports", () => {
  it("matches a find by star, kind and period (0.5%), or by dip times", () => {
    expect(sameFind(input(), input({ period: 0.5705, t0: 3300 }))).toBe(true);
    expect(sameFind(input(), input({ period: 0.58 }))).toBe(false);
    expect(sameFind(input(), input({ tic: "1" }))).toBe(false);
    const single = input({ kind: "single", period: undefined, times: [2010.4], duration: 0.2 });
    expect(sameFind(single, { ...single, times: [2010.5] })).toBe(true);
    expect(sameFind(single, { ...single, times: [2011] })).toBe(false);
  });

  it("keeps one report per signal, the latest, and finds it by TIC", async () => {
    const s = fileVetStore(mkdtempSync(join(tmpdir(), "vets-")));
    const a = await s.save(report(input(), "C"));
    const b = await s.save(report(input({ period: 0.5695 }), "X")); // the same signal, re-run
    await s.save(report(input({ period: 1.7 }), "B")); // another signal on the star
    expect(b.id).toBe(a.id);
    const all = await s.byTic(["440445671", "nope"]);
    expect(all.map((v) => v.report.tier).sort()).toEqual(["B", "X"]);
    expect(await s.byTic(["123"])).toEqual([]);
    await expect(s.save(report(input({ tic: "../x" }), "C"))).rejects.toThrow(/bad TIC/);
  });
});
