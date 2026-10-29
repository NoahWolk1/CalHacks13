import { describe, expect, it } from "vitest";
import { parseToiTable, planetName, sexagesimal } from "./toiTable";

// Two rows of ExoFOP's TOI table as downloaded (most columns trimmed; the parser reads by header).
const CSV = `TIC ID,TOI,TESS Disposition,TFOPWG Disposition,TESS Mag,Planet Name,RA,Dec,Epoch (BJD),Epoch (BJD) err,Period (days),Period (days) err,Duration (hours),Planet Radius (R_Earth),Stellar Distance (pc),Comments
231663901,101.01,KP,KP,12.4069,,21:14:56.88,-55:52:18.71,2458326.009117,0.00013154597,1.43036994965074,0.00000077233494,1.61659940399439,13.1874503075824,375.31,"WASP-46 b"
12345,9999.01,PC,,14.1,,05:00:00.00,+01:30:00.0,2460000.5,0.002,,,2.0,,,"WASP-1 b"
`;

describe("ExoFOP TOI table", () => {
  it("parses sexagesimal RA (hours) and Dec (degrees)", () => {
    expect(sexagesimal("21:14:56.88", true)).toBeCloseTo(318.737, 3);
    expect(sexagesimal("-55:52:18.71", false)).toBeCloseTo(-55.87186, 4);
    expect(sexagesimal("-00:30:00", false)).toBeCloseTo(-0.5, 6);
    expect(sexagesimal("12.5", true)).toBe(12.5);
  });
  it("takes a known planet's name from the start of ExoFOP's comments", () => {
    expect(planetName("WASP-46 b")).toBe("WASP-46 b");
    expect(planetName("L 98-59 d/TOI 175.02")).toBe("L 98-59 d");
    expect(planetName("TOI-561 b / .02")).toBe("TOI-561 b");
    expect(planetName("K2-371 b")).toBe("K2-371 b");
    expect(planetName("faint neighbors")).toBeUndefined();
    expect(planetName("TOI 261.01; active TFOP PC; validated planet in S Giacalone 2020")).toBeUndefined();
  });
  it("reads TOIs with their ephemeris, disposition and planet name", () => {
    const [a, b] = parseToiTable(CSV);
    expect(a).toMatchObject({ tic: "231663901", toi: "101.01", disposition: "KP", planet: "WASP-46 b", period: 1.43036994965074, epoch: 2458326.009117 });
    expect(a.ra).toBeCloseTo(318.737, 3);
    expect(b).toMatchObject({ tic: "12345", disposition: "PC", period: undefined });
    expect(b.planet).toBeUndefined();
    expect(() => parseToiTable("a,b\n1,2\n")).toThrow(/unexpected/);
  });
});
