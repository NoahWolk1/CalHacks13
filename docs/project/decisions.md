# Decisions log

> **Summary:** Decisions made (with reasoning) and decisions still open. Update this file when something is decided; add the date.

## Made

- **2026-10-24: Pivot away from Hyphenate.** Earlier plan was a finance automation project for The Hyphenated Enterprise track (largest prize pool: $8k / $5k / $3k + expedited interviews for top 5). Dropped for Geo Research Agents; deliberate tradeoff, since the new idea doesn't fit that track.
- **2026-10-24: Two-tier agent architecture**, shared finding schema, thin Agent Hub, agents can spawn agents with guardrails. See [architecture.md](architecture.md).
- **2026-10-24: Depth over breadth.** One orchestrator end to end first.
- **2026-10-24: Site Risk Analyst is the first orchestrator.** Storefront Scout and Disaster Response also exist and reuse the same workers (`web/src/lib/orchestrator/profiles.ts`). Which named community we pitch for Anthropic/Microsoft is still open (see below).
- **2026-10-24: Demo workers + sources.** Flood: FEMA NFHL + SFPUC 100-year storm flood map (FEMA only covers SF's shoreline; SFPUC covers inland, which is what makes "permits inside a flood zone" fire in the Mission). Development: SF DBI permits. Plus elevation, 311, OSM places, USGS, NWS/air quality, news, Census. All live public data. Table in `web/README.md`.
- **2026-10-24: Insights mode uses a default worker set per orchestrator** (`defaultAgents` on each profile).
- **2026-10-24 (superseded 2026-10-25 by SpacetimeDB, below): Backend = Convex (live shared mission state; SSE fallback).** Every run, its ordered RunEvent log and its findings live in Convex; browsers subscribe reactively, so a `/?run=<id>` link streams the same mission live on any device and replays finished ones. Without `NEXT_PUBLIC_CONVEX_URL` the app streams over SSE (in-memory per run) as before. See [web/README.md](../../web/README.md#convex-live-shared-mission-state).
- **2026-10-24: Map stack is MapLibre GL + deck.gl** on OpenFreeMap tiles, with Turf.js for geometry and the cross-reference spatial joins. deck.gl draws the animated agent fleet, trails, beams and insight arcs.
- **2026-10-24: LLM is Claude** via the Anthropic SDK for planning, insights and answers; falls back to heuristics when no API key is set. Built-in workers don't call an LLM.
- **2026-10-24: Hosting = Vercel (Root Directory `web`) + Convex cloud prod.** The build runs `npx convex deploy --cmd 'npm run build'` when `CONVEX_DEPLOY_KEY` is set (`web/vercel.json`, `npm run build:vercel`). Background orchestrator work runs in `after()`, stop goes through a Convex `stopRequested` flag so it works across instances, and the disk cache lives in `/tmp` on Vercel. Runs are capped at 300 s on Hobby. Steps: [web/README.md](../../web/README.md#deploy-to-vercel).
- **2026-10-24: Visual direction "Night survey sheet".** The chrome is warm graphite with docked solid panels and hairline borders, with no glass, glow or gradients. Colour is reserved for data: the agents (`web/src/lib/client/theme.ts`) and the insight kinds. One sodium-orange accent marks the drawn area, live state and the command post. Geist in sentence case, with mono only for numbers and IDs. Collapsed panels leave a 36px activity rail.

- **2026-10-25: Live backend switched from Convex to SpacetimeDB (Spacetime track); Convex kept as fallback.** Spacetime wants SpacetimeDB as the *core* real-time backend and calls out AI agent coordination + live dashboards, which is exactly the mission event log. The TypeScript module (`web/spacetime/src/index.ts`) holds `runs`, the ordered `events` log, `findings` and the private `llm_usage` rate-limit counters; reducers enforce seq order and do the LLM cap check atomically. Only the Next server's allowlisted identity (`writers` table, `SPACETIME_TOKEN`) can write; browsers subscribe anonymously and read. The server calls reducers over HTTP (serverless-friendly). Published to maincloud as database `geoswarm`. Backend is chosen by `LIVE_BACKEND` (default spacetime when configured, else convex, else SSE); the browser follows what `/api/agents` reports. We no longer claim the Convex track (one of Convex/Spacetime per team). Details: [web/README.md](../../web/README.md#spacetimedb-live-shared-mission-state-primary).

- **2026-10-24: Deployed** to https://geoswarm.vercel.app (Vercel project `geoswarm`, CLI deploys from `web/`) with Convex prod `hip-puffin-315` (project `geoswarm`, team noah-wolk). Claude runs are rate-limited (20/h per IP, 150/h global, via Convex `llmUsage`); over the cap runs fall back to heuristic mode.

## Open

- [ ] **Named community for the pitch** (needed for Anthropic/Microsoft). Candidates in [submission/tracks.md](../submission/tracks.md).
- [ ] Which tool primitives generated agents get, and which transcription service.
- [ ] Limits for agents creating agents (depth, per-run cap) and whether spawning needs user approval. Owned by the agent-creation teammate; placeholder defaults are `maxDepth: 2, maxPerRun: 4` in `web/src/lib/agents/factory.ts`.
- [ ] Which sponsor tracks we're targeting. Options and requirements: [tracks/shortlist.md](../tracks/shortlist.md). Notable findings:
  - Bright Data and Apify both reward our scraping workers; Bright Data **disqualifies mocked data in the demo**.
  - Fetch.ai requires the primary workflow to run in ASI:One chat with **no custom frontend**, which conflicts with the map UI.
  - Figma is a process track: only worth it if we start a stage log now.
- [ ] Project name.
- [ ] Who presents the 2-minute pitch, who runs the live demo.
