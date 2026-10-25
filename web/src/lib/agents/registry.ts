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
import { reviewsWorker } from "./workers/reviews";
import { rentWorker } from "./workers/rent";
import { pulseWorker } from "./workers/pulse";
import { planningNoticesWorker } from "./workers/planningNotices";
import { crimeWorker } from "./workers/crime";
import { evictionsWorker } from "./workers/evictions";
import { businessWorker } from "./workers/business";
import { crashesWorker } from "./workers/crashes";
import { zoningWorker } from "./workers/zoning";
import { propertyWorker } from "./workers/property";
import { fireEmsWorker } from "./workers/fireEms";
import { streetWorkWorker } from "./workers/streetWork";
import { transitWorker } from "./workers/transit";
import { treesWorker } from "./workers/trees";
import { groundHazardsWorker } from "./workers/groundHazards";
import { seaLevelWorker } from "./workers/seaLevel";
import { wildfireWorker } from "./workers/wildfire";
import { weatherWorker } from "./workers/weather";
import { landmarksWorker } from "./workers/landmarks";
import { rentalsWorker } from "./workers/rentals";
import { schoolsWorker } from "./workers/schools";
import { envBurdenWorker } from "./workers/envBurden";
import { disastersWorker } from "./workers/disasters";
import { createLibrary, type Library } from "./library";
import { buildGeneratedWorker } from "./runtime";

export const BUILTIN_WORKERS: Worker[] = [
  floodWorker, stormwaterWorker, terrainWorker, permitsWorker, complaintsWorker, placesWorker,
  seismicWorker, alertsWorker, newsWorker, demographicsWorker, sentinelWorker, orbitWorker, eonetWorker,
  // Sponsor-backed (Apify / Bright Data): inert until their keys are set; see lib/sponsors/keys.ts.
  reviewsWorker, rentWorker, pulseWorker, planningNoticesWorker,
  // DataSF city-data agents (no key): crime, evictions, business churn, crashes, zoning, property, fire/EMS, street work, transit, trees.
  crimeWorker, evictionsWorker, businessWorker, crashesWorker, zoningWorker, propertyWorker, fireEmsWorker, streetWorkWorker, transitWorker, treesWorker,
  // Hazard / environment / context agents (no key): CGS zones, sea-level rise, CAL FIRE, weather, Wikipedia, Airbnb, schools, CalEnviroScreen, FEMA history.
  groundHazardsWorker, seaLevelWorker, wildfireWorker, weatherWorker, landmarksWorker, rentalsWorker, schoolsWorker, envBurdenWorker, disastersWorker,
];

// Generated agents come in two kinds:
// - saved: in the library (data/agents.json); every planner and the Hub see them like built-ins.
// - temporary: spawned mid-run and not yet kept; only reachable by id (the run that spawned them,
//   and the Keep/Discard calls). Lost on server restart.
export function createRegistry(library: Library, temp = new Map<string, Worker>()) {
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

// Rebuilt on every module load so dev hot-reloads pick up edited BUILTIN_WORKERS; only the spawned
// (temporary) agents live on globalThis so a reload doesn't drop them. Saved agents reload from the library file.
const g = globalThis as { __agentTemp?: Map<string, Worker> };
export const registry: Registry = createRegistry(createLibrary(), (g.__agentTemp ??= new Map()));

export const allWorkers = () => registry.allWorkers();
export const getWorker = (id: string) => registry.getWorker(id);

/** Strip the run() impl so configs can be sent to the client. */
export function toConfig({ run: _run, ...cfg }: Worker): AgentConfig { return cfg; }
