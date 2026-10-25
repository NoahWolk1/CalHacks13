import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLibrary } from "./library";
import { createRegistry, type Registry } from "./registry";
import type Anthropic from "@anthropic-ai/sdk";
import { draftAgent, makeLlmGenerate, normalizeGenerated, requestSpawn, SPAWN_LIMITS, type Generated } from "./factory";

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

describe("generator hardening", () => {
  const wire = { ...created(), tools: ["http_get", "osm_features"], vehicle: "" } as unknown as Parameters<typeof normalizeGenerated>[0];

  it("normalizes loose output instead of failing the parse (empty vehicle, unknown tools)", () => {
    const g = normalizeGenerated(wire);
    expect(g.vehicle).toBe("drone");
    expect(g.tools).toEqual(["http_get"]);
    expect(normalizeGenerated({ ...wire, decision: "Reuse" }).decision).toBe("reuse");
  });

  const fakeClient = (results: (Error | { stop_reason: string; parsed_output: unknown })[]) => {
    const parse = vi.fn(async () => { const r = results.shift(); if (!r || r instanceof Error) throw r ?? new Error("none"); return r; });
    return { client: { beta: { messages: { parse } } } as unknown as Pick<Anthropic, "beta">, parse };
  };

  it("retries once with a shorter brief when the structured output fails, then succeeds", async () => {
    const { client, parse } = fakeClient([new Error("Failed to parse structured output"), { stop_reason: "end_turn", parsed_output: wire }]);
    const g = await makeLlmGenerate(() => client)("census", "- a | A | US | x");
    expect(g?.name).toBe("Inspection Scout");
    expect(parse).toHaveBeenCalledTimes(2);
    const [first, second] = parse.mock.calls as unknown as { system: string }[][];
    expect(second[0].system.length).toBeLessThan(first[0].system.length);
  });

  it("does not trust parsed output from a truncated reply, and reports why after two failures", async () => {
    const { client } = fakeClient([{ stop_reason: "max_tokens", parsed_output: wire }, { stop_reason: "refusal", parsed_output: null }]);
    await expect(makeLlmGenerate(() => client)("census", "")).rejects.toThrow(/failed twice.*refusal/);
  });

  it("returns null without a client", async () => {
    expect(await makeLlmGenerate(() => null)("x", "")).toBeNull();
  });

  it("asks again for a real design when it picks an unavailable agent and leaves the design blank", async () => {
    const blank = created({ decision: "reuse", reuse_id: "census-demographics", name: "", prompt: "", tools: [] });
    const generate = vi.fn().mockResolvedValueOnce(blank).mockResolvedValueOnce(created({ name: "Census Tracker" }));
    const out = await draftAgent(spec, { registry, generate });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(String(generate.mock.calls[1][0])).toMatch(/not available/);
    expect(out?.kind === "new" && out.config.name).toBe("Census Tracker");
  });
});
