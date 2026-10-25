import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Worker, WorkerContext } from "@/lib/types";
import { regionFromBox } from "@/lib/geo";
import { arcgisCount, arcgisQuery } from "./kit";
import { groundHazardsWorker } from "./groundHazards";
import { seaLevelWorker } from "./seaLevel";

vi.mock("./kit", async (original) => ({
  ...await original<typeof import("./kit")>(),
  arcgisCount: vi.fn(),
  arcgisQuery: vi.fn(),
  osmTileLayers: vi.fn(async () => ({ water: [], poi: [] })),
}));
vi.mock("@/lib/http", () => ({ getJson: vi.fn(async () => ({ stations: [] })) }));

const region = regionFromBox([-122.42, 37.76], [-122.41, 37.77]);
const zone = { ...region.polygon, properties: {} };
const query = vi.mocked(arcgisQuery);
const count = vi.mocked(arcgisCount);

function capture(worker: Worker) {
  const emit = vi.fn<WorkerContext["emit"]>();
  const done = worker.run({ task: { region }, signal: new AbortController().signal, emit, log: vi.fn() });
  return { done, emit, findings: () => emit.mock.calls.map(([f]) => f) };
}

beforeEach(() => { vi.clearAllMocks(); query.mockReset(); count.mockReset(); });

describe("CGS query failures", () => {
  it("fails the worker without emitting an all-clear when all layers fail", async () => {
    query.mockRejectedValue(new Error("service unavailable"));
    const run = capture(groundHazardsWorker);
    await expect(run.done).rejects.toThrow("all layer queries failed");
    expect(run.emit).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable layer from successfully empty layers", async () => {
    query.mockImplementation(async (url) => {
      if (url.includes("Liquefaction")) throw new Error("service unavailable");
      return [];
    });
    const run = capture(groundHazardsWorker);
    await run.done;
    const summary = run.findings()[0];
    expect(summary.claim).toContain("Unavailable hazard layers: liquefaction");
    expect(summary.props).toMatchObject({ liquefaction: null, landslide: false, tsunami: false });
    expect(summary.props?.shareOfArea).not.toHaveProperty("liquefaction");
  });

  it("retains real hazard polygons when another layer fails", async () => {
    query.mockImplementation(async (url) => {
      if (url.includes("Liquefaction")) return [zone];
      throw new Error("service unavailable");
    });
    const run = capture(groundHazardsWorker);
    await run.done;
    expect(run.findings().some((f) => f.geometry.type === "Polygon" && f.category === "liquefaction")).toBe(true);
    expect(run.findings().at(-1)?.props).toMatchObject({ liquefaction: true, landslide: null, tsunami: null });
  });

  it("reports no mapped hazards when every layer succeeds with no intersections", async () => {
    query.mockResolvedValue([]);
    const run = capture(groundHazardsWorker);
    await run.done;
    expect(run.findings()[0].props).toMatchObject({ liquefaction: false, landslide: false, tsunami: false, unavailableHazards: [] });
    expect(run.findings()[0].claim).not.toContain("Unavailable");
  });
});

describe("sea-level scenario failures", () => {
  it("emits no inundation finding when every scenario is unavailable", async () => {
    count.mockRejectedValue(new Error("service unavailable"));
    const run = capture(seaLevelWorker);
    await run.done;
    expect(run.emit).not.toHaveBeenCalled();
  });

  it("does not turn a failed high-scenario count into a 4.9 ft all-clear", async () => {
    count.mockImplementation(async (url) => {
      if (url.endsWith("/13")) throw new Error("service unavailable");
      return 0;
    });
    const run = capture(seaLevelWorker);
    await run.done;
    expect(run.findings()[0].claim).toContain("Unavailable scenarios: 4.9 ft");
    expect(run.findings()[0].claim).not.toContain("even at 4.9 ft");
    expect(run.findings()[0].props?.landShare).toEqual({ 50: 0, 75: 0 });
  });

  it.each(["error", "empty"])("keeps positive counts unknown when the geometry response is %s", async (response) => {
    count.mockImplementation(async (url) => url.endsWith("/13") ? 1 : 0);
    if (response === "error") query.mockRejectedValue(new Error("download failed"));
    else query.mockResolvedValue([]);
    const run = capture(seaLevelWorker);
    await run.done;
    expect(run.findings()[0].claim).not.toContain("even at 4.9 ft");
    expect(run.findings()[0].props).toMatchObject({ unavailableScenariosCm: [150], landShare: { 50: 0, 75: 0 } });
    expect(run.findings()[0].props?.landShare).not.toHaveProperty("150");
  });

  it("keeps available flood geometry without claiming an unknown lower scenario is dry", async () => {
    count.mockImplementation(async (url) => {
      if (url.endsWith("/10")) throw new Error("service unavailable");
      return 1;
    });
    query.mockResolvedValue([zone]);
    const run = capture(seaLevelWorker);
    await run.done;
    const summary = run.findings().find((f) => f.props?.areaLevel);
    expect(run.findings().filter((f) => f.geometry.type === "Polygon")).toHaveLength(2);
    expect(summary?.claim).toContain("Unavailable scenarios: 1.6 ft");
    expect(summary?.props).toMatchObject({ firstFloodFt: null, unavailableScenariosCm: [50] });
    expect(summary?.props?.landShare).not.toHaveProperty("50");
  });

  it("preserves the all-clear when all three count queries succeed with zero", async () => {
    count.mockResolvedValue(0);
    const run = capture(seaLevelWorker);
    await run.done;
    expect(run.findings()[0].claim).toContain("even at 4.9 ft");
    expect(run.findings()[0].props?.landShare).toEqual({ 50: 0, 75: 0, 150: 0 });
  });
});
