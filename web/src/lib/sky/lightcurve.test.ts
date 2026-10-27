import { describe, expect, it } from "vitest";
import { analyseLightCurve } from "./analysis";
import { bls, blsDetected, measureSignal } from "./bls";
import { coneBox, mastDownloadUrl, mergeStars, parseLcProducts, parseLightCurve, pickLightCurves } from "./lightcurves";
import { periodsMatch, toiQuery, vetSignal } from "./vetting";
import { readHdus, readTable } from "./fits";
import { isVariable, lombScargle } from "./lombscargle";
import { binSeries, cleanSeries, clipUpper, flatten, median, robustStd, trimGaps, type Series } from "./timeseries";

/** Deterministic gaussian noise (mulberry32 + Box-Muller) so the tests never flake. */
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u());
}

/** A TESS-like sector: 27 d of 10-min cadences with the mid-sector downlink gap. */
function sector(opts: { noise: number; seed?: number; transit?: { P: number; t0: number; dur: number; depth: number; secondary?: number; oddExtra?: number }; sine?: { P: number; amp: number } }): Series {
  const g = rng(opts.seed ?? 1);
  const t: number[] = [], f: number[] = [];
  for (let x = 1468; x < 1495; x += 10 / 1440) {
    if (x > 1481 && x < 1482) continue;
    let v = 1 + opts.noise * g();
    if (opts.sine) v += opts.sine.amp * Math.sin((2 * Math.PI * x) / opts.sine.P);
    const tr = opts.transit;
    if (tr) {
      const e = Math.round((x - tr.t0) / tr.P), dt = x - tr.t0 - e * tr.P;
      if (Math.abs(dt) < tr.dur / 2) v -= tr.depth + (e % 2 ? tr.oddExtra ?? 0 : 0);
      const ds = x - tr.t0 - tr.P / 2 - Math.round((x - tr.t0 - tr.P / 2) / tr.P) * tr.P;
      if (tr.secondary && Math.abs(ds) < tr.dur / 2) v -= tr.secondary;
    }
    t.push(x); f.push(v);
  }
  return { t: Float64Array.from(t), f: Float64Array.from(f) };
}

const prep = (s: Series) => clipUpper(flatten(trimGaps(s), 1));

describe("light-curve preparation", () => {
  it("drops flagged and non-finite cadences, sorts, normalises to the median", () => {
    const s = cleanSeries([3, 1, 2, NaN, 4], [200, 100, 100, 100, 50], [0, 0, 0, 0, 1]);
    expect([...s.t]).toEqual([1, 2, 3]);
    expect([...s.f]).toEqual([1, 1, 2]);
  });
  it("bins to a coarser cadence and leaves coarse data alone", () => {
    const s = { t: Float64Array.from([0, 0.001, 0.002, 0.01, 0.011]), f: Float64Array.from([1, 2, 3, 4, 6]) };
    const b = binSeries(s, 0.005);
    expect([...b.f]).toEqual([2, 5]);
    expect(binSeries(b, 0.001)).toBe(b);
  });
  it("flattening removes slow variability but keeps a transit", () => {
    const s = prep(sector({ noise: 3e-4, sine: { P: 4, amp: 5e-3 }, transit: { P: 3.3, t0: 1470.2, dur: 0.12, depth: 3e-3 } }));
    expect(robustStd(s.f)).toBeLessThan(6e-4);
    expect(Math.min(...s.f)).toBeLessThan(1 - 2e-3);
    expect(median(s.f)).toBeCloseTo(1, 3);
  });
});

describe("BLS transit search", () => {
  it("recovers an injected 2 ppt transit through noise and spot modulation", () => {
    const tr = { P: 3.71, t0: 1469.45, dur: 0.125, depth: 2e-3 };
    const r = bls(prep(sector({ noise: 8e-4, seed: 7, transit: tr, sine: { P: 6.2, amp: 4e-3 } })));
    expect(r.period).toBeCloseTo(tr.P, 1);
    expect(Math.abs(r.depth - tr.depth) / tr.depth).toBeLessThan(0.25);
    expect(r.duration).toBeGreaterThan(0.06);
    expect(r.duration).toBeLessThan(0.2);
    expect(r.transits).toBeGreaterThanOrEqual(5);
    expect(r.snr).toBeGreaterThan(15);
    expect(r.oddEvenSigma).toBeLessThan(3);
    expect(Math.abs(r.secondarySigma)).toBeLessThan(3);
    expect(blsDetected(r)).toBe(true);
  });
  it("finds nothing significant in pure noise", () => {
    const r = bls(prep(sector({ noise: 1e-3, seed: 3 })));
    expect(blsDetected(r)).toBe(false);
  });
  it("flags an eclipsing binary's odd/even mismatch and secondary eclipse", () => {
    const s = prep(sector({ noise: 5e-4, seed: 5, transit: { P: 2.4, t0: 1468.9, dur: 0.15, depth: 6e-3, oddExtra: 4e-3, secondary: 2e-3 } }));
    const m = measureSignal(s, { period: 2.4, t0: 1468.9, duration: 0.15 });
    expect(m.oddEvenSigma).toBeGreaterThan(5);
    expect(m.secondarySigma).toBeGreaterThan(5);
  });
});

describe("Lomb-Scargle variability", () => {
  it("recovers a rotation period and amplitude", () => {
    const r = lombScargle(trimGaps(sector({ noise: 1e-3, seed: 11, sine: { P: 2.8, amp: 3e-3 } })));
    expect(r.period).toBeCloseTo(2.8, 1);
    expect(r.amplitude).toBeCloseTo(3e-3, 3);
    expect(isVariable(r)).toBe(true);
  });
  it("calls white noise non-variable", () => {
    expect(isVariable(lombScargle(sector({ noise: 1e-3, seed: 2 })))).toBe(false);
  });
});

/** Builds a tiny FITS file: empty primary HDU + a LIGHTCURVE binary table (TIME D, FLUX E, QUALITY J). */
function fitsFile(rows: [number, number, number][], fluxName = "PDCSAP_FLUX") {
  const card = (s: string) => s.padEnd(80, " ");
  const header = (cards: string[]) => {
    const all = [...cards, "END"].map(card).join("");
    return all.padEnd(Math.ceil(all.length / 2880) * 2880, " ");
  };
  const kv = (k: string, v: string | number) => `${k.padEnd(8)}= ${typeof v === "string" ? `'${v}'`.padEnd(20) : String(v).padStart(20)}`;
  const primary = header([kv("SIMPLE", "T").replace("'T'", "T").replace(/= +T/, "=                    T"), kv("BITPIX", 8), kv("NAXIS", 0), kv("OBJECT", "TIC 1"), kv("TESSMAG", 9.5)]);
  const table = header([kv("XTENSION", "BINTABLE"), kv("BITPIX", 8), kv("NAXIS", 2), kv("NAXIS1", 16), kv("NAXIS2", rows.length), kv("PCOUNT", 0), kv("GCOUNT", 1), kv("TFIELDS", 3),
    kv("TTYPE1", "TIME"), kv("TFORM1", "D"), kv("TTYPE2", fluxName), kv("TFORM2", "E"), kv("TTYPE3", "QUALITY"), kv("TFORM3", "J"), kv("EXTNAME", "LIGHTCURVE")]);
  const data = new ArrayBuffer(Math.ceil((16 * rows.length) / 2880) * 2880);
  const v = new DataView(data);
  rows.forEach(([t, f, q], i) => { v.setFloat64(i * 16, t); v.setFloat32(i * 16 + 8, f); v.setInt32(i * 16 + 12, q); });
  const enc = new TextEncoder();
  const out = new Uint8Array(primary.length + table.length + data.byteLength);
  out.set(enc.encode(primary), 0);
  out.set(enc.encode(table), primary.length);
  out.set(new Uint8Array(data), primary.length + table.length);
  return out.buffer;
}

describe("FITS reader", () => {
  it("reads headers and big-endian binary-table columns", () => {
    const buf = fitsFile([[1500.5, 1234.5, 0], [1500.6, NaN, 0], [1500.7, 1200, 128]]);
    const hdus = readHdus(buf);
    expect(hdus).toHaveLength(2);
    expect(hdus[0].header.OBJECT).toBe("TIC 1");
    expect(hdus[0].header.TESSMAG).toBe(9.5);
    expect(hdus[1].header.EXTNAME).toBe("LIGHTCURVE");
    const tab = readTable(buf, hdus[1], ["TIME", "PDCSAP_FLUX", "QUALITY", "MISSING"]);
    expect(tab.rows).toBe(3);
    expect([...tab.columns.TIME]).toEqual([1500.5, 1500.6, 1500.7]);
    expect(tab.columns.PDCSAP_FLUX[0]).toBeCloseTo(1234.5);
    expect(Number.isNaN(tab.columns.PDCSAP_FLUX[1])).toBe(true);
    expect([...tab.columns.QUALITY]).toEqual([0, 0, 128]);
    expect(tab.columns.MISSING).toBeUndefined();
  });
  it("reads QLP light curves under both flux column names (KSPSAP_FLUX, later DET_FLUX)", () => {
    for (const name of ["KSPSAP_FLUX", "DET_FLUX"]) {
      const lc = parseLightCurve(fitsFile([[1500.5, 1234.5, 0]], name), { tic: "1", pipeline: "QLP", sector: 104 });
      expect(lc.flux[0]).toBeCloseTo(1234.5);
    }
    expect(() => parseLightCurve(fitsFile([[1500.5, 1, 0]], "SAP_FLUX"), { tic: "1", pipeline: "QLP", sector: 104 })).toThrow(/DET_FLUX/);
  });
  it("rejects files that aren't FITS", () => {
    expect(() => readHdus(new TextEncoder().encode("<html>".padEnd(2880)).buffer as ArrayBuffer)).toThrow(/not a FITS/);
  });
});

describe("Vetter", () => {
  const star = { tic: "100", ra: 24.32, dec: -45.68, otype: "" };
  const planet = { period: 0.9415, depth: 7e-3, oddEven: 0.02, oddEvenSigma: 1, secondary: 1e-5, secondarySigma: 0.5 };
  const base = { star, known: [], neighbours: [], others: [] };
  it("passes a clean signal as an unvetted candidate, never a discovery", () => {
    const v = vetSignal(planet, base);
    expect(v.kind).toBe("candidate");
    expect(v.label).toBe("Unvetted transit candidate");
    expect(vetSignal(planet, { ...base, unchecked: ["TOI list"] }).reasons.join(" ")).toMatch(/may already be known/);
  });
  it("recovers a known planet on the star, including at twice the period", () => {
    const known = [{ tic: "100", name: "X b", period: 0.4707, ra: 24.32, dec: -45.68, kind: "planet" as const }];
    expect(vetSignal(planet, { ...base, known })).toMatchObject({ kind: "known-planet", label: "Known planet recovered: X b" });
  });
  it("attributes a known planet's period on a neighbour to contamination", () => {
    // WASP-18 and TIC 100100829 are 1.4′ apart: the neighbour's light curve shows WASP-18 b.
    const known = [{ tic: "100100827", name: "WASP-18 b", period: 0.94145, ra: 24.3543, dec: -45.6779, kind: "planet" as const }];
    const v = vetSignal(planet, { ...base, star: { tic: "100100829", ra: 24.322, dec: -45.6825, otype: "" }, known });
    expect(v.kind).toBe("contamination");
    expect(v.label).toMatch(/WASP-18 b's host, 1\.4′ away/);
    // Far away (10′): not contamination, so the signal stands on its own.
    expect(vetSignal(planet, { ...base, known: [{ ...known[0], dec: -45.5 }] }).kind).toBe("candidate");
  });
  it("labels TOIs with their disposition", () => {
    const known = [{ tic: "100", name: "TOI-185.01", period: 0.9415, ra: 24.32, dec: -45.68, kind: "toi" as const, disposition: "PC" }];
    expect(vetSignal(planet, { ...base, known }).label).toBe("Known TOI recovered: TOI-185.01 (planet candidate)");
  });
  it("flags eclipsing-binary signs, but not a hot Jupiter's small occultation", () => {
    expect(vetSignal({ ...planet, oddEven: 0.4, oddEvenSigma: 8 }, base).kind).toBe("eclipsing-binary");
    expect(vetSignal({ ...planet, secondary: 2e-3, secondarySigma: 20 }, base).kind).toBe("eclipsing-binary");
    expect(vetSignal({ ...planet, secondary: 2e-4, secondarySigma: 15 }, base).kind).toBe("candidate"); // ~3% of depth, like WASP-18 b
    expect(vetSignal({ ...planet, depth: 0.05 }, base).kind).toBe("eclipsing-binary");
    expect(vetSignal(planet, { ...base, starRadius: 30 }).reasons.join(" ")).toMatch(/star-sized/);
    expect(vetSignal(planet, { ...base, neighbours: [{ name: "V* XX Phe", otype: "EB*", ra: 24.3205, dec: -45.6795 }] }).reasons.join(" ")).toMatch(/V\* XX Phe/);
    expect(vetSignal(planet, { ...base, star: { ...star, otype: "EB*" } }).kind).toBe("eclipsing-binary");
  });
  it("calls a period shared with another star systematic, or contamination when that star is close and deeper", () => {
    const far = { tic: "200", period: 0.9416, depth: 1e-3, ra: 30, dec: -45 };
    expect(vetSignal(planet, { ...base, others: [far] }).kind).toBe("systematic");
    const near = { tic: "300", period: 0.9415, depth: 0.02, ra: 24.33, dec: -45.68 };
    expect(vetSignal(planet, { ...base, others: [near] }).kind).toBe("contamination");
  });
  it("matches periods at factors of two only", () => {
    expect(periodsMatch(1.883, 0.9415)).toBe(true);
    expect(periodsMatch(5.99, 6.27)).toBe(false);
  });
  it("builds a TOI box query that wraps RA through 0°", () => {
    expect(toiQuery({ ra: 0.2, dec: 10, radius: 1 })).toMatch(/\(ra >= 359\.\d+ or ra <= 1\.\d+\)/);
    expect(toiQuery({ ra: 87.08, dec: 0.29, radius: 3 })).toMatch(/ra between 84\.\d+ and 90\.\d+ and dec between -2\.\d+ and 3\.\d+/);
  });
});

describe("TESS light-curve inventory", () => {
  const cone = { ra: 87.0846, dec: 0.2857, radius: 3 };
  const row = (tic: string, prov: string, sector: number, uri: string, ra = 87, dec = 0.3) => ({ obs_collection: prov === "SPOC" ? "TESS" : "HLSP", provenance_name: prov, target_name: tic, sequence_number: sector, t_exptime: 120, dataURL: uri, s_ra: ra, s_dec: dec });
  const json = {
    status: "COMPLETE",
    data: [
      row("282199717", "SPOC", 33, "mast:TESS/product/tess2020351194500-s0033-0000000282199717-0203-s_lc.fits", 89.48, 1.22),
      row("282199717", "SPOC", 87, "mast:TESS/product/tess2024353092137-s0087-0000000282199717-0284-s_lc.fits", 89.48, 1.22),
      row("282199717", "SPOC", 87, "mast:TESS/product/tess2024353092137-s0087-0000000282199717-0284-a_fast-lc.fits", 89.48, 1.22),
      row("158734620", "QLP", 6, "mast:HLSP/qlp/s0006/0000/0001/5873/4620/hlsp_qlp_tess_ffi_s0006-0000000158734620_tess_v01_llc.fits"),
      row("999", "SPOC", 6, "mast:TESS/product/x-s_lc.fits", 95, 0.3), // outside the 3° circle
      row("123", "SPOC", 6, "mast:TESS/product/tess-dvt.fits"),
    ],
  };
  it("keeps light-curve files, skips 20 s fast cadence and other products", () => {
    const p = parseLcProducts(json);
    expect(p.map((x) => `${x.tic}:${x.pipeline}:${x.sector}`)).toEqual(["282199717:SPOC:33", "282199717:SPOC:87", "158734620:QLP:6", "999:SPOC:6"]);
    expect(() => parseLcProducts({ status: "ERROR" })).toThrow(/ERROR/);
  });
  it("merges SIMBAD stars with SPOC targets inside the circle and picks SPOC first, latest sector", () => {
    const products = parseLcProducts(json);
    const stars = mergeStars(cone, [{ tic: "158734620", name: "HD 38856", otype: "*", ra: 87.19, dec: 0.73, vmag: 7.25 }], products);
    expect(stars.map((s) => s.tic).sort()).toEqual(["158734620", "282199717"]);
    const picks = pickLightCurves(cone, stars, products, 10);
    expect(picks.map((x) => `${x.star.tic}:${x.product.pipeline}:${x.product.sector}`)).toEqual(["282199717:SPOC:87", "158734620:QLP:6"]);
    expect(pickLightCurves(cone, stars, products, 1)).toHaveLength(1);
  });
  it("covers the cone with RA ranges split across 0° and opened up near a pole", () => {
    expect(coneBox({ ra: 87, dec: 0, radius: 3 }).ra).toHaveLength(1);
    const wrap = coneBox({ ra: 1, dec: 0, radius: 3 }).ra;
    expect(wrap).toHaveLength(2);
    expect(wrap[1].max).toBe(360);
    expect(coneBox({ ra: 10, dec: 88, radius: 2 }).ra).toEqual([{ min: 0, max: 360 }]);
  });
  it("builds a MAST download URL for a product", () => {
    expect(mastDownloadUrl("mast:TESS/product/a_lc.fits")).toBe("https://mast.stsci.edu/api/v0.1/Download/file?uri=mast%3ATESS%2Fproduct%2Fa_lc.fits");
  });
});

describe("per-star analysis pipeline", () => {
  it("finds an injected transit and a rotation period from raw SPOC-like columns", () => {
    const s = sector({ noise: 6e-4, seed: 21, transit: { P: 2.93, t0: 1468.7, dur: 0.1, depth: 1.5e-3 }, sine: { P: 5.5, amp: 6e-3 } });
    // Back to raw flux with a quality flag on a few cadences and a NaN, as a real file has.
    const flux = Array.from(s.f, (f) => f * 51234), quality = Array.from(s.t, (_, i) => (i % 500 === 7 ? 128 : 0));
    flux[100] = NaN;
    const a = analyseLightCurve({ time: s.t, flux: Float64Array.from(flux), quality: Float64Array.from(quality) });
    expect(a.transit!.period).toBeCloseTo(2.93, 1);
    expect(blsDetected(a.transit!)).toBe(true);
    expect(a.ls.period).toBeCloseTo(5.5, 0);
    expect(isVariable(a.ls)).toBe(true);
  });
  it("refuses background-dominated light curves", () => {
    expect(() => cleanSeries([1, 2, 3, 4], [-5, 3, -1, 2])).toThrow(/too faint/);
  });
});
