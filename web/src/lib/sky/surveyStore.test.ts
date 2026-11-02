import { mkdtempSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newSummary } from "./survey";
import { fileStore, LIST_ALL } from "./surveyStore";

describe("file store listing", () => {
  it("lists from the small summary files, rebuilding one written before them", async () => {
    const dir = mkdtempSync(join(tmpdir(), "store-"));
    const store = fileStore(dir);
    await store.create(newSummary("first01", { ra: 0, dec: 0, radius: 1 }, false));
    await store.create({ ...newSummary("second1", { ra: 1, dec: 0, radius: 1 }, false), createdAt: Date.now() + 1 });
    await store.lease("first01", "w", Date.now() + 60_000);
    await store.save("first01", "w", { summary: { ...(await store.get("first01"))!.summary, seasonsDone: 7 }, notes: [], objects: [] }, []);
    expect(readdirSync(dir).filter((f) => f.endsWith(".summary")).sort()).toEqual(["first01.summary", "second1.summary"]);

    unlinkSync(join(dir, "first01.summary"));
    const all = await store.list(LIST_ALL);
    expect(all.map((s) => s.id)).toEqual(["second1", "first01"]);
    expect(all[1].seasonsDone).toBe(7);
    expect(readdirSync(dir)).toContain("first01.summary");
  });
});

describe("vet gaps", () => {
  it("counts checks that couldn't reach their service, not ones that had too little signal", async () => {
    const { vetGaps } = await import("./vetShared");
    const check = (name: string, status: "not-run" | "flag" | "pass", detail: string) => ({ id: name, stage: 2 as const, name, status, detail });
    expect(vetGaps({ checks: [
      check("Multiplicity", "not-run", "partly run: no sign of a companion in ExoFOP, but Gaia DR3 wasn't checked (This operation was aborted)"),
      check("Unresolved companions", "not-run", "Gaia unavailable"),
      check("Difference imaging", "not-run", "TESScut cutouts unavailable (s12: The operation was aborted due to timeout)"),
      check("Already catalogued", "not-run", "partly run: not in the catalogs that answered, but AAVSO VSX didn't, so it may already be known there"),
      check("Transit shape", "not-run", "SNR 6 is too low to tell a V from a U"),
      check("Ground photometry (ZTF archive)", "not-run", "the star (G 8) saturates ZTF (G < 12.5)"),
      check("Transit shape", "not-run", "the trapezoid fit didn't converge"),
      check("Secondary eclipse", "not-run", "the single-event scan didn't run"),
    ] })).toEqual(["Multiplicity", "Unresolved companions", "Difference imaging", "Already catalogued"]);
  });
});

describe("file store layout", () => {
  it("keeps stars in their own file, and splits a survey saved the old way on its first lease", async () => {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const dir = mkdtempSync(join(tmpdir(), "store-"));
    const store = fileStore(dir);
    const summary = newSummary("legacy1", { ra: 0, dec: 0, radius: 1 }, false);
    const star = { tic: "7", name: "TIC 7", otype: "", ra: 0, dec: 0, priority: 1, playbook: "census" as const, why: "", masked: [], masks: [], seasons: [] };
    writeFileSync(join(dir, "legacy1.json"), JSON.stringify({ summary, notes: [], objects: [], field: null, leaseOwner: "", leaseUntil: 0, stars: { 7: star } }));

    expect((await store.stars("legacy1")).map((s) => s.tic)).toEqual(["7"]);
    expect(await store.lease("legacy1", "w", Date.now() + 60_000)).toBe(true);
    expect(JSON.parse(readFileSync(join(dir, "legacy1.json"), "utf8")).stars).toBeUndefined();
    expect((await store.stars("legacy1")).map((s) => s.tic)).toEqual(["7"]);

    // A save without changed stars leaves the stars file alone; one with stars merges them in.
    await store.save("legacy1", "w", { summary, notes: [], objects: [] }, []);
    await store.save("legacy1", "w", { summary, notes: [], objects: [] }, [{ ...star, tic: "8", name: "TIC 8" }]);
    expect((await store.stars("legacy1")).map((s) => s.tic).sort()).toEqual(["7", "8"]);
    expect((await store.list(LIST_ALL)).map((s) => s.id)).toEqual(["legacy1"]);
  });
});
