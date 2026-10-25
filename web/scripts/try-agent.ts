// Drafts an agent from a prompt and runs it once against a region, printing logs and findings.
// Needs ANTHROPIC_API_KEY (read from .env.local). Nothing is saved to the library.
//
//   npx vite-node --config vitest.config.mts scripts/try-agent.ts "SF restaurant health inspection scores"
//   (optional 2nd arg: "minLng,minLat,maxLng,maxLat"; default is a block of the Mission, SF)

export {};

try { process.loadEnvFile(".env.local"); } catch { /* no env file: rely on the shell env */ }

const { draftAgent } = await import("@/lib/agents/factory");
const { buildGeneratedWorker } = await import("@/lib/agents/runtime");
const { regionFromBox } = await import("@/lib/geo");

const prompt = process.argv[2] ?? "Health inspection scores for restaurants in the area (SF)";
const [minX, minY, maxX, maxY] = (process.argv[3] ?? "-122.4225,37.7570,-122.4155,37.7620").split(",").map(Number);
const region = { ...regionFromBox([minX, minY], [maxX, maxY]), label: "Mission District, San Francisco" };

const t0 = Date.now();
const draft = await draftAgent({ prompt, createdBy: "user", depth: 0 });
if (!draft) { console.error("No LLM: set ANTHROPIC_API_KEY in web/.env.local"); process.exit(1); }
if (draft.kind === "reuse") console.log(`Generator reused existing agent: ${draft.worker.id}\n`);
else console.log("Drafted config:\n", JSON.stringify(draft.config, null, 2), `\n(${Date.now() - t0} ms)\n`);
const worker = draft.kind === "reuse" ? draft.worker : buildGeneratedWorker(draft.config);

let n = 0;
await worker.run({
  task: { region, question: "Is this a good spot for a coffee shop?" },
  signal: new AbortController().signal,
  log: (m) => console.log(`  › ${m}`),
  emit: (f) => console.log(`  ◆ F${++n} ${f.claim}  @ ${JSON.stringify(f.geometry.type === "Point" ? f.geometry.coordinates : f.geometry.type)}  conf ${f.confidence.toFixed(2)}  ${f.source_url ?? ""}`),
});
console.log(`\n${n} findings in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
