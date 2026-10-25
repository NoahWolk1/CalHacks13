import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentConfig } from "@/lib/types";
import { createLibrary } from "./library";

const agent = (id: string): AgentConfig => ({
  id, name: "Inspection Scout", description: "SF restaurant health inspection scores", vehicle: "rover", color: "#e879f9",
  tools: ["search", "http_get", "llm"], dataSources: ["DataSF restaurant inspections"], coverage: "San Francisco",
  builtin: false, prompt: "Find health inspection scores for restaurants in the area", createdBy: "orchestrator",
});

let path: string;
beforeEach(() => { path = join(mkdtempSync(join(tmpdir(), "lib-")), "nested", "agents.json"); });

describe("library", () => {
  it("starts empty when the file doesn't exist", () => {
    expect(createLibrary(path).list()).toEqual([]);
  });

  it("persists saved agents across instances (server restarts)", () => {
    createLibrary(path).save(agent("custom-a"));
    expect(createLibrary(path).list().map((a) => a.id)).toEqual(["custom-a"]);
  });

  it("overwrites an agent saved twice under the same id", () => {
    const lib = createLibrary(path);
    lib.save(agent("custom-a"));
    lib.save({ ...agent("custom-a"), name: "Renamed" });
    expect(createLibrary(path).list()).toMatchObject([{ id: "custom-a", name: "Renamed" }]);
  });

  it("never persists the temporary flag", () => {
    createLibrary(path).save({ ...agent("custom-a"), temporary: true });
    expect(JSON.parse(readFileSync(path, "utf8"))[0].temporary).toBeUndefined();
  });

  it("removes agents", () => {
    const lib = createLibrary(path);
    lib.save(agent("custom-a"));
    lib.save(agent("custom-b"));
    expect(lib.remove("custom-a")).toBe(true);
    expect(lib.remove("custom-zzz")).toBe(false);
    expect(createLibrary(path).list().map((a) => a.id)).toEqual(["custom-b"]);
  });

  it("skips malformed entries instead of crashing", () => {
    createLibrary(path).save(agent("custom-a"));
    const rows = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify([...rows, { id: 42 }]));
    expect(createLibrary(path).list().map((a) => a.id)).toEqual(["custom-a"]);
  });
});
