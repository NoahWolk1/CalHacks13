import { afterEach, describe, expect, it, vi } from "vitest";
import { simbad } from "./run";
import { simbadQuery, simbadTap } from "./simbad";

const tapJson = (rows: unknown[][], cols: string[]) => new Response(JSON.stringify({ metadata: cols.map((name) => ({ name })), data: rows }), { headers: { "Content-Type": "application/json" } });
// A request that never answers until it's aborted (the way CDS fails on some networks).
const hang = (init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))));

afterEach(() => vi.unstubAllGlobals());

describe("SIMBAD client", () => {
  it("falls over to the CfA mirror when CDS hangs", async () => {
    const hosts: string[] = [];
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
      hosts.push(new URL(url).host);
      expect(init?.method).toBe("POST");
      return url.includes("cfa.harvard") ? Promise.resolve(tapJson([["M 42"]], ["main_id"])) : hang(init);
    });
    const t0 = Date.now();
    const t = await simbadTap(`SELECT TOP 1 main_id FROM basic -- ${Math.random()}`, { timeoutMs: 10_000, signal: new AbortController().signal });
    expect(t.data).toEqual([["M 42"]]);
    expect(hosts).toEqual(["simbad.cds.unistra.fr", "simbad.cfa.harvard.edu"]);
    expect(Date.now() - t0).toBeLessThan(4_500);
  });

  it("asks the mirror at once when CDS refuses", async () => {
    vi.stubGlobal("fetch", (url: string) => Promise.resolve(url.includes("cfa.harvard") ? tapJson([["x"]], ["main_id"]) : new Response("blocked", { status: 403 })));
    const t0 = Date.now();
    await simbadTap(`SELECT 1 -- ${Math.random()}`, { timeoutMs: 10_000, signal: new AbortController().signal });
    expect(Date.now() - t0).toBeLessThan(1_500);
  });

  it("gives the run Gaia's bright stars when both SIMBAD hosts fail", async () => {
    vi.stubGlobal("fetch", (url: string) => {
      if (url.includes("gea.esac")) return Promise.resolve(new Response(`{"metadata":${JSON.stringify(["source_id", "ra", "dec", "phot_g_mean_mag", "bp_rp", "parallax"].map((name) => ({ name })))},"data":[[3017364132641119232,83.8,-5.4,4.6,0.1,2.5]]}`));
      return Promise.resolve(new Response("down", { status: 403 }));
    });
    const c = { ra: 83.8 + Math.random(), dec: -5.4, radius: 0.3 };
    const out = await simbad(c, new AbortController().signal);
    expect(Array.isArray(out)).toBe(false);
    const { objects, note } = out as { objects: { name: string; category: string }[]; note: string };
    expect(objects[0]).toMatchObject({ name: "Gaia DR3 3017364132641119232", category: "star" });
    expect(note).toMatch(/SIMBAD unreachable.*Gaia DR3/);
    expect(simbadQuery(c)).toContain("FROM basic");
  });

  it("stops waiting on SIMBAD for a few minutes once neither host answers", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", (_url: string, init?: RequestInit) => { calls++; return hang(init); });
    await expect(simbadTap(`SELECT 2 -- ${Math.random()}`, { timeoutMs: 3_500, signal: new AbortController().signal })).rejects.toThrow(/no answer/);
    const before = calls, t0 = Date.now();
    await expect(simbadTap(`SELECT 3 -- ${Math.random()}`, { timeoutMs: 3_500, signal: new AbortController().signal })).rejects.toThrow(/retrying in 5 min/);
    expect(calls).toBe(before);
    expect(Date.now() - t0).toBeLessThan(100);
  });
});
