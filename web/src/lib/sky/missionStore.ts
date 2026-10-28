// Recorded Research runs on /space ("missions"): the run's event stream, appended as it happens, so a
// shared /space?mission=<id> link can follow the run live or replay it later. SpacetimeDB when it's
// configured (tables sky_missions + sky_mission_events in web/spacetime), else JSON files (dev), the
// same choice as the deep-survey store.
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callReducer, spacetimeConfig, sql } from "@/lib/server/spacetimeRun";
import { validSurveyId } from "./surveyStore";
import { applyMissionEdit, type MissionEdit, type MissionMeta, type MissionStatus, type SkyEvent } from "./types";

export interface MissionStore {
  name: "spacetime" | "file";
  create(meta: MissionMeta): Promise<void>;
  /** Appends events starting at seq `from` (contiguous), with the status and the latest meta. */
  append(id: string, from: number, events: SkyEvent[], status: MissionStatus, meta: MissionMeta): Promise<void>;
  get(id: string): Promise<MissionMeta | null>;
  /** Events from seq `since` on, in order, and the next seq. */
  events(id: string, since: number): Promise<{ events: SkyEvent[]; next: number }>;
  /** Most recent first. */
  list(limit: number): Promise<MissionMeta[]>;
  /** Renames / categorizes a mission; returns the updated meta (null: no such mission). */
  edit(id: string, edit: MissionEdit): Promise<MissionMeta | null>;
}

/** The recorder saves the run's own meta, which has no name or category: keep the stored ones. */
const keepEdits = (stored: MissionMeta, incoming: MissionMeta): MissionMeta => ({
  ...incoming, ...(stored.name ? { name: stored.name } : {}), ...(stored.category ? { category: stored.category } : {}),
});

export const validMissionId = validSurveyId;

type FileDoc = { meta: MissionMeta; events: SkyEvent[] };

export function fileMissionStore(dir = join(process.env.SKY_SURVEY_DIR || join(tmpdir(), "coordinate-sky-surveys"), "missions")): MissionStore {
  const path = (id: string) => join(dir, `${id}.json`);
  const locks = new Map<string, Promise<unknown>>();
  const locked = <T,>(id: string, fn: () => Promise<T>): Promise<T> => {
    const p = (locks.get(id) ?? Promise.resolve()).then(fn, fn);
    locks.set(id, p.catch(() => {}));
    return p;
  };
  const read = async (id: string): Promise<FileDoc | null> => {
    if (!validMissionId(id)) return null;
    try { return JSON.parse(await readFile(path(id), "utf8")) as FileDoc; } catch { return null; }
  };
  const write = async (doc: FileDoc) => {
    await mkdir(dir, { recursive: true });
    const tmp = `${path(doc.meta.id)}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(doc));
    await rename(tmp, path(doc.meta.id));
  };
  return {
    name: "file",
    create: (meta) => locked(meta.id, () => write({ meta, events: [] })),
    append: (id, from, events, status, meta) => locked(id, async () => {
      const d = await read(id);
      if (!d) throw new Error("unknown mission");
      if (from > d.events.length) throw new Error(`seq gap: expected ${d.events.length}, got ${from}`);
      await write({ meta: { ...keepEdits(d.meta, meta), status }, events: [...d.events, ...events.slice(d.events.length - from)] });
    }),
    edit: (id, edit) => locked(id, async () => {
      const d = await read(id);
      if (!d) return null;
      d.meta = applyMissionEdit(d.meta, edit);
      await write(d);
      return d.meta;
    }),
    async get(id) { return (await read(id))?.meta ?? null; },
    async events(id, since) { const d = await read(id); return { events: d?.events.slice(since) ?? [], next: d?.events.length ?? 0 }; },
    async list(limit) {
      const files = await readdir(dir).catch(() => [] as string[]);
      const docs = await Promise.all(files.filter((f) => f.endsWith(".json")).map((f) => read(f.slice(0, -5))));
      return docs.flatMap((d) => (d ? [d.meta] : [])).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
    },
  };
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const metaOf = (r: unknown[]) => ({ ...(JSON.parse(String(r[1])) as MissionMeta), status: String(r[0]) as MissionStatus, updatedAt: Number(r[2]) });

export const spacetimeMissionStore: MissionStore = {
  name: "spacetime",
  async create(meta) { await callReducer("create_sky_mission", [meta.id, JSON.stringify(meta)]); },
  async append(id, from, events, status, meta) {
    await callReducer("append_sky_mission_events", [id, events.map((e, i) => ({ seq: from + i, event_json: JSON.stringify(e) })), status, JSON.stringify({ ...meta, status })], 30_000);
  },
  async get(id) {
    if (!validMissionId(id)) return null;
    const rows = await sql(`SELECT status, meta_json, updated_ms FROM sky_missions WHERE mission_id = ${quote(id)}`, 15_000);
    return rows[0] ? metaOf(rows[0]) : null;
  },
  async events(id, since) {
    if (!validMissionId(id)) return { events: [], next: 0 };
    const rows = await sql(`SELECT seq, event_json FROM sky_mission_events WHERE mission_id = ${quote(id)}`, 30_000);
    const all = rows.map((r) => ({ seq: Number(r[0]), e: JSON.parse(String(r[1])) as SkyEvent })).sort((a, b) => a.seq - b.seq);
    return { events: all.filter((x) => x.seq >= since).map((x) => x.e), next: all.length };
  },
  async list(limit) {
    const rows = await sql(`SELECT status, meta_json, updated_ms FROM sky_missions`, 15_000);
    return rows.map(metaOf).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  },
  async edit(id, edit) {
    if (!validMissionId(id)) return null;
    try {
      await callReducer("edit_sky_mission", [id, edit.name !== undefined, edit.name ?? "", edit.category !== undefined, edit.category ?? ""]);
    } catch (e) {
      if (/unknown mission/.test((e as Error).message)) return null;
      throw e;
    }
    return spacetimeMissionStore.get(id);
  },
};

const g = globalThis as unknown as { __skyMissionFiles?: MissionStore };

export function missionStore(): MissionStore {
  if (spacetimeConfig() && process.env.SKY_SURVEY_BACKEND !== "file") return spacetimeMissionStore;
  return (g.__skyMissionFiles ??= fileMissionStore());
}

/** Records a run's events: buffers them and appends every `everyMs`, in order, never two appends at
 *  once. Recording failures are logged and dropped; they never break the run itself. */
export function missionRecorder(store: MissionStore, meta: MissionMeta, everyMs = 1500) {
  const buf: SkyEvent[] = [];
  let seq = 0, chain = Promise.resolve(), broken = false;
  const flush = (status: MissionStatus) => {
    chain = chain.then(async () => {
      if (broken) return;
      const batch = buf.splice(0);
      meta.updatedAt = Date.now();
      meta.status = status;
      try { await store.append(meta.id, seq, batch, status, meta); seq += batch.length; }
      catch (e) { broken = true; console.warn(`[space] mission ${meta.id} recording stopped: ${(e as Error).message}`); }
    });
    return chain;
  };
  const timer = setInterval(() => { if (buf.length) void flush("running"); }, everyMs);
  return {
    push(e: SkyEvent) {
      buf.push(e);
      if (e.type === "results" || e.type === "archive") meta.objects = (meta.objects ?? 0) + e.objects.length;
      if (e.type === "analysis" && e.analysis) { meta.finds = e.analysis.discoveries; meta.objects = (meta.objects ?? 0) + e.analysis.objects.length; }
      if (e.type === "summary" && e.summary) meta.headline = e.summary.headline;
    },
    async finish(status: MissionStatus) { clearInterval(timer); await flush(status); },
  };
}
