import { describe, expect, it } from "vitest";
import { separation } from "./geom";
import { VSX_SELF_ARCSEC, vsxEntry, vsxWithin, type VsxStar } from "./vsx";

// Deterministic pseudo-random numbers.
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe("vsxWithin", () => {
  it("matches a brute-force filter, through RA 0°/360° and near the poles", () => {
    const r = rng(7);
    for (const [ra0, dec0] of [[97.8, -60.7], [0.5, 10], [359.7, -5], [180, 88.5], [45, -89.6]]) {
      const vsx: VsxStar[] = Array.from({ length: 4000 }, (_, i) => ({ name: `V${i}`, type: "RRAB", ra: ((ra0 + (r() - 0.5) * 8) % 360 + 360) % 360, dec: Math.max(-90, Math.min(90, dec0 + (r() - 0.5) * 4)) }));
      for (let k = 0; k < 60; k++) {
        const pos = { ra: ((ra0 + (r() - 0.5) * 6) % 360 + 360) % 360, dec: Math.max(-90, Math.min(90, dec0 + (r() - 0.5) * 3)) };
        for (const arcmin of [VSX_SELF_ARCSEC / 60, 2.5, 30]) {
          const brute = vsx.filter((v) => separation(pos.ra, pos.dec, v.ra, v.dec) * 60 <= arcmin);
          expect(vsxWithin(pos, vsx, arcmin)).toEqual(brute);
        }
      }
    }
  });

  it("vsxEntry picks the nearest entry within the self radius", () => {
    const vsx: VsxStar[] = [{ name: "far", type: "EA", ra: 10, dec: 0.01 }, { name: "near", type: "EA", ra: 10.001, dec: 0 }, { name: "mid", type: "EA", ra: 10, dec: 0.002 }];
    expect(vsxEntry({ ra: 10, dec: 0 }, vsx)?.name).toBe("near");
    expect(vsxEntry({ ra: 20, dec: 0 }, vsx)).toBeUndefined();
  });
});
