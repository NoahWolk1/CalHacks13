// Worker-thread entry for one sweep vet (src/lib/server/vetPool.ts): runs runVetting off the main
// thread, which otherwise spends most of its time on vets' periodograms while the web and the season
// downloads wait. Bundled to .worker/vetWorker.mjs by scripts/build-search-worker.mjs.
import { parentPort, workerData } from "node:worker_threads";
import { runVetting } from "./vetReport";
import type { VetInput } from "./vetShared";

const { input, budgetMs } = workerData as { input: VetInput; budgetMs: number };
runVetting(input, AbortSignal.timeout(budgetMs + 50_000), () => {}, { budgetMs }).then(
  (report) => parentPort!.postMessage({ report }),
  (e) => parentPort!.postMessage({ error: (e as Error).message }),
);
