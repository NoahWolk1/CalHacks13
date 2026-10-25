// Parsers and key-gating for the Bright Data / Apify workers. The HTML fixtures were recorded once from
// the live pages and are used ONLY here; the workers never read them.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { regionFromBox } from "@/lib/geo";
import type { WorkerContext } from "@/lib/types";
import { parseCraigslist, rentStats, rentWorker } from "@/lib/agents/workers/rent";
import { pickPulse, pulseWorker } from "@/lib/agents/workers/pulse";
import { reviewsWorker, summarizePlaces } from "@/lib/agents/workers/reviews";
import { planningNoticesWorker } from "@/lib/agents/workers/planningNotices";
import { parseSerp } from "./brightdata";
import { actorPath } from "./apify";
import { missingEnv } from "./keys";
import { businessCategory, searchTopic } from "./topic";
// The custom Apify Actor's pure parsing module (plain JS, shared with the Actor).
import { easAddress, filterNotices, parseNotices } from "../../../apify/actors/sf-planning-notices/src/parse.js";

const fixture = (f: string) => readFileSync(path.join(__dirname, "__fixtures__", f), "utf8");
const KEYS = ["BRIGHTDATA_API_TOKEN", "BRIGHTDATA_UNLOCKER_ZONE", "BRIGHTDATA_SERP_ZONE", "APIFY_TOKEN", "APIFY_PLANNING_ACTOR"];
afterEach(() => vi.unstubAllEnvs());
const clearKeys = () => KEYS.forEach((k) => vi.stubEnv(k, ""));

describe("Rent Scout: Craigslist parser", () => {
  it("zips the JSON-LD coordinates with the static price list", () => {
    const ls = parseCraigslist(fixture("craigslist-sfc-apa.html"));
    expect(ls.length).toBeGreaterThan(10);
    expect(ls[0]).toMatchObject({ title: expect.stringContaining("Mission"), price: 1950, beds: 2 });
    expect(ls[0].lat).toBeCloseTo(37.759, 2);
    expect(ls[0].url).toMatch(/^https:\/\/www\.craigslist\.org\/view\//);
    const s = rentStats(ls);
    expect(s.n).toBeGreaterThan(5);
    expect(s.median).toBeGreaterThan(1000);
  });
  it("returns nothing for a page without results", () => {
    expect(parseCraigslist("<html><body>blocked</body></html>")).toEqual([]);
  });
});

describe("Local Pulse", () => {
  it("parses SERP JSON (news + organic) and interleaves resident threads", () => {
    const web = parseSerp(JSON.stringify({ organic: [{ title: "Café closes on Valencia", link: "https://sfist.com/a", description: "x" }, { title: "bad" }], news: [{ title: "Mission news", link: "https://missionlocal.org/b", source: "Mission Local", date: "2026-10-01" }] }));
    expect(web.map((r) => r.kind)).toEqual(["news", "organic"]);
    const community = parseSerp(JSON.stringify({ organic: [{ title: "r/sanfrancisco thread", link: "https://www.reddit.com/r/sanfrancisco/1" }, { title: "spam", link: "https://example.com" }] }));
    const picks = pickPulse(web, community);
    expect(picks.map((p) => p.community)).toEqual([false, true, false]);
  });
  it("rejects non-JSON SERP bodies", () => expect(() => parseSerp("<html>")).toThrow(/non-JSON/));
  it("extracts a topic and a business category", () => {
    expect(businessCategory("Is this a good spot for a café?")).toBe("coffee shop");
    expect(businessCategory("Where should I open a ramen place")).toBe("ramen restaurant");
    expect(searchTopic("Is flooding a problem on 17th St?")).toBe("flooding problem 17th");
  });
});

describe("Review Radar summary", () => {
  it("finds leaders, the ratings gap and closures", () => {
    const s = summarizePlaces([
      { title: "A", totalScore: 4.7, reviewsCount: 900, price: "$$" },
      { title: "B", totalScore: 3.6, reviewsCount: 40, price: "$" },
      { title: "C", totalScore: 4.2, reviewsCount: 10, permanentlyClosed: true },
    ], 0.5);
    expect(s).toMatchObject({ open: 2, closed: 1, prices: { $$: 1, $: 1 } });
    expect(s.strong).toHaveLength(1);
    expect(s.weak).toHaveLength(1);
    expect(s.density).toBe(4);
  });
  it("builds the Apify actor path", () => expect(actorPath("compass/crawler-google-places")).toBe("compass~crawler-google-places"));
});

describe("sf-planning-notices Actor parser", () => {
  it("parses the notices table", () => {
    const rows = parseNotices(fixture("sfplanning-notices.html"));
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(rows[0]).toMatchObject({ address: "684-688 Guerrero Street", recordNumber: "2026-002187CND", recordType: "CND", noticeType: "Planning Commission Hearing", neighborhood: "Mission", postedDate: "2026-10-21", expirationDate: null, hearingDate: "2026-11-12" });
    expect(rows[0].noticeUrl).toMatch(/^https:\/\/citypln-m-extnl\.sfgov\.org\//);
    expect(rows[0].plansUrl).toBeNull();
  });
  it("normalizes addresses to the city's EAS spelling", () => {
    expect(easAddress("684-688 Guerrero Street")).toBe("684 GUERRERO ST");
    expect(easAddress("116 18th Avenue")).toBe("116 18TH AVE");
    expect(easAddress("40 3rd Street")).toBe("40 03RD ST");
    expect(easAddress("333 O’Farrell Street")).toBe("333 O'FARRELL ST");
    expect(easAddress("451 Kansas Street, 450 Rhode Island Street")).toBe("451 KANSAS ST");
    expect(easAddress("SF Survey Findings Marina")).toBeNull();
  });
  it("filters by radius, nearest first", () => {
    const rows = [{ address: "a", lng: -122.42, lat: 37.76 }, { address: "b", lng: -122.40, lat: 37.79 }, { address: "c", lng: null, lat: null }];
    const out = filterNotices(rows, { center: [-122.4194, 37.7599], radiusKm: 1 }, "2026-10-25");
    expect(out.map((r: { address: string }) => r.address)).toEqual(["a"]);
  });
});

describe("key gating", () => {
  const region = regionFromBox([-122.425, 37.755], [-122.413, 37.765]);
  region.label = "Mission District, San Francisco";
  const ctx = () => {
    const logs: string[] = [], findings: unknown[] = [];
    const c: WorkerContext = { task: { region, question: "café?" }, emit: (f) => findings.push(f), log: (m) => logs.push(m), signal: new AbortController().signal };
    return { c, logs, findings };
  };

  it("reports the missing env per worker", () => {
    clearKeys();
    expect(missingEnv(reviewsWorker)).toEqual(["APIFY_TOKEN"]);
    expect(missingEnv(planningNoticesWorker)).toEqual(["APIFY_TOKEN", "APIFY_PLANNING_ACTOR"]);
    expect(missingEnv(rentWorker)).toEqual(["BRIGHTDATA_API_TOKEN", "BRIGHTDATA_UNLOCKER_ZONE"]);
    expect(missingEnv(pulseWorker)).toEqual(["BRIGHTDATA_API_TOKEN", "BRIGHTDATA_SERP_ZONE"]);
    expect(missingEnv({ id: "osm-places" })).toEqual([]);
    vi.stubEnv("BRIGHTDATA_API_TOKEN", "t");
    vi.stubEnv("BRIGHTDATA_UNLOCKER_ZONE", "web_unlocker1");
    expect(missingEnv(pulseWorker)).toEqual([]); // SERP falls back to the Unlocker zone
  });

  it("each worker logs what it needs and makes no request without keys", async () => {
    clearKeys();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (const w of [reviewsWorker, rentWorker, pulseWorker, planningNoticesWorker]) {
      const { c, logs, findings } = ctx();
      await w.run(c);
      expect(logs[0]).toMatch(/^needs /);
      expect(findings).toHaveLength(0);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
