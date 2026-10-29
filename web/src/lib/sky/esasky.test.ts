import { describe, expect, it } from "vitest";
import { esaskyQuery, esaskyRows, parseCsv } from "./esasky";
import { parseMast } from "./telescopes";

describe("ESASky fallback for the telescope archive", () => {
  const hst = { mission: "HST", table: "t", ra: "ra_deg", dec: "dec_deg", cols: { observation_id: "obs_id", target_name: "target_name", instrument_name: "instrument_name", filter: "filters" }, time: { col: "start_time" } };
  it("asks for a cone on the table's own position columns", () => {
    expect(esaskyQuery(hst, { ra: 83.82, dec: -5.39, radius: 0.2 })).toMatch(/FROM observations\.t WHERE 1 = CONTAINS\(POINT\('ICRS', ra_deg, dec_deg\), CIRCLE\('ICRS', 83\.820000, -5\.390000, 0\.200000\)\)/);
  });
  it("reads CSV (quoted commas) into MAST's columns and summarises per mission", () => {
    const rows = parseCsv('ra_deg,dec_deg,observation_id,target_name,instrument_name,filter,start_time\n83.8,-5.4,o1,"M42, core",ACS/WFC,F658N,2022-01-14 10:00:00\n83.81,-5.38,o2,M42,WFPC2,F656N,1995-03-01 00:00:00\n');
    expect(rows[0].target_name).toBe("M42, core");
    const mast = esaskyRows(hst, rows);
    expect(mast[0]).toMatchObject({ obs_collection: "HST", obs_id: "o1", instrument_name: "ACS/WFC", filters: "F658N" });
    expect(mast[0].t_min as number).toBeCloseTo(59593.4167, 3); // 2022-01-14 10:00 UTC
    const [o] = parseMast({ data: mast }, { ra: 83.82, dec: -5.39, radius: 0.2 });
    expect(o.name).toBe("HST archive");
    expect(o.props.observations).toBe(2);
    expect(o.props["latest observation"]).toMatch(/^2022-01-14 \(o1/);
  });
  it("reports a TAP error instead of reading it as rows", () => {
    expect(() => parseCsv('<VOTABLE><INFO name="QUERY_STATUS" value="ERROR">bad</INFO></VOTABLE>')).toThrow();
  });
});
