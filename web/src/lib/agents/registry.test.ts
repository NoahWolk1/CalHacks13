import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentConfig } from "@/lib/types";
import { createLibrary } from "./library";
import { createRegistry } from "./registry";

const cfg = (id: string): AgentConfig => ({
  id, name: "Inspection Scout", description: "SF restaurant health inspection scores", vehicle: "rover", color: "#e879f9",
  tools: ["search", "http_get", "llm"], dataSources: ["DataSF"], coverage: "San Francisco", builtin: false, prompt: "Find scores", createdBy: "orchestrator",
});

let path: string;
const fresh = () => createRegistry(createLibrary(path));
beforeEach(() => { path = join(mkdtempSync(join(tmpdir(), "reg-")), "agents.json"); });

describe("registry", () => {
  it("lists the built-in workers", () => {
    expect(fresh().allWorkers().some((w) => w.id === "fema-flood")).toBe(true);
  });

  it("keeps spawned agents out of the roster until they are kept", () => {
    const r = fresh();
    r.registerTemporary(cfg("custom-a"));
    expect(r.allWorkers().some((w) => w.id === "custom-a")).toBe(false);
    expect(r.getWorker("custom-a")).toMatchObject({ id: "custom-a", temporary: true });
  });

  it("keep moves a spawned agent into the saved library", () => {
    const r = fresh();
    r.registerTemporary(cfg("custom-a"));
    expect(r.keepAgent("custom-a")).toMatchObject({ id: "custom-a", temporary: false });
    expect(r.allWorkers().find((w) => w.id === "custom-a")?.temporary).toBe(false);
    expect(fresh().allWorkers().some((w) => w.id === "custom-a")).toBe(true); // survives restart
  });

  it("keep of an unknown id returns null", () => {
    expect(fresh().keepAgent("custom-nope")).toBeNull();
  });

  it("discard forgets a spawned agent", () => {
    const r = fresh();
    r.registerTemporary(cfg("custom-a"));
    expect(r.deleteAgent("custom-a")).toBe(true);
    expect(r.getWorker("custom-a")).toBeUndefined();
  });

  it("saves and deletes custom agents", () => {
    const r = fresh();
    r.saveAgent(cfg("custom-b"));
    expect(fresh().getWorker("custom-b")).toBeDefined();
    expect(r.deleteAgent("custom-b")).toBe(true);
    expect(fresh().getWorker("custom-b")).toBeUndefined();
  });

  it("never deletes built-ins", () => {
    expect(fresh().deleteAgent("fema-flood")).toBe(false);
    expect(fresh().getWorker("fema-flood")).toBeDefined();
  });
});
