// Runs sweep vets on worker threads (one per vet), so several vets at once don't hold the main thread
// that serves the web and feeds the season search. On with SKY_VET_THREADS=1 and the worker bundle built
// (npm run build); otherwise, or if a worker fails to start, vets run inline as before.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { runVetting } from "@/lib/sky/vetReport";
import type { VetInput, VetReport } from "@/lib/sky/vetShared";

const ON = process.env.SKY_VET_THREADS === "1";
const WORKER_FILE = join(process.cwd(), ".worker", "vetWorker.mjs");
let warned = false;

function inWorker(input: VetInput, signal: AbortSignal, budgetMs: number): Promise<VetReport> {
  return new Promise((resolve, reject) => {
    const w = new Worker(WORKER_FILE, { workerData: { input, budgetMs } });
    let settled = false;
    const done = (fn: () => void) => { if (settled) return; settled = true; signal.removeEventListener("abort", abort); fn(); void w.terminate(); };
    const abort = () => done(() => reject(new Error("vetting aborted")));
    signal.addEventListener("abort", abort, { once: true });
    w.on("message", (m: { report?: VetReport; error?: string }) => done(() => (m.report ? resolve(m.report) : reject(new Error(m.error ?? "vetting failed")))));
    w.on("error", (e) => done(() => reject(Object.assign(e, { crashed: true }))));
    w.on("exit", (code) => done(() => reject(Object.assign(new Error(`vet thread exited (${code})`), { crashed: true }))));
  });
}

/** A vet, on its own thread when SKY_VET_THREADS=1 (inline otherwise, or if the thread crashes). */
export async function vetOffThread(input: VetInput, signal: AbortSignal, budgetMs: number): Promise<VetReport> {
  if (!ON || !existsSync(WORKER_FILE)) return runVetting(input, signal, () => {}, { budgetMs });
  try {
    return await inWorker(input, signal, budgetMs);
  } catch (e) {
    if (!(e as { crashed?: boolean }).crashed) throw e;
    if (!warned) console.warn(`[vet] a vet thread failed (${(e as Error).message.slice(0, 120)}): vetting inline (further failures not logged)`);
    warned = true;
    return runVetting(input, signal, () => {}, { budgetMs });
  }
}
