import { describe, expect, it } from "vitest";
import mastOrion from "./fixtures/mast-orion.json";
import { mastRequest, mjdToDate, parseMast } from "./telescopes";
import { cutoutUrl, filterObservations } from "./observer";
import { assignIds } from "./run";

const orion = { ra: 83.822, dec: -5.391, radius: 0.5 };

describe("MAST telescope archive", () => {
  it("builds a form-encoded CAOM position request", () => {
    const body = new URLSearchParams(String(mastRequest(orion).body));
    const req = JSON.parse(body.get("request")!);
    expect(req.service).toBe("Mast.Caom.Filtered.Position");
    expect(req.params.position).toBe("83.82200, -5.39100, 0.50000");
    expect(req.params.filters[0].values).toContain("JWST");
  });
  it("converts MJD to a calendar date", () => {
    expect(mjdToDate(51544)).toBe("2000-01-01");
  });
  it("groups the recorded Orion response by mission", () => {
    const rows = parseMast(mastOrion, orion);
    expect(rows.map((r) => r.name)).toEqual(["TESS archive", "Pan-STARRS1 archive", "JWST archive", "IUE archive", "HST archive", "FUSE archive"]);
    const jwst = rows.find((r) => r.name === "JWST archive")!;
    expect(jwst).toMatchObject({ category: "observation", source: "telescopes", type: "JWST observations" });
    expect(jwst.props.observations).toBe(25);
    expect(String(jwst.props.instruments)).toMatch(/NIRSPEC|MIRI|NIRCAM/);
    expect(String(jwst.props["latest observation"])).toMatch(/^20\d\d-\d\d-\d\d \(/);
    expect(jwst.url).toContain("mast.stsci.edu/portal");
    expect(assignIds([{ id: "telescopes", objects: rows }])[0].id).toBe("T1");
  });
  it("marks truncated pages, caps missions, and rejects junk", () => {
    const rows = parseMast({ status: "COMPLETE", data: [{ obs_collection: "HST", t_min: 51544 }], paging: { rowsTotal: 99 } }, orion);
    expect(rows[0].props.observations).toBe("1+");
    expect(parseMast({ status: "COMPLETE", data: [] }, orion)).toEqual([]);
    expect(() => parseMast({ status: "ERROR" }, orion)).toThrow(/ERROR/);
    expect(parseMast(mastOrion, orion, 2)).toHaveLength(2);
  });
});

describe("Observer", () => {
  it("builds a hips2fits cutout spanning the cone diameter", () => {
    const u = new URL(cutoutUrl(orion));
    expect(u.host).toBe("alasky.cds.unistra.fr");
    expect(u.searchParams.get("fov")).toBe("1.00000");
    expect(u.searchParams.get("hips")).toBe("CDS/P/DSS2/color");
  });
  it("drops invented ids but keeps purely visual remarks", () => {
    const out = filterObservations({
      observations: [
        { text: "Bright nebulosity around the Trapezium [S1]", ids: ["S1", "S99"] },
        { text: "Dark dust lane to the east [S42]", ids: ["S42"] },
        { text: "Star density drops toward the north", ids: [] },
      ],
    }, new Set(["S1", "T1"]));
    expect(out.dropped).toBe(1);
    expect(out.observations).toEqual([
      { text: "Bright nebulosity around the Trapezium [S1]", ids: ["S1"] },
      { text: "Star density drops toward the north", ids: [] },
    ]);
  });
});
