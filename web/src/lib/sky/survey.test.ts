import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { coverageOf, duotransitAliases, newSummary, nextSeason, runSurveyStep, surveyObjects } from "./survey";
import { fileStore, LeaseLost, type SurveyField } from "./surveyStore";
import { seasonsFor, type LcProduct } from "./lightcurves";
import type { SurveySeason, SurveyStar, TransitSignal } from "./types";

// Downloads fail in these tests (no MAST); the rest of the analysis module is real.
const downloads = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./analysis", async (orig) => ({
  ...(await orig<typeof import("./analysis")>()),
  download: async () => { downloads.calls++; return { lcs: [], errors: ["timed out after 10s"] }; },
}));

const field: SurveyField = { known: [], neighbours: [], vsx: [], unchecked: [] };
const sig = (period: number, snr = 12, depth = 1e-3): TransitSignal => ({ period, t0: 3000.1, duration: 0.12, depth, snr, sde: 12, transits: 5, oddEven: 0, oddEvenSigma: 0, secondary: 0, secondarySigma: 0, detected: true });
const season = (sectors: number[], from: number, extra: Partial<SurveySeason> = {}): SurveySeason => ({
  sectors, pipeline: "SPOC", files: [], status: "ok", days: 27 * sectors.length, coverage: sectors.map((_, i) => [from + 27.4 * i, from + 27.4 * i + 26] as [number, number]),
  signals: [], singles: [], radius: 1, logg: 4.44, ...extra,
});
const star = (tic: string, seasons: SurveySeason[], extra: Partial<SurveyStar> = {}): SurveyStar => ({
  tic, name: `TIC ${tic}`, otype: "", ra: 10 + Number(tic) * 0.1, dec: 20, priority: 1, playbook: "long-period", why: "", masked: [], masks: [], seasons, ...extra,
});

describe("deep-survey seasons", () => {
  it("groups every sector into seasons of nearby sectors, best pipeline per sector, latest first", () => {
    const p = (sector: number, pipeline: LcProduct["pipeline"]): LcProduct => ({ tic: "1", sector, pipeline, cadence: 0, uri: `${pipeline}-${sector}` });
    const s = seasonsFor([p(1, "QLP"), p(1, "SPOC"), p(2, "QLP"), p(3, "QLP"), p(4, "QLP"), p(5, "QLP"), p(30, "TESS-SPOC"), p(31, "QLP")], "1");
    expect(s.map((g) => g.map((x) => `${x.pipeline}${x.sector}`))).toEqual([["TESS-SPOC30", "QLP31"], ["QLP5"], ["SPOC1", "QLP2", "QLP3", "QLP4"]]);
  });
  it("records covered time ranges, split at gaps", () => {
    const time = Float64Array.from([1, 1.05, 1.1, 2, 2.05, 2.1, 2.15]);
    expect(coverageOf([{ time, flux: new Float64Array(7).fill(1), quality: new Float64Array(7) }])).toEqual([[1, 1.1], [2, 2.15]]);
  });
  it("searches the highest-priority star's pending seasons first", () => {
    const a = star("1", [season([1], 1000), { ...season([2], 1030), status: "pending" }]);
    const b = star("2", [{ ...season([1], 1000), status: "pending" }], { priority: 5 });
    expect(nextSeason([a, b], new Set())).toMatchObject({ star: b, index: 0 });
    expect(nextSeason([a, b], new Set(["2:0"]))).toMatchObject({ star: a, index: 1 });
  });
});

describe("duotransit periods", () => {
  it("keeps only periods whose other transits fall in gaps", () => {
    // Dips at 1005 and 1105 (100 d apart); TESS watched 1000-1027 and 1100-1127 only.
    const cov: [number, number][] = [[1000, 1027], [1100, 1127]];
    const p = duotransitAliases(1005, 1105, 0.2, cov);
    expect(p[0]).toBe(100);
    expect(p).toContain(50); // the middle transit at 1055 is in the gap
    expect(p.some((x) => x < 22)).toBe(false); // anything shorter repeats inside a sector
    expect(p.every((x) => [1, 2].every((k) => !cov.some(([a, b]) => 1005 + k * x > a + 0.1 && 1005 + k * x < b - 0.1) || 1005 + k * x === 1105))).toBe(true);
  });
});

describe("survey finds across seasons", () => {
  it("clusters a signal seen in two seasons and notes one missed where it should show", () => {
    const s1 = star("1", [season([10], 2000, { signals: [sig(3.21)] }), season([40], 2900, { signals: [sig(3.2101, 9)] })]);
    const s2 = star("2", [season([10], 2000, { signals: [sig(5.5)] }), season([40], 2900)]);
    const { objects, candidates } = surveyObjects([s1, s2], field);
    const a = objects.find((o) => o.props.TIC === "1")!;
    expect(a.type).toBe("Unvetted transit candidate · seen in 2 seasons");
    const b = objects.find((o) => o.props.TIC === "2")!;
    expect(b.type).toBe("Unvetted transit candidate · other seasons not checked yet");
    expect(String(b.props["at the period in other seasons"])).toMatch(/s40: not checked yet/);
    expect(candidates).toBe(2);
  });
  it("labels other seasons by the forced check at the period, not by the blind search", () => {
    const f = (result: "recovered" | "weak" | "absent", depth: number) => ({ forced: [{ period: 5.5003, depth, err: 1e-4, snr: depth / 1e-4, transits: 4, result }] });
    const label = (other: Partial<SurveySeason>) => surveyObjects([star("2", [season([10], 2000, { signals: [sig(5.5)] }), season([40], 2900, other)])], field).objects[0];
    expect(label(f("recovered", 9e-4)).type).toBe("Unvetted transit candidate · seen in 2 seasons");
    expect(label(f("weak", 4e-4)).type).toBe("Unvetted transit candidate · weak in 1 other season");
    const absent = label(f("absent", 1e-5));
    expect(absent.type).toBe("Unvetted transit candidate · absent in 1 other season");
    expect(String(absent.props["not recovered"])).toMatch(/40: should show at 1000 ppm/);
  });
  it("queues searched seasons that still have to measure another season's signal", () => {
    const a = star("1", [season([10], 2000, { signals: [sig(3.21)] }), season([40], 2900)]);
    expect(nextSeason([a], new Set())).toMatchObject({ star: a, index: 1, recheck: true });
    a.seasons[1].forced = [{ period: 3.21, depth: 0, err: 0, snr: 0, transits: 0, result: "inconclusive" }];
    expect(nextSeason([a], new Set())).toBeNull();
  });
  it("pairs two lone dips into a duotransit with possible periods", () => {
    const s1 = star("1", [season([10], 2000, { singles: [{ t: 2010, duration: 0.2, depth: 2e-3, snr: 11 }] }), season([40], 2900, { singles: [{ t: 2910, duration: 0.2, depth: 1.8e-3, snr: 10 }] })]);
    const { objects, finds } = surveyObjects([s1], field);
    const o = objects[0];
    expect(o.type).toBe("Duotransit candidate");
    expect(finds).toBe(1); // a duotransit is a new find, not a rejected result
    expect(Number(o.props["possible periods"])).toBeGreaterThan(0);
    expect(String(o.props["longest possible periods (days)"]).startsWith("900.00")).toBe(true);
  });
  it("calls dips on several stars at once systematic, not a duotransit", () => {
    const dip = (t: number) => ({ t, duration: 0.2, depth: 2e-3, snr: 11 });
    const s1 = star("1", [season([10], 2000, { singles: [dip(2010), dip(2020)] })]);
    const s2 = star("2", [season([10], 2000, { singles: [dip(2010.1), dip(2020.2)] })]);
    const { objects, finds } = surveyObjects([s1, s2], field);
    expect(objects.every((o) => o.type.startsWith("Likely systematic"))).toBe(true);
    expect(finds).toBe(0);
  });
  it("reports an uncatalogued variable seen in two seasons", () => {
    const ls = { period: 0.8, amplitude: 2e-3, power: 0.5, fap: 1e-12, variable: true };
    const o = surveyObjects([star("1", [season([10], 2000, { ls }), season([40], 2900, { ls: { ...ls, period: 0.801 } })])], field).objects[0];
    expect(o.type).toMatch(/^Uncatalogued variable: .* · seen in 2 seasons$/);
  });
});

describe("survey steps and the file store", () => {
  const cone = { ra: 10, dec: 20, radius: 0.3 };
  it("holds one lease at a time and refuses saves without it", async () => {
    const store = fileStore(mkdtempSync(join(tmpdir(), "survey-")));
    const sum = newSummary("abcdef1", cone, false);
    await store.create(sum);
    expect(await store.lease("abcdef1", "a", Date.now() + 60_000)).toBe(true);
    expect(await store.lease("abcdef1", "b", Date.now() + 60_000)).toBe(false);
    await expect(store.save("abcdef1", "b", { summary: sum, notes: [], objects: [] }, [])).rejects.toBeInstanceOf(LeaseLost);
    await store.release("abcdef1", "a");
    expect(await store.lease("abcdef1", "b", Date.now() + 60_000)).toBe(true);
    // An expired lease can be taken over.
    await store.lease("abcdef1", "b", Date.now() - 1);
    expect(await store.lease("abcdef1", "c", Date.now() + 60_000)).toBe(true);
  });
  it("finishes a survey with nothing pending, and a stop wins over a running step's save", async () => {
    const store = fileStore(mkdtempSync(join(tmpdir(), "survey-")));
    const sum = { ...newSummary("abcdef2", cone, false), planned: true };
    await store.create(sum);
    await store.lease("abcdef2", "setup", Date.now() + 60_000);
    await store.save("abcdef2", "setup", { summary: sum, notes: [], objects: [], field }, [star("1", [season([10], 2000, { signals: [sig(3.2)] })])]);
    await store.release("abcdef2", "setup");
    expect(await runSurveyStep(store, "abcdef2", "w1", { budgetMs: 60_000 })).toBe("done");
    const row = await store.get("abcdef2");
    expect(row!.summary).toMatchObject({ status: "done", seasonsDone: 1, finds: 1, steps: 1 });
    expect(row!.objects[0].type).toMatch(/^Unvetted/);

    const s3 = { ...newSummary("abcdef3", cone, false), planned: true };
    await store.create(s3);
    await store.lease("abcdef3", "w", Date.now() + 60_000);
    expect(await store.stop("abcdef3")).toBe(true);
    expect(await store.save("abcdef3", "w", { summary: s3, notes: [], objects: [] }, [])).toBe("stopped");
    expect(await runSurveyStep(store, "abcdef3", "w2")).toBe("busy"); // not running: no lease
  });
  it("gives a season whose download failed one more try before counting it failed", async () => {
    const store = fileStore(mkdtempSync(join(tmpdir(), "survey-")));
    const sum = { ...newSummary("abcdef4", cone, false), planned: true };
    await store.create(sum);
    await store.lease("abcdef4", "setup", Date.now() + 60_000);
    const pending = season([69], 3000, { status: "pending", files: [{ sector: 69, pipeline: "SPOC", uri: "mast:x" }] });
    await store.save("abcdef4", "setup", { summary: sum, notes: [], objects: [], field }, [star("1", [pending])]);
    await store.release("abcdef4", "setup");
    downloads.calls = 0;
    expect(await runSurveyStep(store, "abcdef4", "w1", { budgetMs: 60_000 })).toBe("done");
    expect(downloads.calls).toBe(2);
    const [s] = await store.stars("abcdef4");
    expect(s.seasons[0]).toMatchObject({ status: "error", tries: 1 });
    expect((await store.get("abcdef4"))!.summary).toMatchObject({ seasonsFailed: 1 });
  });
});

describe("duotransit with a third dip", () => {
  it("pins the period when another dip falls on one of the allowed periods", () => {
    const dip = (t: number) => ({ t, duration: 0.2, depth: 2e-3, snr: 11 });
    // Dips at 2010, 2910 and 2610 (600 = 2 x 300 after the first): only periods dividing both gaps survive.
    const s1 = star("1", [season([10], 2000, { singles: [dip(2010)] }), season([30], 2600, { singles: [dip(2610)] }), season([40], 2900, { singles: [dip(2910)] })]);
    const o = surveyObjects([s1], field).objects[0];
    expect(o.type).toBe("Duotransit candidate");
    expect(o.props["third dip"]).toBeTruthy();
    expect(String(o.props["longest possible periods (days)"]).split(", ").every((p) => Math.abs(600 / Number(p) - Math.round(600 / Number(p))) < 0.01)).toBe(true);
    expect(surveyObjects([s1], field).objects).toHaveLength(1);
  });
});
