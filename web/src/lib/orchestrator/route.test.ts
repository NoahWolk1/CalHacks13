import { describe, expect, it } from "vitest";
import { normalizeProfileId, routeByKeywords } from "./route";

describe("routeByKeywords", () => {
  it.each([
    ["Is this a good spot for a coffee shop?", "storefront"],
    ["How saturated is food & drink here?", "storefront"],
    ["Where should I open my café? Lots of foot traffic?", "storefront"],
    ["What's happening on the ground right now?", "disaster"],
    ["What's the current situation here?", "disaster"],
    ["Is there smoke or an evacuation alert?", "disaster"],
    ["Is it risky to build here?", "site-risk"],
    ["Which new developments are most exposed to flooding?", "site-risk"],
    ["What hazards should a homebuyer know about?", "site-risk"],
    ["How many villages are located here?", "general"],
    ["What animals live here?", "general"],
    ["Tell me about this place", "general"], // no keywords → general
    ["Is it risky to build near this village?", "site-risk"], // tie → specialist
  ])("%s → %s", (q, profileId) => {
    expect(routeByKeywords(q).profileId).toBe(profileId);
  });

  it("matches on word boundaries", () => {
    // "current" must not hit storefront's /rent/, "know" must not hit disaster's /now/.
    expect(routeByKeywords("Do you know the parcels?").profileId).toBe("site-risk");
    expect(routeByKeywords("Is the parcel cheap to lease?").profileId).toBe("storefront");
  });

  it("explains the route in a few words", () => {
    const r = routeByKeywords("Is this a good spot for a coffee shop?");
    expect(r.reason).toMatch(/coffee/);
    expect(r.reason.split(/\s+/).length).toBeLessThanOrEqual(12);
  });
});

describe("normalizeProfileId", () => {
  it("keeps known ids and maps everything else to auto", () => {
    expect(normalizeProfileId("storefront")).toBe("storefront");
    expect(normalizeProfileId("auto")).toBe("auto");
    expect(normalizeProfileId(undefined)).toBe("auto");
    expect(normalizeProfileId("nope")).toBe("auto");
  });
});
