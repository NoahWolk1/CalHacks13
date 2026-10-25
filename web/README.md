# Geo Research Agents: web app

Next.js 15 app (App Router, React 19, Tailwind 4). Select an area on the map, Ask a question (it is routed to the right orchestrator automatically) or run Insights, and watch worker agents drive/fly in and drop findings. Project docs (idea, architecture, decisions) start at [`../docs/INDEX.md`](../docs/INDEX.md).

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
| `BRIGHTDATA_API_TOKEN` / `BRIGHTDATA_UNLOCKER_ZONE` / `BRIGHTDATA_SERP_ZONE` | Bright Data. Turns on Rent Scout, Local Pulse, and the Web Unlocker fetch for generated agents. See [Sponsor data workers](#sponsor-data-workers-bright-data--apify). |
| `APIFY_TOKEN` / `APIFY_PLANNING_ACTOR` / `APIFY_MAPS_ACTOR` | Apify. Turns on Review Radar and Hearing Watch (our own Actor). |
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
 ResearchForm: area, mode, question,      ──POST /api/run (RunRequest)──►  runOrchestrator (lib/orchestrator/run.ts)
   focus (Auto or a profile)
 RightPanel: answer, insights, findings  ◄──── SSE stream of RunEvents ───   0. reverse-geocode region (Nominatim)
 lib/client/sim.ts: vehicle motion                                            1. route + plan (Claude, or keywords)
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
- **Auto-routing** (default; `profileId: "auto"` or omitted). With Claude, the planner's system prompt lists the three profiles and its structured output gains `profileId` (enum) + `routeReason` (≤ 12 words), so routing costs no extra round trip; the routed profile's `domainPrompt` drives the rest of the run (gap check, insights, answer, core-team top-up). Without Claude (no key, quota, planner error) `routeByKeywords` in `lib/orchestrator/route.ts` decides (storefront: shop/café/customers/rent/foot traffic…; disaster: now/current/fire/smoke/evacuation/alert…; otherwise site-risk). Insights mode with Auto uses the Site Risk Analyst team. Choosing a specialist in the **Research focus** select (`ResearchForm.tsx`) forces it. After an auto-routed run the panel header shows "Routed to <profile>" tagged *auto-picked* (reason in the tooltip), the select marks that profile "(auto-picked)", and "Routed to …: reason" opens the orchestrator log behind **How this was researched**; the choice persists in `localStorage`.
- **Findings store**: in live mode every run, event and finding is persisted in SpacetimeDB (or Convex as fallback; see above). The orchestrator also keeps an in-memory array per run for cross-referencing.
- SF-only workers are dropped from the plan when the region doesn't touch San Francisco. Re-dispatch is skipped for Storefront Scout.
- Claude calls use structured outputs (zod schemas) for the plan and insights; any LLM failure falls back to the heuristic path.

## Built-in workers

Registered in `BUILTIN_WORKERS` (`lib/agents/registry.ts`). All use only the `http_get` primitive except News Uplink and Local Pulse (`search`) and the sponsor scrapers (`scrape`).

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
| `census-demographics` | Census Rover | rover | US Census Geocoder, ACS 5-year | US | `CENSUS_API_KEY` (no finding without it, so it sits out of plans) |
| `sf-stormwater` | Storm Scout | drone | SFPUC 100-Year Storm Flood Risk Map, historical creeks & water bodies | San Francisco | No |
| `sentinel-imagery` | Sentinel Eye | satellite | Sentinel-2 L2A (Element84 Earth Search), USGS Landsat Collection 2 | Global | No |
| `orbit-passes` | Orbit Planner | satellite | CelesTrak TLEs + SGP4 (satellite.js) | Global | No |
| `nasa-eonet` | Earth Events | satellite | NASA EONET v3 | Global | No |
| `apify-reviews` | Review Radar | drone | Google Maps via Apify `compass/crawler-google-places` | Global | `APIFY_TOKEN` |
| `brightdata-rent` | Rent Scout | car | Craigslist apartment search via Bright Data Web Unlocker | US metros | `BRIGHTDATA_API_TOKEN` + `BRIGHTDATA_UNLOCKER_ZONE` |
| `brightdata-pulse` | Local Pulse | satellite | Google (news, Reddit, Nextdoor) via Bright Data SERP API | Global | `BRIGHTDATA_API_TOKEN` + SERP (or Unlocker) zone |
| `apify-planning-notices` | Hearing Watch | car | sfplanning.org notices via our Apify Actor `sf-planning-notices` | San Francisco | `APIFY_TOKEN` + `APIFY_PLANNING_ACTOR` |
| `sf-crime` | Beat Cop | car | SFPD Incident Reports 2018-present (DataSF wg3w-h783) | San Francisco | No |
| `sf-evictions` | Tenant Watch | car | SF Rent Board Eviction Notices (DataSF 5cei-gny5) | San Francisco | No |
| `sf-business` | Storefront Census | car | SF Registered Business Locations (DataSF g8m3-pdis) | San Francisco | No |
| `sf-crashes` | Vision Zero | car | SF Traffic Crashes Resulting in Injury (DataSF ubvf-ztfx), Vision Zero 2024 High Injury Network (DataSF enwt-3u8m) | San Francisco | No |
| `sf-zoning` | Zoning Clerk | drone | SF Planning Zoning Districts (DataSF 3i4a-hu95), SF Planning Height & Bulk Districts (DataSF h9wh-cg3m) | San Francisco | No |
| `sf-property` | Assessor's Ledger | car | SF Assessor Historical Secured Property Tax Rolls (DataSF wv5m-vpq2) | San Francisco | No |
| `sf-fire-ems` | Engine Company | car | SFFD Calls for Service (DataSF nuek-vuh3), SFFD Fire Incidents (DataSF wr8u-xric) | San Francisco | No |
| `sf-street-work` | Road Crew | rover | SF Public Works Street-Use Permits (DataSF b6tj-gt35), Active & upcoming street surface permits (DataSF bpc9-7sus), Utility Excavation Moratorium Streets (DataSF 5wbp-dwzt) | San Francisco | No |
| `sf-transit` | Transit Scout | rover | SFMTA Muni Stops (DataSF i28k-bkz6), SFMTA Muni Simple Routes (DataSF 9exe-acju), BART station locations | San Francisco | No |
| `sf-trees` | Canopy Counter | drone | SF Street Tree Inventory (DataSF tkzw-k3nq) | San Francisco | No |
| `cgs-ground-hazards` | Ground Truth | rover | CGS Seismic Hazard Zones (liquefaction, landslide), CGS Tsunami Hazard Areas | California | No |
| `sea-level-rise` | Tide Line | boat | MTC/BCDC Bay Area sea level rise inundation layers, NOAA CO-OPS tide gauges, OpenStreetMap places + water via OpenFreeMap | SF Bay Area (inundation); US coasts (tide gauge) | No |
| `calfire-fhsz` | Ember Watch | drone | CAL FIRE / OSFM Fire Hazard Severity Zones, MTC 2025 State & Local FHSZ (Bay Area) | California | No |
| `weather-outlook` | Front Line | satellite | Open-Meteo Forecast API, Open-Meteo Historical Weather (ERA5) | Global | No |
| `wiki-landmarks` | Chronicle | drone | Wikipedia GeoSearch + extracts + pageviews | Global | No |
| `short-term-rentals` | Night Shift | car | Inside Airbnb listings snapshot | SF Bay Area, LA, San Diego, NYC, Seattle, Chicago, Boston | No |
| `ca-schools` | School Run | car | California Department of Education School Sites 2025-26, OpenStreetMap via OpenFreeMap | California public schools; global (OSM schools & childcare) | No |
| `env-burden` | Clean Air Patrol | drone | OEHHA CalEnviroScreen 4.0, Open-Meteo Air Quality (CAMS) | California (CalEnviroScreen); global (PM2.5) | No |
| `fema-disasters` | Archivist | satellite | OpenFEMA Disaster Declarations Summaries v2, FCC Area API (county lookup) | US | No |

36 built-ins. **Agents with a missing key sit out**: `missingEnv(w)` (`lib/sponsors/keys.ts`) removes them from the Claude planner roster, the keyword plan and the Insights teams; `/api/agents` sends them with `needsKeys: string[]`, and the Agents page (`/agents`) labels them "Needs key" and dims them in each orchestrator team. Census Rover counts too (without `CENSUS_API_KEY` it emits nothing).

**Insights teams** (`defaultAgents` in `lib/orchestrator/profiles.ts`, ~9–12 agents each after coverage and key filtering):

| Orchestrator | Team |
|---|---|
| Site Risk Analyst | fema-flood, sf-stormwater, terrain-elevation, cgs-ground-hazards, sea-level-rise, usgs-seismic, calfire-fhsz, sf-permits, sf-zoning, sf-property, sf-311, ca-schools |
| Storefront Scout | osm-places, sf-business, sf-transit, sf-crime, short-term-rentals, wiki-landmarks, sf-street-work, sf-311, sf-permits, + census-demographics, apify-reviews, brightdata-rent, brightdata-pulse when keyed |
| Disaster Response | live-conditions, nasa-eonet, sentinel-imagery, usgs-seismic, sf-fire-ems, weather-outlook, sea-level-rise, cgs-ground-hazards, fema-disasters, ca-schools, sf-311, local-news |

**Cross-reference rules** (`lib/orchestrator/crossref.ts`, top 12 by severity, deduped by title): permits in FEMA/SFPUC flood zones, on low ground, on filled former water, in CGS liquefaction zones, in the 2.5 ft sea-level-rise extent; schools in liquefaction / tsunami / SLR / wildfire / flood zones; severe crashes within 150 m of schools; schools and new housing in top-quartile CalEnviroScreen tracts; no-fault evictions × entire-home Airbnbs; evictions × sale prices vs. the assessed roll; new storefronts near crime hotspots or active street digs; storefront churn × transit access; historic landmarks in hazard zones; plus the 311, EONET, satellite and new-housing rules.

## Sponsor data workers (Bright Data + Apify)

Live public-web data from scrapers. Code: `lib/sponsors/` (API clients, key gating, topic extraction) and `lib/agents/workers/{reviews,rent,pulse,planningNotices}.ts`. Each worker is **inert without its keys**: it logs `needs <KEY> (not set); skipping.` and returns no findings. `missingEnv(worker)` in `lib/sponsors/keys.ts` lists what's missing, so the planner can leave the worker out. There is **no mock data at runtime**: the recorded HTML in `lib/sponsors/__fixtures__/` is read only by `sponsors.test.ts`. Responses go through `lib/http.ts`'s cache (6 h, keyed by URL + body, never the token), so repeat demo runs cost nothing.

| Worker | Calls | Cost per run (approx.) | Budget |
|---|---|---|---|
| **Review Radar** `apify-reviews` | `POST api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items` with `searchStringsArray: [<category from question>]`, `customGeolocation: <drawn polygon>`, `maxCrawledPlacesPerSearch: 30`, no detail pages | ≤30 places × $0.0015 + actor start ≈ **$0.05**; capped by `maxTotalChargeUsd=0.25` | 25 s run timeout, no retry |
| **Rent Scout** `brightdata-rent` | `POST api.brightdata.com/request` `{zone: UNLOCKER, url: <metro>.craigslist.org/search/apa?lat&lon&search_distance, format: "raw"}`; parses JSON-LD (coords, beds) + list (price, link) | 1 Unlocker request ≈ **$0.0015** | 25 s, 1 retry |
| **Local Pulse** `brightdata-pulse` | 2 × `POST api.brightdata.com/request` `{zone: SERP, url: google.com/search?q=…&brd_json=1, data_format: "parsed_light"}` (topic query, past year; plus a Reddit/Nextdoor-only query) | 2 SERP requests ≈ **$0.003** | 25 s |
| Generated agents' `scrape` tool | When Unlocker is configured, Claude's server-side `web_fetch` is replaced by a client-side `fetch_page` tool → Unlocker `data_format: "markdown"` (`lib/agents/runtime.ts`). `urlGuard` still applies; on a Bright Data error it fetches directly. | ≈ $0.0015 per page, ≤ a few per agent | 45 s agent budget |
| **Hearing Watch** `apify-planning-notices` | Our Actor (`apify/actors/sf-planning-notices`) via run-sync-get-dataset-items, input `{center, radiusKm, geocode: true}` | ~5 s at 256 MB ≈ **< $0.001** | 25 s, no retry |

Prices are list rates as of 2026-10-25. Check your plan.

**Setup**

1. **Bright Data:** in the control panel, create a **Web Unlocker** zone and a **SERP API** zone, then an API key (Account settings → API keys). Set `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_UNLOCKER_ZONE` (e.g. `web_unlocker1`) and `BRIGHTDATA_SERP_ZONE` (e.g. `serp_api1`). If the SERP zone is unset, Local Pulse uses the Unlocker zone.
2. **Apify:** Console → Settings → API & Integrations → copy the token into `APIFY_TOKEN`. Review Radar works from then on. `APIFY_MAPS_ACTOR` optionally swaps the Google Maps actor; set `REVIEW_RADAR_DETAILS=1` for popular-times data, which is slower and costs more.
3. **Our Actor (Best Actor award):** from `web/`, run `npm run apify:login` (paste the token), then `npm run apify:push`. Set `APIFY_PLANNING_ACTOR=<your-apify-username>/sf-planning-notices`, then restart `npm run dev`. To try it locally without the platform, run `npm run apify:run:local`; input comes from `apify/actors/sf-planning-notices/storage/key_value_stores/default/INPUT.json`. Make it public in Console (Publication tab) so judges can open it.
4. Add the same env vars on Vercel and redeploy.

**Check:** `npm test` (parsers + key gating). With keys set, open a run with `includeAgents: ["apify-reviews","brightdata-rent","brightdata-pulse","apify-planning-notices"]`. New built-ins only appear after restarting `npm run dev`: the registry lives on `globalThis`, so hot reload keeps the old list.

## RunEvent protocol

`POST /api/run` with a `RunRequest` (`mode`, `profileId` (a profile id, or `"auto"`/omitted), `region`, optional `question`, optional `includeAgents`) returns `{runId, backend}` in live mode (events land in the SpacetimeDB or Convex `events` table), otherwise `text/event-stream`; each message is `data: <JSON RunEvent>\n\n`. Types live in `lib/types.ts`.

| Event | Meaning |
|---|---|
| `run_started` | run id, mode, profile (`"auto"` until routed), region, whether the LLM is on |
| `routed` | the profile running the mission (`profileId`, `reason`, `auto`: picked by the router vs. chosen by the user). `append_events` copies it onto the run row's `profile_id` (SpacetimeDB module change needs `npm run spacetime:publish:cloud`; until then the Missions list reads the `routed` events) |
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

Generated agents are **configs, not code**: an `AgentConfig` with a `prompt` (its brief) run by one shared runtime. Users create them on the Agents page (`/agents`); the orchestrator creates them mid-run when it hits a gap.

| File | Role |
|---|---|
| `lib/agents/factory.ts` | `draftAgent(spec)`: one Claude call that either **reuses** a library agent or drafts a new config. `requestSpawn(spec, spawnedSoFar)`: guardrails (`SPAWN_LIMITS = { maxDepth: 2, maxPerRun: 4 }`), then registers a new agent as **temporary**. |
| `lib/agents/runtime.ts` | `buildGeneratedWorker(config)`: a bounded Claude tool-use loop (`CLAUDE_WORKER_MODEL`, default Sonnet 5.5; 6 turns, 45 s, 15 findings). Tools: `web_search` (`search`), `web_fetch` (`scrape`), `http_get` (public URLs only, `urlGuard.ts`), and `emit_findings`, which enforces the finding schema. |
| `lib/agents/placement.ts` | Finding coordinates: the agent's lng/lat, else a geocoded address (`geocode.ts`, Nominatim, 1 req/s), else the region center at reduced confidence. Findings well outside the region are dropped. Category is `custom`; pins use the agent's color. |
| `lib/agents/registry.ts` | Built-ins + **saved** agents (every planner and the Agents page see them) + **temporary** agents (spawned this run, reachable only by id until kept or discarded; lost on restart). |
| `lib/agents/library.ts` | Saved agents persisted to `data/agents.json` (gitignored; override with `AGENT_LIBRARY_PATH`). On Vercel it falls back to per-instance `/tmp`, so saved and temporary agents don't reliably survive across requests there; not in Convex yet. |

**When the orchestrator spawns** (Ask mode with an API key only): for each planner `gap` (dispatched alongside the planned workers), and once after the first sweep if `llmGapCheck` finds a remaining gap. Either may resolve to an existing agent instead of a new one.

**After a run**, the results show a **"N new agents to review"** button; behind it, spawned agents show **Keep in library / Discard**. The Agents page's create card drafts a config from a prompt, lets you edit the name and brief, then saves it; custom cards have a delete button.

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
