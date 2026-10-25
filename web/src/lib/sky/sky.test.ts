import { describe, expect, it } from "vitest";
import simbadOrion from "./fixtures/simbad-orion.json";
import exoTrappist from "./fixtures/exo-trappist.json";
import hzJupiter from "./fixtures/horizons-jupiter.json";
import hzSun from "./fixtures/horizons-sun.json";
import { parseCone, separation } from "./geom";
import { categoryOf, parseSimbad, simbadQuery, tidyName } from "./simbad";
import { parseExoplanets } from "./exoplanets";
import { BODIES, bodyObject, horizonsUrl, parseHorizons } from "./horizons";
import { assignIds, runSkyAgents } from "./run";
import { filterCitations } from "./summary";
import type { SkyObject } from "./types";

describe("geometry", () => {
  it("computes great-circle separation", () => {
    expect(separation(0, 0, 90, 0)).toBeCloseTo(90, 6);
    expect(separation(10, 89, 190, 89)).toBeCloseTo(2, 6);
    expect(separation(359.5, 0, 0.5, 0)).toBeCloseTo(1, 6);
  });
  it("validates and clamps cones", () => {
    expect(parseCone({ ra: -10, dec: 5, radius: 1 })).toEqual({ ra: 350, dec: 5, radius: 1 });
    expect(parseCone({ ra: 10, dec: 5, radius: 40 })?.radius).toBe(3);
    expect(parseCone({ ra: 10, dec: 95, radius: 1 })).toBeNull();
    expect(parseCone({ ra: "x", dec: 5, radius: 1 })).toBeNull();
    expect(parseCone(null)).toBeNull();
  });
});

describe("SIMBAD", () => {
  it("builds a cone query with plain numbers", () => {
    const q = simbadQuery({ ra: 83.82, dec: -5.39, radius: 0.5 });
    expect(q).toContain("CIRCLE('ICRS', 83.820000, -5.390000, 0.500000)");
    expect(q).toContain("ORDER BY rank DESC");
  });
  it("parses the recorded Orion response", () => {
    const rows = parseSimbad(simbadOrion);
    expect(rows.length).toBe(10);
    expect(rows[0]).toMatchObject({ name: "M 42", category: "nebula", type: "HII region (emission nebula)", source: "simbad" });
    expect(rows[0].url).toBe("https://simbad.cds.unistra.fr/simbad/sim-id?Ident=M%20%2042");
    const star = rows.find((r) => r.name === "tet01 Ori C")!;
    expect(star.category).toBe("star");
    expect(star.props["V mag"]).toBe(5.13);
  });
  it("tidies names and categorises types", () => {
    expect(tidyName("NAME Orion Nebula Cluster")).toBe("Orion Nebula Cluster");
    expect(categoryOf("GlC")).toBe("cluster");
    expect(categoryOf("Sy2")).toBe("galaxy");
    expect(categoryOf("X")).toBe("other");
  });
  it("rejects error responses", () => {
    expect(() => parseSimbad({ oops: 1 })).toThrow();
  });
});

describe("Exoplanet Archive", () => {
  it("parses the recorded TRAPPIST-1 response", () => {
    const rows = parseExoplanets(exoTrappist);
    expect(rows.length).toBe(3);
    expect(rows[0]).toMatchObject({ name: "TRAPPIST-1 c", category: "exoplanet", source: "exoplanets" });
    expect(rows[0].props["host star"]).toBe("TRAPPIST-1");
    expect(rows[0].url).toBe("https://exoplanetarchive.ipac.caltech.edu/overview/TRAPPIST-1");
  });
  it("skips rows without coordinates", () => {
    expect(parseExoplanets([{ pl_name: "x", ra: null, dec: 1 }])).toEqual([]);
  });
});

describe("JPL Horizons", () => {
  it("parses recorded ephemerides", () => {
    expect(parseHorizons(hzJupiter)).toMatchObject({ ra: 145.68013, dec: 14.44227, mag: -1.97 });
    expect(parseHorizons(hzSun)).toMatchObject({ ra: 209.59633, dec: -12.08358 });
  });
  it("skips presence flags after the timestamp", () => {
    const r = parseHorizons({ result: "$$SOE\n 2026-Oct-25 13:00 *m  12.5  -3.25  -12.1  n.a.\n$$EOE" });
    expect(r).toMatchObject({ ra: 12.5, dec: -3.25, mag: -12.1 });
  });
  it("throws on a Horizons error message", () => {
    expect(() => parseHorizons({ result: "No matches found." })).toThrow(/no ephemeris/);
  });
  it("keeps bodies inside or near the cone only", () => {
    const pos = { ra: 145.68, dec: 14.44, time: "t" };
    const jup = BODIES.find((b) => b.name === "Jupiter")!;
    expect(bodyObject(jup, pos, { ra: 145.5, dec: 14.5, radius: 1 })?.props.position).toBe("inside the selected region");
    expect(bodyObject(jup, pos, { ra: 150, dec: 14.5, radius: 1 })?.props.position).toMatch(/^near/);
    expect(bodyObject(jup, pos, { ra: 300, dec: 14.5, radius: 1 })).toBeNull();
  });
  it("floors the request time to the hour", () => {
    expect(new URL(horizonsUrl("599", new Date("2026-10-25T13:42:00Z"))).searchParams.get("START_TIME")).toBe("'2026-10-25 13:00'");
  });
});

const obj = (name: string): SkyObject => ({ id: "", name, type: "t", category: "other", ra: 0, dec: 0, source: "simbad", url: "u", props: {} });

describe("run + citations", () => {
  it("assigns per-source ids", () => {
    const out = assignIds([{ id: "simbad", objects: [obj("a"), obj("b")] }, { id: "exoplanets", objects: [obj("c")] }, { id: "horizons", objects: [obj("d")] }]);
    expect(out.map((o) => o.id)).toEqual(["S1", "S2", "X1", "J1"]);
  });
  it("isolates a failing source", async () => {
    const res = await runSkyAgents({ ra: 1, dec: 1, radius: 1 }, new AbortController().signal, [
      { id: "simbad", label: "ok", endpoint: "e", run: async () => [obj("a")] },
      { id: "exoplanets", label: "bad", endpoint: "e", run: async () => { throw new Error("boom"); } },
      { id: "horizons", label: "none", endpoint: "e", run: async () => [] },
    ]);
    expect(res.objects.map((o) => o.id)).toEqual(["S1"]);
    expect(res.sources.map((s) => s.status)).toEqual(["ok", "error", "empty"]);
    expect(res.sources[1].error).toBe("boom");
  });
  it("drops citations that don't exist and bullets left with none", () => {
    const s = filterCitations({
      headline: " Orion ",
      bullets: [
        { text: "M42 is bright [S1] [S9].", ids: ["S1", "S9"] },
        { text: "Made up [Q4].", ids: ["Q4"] },
        { text: "Planet", ids: ["[X1]"] },
      ],
    }, new Set(["S1", "X1"]));
    expect(s.headline).toBe("Orion");
    expect(s.bullets).toEqual([{ text: "M42 is bright [S1].", ids: ["S1"] }, { text: "Planet", ids: ["X1"] }]);
    expect(s.dropped).toBe(1);
  });
});
