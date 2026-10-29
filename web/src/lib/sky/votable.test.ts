import { describe, expect, it } from "vitest";
import { parseVotable } from "./votable";
import { parseVsxRows } from "./vsx";

const fields = `<FIELD datatype="char" arraysize="*" name="name"/><FIELD datatype="double" name="ra"/><FIELD datatype="double" name="dec"/><FIELD datatype="char" arraysize="*" name="variability_type"/><FIELD datatype="double" name="period"/>`;
function binaryRow(name: string, ra: number, dec: number, type: string, period: number) {
  const s = (x: string) => { const b = Buffer.alloc(4 + x.length); b.writeUInt32BE(x.length); b.write(x, 4, "latin1"); return b; };
  const d = (x: number) => { const b = Buffer.alloc(8); b.writeDoubleBE(x); return b; };
  return Buffer.concat([s(name), d(ra), d(dec), s(type), d(period)]);
}
const wrap = (data: string) => `<VOTABLE><RESOURCE><INFO name="QUERY_STATUS" value="OK">ok</INFO><TABLE>${fields}<DATA>${data}</DATA></TABLE></RESOURCE></VOTABLE>`;

describe("VOTable from HEASARC", () => {
  it("reads BINARY rows (variable-length strings, doubles, NaN as missing)", () => {
    const b64 = Buffer.concat([binaryRow("Gaia DR3 1", 100.1, 20.2, "EA", 1.5166), binaryRow("V0001 Gem", 100.3, 19.9, "DSCT", NaN)]).toString("base64");
    const rows = parseVotable(wrap(`<BINARY><STREAM encoding="base64">${b64}</STREAM></BINARY>`));
    expect(rows).toEqual([
      { name: "Gaia DR3 1", ra: 100.1, dec: 20.2, variability_type: "EA", period: 1.5166 },
      { name: "V0001 Gem", ra: 100.3, dec: 19.9, variability_type: "DSCT", period: null },
    ]);
    expect(parseVsxRows(rows)).toEqual([{ name: "Gaia DR3 1", type: "EA", ra: 100.1, dec: 20.2, period: 1.5166 }, { name: "V0001 Gem", type: "DSCT", ra: 100.3, dec: 19.9 }]);
  });
  it("reads TABLEDATA and reports TAP errors", () => {
    expect(parseVotable(wrap("<TABLEDATA><TR><TD>X &amp; Y</TD><TD>1.5</TD><TD>2</TD><TD>EW</TD><TD/></TR></TABLEDATA>"))).toEqual([{ name: "X & Y", ra: 1.5, dec: 2, variability_type: "EW", period: null }]);
    expect(() => parseVotable(`<INFO name="QUERY_STATUS" value="ERROR">column "x" does not exist</INFO>`)).toThrow(/column "x"/);
  });
});
