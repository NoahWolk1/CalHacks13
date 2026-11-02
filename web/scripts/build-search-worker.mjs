// Bundles the worker-thread entries to .worker/: the deep-survey search worker (src/lib/sky/searchWorker.ts,
// thread pool in src/lib/server/searchPool.ts, SKY_SEARCH_THREADS) and the sweep vet worker
// (src/lib/sky/vetWorker.ts, src/lib/server/vetPool.ts, SKY_VET_THREADS). Never fails the build: without
// the bundles, seasons are searched and vets run inline.
import { build } from "esbuild";

try {
  await build({
    entryPoints: ["src/lib/sky/searchWorker.ts", "src/lib/sky/vetWorker.ts"], outdir: ".worker", outExtension: { ".js": ".mjs" },
    bundle: true, platform: "node", format: "esm", target: "node20", logLevel: "warning",
    // CommonJS globals some bundled modules still use.
    banner: { js: "import { createRequire } from 'node:module'; import { fileURLToPath as __fu } from 'node:url'; import { dirname as __dn } from 'node:path'; const require = createRequire(import.meta.url); const __filename = __fu(import.meta.url); const __dirname = __dn(__filename);" },
  });
  console.log("worker threads built: .worker/searchWorker.mjs, .worker/vetWorker.mjs");
} catch (e) {
  console.warn(`worker threads not built (${e.message}): seasons are searched and vets run inline`);
}
