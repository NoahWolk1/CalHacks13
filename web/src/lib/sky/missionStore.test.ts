import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fileMissionStore, missionRecorder, type MissionStore } from "./missionStore";
import { cleanMissionEdit, type MissionMeta, type SkyEvent } from "./types";

const meta = (id: string, createdAt = 1000): MissionMeta => ({ id, cone: { ra: 83.8, dec: -5.4, radius: 0.5 }, label: "Orion", createdAt, updatedAt: createdAt, status: "running" });
const note = (text: string): SkyEvent => ({ type: "analysis-note", note: { agent: "strategist", text }, ms: 1 } as unknown as SkyEvent);
const store = () => fileMissionStore(mkdtempSync(join(tmpdir(), "missions-")));

describe("fileMissionStore", () => {
  it("appends contiguously, ignores replayed events and refuses gaps", async () => {
    const s = store();
    await s.create(meta("aaaaaaaaaaaa"));
    await s.append("aaaaaaaaaaaa", 0, [note("a"), note("b")], "running", meta("aaaaaaaaaaaa"));
    // A retried append that overlaps what's stored adds only the new events.
    await s.append("aaaaaaaaaaaa", 1, [note("b"), note("c")], "done", meta("aaaaaaaaaaaa"));
    await expect(s.append("aaaaaaaaaaaa", 5, [note("x")], "done", meta("aaaaaaaaaaaa"))).rejects.toThrow(/seq gap/);
    const { events, next } = await s.events("aaaaaaaaaaaa", 1);
    expect(next).toBe(3);
    expect(events.map((e) => (e as Extract<SkyEvent, { type: "analysis-note" }>).note.text)).toEqual(["b", "c"]);
    expect((await s.get("aaaaaaaaaaaa"))?.status).toBe("done");
  });

  it("lists newest first and rejects bad ids", async () => {
    const s = store();
    await s.create(meta("bbbbbbbbbbbb", 1));
    await s.create(meta("cccccccccccc", 2));
    expect((await s.list(10)).map((m) => m.id)).toEqual(["cccccccccccc", "bbbbbbbbbbbb"]);
    expect(await s.get("../etc/passwd")).toBeNull();
  });
});

describe("renaming and categorizing", () => {
  it("cleans edits: trims, collapses spaces, caps length, ignores other fields", () => {
    expect(cleanMissionEdit({ name: "  Orion   deep ", category: "x".repeat(50), status: "done" })).toEqual({ name: "Orion deep", category: "x".repeat(32) });
    expect(cleanMissionEdit({ category: "" })).toEqual({ category: "" });
    expect(cleanMissionEdit({ name: 5 })).toBeNull();
    expect(cleanMissionEdit(null)).toBeNull();
  });

  it("keeps a rename made while the run is still recording, and clears with an empty string", async () => {
    const s = store(), id = "eeeeeeeeeeee";
    await s.create(meta(id));
    expect(await s.edit(id, { name: "Orion nebula sweep", category: "Demo" })).toMatchObject({ name: "Orion nebula sweep", category: "Demo", label: "Orion" });
    // The recorder saves the run's own meta, which never has a name or category.
    await s.append(id, 0, [note("a")], "done", { ...meta(id), headline: "done" });
    expect(await s.get(id)).toMatchObject({ name: "Orion nebula sweep", category: "Demo", headline: "done", status: "done" });
    await s.edit(id, { category: "" });
    const m = await s.get(id);
    expect(m?.category).toBeUndefined();
    expect(m?.name).toBe("Orion nebula sweep");
    expect(await s.edit("zzzzzzzzzzzz", { name: "x" })).toBeNull();
  });
});

describe("missionRecorder", () => {
  it("flushes in order, keeps the counts and the headline, and finishes with the status", async () => {
    const s = store(), m = meta("dddddddddddd");
    await s.create(m);
    const r = missionRecorder(s, { ...m }, 20);
    r.push(note("one"));
    r.push({ type: "results", objects: [{ id: "S1" }, { id: "S2" }], sources: [], ms: 5 } as unknown as SkyEvent);
    await vi.waitFor(async () => expect((await s.events("dddddddddddd", 0)).next).toBe(2));
    r.push({ type: "summary", summary: { headline: "Two stars", bullets: [], dropped: 0 }, ms: 9 } as unknown as SkyEvent);
    await r.finish("done");
    const got = await s.get("dddddddddddd");
    expect(got).toMatchObject({ status: "done", objects: 2, headline: "Two stars" });
    expect((await s.events("dddddddddddd", 0)).next).toBe(3);
  });

  it("stops recording after a failed append but never throws into the run", async () => {
    const append = vi.fn(async () => { throw new Error("down"); });
    const s = { ...store(), append } as MissionStore;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = missionRecorder(s, meta("eeeeeeeeeeee"), 60_000);
    r.push(note("x"));
    await r.finish("done");
    await r.finish("done");
    expect(append).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe("mission labels", () => {
  it("never shows 60 seconds", async () => {
    const { formatDec, formatRa } = await import("./geom");
    expect(formatRa(56.75)).toBe("03h47m00s");
    expect(formatRa(359.99999)).toBe("00h00m00s");
    expect(formatDec(24.11666666)).toBe("+24°07′00″");
    expect(formatDec(-5.391)).toBe("-05°23′28″");
  });
});
