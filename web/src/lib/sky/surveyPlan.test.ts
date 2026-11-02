import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { newSummary, runSurveyStep } from "./survey";
import { fileStore } from "./surveyStore";

// The archives, faked: SIMBAD's star list is down for the first two plans, then answers.
const archive = vi.hoisted(() => ({ simbadDownFor: 2, plans: 0 }));
vi.mock("./lightcurves", async (orig) => ({
  ...(await orig<typeof import("./lightcurves")>()),
  surveyInventory: async () => {
    const up = archive.plans++ >= archive.simbadDownFor;
    return { stars: [], products: [], simbad: up, notes: up ? [] : ["SIMBAD star list failed (timed out): SPOC 2-min targets only"] };
  },
}));
vi.mock("./vetting", async (orig) => ({ ...(await orig<typeof import("./vetting")>()), knownPlanetsNear: async () => [], toisNear: async () => [], ebNeighbours: async () => [] }));
vi.mock("./vsx", async (orig) => ({ ...(await orig<typeof import("./vsx")>()), variablesNear: async () => [] }));
vi.mock("./hostStar", async (orig) => ({ ...(await orig<typeof import("./hostStar")>()), ctoiSignals: async () => [] }));

describe("planning a sweep tile through an archive outage", () => {
  it("plans again instead of keeping a reduced star list, then plans once the archive answers", async () => {
    const store = fileStore(mkdtempSync(join(tmpdir(), "plan-")));
    await store.create(newSummary("tile001", { ra: 10, dec: 20, radius: 1 }, false, { sweepId: "sweep01" }));
    const step = () => runSurveyStep(store, "tile001", "w", { budgetMs: 10_000, planWaitMs: 1 });

    expect(await step()).toBe("continue");
    let s = (await store.get("tile001"))!.summary;
    expect(s.planned).toBe(false);
    expect(s.note).toMatch(/SIMBAD star list unavailable: planning again \(try 1 of 12\)/);
    expect(await step()).toBe("continue");
    expect((await store.get("tile001"))!.summary.planned).toBe(false);

    await step();
    s = (await store.get("tile001"))!.summary;
    expect(s.planned).toBe(true);
    expect(archive.plans).toBe(3);
    expect(s.note).toBe("No star in this cone has a TESS light curve at MAST.");
  });

  it("keeps a single survey's reduced plan (someone is waiting on it)", async () => {
    archive.plans = 0;
    const store = fileStore(mkdtempSync(join(tmpdir(), "plan-")));
    await store.create(newSummary("solo001", { ra: 10, dec: 20, radius: 1 }, false));
    await runSurveyStep(store, "solo001", "w", { budgetMs: 10_000, planWaitMs: 1 });
    expect((await store.get("solo001"))!.summary.planned).toBe(true);
  });
});
