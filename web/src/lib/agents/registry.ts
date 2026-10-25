import type { AgentConfig, Worker } from "@/lib/types";
import { floodWorker } from "./workers/flood";
import { terrainWorker } from "./workers/terrain";
import { permitsWorker } from "./workers/permits";
import { complaintsWorker } from "./workers/complaints";
import { placesWorker } from "./workers/places";
import { seismicWorker } from "./workers/seismic";
import { alertsWorker } from "./workers/alerts";
import { newsWorker } from "./workers/news";
import { demographicsWorker } from "./workers/demographics";
import { stormwaterWorker } from "./workers/stormwater";
import { sentinelWorker } from "./workers/sentinel";
import { orbitWorker } from "./workers/orbit";
import { eonetWorker } from "./workers/eonet";
import { createLibrary, type Library } from "./library";
import { buildGeneratedWorker } from "./runtime";

export const BUILTIN_WORKERS: Worker[] = [
  floodWorker, stormwaterWorker, terrainWorker, permitsWorker, complaintsWorker, placesWorker,
  seismicWorker, alertsWorker, newsWorker, demographicsWorker, sentinelWorker, orbitWorker, eonetWorker,
];

// Generated agents come in two kinds:
// - saved: in the library (data/agents.json); every planner and the Hub see them like built-ins.
// - temporary: spawned mid-run and not yet kept; only reachable by id (the run that spawned them,
//   and the Keep/Discard calls). Lost on server restart.
export function createRegistry(library: Library) {
  const temp = new Map<string, Worker>();
  let saved: Map<string, Worker> | null = null;
  const savedMap = () => (saved ??= new Map(library.list().map((c) => [c.id, buildGeneratedWorker({ ...c, temporary: false })])));

  const allWorkers = (): Worker[] => [...BUILTIN_WORKERS, ...savedMap().values()];
  const getWorker = (id: string) => allWorkers().find((w) => w.id === id) ?? temp.get(id);

  const saveAgent = (cfg: AgentConfig): Worker => {
    const w = buildGeneratedWorker({ ...cfg, builtin: false, temporary: false });
    library.save(w);
    savedMap().set(w.id, w);
    temp.delete(w.id);
    return w;
  };

  return {
    allWorkers,
    getWorker,
    saveAgent,
    registerTemporary(cfg: AgentConfig): Worker {
      const w = buildGeneratedWorker({ ...cfg, builtin: false, temporary: true });
      temp.set(w.id, w);
      return w;
    },
    /** Spawned → saved. Returns the saved config, or null if no such spawned agent. */
    keepAgent(id: string): AgentConfig | null {
      const w = temp.get(id);
      return w ? toConfig(saveAgent(w)) : null;
    },
    /** Discards a spawned agent or deletes a saved one. Built-ins can't be deleted. */
    deleteAgent(id: string): boolean {
      if (temp.delete(id)) return true;
      if (!savedMap().has(id)) return false;
      savedMap().delete(id);
      return library.remove(id);
    },
  };
}

export type Registry = ReturnType<typeof createRegistry>;

// One registry per server process; kept on globalThis so dev hot-reloads don't drop spawned agents.
const g = globalThis as { __agentRegistry?: Registry };
export const registry: Registry = (g.__agentRegistry ??= createRegistry(createLibrary()));

export const allWorkers = () => registry.allWorkers();
export const getWorker = (id: string) => registry.getWorker(id);

/** Strip the run() impl so configs can be sent to the client. */
export function toConfig({ run: _run, ...cfg }: Worker): AgentConfig { return cfg; }
