import { describe, expect, it } from "vitest";
import { cameraBasis, toEcef } from "./sky";

describe("sky projection", () => {
  it("looks straight down at pitch 0 with north up", () => {
    const { fwd, up, right } = cameraBasis(0, 0, 0, 0);
    expect(fwd.map((x) => +x.toFixed(6))).toEqual([-1, 0, 0]);
    expect(up.map((x) => +x.toFixed(6))).toEqual([0, 0, 1]);
    expect(right.map((x) => +x.toFixed(6))).toEqual([0, 1, 0]);
  });
  it("bearing 90 puts east at the top of the screen", () => {
    const { up } = cameraBasis(0, 0, 90, 0);
    expect(up.map((x) => +x.toFixed(6))).toEqual([0, 1, 0]);
  });
  it("sidereal rotation maps RA = GAST onto the Greenwich meridian", () => {
    const v = toEcef([0, 1, 0], 6); // RA 6h, GAST 6h
    expect(v.map((x) => +x.toFixed(6))).toEqual([1, 0, 0]);
  });
});
