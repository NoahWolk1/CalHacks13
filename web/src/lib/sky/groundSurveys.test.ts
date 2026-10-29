import { describe, expect, it } from "vitest";
import { atlasLightCurve, groupPhot, hjdToBtjd, mjdToBtjd, parseAtlas, parseSkyPatrol, pickSkyPatrolTarget, tdbMinusUtc, toZtfPoints } from "./groundSurveys";
import { ztfScore, ztfSeries } from "./periodRecovery";

const S = 1 / 86400;

describe("ground-survey times", () => {
  it("adds TDB − UTC by leap-second era", () => {
    expect(tdbMinusUtc(60000) / S).toBeCloseTo(69.184, 6);
    expect(tdbMinusUtc(57500) / S).toBeCloseTo(68.184, 6); // 2016: 36 leap seconds
    expect(tdbMinusUtc(56500) / S).toBeCloseTo(67.184, 6);
  });
  it("HJD (UTC) → BTJD", () => {
    expect(hjdToBtjd(2458328.70264)).toBeCloseTo(1328.70264 + 69.184 * S, 9);
  });
  it("geocentric MJD → BTJD: Earth is ~1 AU nearer a star opposite the Sun (499 s light time)", () => {
    // 2024 March equinox: the Sun at RA 0, so Earth (seen from the barycentre) at RA 180.
    const mjd = 60389.0, base = mjd + 2400000.5 - 2457000 + 69.184 * S;
    expect((mjdToBtjd(mjd, 180, 0) - base) / S).toBeGreaterThan(485);
    expect((mjdToBtjd(mjd, 180, 0) - base) / S).toBeLessThan(505);
    expect((mjdToBtjd(mjd, 0, 0) - base) / S).toBeLessThan(-485);
    expect(Math.abs(mjdToBtjd(mjd, 0, 90) - base) / S).toBeLessThan(10); // celestial pole: ⊥ to Earth's offset
  });
});

describe("ASAS-SN Sky Patrol v2", () => {
  it("prefers the stellar_main entry within 3″ over a VSX position", () => {
    // From a live cone search around WASP-4.
    const rows = [
      { asas_sn_id: 661427714402, ra_deg: 353.56286, dec_deg: -42.06141, catalog_sources: ["aavsovsx"] },
      { asas_sn_id: 360778417165, ra_deg: 353.56291485, dec_deg: -42.06177944, catalog_sources: ["stellar_main", "tic"] },
    ];
    expect(pickSkyPatrolTarget(rows, 353.5629, -42.0617)?.id).toBe("360778417165");
    expect(pickSkyPatrolTarget(rows, 353.6, -42.0617)).toBeUndefined();
  });
  it("keeps good-quality detections, derives the band from the camera, drops limits and flagged images", () => {
    const text = JSON.stringify({
      light_curve: {
        columns: ["jd", "flux", "flux_err", "mag", "mag_err", "limit", "fwhm", "image_id", "quality"],
        data: [
          [2457000.5, 38.2, 0.7, 12.5, 0.02, 17.1, 1.5, "bf123456", "G"],
          [2459000.5, 38.0, 0.7, 12.51, 0.015, 17.4, 1.4, "bC654321", "G"],
          [2459001.5, null, null, 17.3, 99.99, 17.3, 1.4, "bC654322", "G"], // upper limit
          [2459002.5, 30.0, 0.7, 12.9, 0.02, 15.2, 3.5, "bC654323", "B"], // bad image
          [2459003.5, null, null, null, 0.02, 15.2, 3.5, "bC654324", "G"],
        ],
      },
      meta: [{ ra_deg: 353.56, dec_deg: -42.06 }],
    });
    const pts = parseSkyPatrol(text);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toMatchObject({ band: "V", camera: "bf", mag: 12.5, err: 0.02 });
    expect(pts[1]).toMatchObject({ band: "g", camera: "bC" });
    expect(pts[0].t).toBeCloseTo(0.5 + 67.184 * S, 9); // Dec 2014: 35 leap seconds
  });
  it("reports the server's error body (light-curve servers down) instead of returning nothing", () => {
    expect(() => parseSkyPatrol('{"error": "lightcurve servers temporarily unavailable"}')).toThrow(/temporarily unavailable/);
  });
});


describe("ATLAS forced photometry", () => {
  const head = "###MJD          m      dm   uJy   duJy F err chi/N     RA       Dec        x        y     maj    min    phi    apfit mag5sig PA_DEG Sky   Obs";
  const row = (o: Partial<Record<string, string | number>> = {}) => {
    const v = { mjd: 59000.5, m: 13.4, dm: 0.003, ujy: 15700, dujy: 45, f: "o", err: 0, chi: 1.2, ra: 353.5629, dec: -42.0617, x: 5000, y: 4000, maj: 2.1, min: 2.0, phi: 10, apfit: -0.4, m5: 19.2, pa: 0.1, sky: 20.1, obs: "03a59000o0123o", ...o };
    return [v.mjd, v.m, v.dm, v.ujy, v.dujy, v.f, v.err, v.chi, v.ra, v.dec, v.x, v.y, v.maj, v.min, v.phi, v.apfit, v.m5, v.pa, v.sky, v.obs].join(" ");
  };
  it("converts flux to AB mag, applies the FAQ cuts and drops non-detections", () => {
    const text = [head, row(), row({ f: "c", obs: "01a59000o0001c", mjd: 59001.5 }),
      row({ err: 3 }), row({ x: 50 }), row({ maj: 6 }), row({ apfit: -1.5 }), row({ m5: 16 }), row({ sky: 16.5 }),
      row({ ujy: 100, dujy: 50 }), row({ ujy: -200, m: -18.1 }), row({ f: "H" })].join("\n");
    const pts = parseAtlas(text, 353.5629, -42.0617);
    expect(pts).toHaveLength(2);
    expect(pts[0]).toMatchObject({ band: "o", camera: "03a" });
    expect(pts[0].mag).toBeCloseTo(23.9 - 2.5 * Math.log10(15700), 9);
    expect(pts[0].err).toBeCloseTo(1.0857 * 45 / 15700, 5);
    expect(pts[1]).toMatchObject({ band: "c", camera: "01a" });
    // Mid-exposure (+15 s), TDB and the Rømer delay: within 8.5 min of the raw MJD.
    expect(Math.abs(pts[0].t - (59000.5 + 2400000.5 - 2457000))).toBeLessThan(510 * S);
    expect(() => parseAtlas("nope", 0, 0)).toThrow();
  });
  it("throws without a token, before touching the network", async () => {
    const prev = process.env.ATLAS_API_TOKEN;
    delete process.env.ATLAS_API_TOKEN;
    await expect(atlasLightCurve(0, 0, new AbortController().signal)).rejects.toThrow(/ATLAS_API_TOKEN/);
    if (prev !== undefined) process.env.ATLAS_API_TOKEN = prev;
  });
});

describe("into the ZTF period search", () => {
  it("groups by band and camera, and a box dip shows in ztfScore", () => {
    const P = 1.33823, t0 = 1000.3, T14 = 0.09;
    const pts: { t: number; mag: number; err: number; band: string; camera: string }[] = [];
    let s = 1;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 0.02;
    for (let i = 0; i < 600; i++) {
      const t = 1000 + i * 0.731, ph = (((t - t0) / P) % 1 + 1) % 1;
      const dip = Math.min(ph, 1 - ph) * P < T14 / 2 ? 0.027 : 0; // 2.5% in flux ≈ 0.027 mag
      pts.push({ t, mag: (i % 2 ? 12.4 : 12.6) + dip + rnd(), err: 0.01, band: i % 2 ? "V" : "g", camera: i % 2 ? "bf" : "bC" });
    }
    pts.push({ t: 2000, mag: 12, err: 0.01, band: "o", camera: "02a" }); // a lone point: too few for its own baseline
    const groups = groupPhot("ASAS-SN", pts);
    expect(groups.map((g) => `${g.band}:${g.camera}`).sort()).toEqual(["V:bf", "g:bC"]);
    expect(groups.every((g) => g.t.every((t, i) => !i || t >= g.t[i - 1]))).toBe(true);
    const z = ztfSeries(toZtfPoints(groups))!;
    const sc = ztfScore(z, P, t0, T14);
    expect(sc.depth).toBeGreaterThan(0.018);
    expect(sc.depth / sc.err).toBeGreaterThan(5);
    expect(ztfScore(z, P * 1.1, t0, T14).depth / sc.err).toBeLessThan(3);
  });
});
