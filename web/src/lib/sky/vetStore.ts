// Finished vetting reports (vetReport.ts), saved when a run ends so the find shows its report again
// later, on any device, without re-running ~40 s of downloads. One report per signal (the latest
// wins), looked up by TIC and matched to the find with sameFind. SpacetimeDB table sky_vets when
// it's configured, else JSON files (dev), the same choice as the mission and survey stores.
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callReducer, spacetimeConfig, sql } from "@/lib/server/spacetimeRun";
import { sameFind, type SavedVet, type VetReport } from "./vetShared";

export interface VetStore {
  name: "spacetime" | "file";
  /** Saves a report, replacing the saved one for the same signal. */
  save(report: VetReport): Promise<SavedVet>;
  /** Every saved report on these stars. */
  byTic(tics: string[]): Promise<SavedVet[]>;
}

export const validTic = (tic: string) => /^\d{1,12}$/.test(tic);
const newId = () => randomBytes(9).toString("base64url");

export function fileVetStore(dir = join(process.env.SKY_SURVEY_DIR || join(tmpdir(), "coordinate-sky-surveys"), "vets")): VetStore {
  const path = (tic: string) => join(dir, `${tic}.json`);
  let chain = Promise.resolve();
  const read = async (tic: string): Promise<SavedVet[]> => {
    try { return JSON.parse(await readFile(path(tic), "utf8")) as SavedVet[]; } catch { return []; }
  };
  return {
    name: "file",
    save(report) {
      const tic = report.input.tic;
      if (!validTic(tic)) return Promise.reject(new Error("bad TIC"));
      const p = chain.then(async () => {
        const all = await read(tic);
        const old = all.find((x) => sameFind(x.report.input, report.input));
        const saved: SavedVet = { id: old?.id ?? newId(), savedAt: Date.now(), report };
        await mkdir(dir, { recursive: true });
        const tmp = `${path(tic)}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify([...all.filter((x) => x !== old), saved]));
        await rename(tmp, path(tic));
        return saved;
      });
      chain = p.then(() => {}, () => {});
      return p;
    },
    async byTic(tics) {
      return (await Promise.all(tics.filter(validTic).map(read))).flat();
    },
  };
}

export const spacetimeVetStore: VetStore = {
  name: "spacetime",
  async save(report) {
    const tic = report.input.tic;
    if (!validTic(tic)) throw new Error("bad TIC");
    const old = (await this.byTic([tic])).find((x) => sameFind(x.report.input, report.input));
    const saved: SavedVet = { id: old?.id ?? newId(), savedAt: Date.now(), report };
    await callReducer("save_sky_vet", [saved.id, tic, JSON.stringify(report)], 30_000);
    return saved;
  },
  async byTic(tics) {
    const ok = [...new Set(tics.filter(validTic))];
    if (!ok.length) return [];
    const rows = await sql(`SELECT vet_id, saved_ms, report_json FROM sky_vets WHERE ${ok.map((t) => `tic = '${t}'`).join(" OR ")}`, 15_000);
    return rows.map((r) => ({ id: String(r[0]), savedAt: Number(r[1]), report: JSON.parse(String(r[2])) as VetReport }));
  },
};

const g = globalThis as unknown as { __skyVetFiles?: VetStore };

export function vetStore(): VetStore {
  if (spacetimeConfig() && process.env.SKY_SURVEY_BACKEND !== "file") return spacetimeVetStore;
  return (g.__skyVetFiles ??= fileVetStore());
}
