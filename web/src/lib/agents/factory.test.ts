import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLibrary } from "./library";
import { createRegistry, type Registry } from "./registry";
import { draftAgent, requestSpawn, SPAWN_LIMITS, type Generated } from "./factory";

const created = (over: Partial<Generated> = {}): Generated => ({
  decision: "create", reuse_id: "", name: "Inspection Scout", description: "Pins SF restaurant health inspection scores.",
  tools: ["search", "http_get"], data_sources: ["DataSF restaurant inspections"], coverage: "San Francisco",
  vehicle: "rover", color: "#e879f9", prompt: "Find recent health inspection scores for restaurants in the area.", ...over,
});

let registry: Registry;
beforeEach(() => { registry = createRegistry(createLibrary(join(mkdtempSync(join(tmpdir(), "fac-")), "agents.json"))); });
const spec = { prompt: "health inspection scores for restaurants", createdBy: "orchestrator", depth: 1 };

describe("draftAgent", () => {
  it("returns null when there is no LLM", async () => {
    expect(await draftAgent(spec, { registry, generate: async () => null })).toBeNull();
  });

  it("shows the generator the current library", async () => {
    const generate = vi.fn(async () => created());
    await draftAgent(spec, { registry, generate });
    expect((generate.mock.calls[0] as unknown[])[1]).toContain("fema-flood");
  });

  it("reuses an existing agent when the generator picks one", async () => {
    const out = await draftAgent(spec, { registry, generate: async () => created({ decision: "reuse", reuse_id: "sf-311" }) });
    expect(out).toMatchObject({ kind: "reuse", worker: { id: "sf-311" } });
  });

  it("creates instead when the reuse id doesn't exist", async () => {
    const out = await draftAgent(spec, { registry, generate: async () => created({ decision: "reuse", reuse_id: "made-up" }) });
    expect(out?.kind).toBe("new");
  });

  it("builds a valid custom config", async () => {
    const out = await draftAgent(spec, { registry, generate: async () => created({ color: "teal", tools: ["http_get"] }) });
    expect(out?.kind).toBe("new");
    if (out?.kind !== "new") return;
    expect(out.config).toMatchObject({ id: "custom-inspection-scout", builtin: false, createdBy: "orchestrator", dataSources: ["DataSF restaurant inspections"] });
    expect(out.config.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(out.config.tools).toEqual(expect.arrayContaining(["http_get", "geocode", "llm"]));
  });

  it("gives a fresh id when the name is taken", async () => {
    const first = await draftAgent(spec, { registry, generate: async () => created() });
    if (first?.kind === "new") registry.saveAgent(first.config);
    const out = await draftAgent(spec, { registry, generate: async () => created() });
    expect(out?.kind === "new" && out.config.id).toBe("custom-inspection-scout-2");
  });
});

describe("draftAgent advanced", () => {
  const advanced = {
    name: "Permit Hawk", coverage: "Oakland", tools: ["scrape" as const], vehicle: "drone" as const, color: "#123456",
    dataSources: ["https://data.oaklandca.gov/permits"], criteria: "Only permits over $1M", forceNew: true,
  };

  it("passes the requirements to the generator", async () => {
    const generate = vi.fn(async () => created());
    await draftAgent({ ...spec, advanced }, { registry, generate });
    const request = (generate.mock.calls[0] as unknown[])[0] as string;
    expect(request).toContain("Only permits over $1M");
    expect(request).toContain("https://data.oaklandca.gov/permits");
  });

  it("overrides the generator with the user's hard choices", async () => {
    const out = await draftAgent({ ...spec, advanced }, { registry, generate: async () => created() });
    if (out?.kind !== "new") throw new Error("expected new");
    expect(out.config).toMatchObject({ name: "Permit Hawk", coverage: "Oakland", vehicle: "drone", color: "#123456" });
    expect(out.config.tools).toEqual(["scrape", "osm", "geocode", "llm"]);
    expect(out.config.dataSources[0]).toBe("https://data.oaklandca.gov/permits");
  });

  it("creates even when the generator wants to reuse, if forceNew", async () => {
    const out = await draftAgent({ ...spec, advanced }, { registry, generate: async () => created({ decision: "reuse", reuse_id: "sf-311" }) });
    expect(out?.kind).toBe("new");
  });
});

describe("requestSpawn", () => {
  it("registers a new agent as temporary", async () => {
    const out = await requestSpawn(spec, 0, { registry, generate: async () => created() });
    expect(out).toMatchObject({ reused: false, worker: { id: "custom-inspection-scout", temporary: true } });
    expect(registry.getWorker("custom-inspection-scout")).toBeDefined();
    expect(registry.allWorkers().some((w) => w.id === "custom-inspection-scout")).toBe(false);
  });

  it("returns the existing worker on reuse", async () => {
    const out = await requestSpawn(spec, 0, { registry, generate: async () => created({ decision: "reuse", reuse_id: "sf-311" }) });
    expect(out).toMatchObject({ reused: true, worker: { id: "sf-311" } });
  });

  it("enforces the depth and per-run limits", async () => {
    const generate = vi.fn(async () => created());
    expect(await requestSpawn({ ...spec, depth: SPAWN_LIMITS.maxDepth + 1 }, 0, { registry, generate })).toBeNull();
    expect(await requestSpawn(spec, SPAWN_LIMITS.maxPerRun, { registry, generate })).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });
});
