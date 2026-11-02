import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { separation } from "./geom";
import { newSummary } from "./survey";
import { fileStore } from "./surveyStore";
import { advanceSweep, computeUsd, newSweep, recordSweepVet } from "./sweep";
import { eclipticLat, parseTileFindId, tileFindId, tileRegion } from "./sweepGrid";
import type { SkyObject } from "./types";

// Price compute as on Vercel, so the budget test can blow the cap with step time; one vet at a time.
vi.hoisted(() => { process.env.SKY_COMPUTE_USD_PER_HOUR = "0.15"; process.env.SKY_SWEEP_VET_CONCURRENCY = "1"; });

describe("tileRegion", () => {
  it("covers the whole sky with 3° tiles, leaving no gap", () => {
    const tiles = tileRegion({ ra: 0, dec: 0, radius: 180 });
    expect(tiles.length).toBeGreaterThan(1500);
    expect(tiles.length).toBeLessThan(2600);
    // Fibonacci-sphere sample points: every one lies inside some tile.
    const n = 4000;
    for (let k = 0; k < n; k++) {
      const dec = Math.asin(-1 + (2 * (k + 0.5)) / n) * 180 / Math.PI;
      const ra = ((k * 137.50776405) % 360 + 360) % 360;
      expect(tiles.some((t) => separation(ra, dec, t.ra, t.dec) <= t.radius)).toBe(true);
    }
  });

  it("keeps a small region as one tile and puts deep TESS coverage first", () => {
    expect(tileRegion({ ra: 10, dec: 20, radius: 2 })).toEqual([{ ra: 10, dec: 20, radius: 2 }]);
    const tiles = tileRegion({ ra: 90, dec: -40, radius: 40 });
    expect(Math.abs(eclipticLat(tiles[0].ra, tiles[0].dec))).toBeGreaterThan(Math.abs(eclipticLat(tiles.at(-1)!.ra, tiles.at(-1)!.dec)));
    expect(eclipticLat(90, -66.56)).toBeCloseTo(-90, 0); // south ecliptic pole
  });

  it("round-trips tile find ids", () => {
    expect(parseTileFindId(tileFindId(4, "C2"))).toEqual({ tile: 4, id: "C2" });
    expect(parseTileFindId("C2")).toBeNull();
  });
});

const find = (id: string): SkyObject => ({ id, name: "TIC 1", type: "Unvetted transit candidate", category: "star", ra: 0, dec: 0, source: "lightcurves", url: "", props: {} });
const transit = (id: string, tic: string): SkyObject => ({ ...find(id), name: `TIC ${tic}`, category: "candidate",
  props: { TIC: tic, "depth (ppt)": 1.2, "duration (hours)": 2.5, SNR: 11, "period (days)": 7.3, "first transit (BTJD)": 1400.2 } });

describe("advanceSweep", () => {
  it("runs tiles two at a time, collects their finds and stops at the budget", async () => {
    const store = fileStore(mkdtempSync(join(tmpdir(), "sweep-")));
    const started: string[] = [];
    const opts = { start: async (id: string) => { started.push(id); }, maxRunning: 3 };
    const sweep = newSweep("sweep01", { ra: 90, dec: -66.56, radius: 8 }, 1, false);
    expect(sweep.sweep!.tiles.length).toBeGreaterThan(3);
    await store.create(sweep);

    expect(await advanceSweep(store, "sweep01", "a", opts)).toBe("continue");
    expect(started).toHaveLength(2);
    const child = (await store.get(started[0]))!.summary;
    expect(child.sweepId).toBe("sweep01");
    expect(child.usdCap).toBeCloseTo(0.5);

    // The first tile finishes with a find; cheap so far.
    await store.lease(started[0], "w", Date.now() + 60_000);
    await store.save(started[0], "w", { summary: { ...child, status: "done", finds: 1, usd: 0.04, fnMs: 600_000 }, notes: [], objects: [find("C1")] }, []);
    expect(await advanceSweep(store, "sweep01", "a", opts)).toBe("continue");
    expect(started).toHaveLength(3);
    let row = (await store.get("sweep01"))!;
    expect(row.objects.map((o) => o.id)).toEqual(["T1·C1"]);
    expect(row.summary.sweep!.claudeUsd).toBeCloseTo(0.04);
    expect(row.summary.sweep!.computeUsd).toBeCloseTo(computeUsd(600_000));

    // The second tile's compute blows the budget: the running tiles stop and the sweep ends.
    const second = (await store.get(started[1]))!.summary;
    await store.lease(started[1], "w", Date.now() + 60_000);
    await store.save(started[1], "w", { summary: { ...second, fnMs: 10 * 3_600_000 }, notes: [], objects: [] }, []);
    expect(await advanceSweep(store, "sweep01", "a", opts)).toBe("done");
    row = (await store.get("sweep01"))!;
    expect(row.summary.sweep!.budgetHit).toBe(true);
    expect((await store.get(started[2]))!.summary.status).toBe("stopped");
    expect(row.notes.some((n) => /Budget of \$1\.00 reached/.test(n.text))).toBe(true);
    expect(started).toHaveLength(3);
  });

  it("restarts a tile whose step chain broke", async () => {
    const store = fileStore(mkdtempSync(join(tmpdir(), "sweep-")));
    const started: string[] = [];
    const opts = { start: async (id: string) => { started.push(id); }, maxRunning: 3 };
    await store.create(newSweep("sweep03", { ra: 0, dec: 0, radius: 10 }, 5, false));
    await advanceSweep(store, "sweep03", "a", opts);
    const [first] = started;
    const child = (await store.get(first))!.summary;
    await store.lease(first, "w", Date.now() + 60_000);
    await store.save(first, "w", { summary: { ...child, updatedAt: Date.now() - 10 * 60_000 }, notes: [], objects: [] }, []);
    await store.release(first, "w");
    await advanceSweep(store, "sweep03", "a", opts);
    expect(started.filter((id) => id === first)).toHaveLength(2);
  });

  it("waits for room when the deployment is at its running-survey limit", async () => {
    const store = fileStore(mkdtempSync(join(tmpdir(), "sweep-")));
    await store.create(newSummary("other01", { ra: 0, dec: 0, radius: 1 }, false));
    await store.create(newSweep("sweep02", { ra: 0, dec: 0, radius: 10 }, 5, false));
    const started: string[] = [];
    expect(await advanceSweep(store, "sweep02", "a", { start: async (id) => { started.push(id); }, maxRunning: 1 })).toBe("idle");
    expect(started).toHaveLength(0);
  });

  it("vets finds as they show up, one at a time, through renumbering, then reviews and finishes", async () => {
    const store = fileStore(mkdtempSync(join(tmpdir(), "sweep-")));
    const started: string[] = [], vetted: string[] = [];
    const opts = { start: async (id: string) => { started.push(id); }, vet: async (key: string) => { vetted.push(key); }, maxRunning: 3 };
    await store.create(newSweep("sweep04", { ra: 10, dec: 20, radius: 2 }, 5, false));
    await advanceSweep(store, "sweep04", "a", opts);
    const tile = started[0];
    const child = (await store.get(tile))!.summary;
    const save = async (status: "running" | "done", objects: SkyObject[]) => {
      await store.lease(tile, "w", Date.now() + 60_000);
      await store.save(tile, "w", { summary: { ...child, status, finds: objects.length, updatedAt: Date.now() }, notes: [], objects }, []);
      await store.release(tile, "w");
    };

    // The tile is still searching and has one transit find and a variable: the transit is sent for vetting at once.
    await save("running", [transit("C1", "11"), find("V1")]);
    expect(await advanceSweep(store, "sweep04", "a", opts)).toBe("continue");
    expect(vetted).toEqual(["v1"]);
    let row = (await store.get("sweep04"))!;
    expect(row.objects.find((o) => o.id === "T1·C1")!.props.vet).toBe("vetting");
    expect(row.objects.find((o) => o.id === "T1·V1")!.props.vet).toBeUndefined(); // not a transit: not vetted

    // A stronger signal turns up and takes C1: TIC 11's find is now C2, still matched to its vet.
    await save("running", [transit("C1", "22"), transit("C2", "11"), find("V1")]);
    expect(await advanceSweep(store, "sweep04", "a", opts)).toBe("continue");
    expect(vetted).toEqual(["v1"]); // one at a time (SKY_SWEEP_VET_CONCURRENCY)
    row = (await store.get("sweep04"))!;
    expect(row.objects.find((o) => o.id === "T1·C2")!.props.vet).toBe("vetting");
    expect(row.objects.find((o) => o.id === "T1·C1")!.props.vet).toBe("queued");

    expect(await recordSweepVet(store, "sweep04", "v", "v1", { tier: "X", reason: "secondary eclipse", ms: 60_000 })).toBe(true);
    expect((await store.get("sweep04"))!.objects.find((o) => o.id === "T1·C2")!.props).toMatchObject({ vet: "X", vetted: "tier X: secondary eclipse" });
    expect(await advanceSweep(store, "sweep04", "a", opts)).toBe("continue");
    expect(vetted).toEqual(["v1", "v2"]);
    await recordSweepVet(store, "sweep04", "v", "v2", { tier: "B", reason: "only 2 transits", ms: 30_000 });

    // The tile finishes; nothing is left to vet, so the sweep finishes.
    await save("done", [transit("C1", "22"), transit("C2", "11"), find("V1")]);
    expect(await advanceSweep(store, "sweep04", "a", opts)).toBe("done");
    row = (await store.get("sweep04"))!;
    expect(row.objects.find((o) => o.id === "T1·C1")!.props.vet).toBe("B");
    expect(row.summary.sweep!.vetMs).toBe(90_000);
    expect(row.summary.sweep!.computeUsd).toBeCloseTo(computeUsd(90_000));
    expect(row.notes.at(-1)!.text).toMatch(/2 vetted: 1 tier B, 1 tier X/);
    expect(vetted).toEqual(["v1", "v2"]);
  });

  it("vets a viable find again when its first vet couldn't reach an archive, and waits for it before finishing", async () => {
    const store = fileStore(mkdtempSync(join(tmpdir(), "sweep-")));
    const started: string[] = [], vetted: string[] = [];
    const opts = { start: async (id: string) => { started.push(id); }, vet: async (key: string) => { vetted.push(key); }, maxRunning: 3 };
    await store.create(newSweep("sweep05", { ra: 10, dec: 20, radius: 2 }, 5, false));
    await advanceSweep(store, "sweep05", "a", opts);
    const tile = started[0], child = (await store.get(tile))!.summary;
    await store.lease(tile, "w", Date.now() + 60_000);
    await store.save(tile, "w", { summary: { ...child, status: "done", finds: 1 }, notes: [], objects: [transit("C1", "11")] }, []);
    await store.release(tile, "w");
    await advanceSweep(store, "sweep05", "a", opts);
    await recordSweepVet(store, "sweep05", "v", "v1", { tier: "C", reason: "a single transit", gaps: ["Multiplicity"], ms: 1000 });

    // Not finished: the find still owes a re-vet, due an hour after the first.
    expect(await advanceSweep(store, "sweep05", "a", opts)).toBe("continue");
    expect(vetted).toEqual(["v1"]);
    const row = (await store.get("sweep05"))!;
    await store.lease("sweep05", "x", Date.now() + 60_000);
    const sw = row.summary.sweep!;
    await store.save("sweep05", "x", { ...row, summary: { ...row.summary, sweep: { ...sw, vets: { v1: { ...sw.vets!.v1, finishedAt: Date.now() - 2 * 3_600_000 } } } } }, []);
    await store.release("sweep05", "x");
    await advanceSweep(store, "sweep05", "a", opts);
    expect(vetted).toEqual(["v1", "v1"]);
    expect((await store.get("sweep05"))!.summary.sweep!.vets!.v1.revets).toBe(1);

    await recordSweepVet(store, "sweep05", "v", "v1", { tier: "C", reason: "a single transit", gaps: [], ms: 1000 });
    expect(await advanceSweep(store, "sweep05", "a", opts)).toBe("done");
    expect((await store.get("sweep05"))!.notes.some((n) => /again \(an archive was unreachable/.test(n.text))).toBe(true);
  });
});
