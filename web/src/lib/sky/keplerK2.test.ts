import { describe, expect, it } from "vitest";
import {
  BKJD, KEPLER_BAD_BITS, campaignOf, chooseKkFiles, eclipticLat, kplrName, ktwoName, parseKeplerCaomProducts, parseKeplerListing,
  parseKkCaom, parseKkFits, parseTargetName, pickEpic, toBtjd, type KkProduct,
} from "./keplerK2";

type Col = { name: string; type: "D" | "E" | "J" | "I" };

/** A small FITS file: primary HDU with `primary` cards, then one binary table named `extname`. */
function fitsFile(primary: Record<string, string | number>, extname: string, table: Record<string, string | number>, cols: Col[], rows: number[][]) {
  const card = (s: string) => s.padEnd(80, " ");
  const kv = (k: string, v: string | number) => `${k.padEnd(8)}= ${typeof v === "string" ? `'${v}'`.padEnd(20) : String(v).padStart(20)}`;
  const header = (cards: string[]) => {
    const all = [...cards, "END"].map(card).join("");
    return all.padEnd(Math.ceil(all.length / 2880) * 2880, " ");
  };
  const size = { D: 8, E: 4, J: 4, I: 2 };
  const width = cols.reduce((s, c) => s + size[c.type], 0);
  const p = header([`SIMPLE  =                    T`, kv("BITPIX", 8), kv("NAXIS", 0), ...Object.entries(primary).map(([k, v]) => kv(k, v))]);
  const t = header([kv("XTENSION", "BINTABLE"), kv("BITPIX", 8), kv("NAXIS", 2), kv("NAXIS1", width), kv("NAXIS2", rows.length), kv("PCOUNT", 0), kv("GCOUNT", 1), kv("TFIELDS", cols.length),
    ...cols.flatMap((c, i) => [kv(`TTYPE${i + 1}`, c.name), kv(`TFORM${i + 1}`, c.type)]), kv("EXTNAME", extname), ...Object.entries(table).map(([k, v]) => kv(k, v))]);
  const data = new ArrayBuffer(Math.ceil((width * rows.length) / 2880) * 2880);
  const v = new DataView(data);
  rows.forEach((r, i) => {
    let off = i * width;
    cols.forEach((c, j) => {
      if (c.type === "D") v.setFloat64(off, r[j]); else if (c.type === "E") v.setFloat32(off, r[j]); else if (c.type === "J") v.setInt32(off, r[j]); else v.setInt16(off, r[j]);
      off += size[c.type];
    });
  });
  const enc = new TextEncoder(), out = new Uint8Array(p.length + t.length + data.byteLength);
  out.set(enc.encode(p), 0);
  out.set(enc.encode(t), p.length);
  out.set(new Uint8Array(data), p.length + t.length);
  return out.buffer;
}

const lcHdr = { BJDREFI: BKJD, BJDREFF: 0, TIMEDEL: 0.02043359821692 };

describe("ids and names", () => {
  it("builds and parses CAOM target names", () => {
    expect(kplrName("11904151")).toBe("kplr011904151");
    expect(ktwoName("205686202")).toBe("ktwo205686202");
    expect(parseTargetName("kplr011904151")).toEqual({ mission: "Kepler", id: "11904151" });
    expect(parseTargetName("ktwo205686202")).toEqual({ mission: "K2", id: "205686202" });
    expect(parseTargetName("polar205686202")).toBeNull();
    expect(parseTargetName("377780790")).toBeNull();
  });
  it("splits campaign labels", () => {
    expect(campaignOf("c02")).toBe(2);
    expect(campaignOf("c19")).toBe(19);
    expect(campaignOf("c102")).toBe(10);
    expect(campaignOf("c91")).toBe(9);
    expect(campaignOf("c111")).toBe(11);
  });
  it("converts BKJD to BTJD", () => {
    expect(toBtjd(630)).toBeCloseTo(630 - 2167, 9);
    expect(toBtjd(2060.5, 2454833, 0.5)).toBeCloseTo(2060.5 - 2167 + 0.5, 9);
  });
  it("gates the EPIC lookup on ecliptic latitude", () => {
    // K2-289 (C2) sits 5.8° off the ecliptic; Kepler-10 72°.
    expect(eclipticLat(246.643041, -15.792379)).toBeCloseTo(5.84, 1);
    expect(eclipticLat(285.679422, 50.241306)).toBeCloseTo(71.85, 1);
  });
  it("matches an EPIC by 2MASS id, else the nearest within 3″", () => {
    const rows = [
      { epic: "1", ra: 246.643041, dec: -15.792379 + 1.5 / 3600, twomass: "2MASS J16263433-1547326" },
      { epic: "2", ra: 246.643041, dec: -15.792379 + 0.5 / 3600 },
    ];
    expect(pickEpic(rows, 246.643041, -15.792379, "16263433-1547326")).toBe("1");
    expect(pickEpic(rows, 246.643041, -15.792379)).toBe("2");
    expect(pickEpic([{ epic: "3", ra: 246.643041, dec: -15.792379 + 5 / 3600 }], 246.643041, -15.792379)).toBeUndefined();
  });
});

describe("products", () => {
  it("parses K2 and HLSP rows from CAOM, skipping Kepler tarballs and other files", () => {
    const rows = [
      { obs_collection: "Kepler", provenance_name: "Kepler", target_name: "kplr011904151", sequence_number: -999, t_exptime: 1800, dataURL: "http://archive.stsci.edu/missions/kepler/lightcurves/0119/011904151/kplr011904151_lc_Q111111110111011101.tar" },
      { obs_collection: "K2", provenance_name: "K2", target_name: "ktwo205686202", sequence_number: 2, t_exptime: 1800, dataURL: "mast:K2/url/missions/k2/lightcurves/c2/205600000/86000/ktwo205686202-c02_llc.fits" },
      { obs_collection: "HLSP", provenance_name: "K2SFF", target_name: "ktwo205686202", sequence_number: 2, t_exptime: 1800, dataURL: "mast:HLSP/k2sff/c02/205600000/86202/hlsp_k2sff_k2_lightcurve_205686202-c02_kepler_v1_llc.fits" },
      { obs_collection: "HLSP", provenance_name: "EVEREST", target_name: "ktwo201437844", sequence_number: 10, t_exptime: 1800, dataURL: "mast:HLSP/everest/v2/c102/201400000/37844/hlsp_everest_k2_llc_201437844-c102_kepler_v2.0_lc.fits" },
      { obs_collection: "HLSP", provenance_name: "K2VARCAT", target_name: "ktwo205686202", sequence_number: 2, t_exptime: 1800, dataURL: "mast:HLSP/k2varcat/c02/x/hlsp_k2varcat_k2_lightcurve_205686202-c02_kepler_v2_llc.fits" },
    ];
    const p = parseKkCaom({ status: "COMPLETE", data: rows });
    expect(p.map((x) => `${x.pipeline} ${x.id} ${x.segment} ${x.part}`)).toEqual(["K2 205686202 2 c02", "K2SFF 205686202 2 c02", "EVEREST 201437844 10 c102"]);
    expect(() => parseKkCaom({ status: "ERROR" })).toThrow(/ERROR/);
  });
  it("reads quarters from a Kepler directory listing", () => {
    const html = ["kplr011904151-2009131105131_llc.fits", "kplr011904151-2009231120729_slc.fits", "kplr011904151-2010009091648_llc.fits", "kplr011904151-2013131215648_llc.fits", "kplr011904151-2099999999999_llc.fits", "kplr099999999-2009166043257_llc.fits"]
      .map((f) => `<a href="${f}">${f}</a>`).join("\n");
    const p = parseKeplerListing(html, "11904151");
    expect(p.map((x) => `${x.part} ${x.segment} ${x.cadence}`)).toEqual(["Q0 0 1800", "2009231120729 -1 60", "Q4 4 1800", "Q17 17 1800", "2099999999999 -1 1800"]);
    expect(p[0].uri).toBe("mast:KEPLER/url/missions/kepler/lightcurves/0119/011904151/kplr011904151-2009131105131_llc.fits");
  });
  it("reads quarters from CAOM's product list", () => {
    const p = parseKeplerCaomProducts({ data: [
      { description: "Lightcurve Long Cadence (CLC) - Q6", dataURI: "mast:KEPLER/url/missions/kepler/lightcurves/0119/011904151/kplr011904151-2010265121752_llc.fits" },
      { description: "Data Validation summary report", dataURI: "mast:KEPLER/url/x_dvs.pdf" },
    ] }, "11904151");
    expect(p).toHaveLength(1);
    expect(p[0].segment).toBe(6);
  });
});

describe("choosing files", () => {
  const kep = (q: number, cadence = 1800): KkProduct => ({ mission: "Kepler", pipeline: "Kepler", id: "1", segment: q, part: `Q${q}`, cadence, uri: `mast:KEPLER/kplr000000001-${String(2009000 + q).padStart(7, "0")}${cadence === 1800 ? "_llc" : "_slc"}.fits` });
  const k2 = (pipeline: KkProduct["pipeline"], part: string, cadence = 1800): KkProduct => ({ mission: "K2", pipeline, id: "2", segment: campaignOf(part), part, cadence, uri: `mast:${pipeline}/${part}/${cadence}.fits` });

  it("prefers K2SFF > EVEREST > PDCSAP per campaign, long cadence first", () => {
    const g = chooseKkFiles([k2("K2", "c05"), k2("EVEREST", "c05"), k2("K2SFF", "c05"), k2("K2", "c05", 60), k2("K2", "c18")]);
    expect(g.map((x) => x.map((p) => p.pipeline).join(">"))).toEqual(["K2SFF>EVEREST>K2", "K2"]);
    expect(g[0].every((p) => p.cadence === 1800)).toBe(true);
    // Short cadence only when a segment has nothing else.
    expect(chooseKkFiles([k2("K2", "c05", 60)])[0][0].cadence).toBe(60);
  });
  it("spreads Kepler quarters over the mission and skips Q0 when over budget", () => {
    const all = Array.from({ length: 18 }, (_, q) => kep(q));
    const g = chooseKkFiles(all, 4);
    expect(g.map((x) => x[0].segment)).toEqual([1, 6, 12, 17]);
    expect(chooseKkFiles(all.slice(0, 3), 8)).toHaveLength(3);
  });
  it("gives K2 campaigns the budget first and drops Kepler short cadence when long exists", () => {
    const g = chooseKkFiles([k2("K2SFF", "c02"), kep(1), kep(2), kep(3), kep(2, 60)], 3);
    expect(g.map((x) => `${x[0].mission}${x[0].segment}`)).toEqual(["K22", "Kepler1", "Kepler3"]);
  });
});

describe("FITS parsing", () => {
  it("reads a Kepler PDCSAP file: BKJD -> BTJD, quality mask, NaNs dropped, median 1", () => {
    const rows = [[630, 1000, 0], [630.02, 1010, 0], [630.04, NaN, 0], [630.06, 990, 32], [630.08, 1020, 16384], [630.1, 1005, 1024], [NaN, 1000, 0]];
    const buf = fitsFile({ QUARTER: 7, OBJECT: "KIC 11904151" }, "LIGHTCURVE", lcHdr,
      [{ name: "TIME", type: "D" }, { name: "PDCSAP_FLUX", type: "E" }, { name: "SAP_QUALITY", type: "J" }], rows);
    const c = parseKkFits(buf, { mission: "Kepler", pipeline: "Kepler", segment: -1, uri: "u" });
    expect(c.segment).toBe(7);
    expect(c.cadence).toBe(1765);
    expect(c.t.length).toBe(4); // NaN flux, NaN time and the desat (32) cadence go
    expect(c.t[0]).toBeCloseTo(630 - 2167, 9);
    expect(c.f[1]).toBeCloseTo(1010 / 1010, 6); // median of 1000, 1010, 1020, 1005 is 1010 (upper middle)
    expect(KEPLER_BAD_BITS & 16384).toBe(0);
    expect(KEPLER_BAD_BITS & 1024).toBe(0);
  });
  it("reads K2SFF (BESTAPER: T, FCOR, MOVING) and drops thruster firings", () => {
    const buf = fitsFile({ CAMPAIGN: 2 }, "BESTAPER", lcHdr,
      [{ name: "T", type: "D" }, { name: "FRAW", type: "D" }, { name: "FCOR", type: "D" }, { name: "MOVING", type: "I" }],
      [[2060.3, 5, 0.995, 0], [2060.32, 5, 0.996, 1], [2060.34, 5, 0.997, 0]]);
    const c = parseKkFits(buf, { mission: "K2", pipeline: "K2SFF", segment: 0, uri: "u" });
    expect(c.segment).toBe(2);
    expect([...c.t].map((x) => +x.toFixed(2))).toEqual([2060.3 - 2167, 2060.34 - 2167].map((x) => +x.toFixed(2)));
    expect(c.f[1]).toBe(1);
  });
  it("reads EVEREST (ARRAYS: TIME, FLUX, QUALITY) keeping its outlier flag", () => {
    const buf = fitsFile({ CAMPAIGN: 5 }, "ARRAYS", { BJDREFI: BKJD, BJDREFF: 0 },
      [{ name: "CADN", type: "D" }, { name: "FLUX", type: "D" }, { name: "QUALITY", type: "J" }, { name: "TIME", type: "D" }],
      [[1, 100, 0, 2300], [2, 99, 16777216, 2300.02], [3, 101, 4194304, 2300.04], [4, 100, 1048576, 2300.06]]);
    const c = parseKkFits(buf, { mission: "K2", pipeline: "EVEREST", segment: 0, uri: "u" });
    expect(c.t.length).toBe(2);
    expect(c.f[1]).toBeCloseTo(0.99, 9);
  });
  it("throws on a file with no good cadences", () => {
    const buf = fitsFile({}, "LIGHTCURVE", lcHdr, [{ name: "TIME", type: "D" }, { name: "PDCSAP_FLUX", type: "E" }, { name: "SAP_QUALITY", type: "J" }], [[1, NaN, 0]]);
    expect(() => parseKkFits(buf, { mission: "K2", pipeline: "K2", segment: 3, uri: "u" })).toThrow(/no good cadences/);
  });
});
