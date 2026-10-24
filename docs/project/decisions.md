# Decisions log

> **Summary:** Decisions made (with reasoning) and decisions still open. Update this file when something is decided; add the date.

## Made

- **2026-10-24: Pivot away from Hyphenate.** Earlier plan was a finance automation project for The Hyphenated Enterprise track (largest prize pool: $8k / $5k / $3k + expedited interviews for top 5). Dropped for Geo Research Agents; deliberate tradeoff, since the new idea doesn't fit that track.
- **2026-10-24: Two-tier agent architecture**, shared finding schema, thin Agent Hub, agents can spawn agents with guardrails. See [architecture.md](architecture.md).
- **2026-10-24: Depth over breadth.** One orchestrator end to end first.
- **2026-10-24: Backend = Convex (live shared mission state; SSE fallback).** Every run, its ordered RunEvent log and its findings live in Convex; browsers subscribe reactively, so a `/?run=<id>` link streams the same mission live on any device and replays finished ones. Without `NEXT_PUBLIC_CONVEX_URL` the app streams over SSE as before. See [web/README.md](../../web/README.md#convex-live-shared-mission-state).
- **2026-10-24: Map = MapLibre GL + deck.gl** on OpenFreeMap vector tiles (no key), Turf.js for geometry. deck.gl draws the animated agent fleet, trails, beams and insight arcs.
- **2026-10-24: LLM = Claude (Anthropic SDK)** for the orchestrator's plan / insights / answer, with a deterministic heuristic fallback when `ANTHROPIC_API_KEY` is unset.
- **2026-10-24: Demo workers + sources.** Flood: FEMA NFHL + SFPUC 100-year storm flood map (FEMA only covers SF's shoreline; SFPUC covers inland, which is what makes "permits inside a flood zone" fire in the Mission). Development: SF DBI permits. Plus elevation, 311, OSM places, USGS, NWS/air quality, news, Census. All live public data.
- **2026-10-24: Insights mode uses each orchestrator's `defaultAgents`.**

## Open

- [ ] **Which orchestrator / user type first.** *(Built: Site Risk Analyst end to end; Storefront Scout and Disaster Response reuse the same workers. Still open: which named community we pitch for Anthropic/Microsoft.)* Blocks most other decisions, and decides whether Anthropic/Microsoft are viable (they need a narrow named community).
- [x] Which 2–3 workers, and their real data sources (decided, see Made) (need a hazard/flood source + a permits/development source for the demo).
- [x] How Insights mode picks workers (per-orchestrator `defaultAgents`) when there's no question (all built-ins? a default set per orchestrator?)
- [ ] Which tool primitives generated agents get, and which transcription service.
- [ ] Which sponsor tracks we're targeting. Options and requirements: [tracks/shortlist.md](../tracks/shortlist.md). Notable findings:
  - Bright Data and Apify both reward our scraping workers; Bright Data **disqualifies mocked data in the demo**.
  - Fetch.ai requires the primary workflow to run in ASI:One chat with **no custom frontend**, which conflicts with the map UI.
  - Figma is a process track: only worth it if we start a stage log now.
- [x] Backend / findings store: **Convex** (decided 2026-10-24, see Made).
- [x] Map library: MapLibre GL + deck.gl + Turf.js (see Made).
- [x] LLM provider: Claude (see Made).
- [ ] Project name.
- [ ] Who presents the 2-minute pitch, who runs the live demo.
