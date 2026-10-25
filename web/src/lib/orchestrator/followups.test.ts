import { describe, expect, it } from "vitest";
import { pickFollowups } from "./followups";

describe("pickFollowups", () => {
  const eligible = ["custom-wildlife", "osm-places", "news"];
  it("keeps only agents that ran, one per agent, non-empty, capped at 2", () => {
    expect(pickFollowups([
      { agentId: "unknown", instruction: "x" },
      { agentId: "custom-wildlife", instruction: "  resolve GBIF keys 5217335 to names " },
      { agentId: "custom-wildlife", instruction: "again" },
      { agentId: "osm-places", instruction: "   " },
      { agentId: "news", instruction: "find recent poaching news" },
      { agentId: "osm-places", instruction: "list parks" },
    ], eligible)).toEqual([
      { agentId: "custom-wildlife", instruction: "resolve GBIF keys 5217335 to names" },
      { agentId: "news", instruction: "find recent poaching news" },
    ]);
  });
  it("handles missing input", () => {
    expect(pickFollowups(undefined, eligible)).toEqual([]);
  });
});
