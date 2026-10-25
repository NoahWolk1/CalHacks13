# Geo Research Agents: web app

Next.js 15 app (App Router, React 19, Tailwind 4). Select an area on the map, pick an orchestrator, Ask a question or run Insights, and watch worker agents drive/fly in and drop findings. Project docs (idea, architecture, decisions) start at [`../docs/INDEX.md`](../docs/INDEX.md).

## Quickstart

```bash
cd web
npm install
cp .env.example .env.local   # all keys optional, see below
npm run dev                  # http://localhost:3000 (or pass -p <port>)
```

| Env var | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | Claude plans which agents to send, writes cross-reference insights and streams the answer. Without it the app runs end-to-end in **heuristic mode** (keyword planner, rule-based insights, templated answer). |
| `CLAUDE_MODEL` | Optional override. Default `claude-opus-5-5` (`lib/llm.ts`). |
| `CLAUDE_WORKER_MODEL` | Model for generated agents' tool loops. Default `claude-sonnet-5-5`. |
| `AGENT_LIBRARY_PATH` | Optional. Where saved agents are stored. Default `data/agents.json` (on Vercel, `/tmp/geoswarm/agents.json`: per instance and ephemeral). |
| `CENSUS_API_KEY` | Free from [api.census.gov/data/key_signup.html](https://api.census.gov/data/key_signup.html). Enables Census Rover's income/rent stats. |
| `NEXT_PUBLIC_CONVEX_URL` | Written by `npx convex dev`. Turns on Convex mode (shared live missions, history, share links). Blank → SSE fallback. |

## Convex: live shared mission state

Convex is the source of truth for missions. With `NEXT_PUBLIC_CONVEX_URL` set:

1. `POST /api/run` creates a `runs` row and returns `{runId}` right away; the orchestrator keeps running in the background on the Node server.
2. Every `RunEvent` is buffered and flushed to Convex every ~100 ms (`events.append`, batched, strictly increasing `seq`). Implemented in `src/lib/server/convexRun.ts`.
3. The browser (`components/ConvexRunSync.tsx`) subscribes with `useQuery(api.events.since, {runId, afterSeq})` and pushes each new event through `dispatchRunEvent` (same path the SSE fallback uses: zustand store + map fleet sim).
4. The URL becomes `/?run=<id>`. Opening it on another device (a judge's phone) loads the region/profile/question from the run row and streams the mission live; a finished mission replays with staggered events so the fleet animates. **Missions ▾** (top of the map) lists recent runs; **Share** copies the link.
5. `POST /api/run/stop {runId}` recalls the agents: it sets `runs.stopRequested`, which the orchestrator polls, so it works across serverless instances. Only the launching browser shows the run as its own.

| Table | Contents |
|---|---|
| `runs` | mode, profileId, question, region (GeoJSON), label, status `running/done/error`, startedAt, durationMs, llm, findingCount, insightCount |
| `events` | runId, seq, type, event (the raw `RunEvent`); index `by_run_seq` |
| `findings` | denormalized per finding: runId, findingId, workerId, category, claim, confidence, severity, source, geometry; indexes `by_run`, `by_run_worker`, `by_run_category` |

Functions live in `web/convex/`: `runs.create/finish/get/recent/requestStop/stopRequested`, `events.append/since`, `findings.byRun({runId, workerId?, category?})`, `findings.countsByAgent`.

**Running it (two terminals):**

```bash
cd web && npx convex dev          # terminal 1: keeps functions deployed + regenerates convex/_generated
cd web && npm run dev -- -p 3005  # terminal 2: restart after .env.local changes
```

No account needed for a local backend: `CONVEX_AGENT_MODE=anonymous npx convex dev` runs one at `http://127.0.0.1:3210` and writes `.env.local`. The browser rewrites `127.0.0.1` to the page's host, so a phone on the same Wi-Fi can open `http://<laptop-ip>:3005/?run=<id>`. For a phone off the LAN, run `npx convex login` then `npx convex dev --configure` to get a cloud deployment.

**Fallback:** no `NEXT_PUBLIC_CONVEX_URL` (or Convex unreachable when a run starts) → `/api/run` streams SSE exactly as before, and the mission bar is hidden.

## Deploy to Vercel

Already handled in code: the Convex-mode orchestrator runs inside `after()` (Vercel `waitUntil`) so it survives the `{runId}` response; `/api/run` has `maxDuration = 300` (the Hobby max with Fluid compute, which is on by default; Pro allows 800); `/api/run/stop` sets `runs.stopRequested` in Convex, which the orchestrator polls every 1.5 s, so a stop works even when it lands on another serverless instance; the HTTP disk cache moves to `/tmp/geoswarm-cache` when `VERCEL` is set. `vercel.json` sets the build command to `npm run build:vercel`. That runs `npx convex deploy --cmd 'npm run build'` when `CONVEX_DEPLOY_KEY` is set (deploys functions and injects `NEXT_PUBLIC_CONVEX_URL` into the build), and a plain `npm run build` otherwise, which gives SSE mode.

**1. Convex production deployment** (one time):

```bash
cd web
npx convex login                 # browser login
npx convex dev --configure       # choose "create a new project" (cloud); writes .env.local with the dev URL
npx convex deploy                # creates and pushes the *prod* deployment, prints https://<name>.convex.cloud
```

In the Convex dashboard, open the prod deployment, then Settings → General → **Generate Production Deploy Key**.

**2. Vercel project:**

```bash
cd web
npx vercel login
npx vercel link                  # create the project; if linking from the repo root, set Root Directory = web
npx vercel env add CONVEX_DEPLOY_KEY production     # paste the prod deploy key
npx vercel env add ANTHROPIC_API_KEY production     # optional: heuristic mode without it
npx vercel env add CENSUS_API_KEY production        # optional
npx vercel env add CLAUDE_MODEL production          # optional
npx vercel env add NEXT_PUBLIC_CONVEX_URL production  # optional safety net: the https://<name>.convex.cloud URL
npx vercel --prod
```

**Current setup:** the Vercel project `geoswarm` has Root Directory = `web` and is linked at the **repo root**, so run `npx vercel --prod` from the repo root (not from `web/`). Pushes to GitHub also build automatically (PRs → preview, `main` → production). Without `CONVEX_DEPLOY_KEY`, preview deploys build in SSE mode. Give them their own Convex preview deploy key if you want Convex there too. The browser's `127.0.0.1` → page-host rewrite only touches local URLs, so `*.convex.cloud` is used as-is.

**3. Post-deploy checklist:**

- `curl https://<app>.vercel.app/api/agents` returns the agent list, with `llm: true` if the key is set.
- Run a mission in the UI. The URL should become `/?run=<id>`. Open it on a phone over cellular to confirm it streams live. Press Stop mid-run and check that the agents recall.
- Warm the prod instance (its `/tmp` cache is per-instance, so this mainly checks that every gov API answers from Vercel):
  `BASE_URL=https://<app>.vercel.app CONVEX_URL=https://<name>.convex.cloud npm run warm`
- Hobby plan: runs are capped at 300 s. Function time and Convex free-tier limits are far above demo usage.

## Architecture

```text
 Browser (components/)                          Server (Next.js route handlers, Node runtime)
 ─────────────────────                          ─────────────────────────────────────────────
 MapView: MapLibre GL + deck.gl                 GET  /api/agents → worker configs + profiles + llm flag
   box / polygon / pin → Region (lib/geo.ts)
 CommandPanel: profile, mode, question   ──POST /api/run (RunRequest)──►  runOrchestrator (lib/orchestrator/run.ts)
 RightPanel: agents, insights, answer    ◄──── SSE stream of RunEvents ───   0. reverse-geocode region (Nominatim)
 lib/client/sim.ts: vehicle motion                                            1. plan     (Claude or keyword heuristic)
 lib/client/store.ts: zustand state                                              └ gaps → factory.requestSpawn()
                                                                              2. dispatch all planned workers in parallel
                                                                              3. re-dispatch Terrain Scanner to risky permit parcels
                                                                              4. cross-reference (Turf spatial joins, crossref.ts)
                                                                                 → insights (Claude, or the joins themselves)
                                                                              5. synthesize answer (Ask mode, streamed)
                                                                                        │
                                                                                        ▼
                                                                    workers (lib/agents/workers/*.ts)
                                                                                        │
                                                                                        ▼
                                                    public data APIs: FEMA NFHL, DataSF, USGS, NWS,
                                                    Open-Meteo, Census, Google News RSS, OpenFreeMap
```

- **Orchestrator profiles** (`lib/orchestrator/profiles.ts`): Site Risk Analyst, Storefront Scout, Disaster Response. Each has a `domainPrompt` and the `defaultAgents` used in Insights mode. All share the same worker pool.
- **Findings store**: in Convex mode every run, event and finding is persisted in Convex (see below). The orchestrator also keeps an in-memory array per run for cross-referencing.
- SF-only workers are dropped from the plan when the region doesn't touch San Francisco. Re-dispatch is skipped for Storefront Scout.
- Claude calls use structured outputs (zod schemas) for the plan and insights; any LLM failure falls back to the heuristic path.

## Built-in workers

Registered in `BUILTIN_WORKERS` (`lib/agents/registry.ts`). All use only the `http_get` primitive except News Uplink (`search`).

| id | Name | Vehicle | Data source | Coverage | Key? |
|---|---|---|---|---|---|
| `fema-flood` | Flood Recon | drone | FEMA National Flood Hazard Layer | US | No |
| `terrain-elevation` | Terrain Scanner | drone | Open-Meteo Elevation API (Copernicus DEM) | Global | No |
| `sf-permits` | Permit Patrol | car | SF Dept. of Building Inspection permits (DataSF) | San Francisco | No |
| `sf-311` | Street Pulse | car | SF 311 Cases (DataSF) | San Francisco | No |
| `osm-places` | Street Scout | rover | OpenStreetMap via OpenFreeMap vector tiles | Global | No |
| `usgs-seismic` | Quake Watch | satellite | USGS Earthquake Catalog | Global | No |
| `live-conditions` | Sky Sentinel | drone | NWS Alerts API, Open-Meteo Air Quality | US alerts, global AQ | No |
| `local-news` | News Uplink | satellite | Google News RSS | Global | No |
| `census-demographics` | Census Rover | rover | US Census Geocoder, ACS 5-year | US | `CENSUS_API_KEY` for stats (tract lookup works without) |
| `sf-stormwater` | Storm Scout | drone | SFPUC 100-Year Storm Flood Risk Map, historical creeks & water bodies | San Francisco | No |
| `sentinel-imagery` | Sentinel Eye | satellite | Sentinel-2 L2A (Element84 Earth Search), USGS Landsat Collection 2 | Global | No |
| `orbit-passes` | Orbit Planner | satellite | CelesTrak TLEs + SGP4 (satellite.js) | Global | No |
| `nasa-eonet` | Earth Events | satellite | NASA EONET v3 | Global | No |

## RunEvent protocol

`POST /api/run` with a `RunRequest` (`mode`, `profileId`, `region`, optional `question`, optional `includeAgents`, which the UI doesn't send yet) returns `{runId}` in Convex mode (events land in the Convex `events` table), otherwise `text/event-stream`; each message is `data: <JSON RunEvent>\n\n`. Types live in `lib/types.ts`.

| Event | Meaning |
|---|---|
| `run_started` | run id, mode, profile, region, whether the LLM is on |
| `region_labeled` | reverse-geocoded place name |
| `thought` | orchestrator narration |
| `plan` | chosen `steps` (agentId, reason, focus) + rationale |
| `agent_gap` | the planner or the post-sweep coverage check found a need no agent covers (`need`, `parentId`) |
| `agent_spawned` | factory created a new, temporary agent (`agent` config with `temporary: true`, `parentId`) |
| `agent_status` | `queued → deploying → scanning → done/error`, keyed by `dispatchId` (one worker can be dispatched twice) |
| `agent_log` | a worker's log line |
| `finding` | one `Finding` ([finding schema](../docs/project/architecture.md#shared-finding-schema)) |
| `insight` | cross-referenced `Insight` citing `findingIds` |
| `answer_delta` | streamed answer text (Ask mode) |
| `run_done` / `error` | end of stream |

## How to add a worker

1. Create `lib/agents/workers/<name>.ts` exporting a `Worker` (`AgentConfig` + `run(ctx)`, see `lib/types.ts`). Give it an `id`, `name`, one-line `description` (the planner reads it), `vehicle`, `color`, `tools`, `dataSources`, `coverage` (`"San Francisco"` means it's skipped outside SF), `builtin: true`.
2. In `run`, read `ctx.task.region` (plus optional `focus` / `targets` / `question`), fetch with `getJson`/`getText` from `lib/http.ts` passing `ctx.signal`, and call `ctx.emit({ claim, geometry, source_url, source_type, confidence, category, severity, props })` per finding. Use `ctx.log` for progress. Throwing marks the agent as `error`.
3. Add it to `BUILTIN_WORKERS` in `lib/agents/registry.ts`.
4. Optional: add a keyword regex to `KEYWORDS` in `lib/orchestrator/run.ts` (heuristic planner), add its id to a profile's `defaultAgents`, and add a join in `lib/orchestrator/crossref.ts` if its `category` should combine with others.

---

## Generated agents (agents creating agents + the library)

Generated agents are **configs, not code**: an `AgentConfig` with a `prompt` (its brief) run by one shared runtime. Users create them in the Agent Hub; the orchestrator creates them mid-run when it hits a gap.

| File | Role |
|---|---|
| `lib/agents/factory.ts` | `draftAgent(spec)`: one Claude call that either **reuses** a library agent or drafts a new config. `requestSpawn(spec, spawnedSoFar)`: guardrails (`SPAWN_LIMITS = { maxDepth: 2, maxPerRun: 4 }`), then registers a new agent as **temporary**. |
| `lib/agents/runtime.ts` | `buildGeneratedWorker(config)`: a bounded Claude tool-use loop (`CLAUDE_WORKER_MODEL`, default Sonnet 5.5; 6 turns, 45 s, 15 findings). Tools: `web_search` (`search`), `web_fetch` (`scrape`), `http_get` (public URLs only, `urlGuard.ts`), and `emit_findings`, which enforces the finding schema. |
| `lib/agents/placement.ts` | Finding coordinates: the agent's lng/lat, else a geocoded address (`geocode.ts`, Nominatim, 1 req/s), else the region center at reduced confidence. Findings well outside the region are dropped. Category is `custom`; pins use the agent's color. |
| `lib/agents/registry.ts` | Built-ins + **saved** agents (every planner and the Hub see them) + **temporary** agents (spawned this run, reachable only by id until kept or discarded; lost on restart). |
| `lib/agents/library.ts` | Saved agents persisted to `data/agents.json` (gitignored; override with `AGENT_LIBRARY_PATH`). On Vercel it falls back to per-instance `/tmp`, so saved and temporary agents don't reliably survive across requests there; not in Convex yet. |

**When the orchestrator spawns** (Ask mode with an API key only): for each planner `gap` (dispatched alongside the planned workers), and once after the first sweep if `llmGapCheck` finds a remaining gap. Either may resolve to an existing agent instead of a new one.

**After a run**, spawned agents show **Keep in library / Discard** in the agent panel. The Hub's create card drafts a config from a prompt, lets you edit the name and brief, then saves it; custom cards have a delete button.

| Route | Does |
|---|---|
| `GET /api/agents` | library (built-in + saved) + profiles + `llm` flag |
| `POST /api/agents/draft` `{ prompt }` | `{ kind: "new" \| "reuse", agent }`; saves nothing. 503 without a key |
| `POST /api/agents` `{ agent }` | validate and save to the library |
| `POST /api/agents/:id/keep` | temporary → saved |
| `DELETE /api/agents/:id` | discard a temporary agent or delete a saved one (never built-ins) |

**Try one without the UI:** `npx vite-node --config vitest.config.mts scripts/try-agent.ts "SF restaurant health inspection scores"` drafts an agent, runs it once on a Mission District block and prints its logs and findings.

**Tests:** `npm test` (vitest) covers the URL guard, placement, library, registry, factory and runtime loop with a fake Claude client.

**Not built:** worker-initiated spawns (`WorkerContext` has no spawn hook), transcription.
