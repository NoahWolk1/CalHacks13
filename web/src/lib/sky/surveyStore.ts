// Where deep surveys live between steps. SpacetimeDB when it's configured (production: the same
// database as the live missions, tables sky_surveys + sky_survey_stars in web/spacetime), otherwise
// JSON files on local disk (dev; on Vercel without SpacetimeDB that's /tmp, which doesn't outlive an
// instance, so surveys there only run while one instance stays warm).
//
// A step holds the survey's lease while it works; saves from anyone else are refused, so a step that
// lost its lease (it ran past the lease, another took over) stops instead of overwriting.
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callReducer, spacetimeConfig, SpacetimeError, sql } from "@/lib/server/spacetimeRun";
import type { EbNeighbour, KnownSignal } from "./vetting";
import type { VsxStar } from "./vsx";
import type { SkyNote, SkyObject, SurveyStar, SurveyStatus, SurveySummary } from "./types";

/** Cross-match catalogs for the whole field, fetched once when the survey is planned. */
export type SurveyField = { known: KnownSignal[]; neighbours: EbNeighbour[]; vsx?: VsxStar[]; unchecked: string[] };

export type SurveyRow = { summary: SurveySummary; notes: SkyNote[]; objects: SkyObject[]; leaseOwner: string; leaseUntil: number };

export interface SurveyStore {
  name: "spacetime" | "file";
  create(summary: SurveySummary): Promise<void>;
  get(id: string): Promise<SurveyRow | null>;
  stars(id: string): Promise<SurveyStar[]>;
  field(id: string): Promise<SurveyField | null>;
  /** Most recent first. */
  list(limit: number): Promise<SurveySummary[]>;
  /** Takes (or extends) the lease; false while someone else holds it or the survey isn't running. */
  lease(id: string, owner: string, untilMs: number): Promise<boolean>;
  release(id: string, owner: string): Promise<void>;
  /** Saves the survey row and the changed stars, only while holding the lease. Returns the stored
   *  status: a stop requested meanwhile wins over the status passed in. */
  save(id: string, owner: string, data: { summary: SurveySummary; notes: SkyNote[]; objects: SkyObject[]; field?: SurveyField }, stars: SurveyStar[]): Promise<SurveyStatus>;
  stop(id: string): Promise<boolean>;
}

export class LeaseLost extends Error {}

const SURVEY_ID = /^[A-Za-z0-9_-]{6,64}$/;
export const validSurveyId = (id: string) => SURVEY_ID.test(id);

// ── files (dev) ─────────────────────────────────────────────────────────────

type FileDoc = { summary: SurveySummary; notes: SkyNote[]; objects: SkyObject[]; field: SurveyField | null; leaseOwner: string; leaseUntil: number; stars: Record<string, SurveyStar> };

export function fileStore(dir = process.env.SKY_SURVEY_DIR || join(tmpdir(), "coordinate-sky-surveys")): SurveyStore {
  const path = (id: string) => join(dir, `${id}.json`);
  // One process owns the files: serialise each survey's read-modify-writes.
  const locks = new Map<string, Promise<unknown>>();
  const locked = <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
    const p = (locks.get(id) ?? Promise.resolve()).then(fn, fn);
    locks.set(id, p.catch(() => {}));
    return p;
  };
  const read = async (id: string): Promise<FileDoc | null> => {
    if (!validSurveyId(id)) return null;
    try { return JSON.parse(await readFile(path(id), "utf8")) as FileDoc; } catch { return null; }
  };
  const write = async (doc: FileDoc) => {
    await mkdir(dir, { recursive: true });
    const tmp = `${path(doc.summary.id)}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(doc));
    await rename(tmp, path(doc.summary.id));
  };
  return {
    name: "file",
    create: (summary) => locked(summary.id, () => write({ summary, notes: [], objects: [], field: null, leaseOwner: "", leaseUntil: 0, stars: {} })),
    async get(id) { const d = await read(id); return d && { summary: d.summary, notes: d.notes, objects: d.objects, leaseOwner: d.leaseOwner, leaseUntil: d.leaseUntil }; },
    async stars(id) { return Object.values((await read(id))?.stars ?? {}); },
    async field(id) { return (await read(id))?.field ?? null; },
    async list(limit) {
      const files = await readdir(dir).catch(() => [] as string[]);
      const docs = await Promise.all(files.filter((f) => f.endsWith(".json")).map((f) => read(f.slice(0, -5))));
      return docs.flatMap((d) => (d ? [d.summary] : [])).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    },
    lease: (id, owner, untilMs) => locked(id, async () => {
      const d = await read(id);
      if (!d || d.summary.status !== "running") return false;
      if (d.leaseOwner && d.leaseOwner !== owner && d.leaseUntil > Date.now()) return false;
      await write({ ...d, leaseOwner: owner, leaseUntil: untilMs });
      return true;
    }),
    release: (id, owner) => locked(id, async () => {
      const d = await read(id);
      if (d && d.leaseOwner === owner) await write({ ...d, leaseOwner: "", leaseUntil: 0 });
    }),
    save: (id, owner, data, stars) => locked(id, async () => {
      const d = await read(id);
      if (!d) throw new Error("unknown survey");
      if (d.leaseOwner !== owner) throw new LeaseLost("lease lost");
      const status = d.summary.status === "stopped" ? "stopped" : data.summary.status;
      const next: FileDoc = { ...d, summary: { ...data.summary, status }, notes: data.notes, objects: data.objects, field: data.field ?? d.field, stars: { ...d.stars } };
      for (const s of stars) next.stars[s.tic] = s;
      await write(next);
      return status;
    }),
    stop: (id) => locked(id, async () => {
      const d = await read(id);
      if (!d || d.summary.status !== "running") return false;
      await write({ ...d, summary: { ...d.summary, status: "stopped", updatedAt: Date.now() } });
      return true;
    }),
  };
}

// ── SpacetimeDB (production) ────────────────────────────────────────────────

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** Reducer arguments stay well under SpacetimeDB's message limits: stars go up in chunks. */
const STAR_CHUNK_BYTES = 400_000;

export const spacetimeSurveyStore: SurveyStore = {
  name: "spacetime",
  async create(summary) {
    await callReducer("create_survey", [summary.id, JSON.stringify(summary)]);
  },
  async get(id) {
    if (!validSurveyId(id)) return null;
    const rows = await sql(`SELECT status, summary_json, notes_json, objects_json, lease_owner, lease_until_ms FROM sky_surveys WHERE survey_id = ${quote(id)}`, 15_000);
    const r = rows[0];
    if (!r) return null;
    const summary = JSON.parse(String(r[1])) as SurveySummary;
    return { summary: { ...summary, status: String(r[0]) as SurveyStatus }, notes: JSON.parse(String(r[2] || "[]")), objects: JSON.parse(String(r[3] || "[]")), leaseOwner: String(r[4] ?? ""), leaseUntil: Number(r[5] ?? 0) };
  },
  async stars(id) {
    const rows = await sql(`SELECT star_json FROM sky_survey_stars WHERE survey_id = ${quote(id)}`, 30_000);
    return rows.map((r) => JSON.parse(String(r[0])) as SurveyStar);
  },
  async field(id) {
    const rows = await sql(`SELECT field_json FROM sky_surveys WHERE survey_id = ${quote(id)}`, 15_000);
    return rows[0]?.[0] ? (JSON.parse(String(rows[0][0])) as SurveyField) : null;
  },
  async list(limit) {
    const rows = await sql(`SELECT status, summary_json FROM sky_surveys`, 15_000);
    return rows.map((r) => ({ ...(JSON.parse(String(r[1])) as SurveySummary), status: String(r[0]) as SurveyStatus }))
      .sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  },
  async lease(id, owner, untilMs) {
    try { await callReducer("lease_survey", [id, owner, untilMs]); return true; }
    catch (e) { if (e instanceof SpacetimeError && /survey_busy|not running|unknown survey/.test(e.message)) return false; throw e; }
  },
  async release(id, owner) {
    await callReducer("release_survey", [id, owner]);
  },
  async save(id, owner, data, stars) {
    // Stars first (each chunk checks the lease), then the row, which reports the stored status.
    let chunk: { tic: string; star_json: string }[] = [], bytes = 0;
    const flush = async () => { if (chunk.length) await callReducer("put_survey_stars", [id, owner, chunk], 30_000).catch(rethrowLease); chunk = []; bytes = 0; };
    for (const s of stars) {
      const json = JSON.stringify(s);
      if (bytes + json.length > STAR_CHUNK_BYTES) await flush();
      chunk.push({ tic: s.tic, star_json: json }); bytes += json.length;
    }
    await flush();
    await callReducer("save_survey", [id, owner, data.summary.status, JSON.stringify(data.summary), JSON.stringify(data.notes), JSON.stringify(data.objects), data.field ? JSON.stringify(data.field) : ""], 30_000).catch(rethrowLease);
    const rows = await sql(`SELECT status FROM sky_surveys WHERE survey_id = ${quote(id)}`, 10_000);
    return String(rows[0]?.[0] ?? data.summary.status) as SurveyStatus;
  },
  async stop(id) {
    try { await callReducer("stop_survey", [id]); return true; }
    catch (e) { if (e instanceof SpacetimeError && /not running|unknown survey/.test(e.message)) return false; throw e; }
  },
};

function rethrowLease(e: unknown): never {
  if (e instanceof SpacetimeError && /lease_lost/.test(e.message)) throw new LeaseLost("lease lost");
  throw e;
}

const g = globalThis as unknown as { __skySurveyFiles?: SurveyStore };

export function surveyStore(): SurveyStore {
  if (spacetimeConfig() && process.env.SKY_SURVEY_BACKEND !== "file") return spacetimeSurveyStore;
  return (g.__skySurveyFiles ??= fileStore());
}
