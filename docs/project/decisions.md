# Decisions log

> **Summary:** Decisions made (with reasoning) and decisions still open. Update this file when something is decided; add the date.

## Made

- **2026-10-24: Pivot away from Hyphenate.** Earlier plan was a finance automation project for The Hyphenated Enterprise track (largest prize pool: $8k / $5k / $3k + expedited interviews for top 5). Dropped for Geo Research Agents; deliberate tradeoff, since the new idea doesn't fit that track.
- **2026-10-24: Two-tier agent architecture**, shared finding schema, thin Agent Hub, agents can spawn agents with guardrails. See [architecture.md](architecture.md).
- **2026-10-24: Depth over breadth.** One orchestrator end to end first.

## Open

- [ ] **Which orchestrator / user type first.** Blocks most other decisions, and decides whether Anthropic/Microsoft are viable (they need a narrow named community).
- [ ] Which 2–3 workers, and their real data sources (need a hazard/flood source + a permits/development source for the demo).
- [ ] How Insights mode picks workers when there's no question (all built-ins? a default set per orchestrator?)
- [ ] Which tool primitives generated agents get, and which transcription service.
- [ ] Which sponsor tracks we're targeting. Options and requirements: [tracks/shortlist.md](../tracks/shortlist.md). Notable findings:
  - Bright Data and Apify both reward our scraping workers; Bright Data **disqualifies mocked data in the demo**.
  - Fetch.ai requires the primary workflow to run in ASI:One chat with **no custom frontend**, which conflicts with the map UI.
  - Figma is a process track: only worth it if we start a stage log now.
- [ ] Backend / findings store: Convex vs Spacetime (vs Elastic if their criteria fit). Pick one.
- [ ] Map library (Leaflet or Mapbox; Turf.js for geometry ops like point-in-polygon).
- [ ] LLM provider for orchestrator and workers.
- [ ] Project name.
- [ ] Who presents the 2-minute pitch, who runs the live demo.
