import { mkdtempSync, readdirSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pruneDisk } from "./http";

describe("http disk cache", () => {
  it("deletes the oldest files until the cache fits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "http-"));
    for (const [i, name] of ["old", "mid", "new"].entries()) {
      writeFileSync(join(dir, name), Buffer.alloc(1000));
      utimesSync(join(dir, name), 1000 + i, 1000 + i);
    }
    await pruneDisk(dir, 2500);
    expect(readdirSync(dir).sort()).toEqual(["mid", "new"]);
  });
});
