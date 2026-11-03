// Watchlist: a finished sweep's viable finds (tiers A-C) are vetted again whenever MAST publishes a TESS
// sector of their star that wasn't there before. Most are lone dips that only a second transit can confirm
// or rule out, and TESS comes back to the same sky every year or two, so nothing else will settle them.
//
// One JSON file beside the surveys (<SKY_SURVEY_DIR>/watch/watchlist.json; not in the folder itself, where
// the file store takes every .json for a survey), read and written by the watchdog of
// a long-running server (skyWatchdog.ts; serverless has none, so nothing is watched there). A sweep row
// isn't touched (a finished sweep has no lease to write under): GET /api/sky/sweep/:id lays each find's
// watch over it (withWatch). The first look at a star records the sectors already there (its vet used
// them); later looks re-vet only when a new sector number appears, in any pipeline.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTileFindId } from "./sweepGrid";
import { sameFind, vetInputFrom, type VetInput, type VetReport, type VetTier } from "./vetShared";
import type { SkyNote, SkyObject, SurveySummary } from "./types";

/** How often a watched star's sectors are looked up: TESS releases a sector about once a month. */
export const WATCH_EVERY_MS = 3 * 24 * 3600_000;
const WATCHED: VetTier[] = ["A", "B", "C"];

export type WatchCheck = { at: number; newSectors: number[]; tier?: VetTier; reason?: string; error?: string };
export type WatchEntry = {
  sweepId: string; vetKey: string; tile: number; input: VetInput;
  /** The latest verdict: the sweep's, then each re-vet's. */
  tier: VetTier; reason?: string;
  /** Sector numbers with a light curve of the star at the last look. */
  sectors: number[];
  addedAt: number;
  /** Last MAST look; 0 before the first. */
  checkedAt: number;
  /** Set when a re-vet rejects the find (X) or finds it catalogued (K): no more looks. */
  retired?: boolean;
  history: WatchCheck[];
};
export type WatchFile = { seeded: string[]; entries: Record<string, WatchEntry> };

export const watchKey = (sweepId: string, vetKey: string) => `${sweepId}/${vetKey}`;
export const emptyWatch = (): WatchFile => ({ seeded: [], entries: {} });

/** Adds a finished sweep's viable vets whose finds are still on the map. True if it was new. */
export function seedSweep(w: WatchFile, summary: SurveySummary, objects: SkyObject[], now = Date.now()): boolean {
  if (!summary.sweep || summary.status === "running" || w.seeded.includes(summary.id)) return false;
  const finds = objects.flatMap((o) => { const input = vetInputFrom(o), at = parseTileFindId(o.id); return input && at ? [{ input, tile: at.tile }] : []; });
  for (const [key, v] of Object.entries(summary.sweep.vets ?? {})) {
    if (v.status !== "done" || !v.tier || !WATCHED.includes(v.tier)) continue;
    if (!finds.some((f) => f.tile === v.tile && sameFind(f.input, v.input))) continue;
    const k = watchKey(summary.id, key);
    w.entries[k] ??= { sweepId: summary.id, vetKey: key, tile: v.tile, input: v.input, tier: v.tier, reason: v.reason, sectors: [], addedAt: now, checkedAt: 0, history: [] };
  }
  w.seeded.push(summary.id);
  return true;
}

export type WatchDeps = {
  /** Sector numbers with a light curve of the star, any pipeline. */
  sectorsOf: (tic: string) => Promise<number[]>;
  vet: (input: VetInput) => Promise<VetReport>;
  now?: number;
  /** Stars looked up per call. */
  maxLooks?: number;
  log?: (s: string) => void;
};

/** Looks up the stars that are due (oldest look first) and re-vets those with a new sector. Changes `w`;
 *  returns what it did. One lookup per star, shared by its entries (a star can have several finds). */
export async function checkWatch(w: WatchFile, deps: WatchDeps): Promise<{ looked: number; vetted: number }> {
  const now = deps.now ?? Date.now();
  const due = Object.values(w.entries).filter((e) => !e.retired && (!e.checkedAt || now - e.checkedAt >= WATCH_EVERY_MS)).sort((a, b) => a.checkedAt - b.checkedAt);
  const tics = [...new Set(due.map((e) => e.input.tic))].slice(0, deps.maxLooks ?? 20);
  let looked = 0, vetted = 0;
  for (const tic of tics) {
    let sectors: number[];
    try { sectors = [...new Set(await deps.sectorsOf(tic))].sort((a, b) => a - b); }
    catch (e) { deps.log?.(`TIC ${tic}: sector lookup failed (${(e as Error).message.slice(0, 80)})`); continue; }
    looked++;
    for (const e of due.filter((x) => x.input.tic === tic)) {
      const first = e.checkedAt === 0;
      const fresh = first ? [] : sectors.filter((s) => !e.sectors.includes(s));
      e.checkedAt = now;
      if (!fresh.length) { e.sectors = [...new Set([...e.sectors, ...sectors])].sort((a, b) => a - b); continue; }
      try {
        const r = await deps.vet(e.input);
        vetted++;
        e.tier = r.tier; e.reason = r.tierReason;
        e.sectors = [...new Set([...e.sectors, ...sectors])].sort((a, b) => a - b);
        e.history.push({ at: now, newSectors: fresh, tier: r.tier, reason: r.tierReason });
        if (!WATCHED.includes(r.tier)) e.retired = true;
      } catch (err) {
        // Sectors kept as they were: the next look tries the vet again.
        e.history.push({ at: now, newSectors: fresh, error: (err as Error).message.slice(0, 160) });
      }
    }
  }
  return { looked, vetted };
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const list = (s: number[]) => s.join(", ");

/** The sweep's finds and notebook with their watch laid over: props.watch says what's watched and since
 *  when; a re-vet's verdict replaces the sweep's (props.vet / props.vetted). */
export function withWatch(sweepId: string, objects: SkyObject[], notes: SkyNote[], w: WatchFile): { objects: SkyObject[]; notes: SkyNote[] } {
  const mine = Object.values(w.entries).filter((e) => e.sweepId === sweepId);
  if (!mine.length) return { objects, notes };
  const extra: SkyNote[] = [];
  const out = objects.map((o) => {
    const input = vetInputFrom(o), at = parseTileFindId(o.id);
    const e = input && at && mine.find((x) => x.tile === at.tile && sameFind(x.input, input));
    if (!e) return o;
    const props = { ...o.props };
    const last = [...e.history].reverse().find((h) => h.tier);
    if (last) { props.vet = last.tier!; props.vetted = `tier ${last.tier}: ${last.reason ?? ""} (vetted again ${day(last.at)}, with new TESS sector${last.newSectors.length === 1 ? "" : "s"} ${list(last.newSectors)})`; }
    props.watch = e.retired ? `no longer watched: tier ${e.tier} with sector${last && last.newSectors.length === 1 ? "" : "s"} ${list(last?.newSectors ?? [])}`
      : e.checkedAt ? `watching for new TESS sectors (has ${list(e.sectors)}; last looked ${day(e.checkedAt)})` : "watching for new TESS sectors (not looked up yet)";
    for (const h of e.history) {
      extra.push({ agent: "vetting", ids: [o.id], text: h.tier ? `New TESS data on TIC ${e.input.tic} (sector${h.newSectors.length === 1 ? "" : "s"} ${list(h.newSectors)}): vetted again, tier ${h.tier}, ${h.reason ?? ""}.`
        : `New TESS data on TIC ${e.input.tic} (sector${h.newSectors.length === 1 ? "" : "s"} ${list(h.newSectors)}), but vetting it again failed (${h.error ?? ""}).` });
    }
    return { ...o, props };
  });
  return { objects: out, notes: [...notes, ...extra] };
}

// ── the file ────────────────────────────────────────────────────────────────

export const watchPath = (dir = process.env.SKY_SURVEY_DIR || join(tmpdir(), "coordinate-sky-surveys")) => join(dir, "watch", "watchlist.json");

export async function readWatch(path = watchPath()): Promise<WatchFile> {
  try { return { ...emptyWatch(), ...(JSON.parse(await readFile(path, "utf8")) as WatchFile) }; } catch { return emptyWatch(); }
}

export async function writeWatch(w: WatchFile, path = watchPath()) {
  await mkdir(join(path, ".."), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(w));
  await rename(tmp, path);
}
