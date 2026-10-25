# Project overview: Geo Research Agents (working title)

> **Source:** team README / planning conversations, Sat 2026-10-24; build status checked against `web/` code Sun 2026-10-25 (after merging the Convex, deploy and space-worker changes).  
> **Summary:** What we're building, the user flow, the orchestrators, the demo moment, and build order with status. Architecture details are in [architecture.md](architecture.md); code-level details in [web/README.md](../../web/README.md); open questions in [decisions.md](decisions.md).

## The idea in one paragraph

A tool where you **drag/select a region on a map** (draw a box/polygon or drop a pin), **ask a question about that area**, and the **relevant agents spin up and work together** to answer it. Results stream back onto the map as pins/regions with sources attached, and an orchestrator agent synthesizes them into an answer. Even without a question, the agents can **generate insights** about the area by cross-referencing each other's findings (e.g. one agent finds the area is likely to flood, another finds new buildings planned there, and together they flag that building there may be a bad idea). There's also an **agent hub/library** where users can browse our built-in agents and **prompt the creation of new ones** for niche tasks our defaults don't cover (e.g. "health inspection scores for restaurants in SF", "scrape the listings at `<url>`").

The UI currently brands the app **GeoSwarm** (`web/src/lib/brand.ts`); the project name is still open.

## User flow

1. **Select a region.** Drag a box, draw a polygon, or drop a pin on the map.
2. **Pick an orchestrator and a mode:**
   - **Ask:** type a question ("Is this a good spot for a coffee shop?"). The orchestrator picks only the agents relevant to that question and dispatches them.
   - **Insights:** no question needed. The orchestrator's default survey team scans the area, and the orchestrator looks for findings that *combine* into something notable (risks, opportunities, contradictions).
3. **Watch agents work.** Each agent drives/flies onto the map as a vehicle and shows in the side panel with its status and log; its findings drop onto the map as they arrive.
4. **Get the answer / insights.** The orchestrator returns ranked insights (and, in Ask mode, a streamed written answer), each citing the findings it rests on.
5. **Missing an agent?** Open the **Agents** page (`/agents`, top-right), describe the agent you need in plain English, review the draft, and save it to the library. In Ask mode the **orchestrator also creates agents itself** mid-run when nothing in the library fits; after the run you **Keep** or **Discard** them (see [architecture.md](architecture.md#agents-can-create-agents)).

## Orchestrators (user types)

**Decided 2026-10-24:** Site Risk Analyst is the primary orchestrator. All three are built (`web/src/lib/orchestrator/profiles.ts`) and share the same worker pool, which covers the "second orchestrator reusing the same workers" bonus.

| Orchestrator | Persona | Example question | Insights-mode team (`defaultAgents`) |
|---|---|---|---|
| **Site Risk Analyst** (primary) | Planners, developers, homebuyers, insurers | "Is it risky to build here?" | FEMA flood, storm flood (SFPUC), terrain, permits, seismic, 311, live conditions, news, Sentinel imagery |
| **Storefront Scout** | Small business owners scouting a location | "Is this a good spot for a coffee shop?" | places, census, 311, permits, news |
| **Disaster Response** | Relief coordinators, insurance adjusters | "What's the current situation here?" | live conditions, news, 311, FEMA flood, storm flood, seismic, places, NASA EONET, Sentinel imagery, orbit passes |

The personas are still broad. The Anthropic and Microsoft tracks reward a narrow, named community, so the pitch should name one (see [tracks/shortlist.md](../tracks/shortlist.md#anthropic)).

## The demo moment

Design the build backward from this.

1. User drags a box over a San Francisco neighborhood, picks **Site Risk Analyst**, and hits **Insights** (or asks a question).
2. The workers spin up; pins appear on the map in real time, each with a source.
3. **Storm Scout (SFPUC 100-year storm map) and Flood Recon (FEMA NFHL) map the flood zones. Permit Patrol (SF DBI) finds new buildings approved there.** FEMA covers little of the inland Mission; SFPUC is what makes the overlap fire.
4. The orchestrator connects the two ("6 permitted projects inside a mapped flood zone") and links the insight to both sets of pins. It then **re-dispatches Terrain Scanner** to measure ground elevation at each permitted parcel.
5. **Bonus beat (agents creating agents):** with **Storefront Scout**, ask "Is this a good spot for a café?". The orchestrator hits a gap, **creates a new agent** that pulls SF restaurant health-inspection scores (DataSF), it appears in the agent panel marked "created by", drops pins, and after the run the user clicks **Keep in library**. Fallback: create the same agent from the Agent Hub.

The cross-agent insight shows the system is doing real reasoning, not just summarizing. A conflict-catch is the second example: "FEMA map vs. ground truth disagree" fires when FEMA shows no hazard but 311 flooding reports or low-elevation samples say otherwise.

Most built-in workers work anywhere in the US or globally, but permits, 311 and the SFPUC storm map are **SF only**, so the demo moment needs an SF region. Judges get ~2 minutes at the table and a **live demo is required** ([event/overview.md](../event/overview.md#judging)).

## Build order

Status as of Sun 2026-10-25 early morning (from the code in `web/`).

| # | Step | Status |
|---|---|---|
| 1 | Map with box/polygon/pin selection + finding schema rendering as pins | **Done** (MapLibre + deck.gl) |
| 2 | Workers returning **real** data in the finding schema | **Done**: 13 built-in workers on public APIs, no mocks ([web/README.md](../../web/README.md#built-in-workers)) |
| 3 | Orchestrator loop (Ask mode): plan → dispatch → synthesize, findings **streaming** onto the map | **Done** (Convex live state, SSE fallback) |
| 4 | Insights mode: cross-reference findings across workers + re-dispatch | **Done**: 6 Turf spatial-join rules + Claude insights; one re-dispatch rule (Terrain Scanner → permit parcels) |
| 5 | Agent Hub + prompt-to-create, and agents creating agents mid-run | **Done** for the Hub and orchestrator spawns (planner gaps + one post-sweep check). Not built: transcription, workers spawning workers |
| 6 | Conflict detection between sources | **Partial**: one rule (FEMA vs. ground truth) plus Claude-written `conflict` insights |
| 7 | Second orchestrator reusing the same workers | **Done** (3 profiles) |
| — | Convex as shared mission state + Vercel deploy | **Done**: share links, history, replay; live at https://geoswarm.vercel.app. Saved agents are not in Convex (per-instance `/tmp` on Vercel) |
| — | Sponsor integrations (Bright Data / Apify) | **Not started**: generated agents use Claude's `web_search` / `web_fetch` |

**Steps 1–4 are the demo. Steps 5–7 are bonus.** What's left: rehearsing the demo (and the spawn beat, ideally locally, see [decisions.md](decisions.md)), the named community, and submitting the Devpost from [submission/devpost-draft.md](../submission/devpost-draft.md).
