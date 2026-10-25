# Architecture

> **Source:** team README / planning conversations, Sat 2026-10-24; checked against `web/` code Sun 2026-10-25.  
> **Summary:** Two-tier agents (orchestrator per user type, shared workers), shared findings store and schema, agents creating agents with guardrails, and a thin Agent Hub. Each section notes what is **built** vs **planned**. Map stack (MapLibre + deck.gl + Turf), LLM (Claude) and backend (Convex, with an SSE fallback) are decided and built; see [decisions.md](decisions.md). File-level details, the RunEvent protocol and API routes are in [web/README.md](../../web/README.md).

## Two tiers of agents

### Orchestrator agents: one per user type
- Each orchestrator is built for a specific kind of user. Built: **Site Risk Analyst** (primary), **Storefront Scout**, **Disaster Response** (`lib/orchestrator/profiles.ts`).
- The orchestrator holds the **domain knowledge** (`domainPrompt`): what this user cares about, which data matters, how to weigh it.
- It receives the user's area + question (or an Insights request), decides which worker agents are relevant, dispatches them, and combines their output into insights and an answer. One shared loop runs every profile (`lib/orchestrator/run.ts`).

### Worker agents: simple, reusable data gatherers
- Narrow agents that each pull one kind of data. Built: 13 workers covering FEMA flood zones, the SFPUC storm flood map, elevation, SF permits, SF 311, OSM places, USGS quakes, NWS alerts/air quality, news, census, Sentinel-2/Landsat imagery, satellite orbit passes and NASA EONET events (`lib/agents/workers/`). Built-in workers are plain code and don't call an LLM.
- Workers are **generic and shared across orchestrators**. Storefront Scout and Site Risk Analyst both use the permits worker.

### How agents work together
All findings land in a **shared findings store** for the current run, so:
- The orchestrator can **cross-reference** findings from different workers (flood zone × permit → "this development is in a flood zone").
- A finding from one worker can **trigger another worker** (permits in risky spots → orchestrator sends Terrain Scanner to measure elevation at those exact parcels).

**Built:** the orchestrator keeps the run's findings in memory for cross-referencing, and every run, its ordered event log and its findings are written to **Convex**, which browsers subscribe to (share links, history, replay). Without Convex the run streams over SSE and nothing persists. Details: [web/README.md](../../web/README.md#convex-live-shared-mission-state).

### Agents can create agents
If no agent in the library can do what's needed, the orchestrator **creates a new one on the fly**, using the same `draftAgent()` path users have in the Agent Hub (`lib/agents/factory.ts`). It checks the library first and reuses an existing agent when one fits. Examples:
- Storefront Scout is asked whether a block suits a café, finds no worker for food-safety data, and creates an agent that pulls SF restaurant health-inspection scores.
- Site Risk Analyst is asked about noise complaints in a city without a 311 worker, and creates a "scrape the city 311 portal" agent.

When it happens (built): only in **Ask mode with an API key**, for each `gap` the planner reports (dispatched alongside the planned workers) and once after the first sweep if a coverage check finds a remaining gap. Workers can't spawn workers.

Generated agents run immediately as part of the current task. They show up in the agent panel marked **"created by `<parent agent>`"**, stay temporary (invisible to other runs), and after the run the user can **Keep in library** or **Discard** them.

### How the Agent Hub fits
- **Library:** built-in workers plus saved generated agents, browsable as cards with description, data sources, tools and creator. Saved agents live in a JSON file, not Convex; on Vercel that file is in per-instance `/tmp` and doesn't persist reliably.
- **Prompt-to-create:** users describe a new worker in natural language; one Claude call either points at an existing agent ("your library already has this") or drafts a config, which the user reviews and saves.
- **Workers are the building blocks; orchestrators are the "products."** A saved agent joins every orchestrator's **Ask** planner roster like a built-in one. It is not added to Insights-mode teams, and the UI has no way to force-include it in a run (the API's `includeAgents` field exists but nothing sends it).

## Design principles

### The orchestrator must do more than summarize
If it just concatenates worker outputs, judges will see a prompt chain. It does five things a summarizer can't:

| Responsibility | What it means | Built |
|---|---|---|
| **Plan** | Decide *which* workers to call based on the question and area, rather than calling all of them every time. | Ask mode: Claude structured plan (keyword heuristic without a key). Insights mode: the profile's `defaultAgents`. SF-only workers dropped outside SF. |
| **Cross-reference** | Combine findings from *different* workers into an insight none could produce alone. **Powers Insights mode.** | 6 Turf spatial-join rules (`crossref.ts`) feed Claude, which writes 3–6 insights citing finding ids. Without a key the joins are the insights. |
| **Reconcile** | When two workers disagree about the same place, flag the conflict and explain which source it trusts and why. | One rule (FEMA "no hazard" vs. 311 flood reports / low ground) plus Claude `conflict` insights weighing recency and authority. |
| **Re-dispatch** | Spot gaps or follow-ups and send a worker back out with a narrower task. | One fixed rule: Terrain Scanner to up to 12 permit parcels (skipped for Storefront Scout). |
| **Spawn** | When no existing worker can fill a gap, create a new one instead of giving up. | Planner gaps + one post-sweep coverage check (Ask mode only). |

Each insight cites the findings it was built from, so a user can hover/click through to the pins and sources.

### Shared finding schema
Every worker (built-in or generated) returns findings in this shape (`Finding` in `lib/types.ts`), so the orchestrator reasons over all of them the same way and the map renders any worker's output without custom code.

```json
{
  "id": "F12",
  "claim": "1420 Valencia St: new 6-story mixed-use building, 24 units",
  "geometry": { "type": "Point", "coordinates": [-122.421, 37.749] },
  "source_url": "https://data.sfgov.org/...",
  "source_type": "permit_record",
  "observed_at": "2026-09-14",
  "confidence": 0.85,
  "worker_id": "sf-permits",
  "category": "permit",
  "severity": 0.6,
  "props": { "units": 24, "cost": 12000000 }
}
```

- `geometry` (GeoJSON, Point or Polygon) ties every finding to the map.
- `observed_at` + `source_type` let the orchestrator resolve conflicts (a permit from last month beats a listing from last year).
- `worker_id` gives provenance: *which agent found what*. `id` is assigned by the orchestrator and is what insights cite.
- `category` drives pin color/icon and the spatial joins; generated agents always use `"custom"`. `severity` (0–1) drives pin size. `props` holds structured details for the inspector.
- `source_url` and `observed_at` are optional.

### Keep the Agent Hub thin
An agent is just a **saved config** (`AgentConfig`):
- name + one-line description (the orchestrator reads this to decide relevance)
- prompt (the agent's brief)
- allowed tools, data sources, coverage, plus vehicle and color for the map

"Running an agent" = one shared runtime (`lib/agents/runtime.ts`) with different settings: a bounded Claude tool-use loop with the agent's prompt as its brief. **Prompt-to-create** is an LLM call that fills in the config; the user can edit the name and brief before saving. Saved agents can be deleted but not edited. The library is a JSON file (`web/data/agents.json`, gitignored).

Generated agents may only use a **fixed set of tool primitives**:

| Primitive | Implementation | Example custom agent |
|---|---|---|
| `search` | Claude server-side `web_search` (≤4 uses) | "Find local news about road closures here" |
| `scrape` | Claude server-side `web_fetch` (≤4 uses) | "Scrape the listings at `<url>` and pin each address" |
| `http_get` | Our GET tool; public http(s) URLs only (`urlGuard.ts` blocks private/loopback hosts) | "Pull SF restaurant inspection scores from the DataSF API" |
| `geocode` | Automatic, not a model tool: addresses are geocoded with Nominatim near the region | (every generated agent) |

Every agent also gets `emit_findings`, which enforces the finding schema. **Transcription is not built.**

### Guardrails for agents creating agents
Built (`SPAWN_LIMITS` in `factory.ts`, `RUNTIME_LIMITS` in `runtime.ts`):
- **Same tool primitives only.** A spawned agent gets exactly what a user-created one gets.
- **Only the orchestrator spawns**, at depth 1 (limit `maxDepth: 2`).
- **Per-run cap** of 4 created agents. Each generated agent run is capped at 6 turns, 45 s and 15 findings.
- **Check the library first.** The factory reuses an existing agent when one fits.
- **Visible and temporary by default.** Shown with their parent; saved only if the user keeps them.
- **Findings stay on the map area.** Findings that land well outside the region are dropped; ones with no location are pinned at the region center with reduced confidence.
- **No API key, no spawning.** Gaps are shown as notes and Hub creation is disabled.

### Depth over breadth in the demo
"Any place, any topic, any agent" is a framework, not a product. **Lead with Site Risk Analyst end to end and make it really good.** Storefront Scout reusing the same workers (and hosting the spawn beat) proves the reuse claim.
