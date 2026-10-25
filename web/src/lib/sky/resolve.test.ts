import { describe, expect, it } from "vitest";
import { parseSesame } from "./resolve";

const M31 = `# M31	#Q12607553
#=Sc=Simbad (CDS, via client/server):    1     0ms (from cache)
%@ @1575544
%C.0 AGN
%J 10.68470833 +41.26875000 = 00 42 44.330  +41 16 07.50 
%I.0 M  31
`;

describe("parseSesame", () => {
  it("reads position, type and the main id", () => {
    const h = parseSesame(M31, "Andromeda")!;
    expect(h.ra).toBeCloseTo(10.6847, 3);
    expect(h.dec).toBeCloseTo(41.2688, 3);
    expect(h.category).toBe("galaxy");
    expect(h.type).toContain("Active galactic nucleus");
    expect(h.source).toBe("Simbad");
  });
  it("returns null when nothing is found", () => {
    expect(parseSesame("# xyzzy\t#Q1\n#! *** Nothing found *** \n", "xyzzy")).toBeNull();
  });
});

describe("cleanQuestion", () => {
  it("trims, collapses whitespace and caps length; non-strings mean no question", async () => {
    const { cleanQuestion } = await import("./summary");
    expect(cleanQuestion("  Are there\n planets   here? ")).toBe("Are there planets here?");
    expect(cleanQuestion("x".repeat(500))).toHaveLength(300);
    expect(cleanQuestion(42)).toBe("");
    expect(cleanQuestion(undefined)).toBe("");
  });
});
