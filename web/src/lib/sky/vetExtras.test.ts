import { describe, expect, it } from "vitest";
import { fitK, gaiaRvLimit, parseBigJson, tmagFromGaia, ztfDepths, type ZtfPoint } from "./archives";
import { combineSectors, differenceImage, erf, linearFit, psf, skyToPix, testSector, unzipFirst, type Cutout, type Wcs } from "./pixels";
import { eventStats, harmonicOf, modelShift, normInv, removePulsations } from "./robust";

// Deterministic noise.
function rng(seed: number) {
  let a = seed >>> 0;
  const u = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { u, n: () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()) };
}

describe("robust", () => {
  it("normInv inverts the normal CDF", () => {
    expect(normInv(0.5)).toBeCloseTo(0, 6);
    expect(normInv(0.975)).toBeCloseTo(1.959964, 4);
    expect(normInv(1e-6)).toBeCloseTo(-4.753424, 3);
  });

  const lc = (depth: number, red = 0, seed = 1) => {
    const r = rng(seed), P = 3, t0 = 0.5, T14 = 0.12, n = 27 * 288;
    const t = Float64Array.from({ length: n }, (_, i) => i / 288);
    let walk = 0;
    const f = Float64Array.from(t, (x) => {
      walk = walk * 0.97 + red * r.n();
      const ph = (((x - t0) / P) % 1 + 1) % 1;
      return 1 + 1e-3 * r.n() + walk - (Math.min(ph, 1 - ph) * P < T14 / 2 ? depth : 0);
    });
    return { s: { t, f }, P, t0, T14 };
  };
  it("model-shift: a real transit is unique, white noise has F_red ≈ 1", () => {
    const { s, P, t0, T14 } = lc(1.5e-3);
    const m = modelShift([s], P, t0, T14)!;
    expect(m.fred).toBeLessThan(1.4);
    expect(m.ms1).toBeGreaterThan(0);
    expect(m.ms2).toBeGreaterThan(0);
    expect(m.ms3).toBeGreaterThan(0);
  });
  it("model-shift: red noise raises F_red and a weak dip stops being unique", () => {
    const { s, P, t0, T14 } = lc(2e-4, 4e-4, 2);
    const m = modelShift([s], P, t0, T14)!;
    expect(m.fred).toBeGreaterThan(1.5);
    expect(m.ms1).toBeLessThan(0);
  });
  it("event stats: a signal made by 2 outliers dies when they're dropped", () => {
    const ev = Array.from({ length: 40 }, (_, i) => ({ depth: i < 2 ? 0.01 : 0, err: 0.001 }));
    const s = eventStats(ev);
    expect(s.outliers.length).toBe(2);
    expect(s.drop3.snr).toBeLessThan(1);
  });
  it("removes a δ Scuti pulsation and keeps the transit", () => {
    const r = rng(3), n = 20 * 288, P = 2, T14 = 0.1;
    const t = Float64Array.from({ length: n }, (_, i) => i / 288);
    const inT = (x: number) => { const ph = ((x / P) % 1 + 1) % 1; return Math.min(ph, 1 - ph) * P < T14 / 2; };
    const f = Float64Array.from(t, (x) => 1 + 2e-3 * Math.sin((2 * Math.PI * x) / 0.075) + 2e-4 * r.n() - (inT(x) ? 1e-3 : 0));
    const { series, removed } = removePulsations({ t, f }, inT);
    expect(removed[0].period).toBeCloseTo(0.075, 3);
    const inside = [...series.t.keys()].filter((i) => inT(series.t[i])), outside = [...series.t.keys()].filter((i) => !inT(series.t[i]));
    const mean = (ix: number[]) => ix.reduce((k, i) => k + series.f[i], 0) / ix.length;
    expect(mean(outside) - mean(inside)).toBeCloseTo(1e-3, 4);
  });
  it("finds harmonics", () => {
    expect(harmonicOf(0.5, [{ period: 0.25, amplitude: 1e-3 }])?.relation).toBe("is 2×");
    expect(harmonicOf(0.57, [{ period: 0.31, amplitude: 1e-3 }])).toBeNull();
  });
});

describe("pixels", () => {
  const wcs: Wcs = { crval1: 90, crval2: 45, crpix1: 6, crpix2: 6, cd: [-21 / 3600, 0, 0, 21 / 3600] };
  it("projects the reference pixel and offsets", () => {
    expect(skyToPix(wcs, 90, 45)).toEqual({ x: 5, y: 5 });
    const p = skyToPix(wcs, 90, 45 + 21 / 3600);
    expect(p.y).toBeCloseTo(6, 3);
    expect(erf(1)).toBeCloseTo(0.8427008, 6);
    expect(psf(11, 11, 5, 5, 0.8).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 3);
  });
  it("solves linear least squares", () => {
    const x = Float64Array.from({ length: 10 }, (_, i) => i), y = Float64Array.from(x, (v) => 2 * v + 3);
    const f = linearFit([x], y, new Float64Array(10).fill(1), true);
    expect(f.a[0]).toBeCloseTo(2, 8);
    expect(f.a[1]).toBeCloseTo(3, 8);
  });
  it("reads a stored zip entry", () => {
    const name = new TextEncoder().encode("a.fits"), data = new TextEncoder().encode("SIMPLE  = T");
    const local = new Uint8Array(30 + name.length + data.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(26, name.length, true); local.set(name, 30); local.set(data, 30 + name.length);
    const cd = new Uint8Array(46 + name.length), cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint32(20, data.length, true); cv.setUint16(28, name.length, true); cv.setUint32(42, 0, true); cd.set(name, 46);
    const end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(10, 1, true); ev.setUint32(16, local.length, true);
    const zip = new Uint8Array([...local, ...cd, ...end]);
    expect(new TextDecoder().decode(unzipFirst(zip.buffer))).toBe("SIMPLE  = T");
  });
  it("finds the eclipsing neighbour in a synthetic cutout", () => {
    const r = rng(5), nx = 11, np = nx * nx, P = 1, T14 = 0.1, n = 27 * 144;
    const t = Float64Array.from({ length: n }, (_, i) => 3000 + i / 144);
    const tgt = psf(nx, nx, 5, 5, 0.75), nb = psf(nx, nx, 7, 4, 0.75);
    const flux = new Float32Array(n * np);
    for (let i = 0; i < n; i++) {
      const ph = (((t[i] - 3000.3) / P) % 1 + 1) % 1, ecl = Math.min(ph, 1 - ph) * P < T14 / 2 ? 0.1 : 0;
      for (let p = 0; p < np; p++) flux[i * np + p] = 1e5 * tgt[p] + 1e4 * (1 - ecl) * nb[p] + 30 * r.n();
    }
    const c: Cutout = { sector: 1, nx, ny: nx, t, quality: new Float64Array(n), flux, wcs };
    const times = Array.from({ length: 27 }, (_, k) => 3000.3 + k);
    const at = (x: number, y: number) => ({ ra: 90 - ((x - 5) * 21) / 3600 / Math.cos((45 * Math.PI) / 180), dec: 45 + ((y - 5) * 21) / 3600 });
    const stars = [{ id: "target", label: "target", ...at(5, 5), tmag: 8 }, { id: "nb", label: "neighbour", ...at(7, 4), tmag: 10.5 }];
    const s = testSector(differenceImage(c, times, T14)!, stars, rng(9).u);
    const cmb = combineSectors([s]);
    expect(s.detection).toBeGreaterThan(10);
    expect(cmb.best?.id).toBe("nb");
    expect(cmb.stars.find((x) => x.id === "target")!.dchi2).toBeGreaterThan(9);
  });
});

describe("archives", () => {
  it("keeps Gaia source ids exact", () => {
    expect((parseBigJson('{"data":[[963025302348161536,1.5]]}') as { data: unknown[][] }).data[0][0]).toBe("963025302348161536");
  });
  it("converts Gaia G to T", () => expect(tmagFromGaia(10, 0.8)).toBeCloseTo(9.55, 1));
  it("bounds K from Gaia's epoch summary", () => {
    const l = gaiaRvLimit({ epochs: 15, err: 1.1, amplitude: 11.7, pvalue: 0.04, gof: 1.75 })!;
    expect(l.variable).toBe(false);
    expect(l.kMax).toBeGreaterThan(11.7 / 1.6);
    expect(gaiaRvLimit({ epochs: 4, err: 1, amplitude: 5 })).toBeNull();
  });
  it("fits K at a fixed phase and with a free phase", () => {
    const P = 2.5, t0 = 10, v = Array.from({ length: 8 }, (_, i) => { const t = 10 + i * 0.7; return { t, rv: 5 - 20 * Math.sin((2 * Math.PI * (t - t0)) / P), err: 0.1 }; });
    expect(fitK(v, P, t0)!.k).toBeCloseTo(20, 4);
    expect(fitK(v, P)!.k).toBeCloseTo(20, 4);
  });
  it("measures a ZTF depth per band", () => {
    const r = rng(7), pts: ZtfPoint[] = [];
    for (let i = 0; i < 800; i++) { const t = r.u() * 1000, ph = ((t / 2) % 1 + 1) % 1, inT = Math.min(ph, 1 - ph) * 2 < 0.04; pts.push({ t, mag: 15 + 0.01 * r.n() + (inT ? 0.0217 : 0), err: 0.01, band: i % 2 ? "g" : "r", oid: "1" }); }
    const d = ztfDepths(pts, 2, 0, 0.1);
    expect(d.g!.depth).toBeCloseTo(0.02, 2);
    expect(d.r!.depth).toBeCloseTo(0.02, 2);
  });
});
