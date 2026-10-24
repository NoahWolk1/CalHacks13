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

export const BUILTIN_WORKERS: Worker[] = [
  floodWorker, terrainWorker, permitsWorker, complaintsWorker, placesWorker,
  seismicWorker, alertsWorker, newsWorker, demographicsWorker,
];

// Custom (generated) agents live here at runtime. The Agent Hub's create flow (see ./factory.ts)
// registers into this map; the orchestrator treats them exactly like built-ins.
const custom = new Map<string, Worker>();

export function registerWorker(w: Worker) { custom.set(w.id, w); }
export function allWorkers(): Worker[] { return [...BUILTIN_WORKERS, ...custom.values()]; }
export function getWorker(id: string) { return allWorkers().find((w) => w.id === id); }

/** Strip the run() impl so configs can be sent to the client. */
export function toConfig({ run: _run, ...cfg }: Worker): AgentConfig { return cfg; }
