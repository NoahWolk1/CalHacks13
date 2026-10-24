# Decisions log

> **Summary:** Decisions made (with reasoning) and decisions still open. Update this file when something is decided; add the date.

## Made

- **2026-10-24: Pivot away from Hyphenate.** Earlier plan was a finance automation project for The Hyphenated Enterprise track (largest prize pool: $8k / $5k / $3k + expedited interviews for top 5). Dropped for Geo Research Agents; deliberate tradeoff, since the new idea doesn't fit that track.
- **2026-10-24: Two-tier agent architecture**, shared finding schema, thin Agent Hub, agents can spawn agents with guardrails. See [architecture.md](architecture.md).
- **2026-10-24: Depth over breadth.** One orchestrator end to end first.
- **2026-10-24: Site Risk Analyst is the first orchestrator.** Storefront Scout and Disaster Response also exist and reuse the same workers (`web/src/lib/orchestrator/profiles.ts`).
- **2026-10-24: Demo workers are FEMA NFHL flood zones + SF DBI permits**, plus 7 more (elevation, SF 311, OSM places, USGS quakes, NWS alerts/air quality, news, census). Table in `web/README.md`.
- **2026-10-24: Insights mode uses a default worker set per orchestrator** (`defaultAgents` on each profile).
- **2026-10-24: Findings store is in-memory per run**, streamed to the map over SSE. Swapping in Convex/Spacetime is still open (see below).
- **2026-10-24: Map stack is MapLibre GL + deck.gl** on OpenFreeMap tiles, with Turf.js for geometry and the cross-reference spatial joins.
- **2026-10-24: LLM is Claude** via the Anthropic SDK for planning, insights and answers; falls back to heuristics when no API key is set. Built-in workers don't call an LLM.

## Open

- [ ] Which tool primitives generated agents get, and which transcription service.
- [ ] Limits for agents creating agents (depth, per-run cap) and whether spawning needs user approval. Owned by the agent-creation teammate; placeholder defaults are `maxDepth: 2, maxPerRun: 4` in `web/src/lib/agents/factory.ts`.
- [ ] Which sponsor tracks we're targeting. Options and requirements: [tracks/shortlist.md](../tracks/shortlist.md). Notable findings:
  - Bright Data and Apify both reward our scraping workers; Bright Data **disqualifies mocked data in the demo**.
  - Fetch.ai requires the primary workflow to run in ASI:One chat with **no custom frontend**, which conflicts with the map UI.
  - Figma is a process track: only worth it if we start a stage log now.
- [ ] Backend / findings store: Convex vs Spacetime (vs Elastic if their criteria fit). Pick one.
- [ ] Project name.
- [ ] Who presents the 2-minute pitch, who runs the live demo.
