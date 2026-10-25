# Geo Research Agents: web app

Next.js 15 app (App Router, React 19, Tailwind 4). Select an area on the map, pick an orchestrator, Ask a question or run Insights, and watch worker agents drive/fly in and drop findings. The team's planning doc is [`../README.md`](../README.md).

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
| `CENSUS_API_KEY` | Free from [api.census.gov/data/key_signup.html](https://api.census.gov/data/key_signup.html). Enables Census Rover's income/rent stats. |
| `LIVE_BACKEND` | `spacetime` \| `convex` \| `sse`. Default: `spacetime` if `SPACETIME_DB` + `SPACETIME_TOKEN` are set, else `convex` if `NEXT_PUBLIC_CONVEX_URL` is set, else `sse`. |
| `SPACETIME_HOST` / `SPACETIME_DB` / `SPACETIME_TOKEN` | SpacetimeDB (primary live backend). Host defaults to `https://maincloud.spacetimedb.com`. The token is a **server-only secret** (see below). |
| `NEXT_PUBLIC_SPACETIME_HOST` / `NEXT_PUBLIC_SPACETIME_DB` | Optional browser overrides. By default the browser uses the host/db the server reports from `/api/agents`. |
| `NEXT_PUBLIC_CONVEX_URL` | Convex (fallback live backend). Written by `npx convex dev`. |
| `LLM_PER_IP_HOURLY` / `LLM_GLOBAL_HOURLY` / `LLM_IP_SALT` / `LLM_RATE_LIMIT` | Hourly caps on Claude-powered runs (defaults 20 / 150; on in production). Over the cap a run goes heuristic. |

## SpacetimeDB: live shared mission state (primary)

SpacetimeDB is the real-time backend: the orchestrator writes every mission into it and every browser watching a mission subscribes to it. The module lives in `web/spacetime/src/index.ts` (TypeScript, runs inside the database).

1. `POST /api/run` calls the `create_run` reducer and returns `{runId}` right away; the orchestrator keeps running in the background (`after()` on Vercel).
2. Every `RunEvent` is buffered and flushed every ~100 ms with the `append_events` reducer (batched, strictly increasing `seq`; a gap rejects the batch, an already-stored seq is skipped so retries are idempotent). The same transaction updates the run summary (label, counts, status) and inserts `findings` rows. Server side: `src/lib/server/spacetimeRun.ts` (HTTP reducer calls, no long-lived socket, so it suits serverless) behind the backend-agnostic `src/lib/server/liveRun.ts`.
3. The browser (`components/SpacetimeLive.tsx` → `SpacetimeRunSync.tsx`) opens one anonymous WebSocket and subscribes to `SELECT * FROM runs WHERE run_id = …` and `SELECT * FROM events WHERE run_id = …` (`useTable`), then pushes each new event through `dispatchRunEvent` in seq order (`lib/client/useRunFeed.ts`, shared with Convex).
4. The URL becomes `/?run=<id>`. Opening it on another device loads the region/profile/question from the run row and streams the mission live; a finished mission replays with staggered events. **Missions ▾** lists recent runs (subscription on `runs`); **Share link** copies the URL.
5. `POST /api/run/stop {runId}` calls `request_stop`, which sets `stop_requested`; the orchestrator polls it over the SQL endpoint every 1.5 s, so a stop works across serverless instances.
6. Claude rate limits: `reserve_llm` checks and records per-IP + global hourly caps in one transaction (rows in the private `llm_usage` table, salted IP hashes, old rows pruned on each call).

| Table | Visibility | Contents |
|---|---|---|
| `runs` | public | run_id (PK), mode, profile_id, question, region_json, label, status `running/done/error`, started_at_ms, duration_ms, llm, finding_count, insight_count, error, stop_requested, next_seq |
| `events` | public | run_id (btree), seq, type, event_json (the raw `RunEvent`) |
| `findings` | public | run_id (btree), finding_id, worker_id, category, claim, confidence, severity, source_type, source_url, geometry_json |
| `llm_usage` | private | ip_hash (btree), at_ms |
| `writers` | private | identity_hex of identities allowed to write |

**Who can write.** Browsers only read. Every write reducer (`create_run`, `append_events`, `finish_run`, `request_stop`, `reserve_llm`, `add_writer`, `remove_writer`) checks `ctx.sender` against the private `writers` table and throws `not authorized` otherwise. `init` seeds `writers` with the database owner (whoever ran `spacetime publish`). The Next server has its own identity: `npm run spacetime:writer -- --server <local|maincloud>` mints one (`POST /v1/identity`), allowlists it with `add_writer` as you, and saves `{identity, token}` to `~/.config/geoswarm/spacetime-<server>-<db>.json` (mode 600). Put that token in `SPACETIME_TOKEN`. Never commit it.

**Running it locally** (the `spacetime` CLI must be on PATH; it installs to `~/.local/bin`):

```bash
cd web
npm run spacetime:start                      # terminal 1: local server on 127.0.0.1:3000
npm run spacetime:publish:local              # publish web/spacetime as database "geoswarm"
npm run spacetime:writer -- --server local   # mint + allowlist the server identity, prints the token file
# .env.local: SPACETIME_HOST=http://127.0.0.1:3000  SPACETIME_DB=geoswarm  SPACETIME_TOKEN=<token from the file>
npm run dev -- -p 3005                       # terminal 2
```

After changing the module: `npm run spacetime:publish:local` (or `:cloud`) and `npm run spacetime:generate` (rewrites `src/spacetime_bindings/`). Maincloud: `spacetime login`, `npm run spacetime:publish:cloud`, `npm run spacetime:writer -- --server maincloud`. The browser rewrites a `127.0.0.1` host to the page's host, so a phone on the same Wi-Fi can open `http://<laptop-ip>:3005/?run=<id>`.

## Convex (fallback live backend)

The Convex implementation (`web/convex/`, `src/lib/server/convexRun.ts`, `components/ConvexRunSync.tsx`) mirrors the same semantics and stays available: set `LIVE_BACKEND=convex` (or leave SpacetimeDB unconfigured with `NEXT_PUBLIC_CONVEX_URL` set). Functions: `runs.create/finish/get/recent/requestStop/stopRequested`, `events.append/since`, `findings.byRun`, `findings.countsByAgent`, `llm.reserve`. Local: `CONVEX_AGENT_MODE=anonymous npx convex dev` runs a backend at `http://127.0.0.1:3210` and writes `.env.local`.

**SSE fallback:** with no live backend (or if it's unreachable when a run starts), `/api/run` streams SSE exactly as before and the mission bar is hidden. The browser always follows the backend the server reports in `/api/agents`.

## Deploy to Vercel

Already handled in code: the live-mode orchestrator runs inside `after()` (Vercel `waitUntil`) so it survives the `{runId}` response; `/api/run` has `maxDuration = 300` (the Hobby max with Fluid compute; Pro allows 800); `/api/run/stop` flags the run row in the live backend, which the orchestrator polls every 1.5 s, so a stop works even when it lands on another serverless instance; the HTTP disk cache moves to `/tmp/geoswarm-cache` when `VERCEL` is set. `vercel.json` sets the build command to `npm run build:vercel`, which runs `npx convex deploy --cmd 'npm run build'` when `CONVEX_DEPLOY_KEY` is set and a plain `npm run build` otherwise. The SpacetimeDB module is published separately (`npm run spacetime:publish:cloud`); Vercel only needs its env vars.

**Vercel env (production):**

```bash
npx vercel env add SPACETIME_HOST production     # https://maincloud.spacetimedb.com
npx vercel env add SPACETIME_DB production       # geoswarm
npx vercel env add SPACETIME_TOKEN production    # the server token (secret), from ~/.config/geoswarm/spacetime-maincloud-geoswarm.json
npx vercel env add LIVE_BACKEND production       # spacetime (optional; it's the default when the two above are set)
npx vercel env add ANTHROPIC_API_KEY production  # optional: heuristic mode without it
npx vercel env add CENSUS_API_KEY production     # optional
npx vercel env add CONVEX_DEPLOY_KEY production  # optional: keeps the Convex fallback deployed
```

**Current setup:** the Vercel project `geoswarm` has Root Directory = `web` and is linked at the **repo root**, so run `npx vercel --prod` from the repo root (not from `web/`). Pushes to GitHub also build automatically (PRs → preview, `main` → production). Preview deploys without the SpacetimeDB vars fall back to Convex (if configured) or SSE.

**Post-deploy checklist:**

- `curl https://<app>.vercel.app/api/agents` returns the agent list, `llm: true` if the key is set, and `live.backend: "spacetime"`.
- Run a mission in the UI. The URL should become `/?run=<id>`. Open it on a phone over cellular to confirm it streams live. Press Stop mid-run and check that the agents recall.
- `spacetime sql geoswarm "SELECT run_id, status, finding_count FROM runs"` shows the run; the SpacetimeDB dashboard is at https://spacetimedb.com/geoswarm.
- Warm the prod instance: `BASE_URL=https://<app>.vercel.app npm run warm`.
- Hobby plan: runs are capped at 300 s.

## Architecture

```text
 Browser (components/)                          Server (Next.js route handlers, Node runtime)
 ─────────────────────                          ─────────────────────────────────────────────
 MapView: MapLibre GL + deck.gl                 GET  /api/agents → worker configs + profiles + llm flag + live backend
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
- **Findings store**: in live mode every run, event and finding is persisted in SpacetimeDB (or Convex as fallback; see above). The orchestrator also keeps an in-memory array per run for cross-referencing.
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

## RunEvent protocol

`POST /api/run` with a `RunRequest` (`mode`, `profileId`, `region`, optional `question`, optional `includeAgents`) returns `{runId, backend}` in live mode (events land in the SpacetimeDB or Convex `events` table), otherwise `text/event-stream`; each message is `data: <JSON RunEvent>\n\n`. Types live in `lib/types.ts`.

| Event | Meaning |
|---|---|
| `run_started` | run id, mode, profile, region, whether the LLM is on |
| `region_labeled` | reverse-geocoded place name |
| `thought` | orchestrator narration |
| `plan` | chosen `steps` (agentId, reason, focus) + rationale |
| `agent_gap` | planner found a need no agent covers (`need`, `parentId`) |
| `agent_spawned` | factory created a new agent (`agent` config, `parentId`) |
| `agent_status` | `queued → deploying → scanning → done/error`, keyed by `dispatchId` (one worker can be dispatched twice) |
| `agent_log` | a worker's log line |
| `finding` | one `Finding` (README §3b schema) |
| `insight` | cross-referenced `Insight` citing `findingIds` |
| `answer_delta` | streamed answer text (Ask mode) |
| `run_done` / `error` | end of stream |

## How to add a worker

1. Create `lib/agents/workers/<name>.ts` exporting a `Worker` (`AgentConfig` + `run(ctx)`, see `lib/types.ts`). Give it an `id`, `name`, one-line `description` (the planner reads it), `vehicle`, `color`, `tools`, `dataSources`, `coverage` (`"San Francisco"` means it's skipped outside SF), `builtin: true`.
2. In `run`, read `ctx.task.region` (plus optional `focus` / `targets` / `question`), fetch with `getJson`/`getText` from `lib/http.ts` passing `ctx.signal`, and call `ctx.emit({ claim, geometry, source_url, source_type, confidence, category, severity, props })` per finding. Use `ctx.log` for progress. Throwing marks the agent as `error`.
3. Add it to `BUILTIN_WORKERS` in `lib/agents/registry.ts`.
4. Optional: add a keyword regex to `KEYWORDS` in `lib/orchestrator/run.ts` (heuristic planner), add its id to a profile's `defaultAgents`, and add a join in `lib/orchestrator/crossref.ts` if its `category` should combine with others.

---

## ✦ For the agent-creation teammate

Agent creation (README §2 "Agents can create agents", §3c guardrails) is yours. Everything around it is already wired; the stub is **`lib/agents/factory.ts`**.

**Contract**

- `createAgent(spec: AgentSpec): Promise<Worker | null>`: currently returns `null`. Turn `spec.prompt` (plain English) into an `AgentConfig` and a `run()` built only from the allowed `ToolPrimitive`s (`http_get | scrape | search | transcribe | llm`), emitting `Finding`s in the shared schema. Set `builtin: false`, `prompt`, `createdBy: spec.createdBy`.
- `requestSpawn(spec, spawnedSoFar)`: the guardrail gate. Returns `null` when `spec.depth > SPAWN_LIMITS.maxDepth` or `spawnedSoFar >= SPAWN_LIMITS.maxPerRun`, otherwise calls `createAgent`. Defaults are `SPAWN_LIMITS = { maxDepth: 2, maxPerRun: 4 }`; tune as you see fit. Approval policy is still open.
- `registerWorker(w)` in `lib/agents/registry.ts`: puts a custom worker in an in-memory map so `allWorkers()`, the planner roster and `GET /api/agents` see it. Call it for agents the user keeps / creates in the hub.

**Already wired for you**

- The Claude planner (`llmPlan` in `lib/orchestrator/run.ts`) returns `gaps`: up to 2 one-line specs for data no agent can provide. Only in Ask mode with an API key.
- For each gap the orchestrator emits `agent_gap`, calls `requestSpawn({ prompt: need, createdBy: "orchestrator", depth: 1 }, spawned)`, and if a `Worker` comes back emits `agent_spawned` with `parentId` and adds it to the plan, so it's dispatched in the same run like any other worker.
- The agent panel (`components/RightPanel.tsx`) shows spawned agents with **"✦ created by &lt;parent&gt;"**.
- `RunRequest.includeAgents` lets the UI force custom agents into a run ("Added by you").
- `components/App.tsx` mounts `components/AgentHub.tsx`, which has a placeholder "create agent" card for the prompt-to-create flow.

**Still yours:** the create flow itself, keep/discard after a run, persistence beyond the server process, worker-initiated spawns (workers don't have a spawn hook in `WorkerContext` yet), and the tool primitives/transcription choice.
