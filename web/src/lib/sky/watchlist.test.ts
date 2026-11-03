import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { tileFindId } from "./sweepGrid";
import type { SkyObject, SurveySummary, SweepVet } from "./types";
import type { VetInput, VetReport, VetTier } from "./vetShared";
import { checkWatch, emptyWatch, readWatch, seedSweep, WATCH_EVERY_MS, withWatch, writeWatch } from "./watchlist";

const DAY = 24 * 3600_000;

function find(tile: number, tic: string, t: number): SkyObject {
  return {
    id: tileFindId(tile, `C${tic}`), name: `TIC ${tic}`, type: "Single-transit event", category: "candidate", ra: 90, dec: -66, source: "lightcurves", url: "",
    props: { TIC: tic, "time (BTJD)": t, "depth (ppt)": 2, "duration (hours)": 4, SNR: 10 },
  };
}
const input = (tic: string, t: number): VetInput => ({ tic, ra: 90, dec: -66, kind: "single", times: [t], duration: 4 / 24, depth: 0.002, snr: 10 });
const vet = (tic: string, t: number, tier: VetTier, tile = 0): SweepVet => ({ status: "done", startedAt: 0, tries: 1, tile, input: input(tic, t), findId: "", tier, reason: `was ${tier}` });

function sweep(status: SurveySummary["status"], vets: Record<string, SweepVet>): SurveySummary {
  return { id: "SWEEP1", status, sweep: { budgetUsd: 1, tiles: [], reviewUsd: 0, claudeUsd: 0, computeUsd: 0, vets } } as unknown as SurveySummary;
}
const report = (tier: VetTier): VetReport => ({ tier, tierReason: `now ${tier}` } as VetReport);

describe("watchlist", () => {
  const objects = [find(0, "111", 2000), find(0, "222", 2100), find(1, "333", 2200)];
  const vets = { v1: vet("111", 2000, "C"), v2: vet("222", 2100, "X"), v3: vet("333", 2200, "B", 1), v4: vet("444", 2300, "C") };

  it("watches a finished sweep's viable finds that are still on the map, once", () => {
    const w = emptyWatch();
    expect(seedSweep(w, sweep("running", vets), objects)).toBe(false);
    expect(seedSweep(w, sweep("done", vets), objects)).toBe(true);
    // X is rejected; 444's find is no longer on the map.
    expect(Object.keys(w.entries).sort()).toEqual(["SWEEP1/v1", "SWEEP1/v3"]);
    expect(seedSweep(w, sweep("done", vets), objects)).toBe(false);
  });

  it("records the sectors on the first look, and vets again only when a new one appears", async () => {
    const w = emptyWatch();
    seedSweep(w, sweep("done", vets), objects, 0);
    let sectors: Record<string, number[]> = { "111": [27, 28], "333": [61] };
    const vetted: string[] = [];
    const deps = (now: number) => ({ now, sectorsOf: async (t: string) => sectors[t], vet: async (i: VetInput) => { vetted.push(i.tic); return report(i.tic === "111" ? "X" : "C"); } });

    expect(await checkWatch(w, deps(DAY))).toEqual({ looked: 2, vetted: 0 });
    expect(w.entries["SWEEP1/v1"].sectors).toEqual([27, 28]);
    // Not due again yet.
    expect((await checkWatch(w, deps(2 * DAY))).looked).toBe(0);
    // Same sectors: no vet.
    expect(await checkWatch(w, deps(DAY + WATCH_EVERY_MS))).toEqual({ looked: 2, vetted: 0 });

    sectors = { "111": [27, 28, 94], "333": [61] };
    const now = DAY + 2 * WATCH_EVERY_MS;
    expect(await checkWatch(w, deps(now))).toEqual({ looked: 2, vetted: 1 });
    const e = w.entries["SWEEP1/v1"];
    expect(vetted).toEqual(["111"]);
    expect(e.history).toEqual([{ at: now, newSectors: [94], tier: "X", reason: "now X" }]);
    // Rejected: retired, never looked up again.
    expect(e.retired).toBe(true);
    expect((await checkWatch(w, deps(now + 10 * WATCH_EVERY_MS))).looked).toBe(1);
  });

  it("keeps the old sectors when a re-vet fails, so the next look tries again", async () => {
    const w = emptyWatch();
    seedSweep(w, sweep("done", { v1: vets.v1 }), objects, 0);
    const deps = (now: number, ok: boolean) => ({ now, sectorsOf: async () => (now > DAY ? [27, 94] : [27]), vet: async () => { if (!ok) throw new Error("MAST down"); return report("C"); } });
    await checkWatch(w, deps(DAY, true));
    expect((await checkWatch(w, deps(DAY + WATCH_EVERY_MS, false))).vetted).toBe(0);
    expect(w.entries["SWEEP1/v1"].sectors).toEqual([27]);
    expect((await checkWatch(w, deps(DAY + 2 * WATCH_EVERY_MS, true))).vetted).toBe(1);
    expect(w.entries["SWEEP1/v1"].sectors).toEqual([27, 94]);
  });

  it("lays the watch and any re-vet over the sweep's finds", async () => {
    const w = emptyWatch();
    seedSweep(w, sweep("done", vets), objects, 0);
    await checkWatch(w, { now: DAY, sectorsOf: async () => [27], vet: async () => report("C") });
    await checkWatch(w, { now: DAY + WATCH_EVERY_MS, sectorsOf: async (t) => (t === "111" ? [27, 94] : [27]), vet: async () => report("X") });
    const { objects: out, notes } = withWatch("SWEEP1", objects, [], w);
    expect(out[0].props.vet).toBe("X");
    expect(String(out[0].props.vetted)).toMatch(/^tier X: now X \(vetted again .*sector 94\)/);
    expect(String(out[0].props.watch)).toMatch(/no longer watched/);
    expect(out[1]).toBe(objects[1]);
    expect(String(out[2].props.watch)).toMatch(/watching for new TESS sectors \(has 27;/);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toMatch(/TIC 111 \(sector 94\): vetted again, tier X/);
    // Another sweep's finds are left alone.
    expect(withWatch("OTHER", objects, [], w).objects).toBe(objects);
  });

  it("round-trips the file, and reads a missing one as empty", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "watch-")), "watch", "watchlist.json");
    expect(await readWatch(path)).toEqual(emptyWatch());
    const w = emptyWatch();
    seedSweep(w, sweep("done", vets), objects, 0);
    await writeWatch(w, path);
    expect(await readWatch(path)).toEqual(w);
  });
});
