# Architecture (decided)

> **Source:** team README / planning conversations, Sat 2026-10-24.  
> **Summary:** Two-tier agents (orchestrator per user type, shared workers), shared findings store and schema, agents creating agents with guardrails, and a thin Agent Hub. Tech choices (backend, map lib, LLM) are still open in [decisions.md](decisions.md).

## Two tiers of agents

### Orchestrator agents: one per user type
- Each orchestrator is built for a specific kind of user (e.g. small business owner scouting a storefront, insurance adjuster assessing a disaster zone).
- The orchestrator holds the **domain knowledge**: what this user cares about, which data matters, how to weigh it.
- It receives the user's area + question (or an Insights request), decides which worker agents are relevant, spins them up, and combines their output into a final answer or a set of insights.

### Worker agents: simple, reusable data gatherers
- Narrow agents that each pull one kind of data: e.g. permits, news, listings, demographics/census, reviews, flood/hazard maps.
- Workers are **generic and shared across orchestrators**. The storefront orchestrator and the disaster orchestrator might both use the same permits worker.

### How agents work together
All findings land in a **shared findings store** for the current region, so:
- The orchestrator can **cross-reference** findings from different workers (flood risk × planned construction → "this development is in a likely flood zone").
- A finding from one worker can **trigger another worker** (permits worker finds a new 6-story build → orchestrator sends the hazard worker to check that exact parcel).

The store is also what the map subscribes to, which is why the backend choice (Convex / Spacetime / Elastic) maps onto sponsor tracks. See [tracks/shortlist.md](../tracks/shortlist.md#convex--spacetime).

### Agents can create agents
If no agent in the library can do what's needed, an agent can **create a new one on the fly**, using the same prompt-to-create path users have in the Agent Hub. Examples:
- The orchestrator is asked about noise complaints, finds no worker for it, and generates a "scrape the city 311 portal" worker.
- The news worker finds a city council meeting about the area, and spawns a "transcribe this meeting video" worker to pull out the relevant part.

Generated agents run immediately as part of the current task. They show up in the agent panel marked **"created by `<parent agent>`"**, and after the run the user can **keep** (save to library) or **discard** them. Guardrails below.

### How the Agent Hub fits
- **Built-in library:** the workers we ship, browsable with a description of what each does and what data it uses.
- **Prompt-to-create:** users describe a new worker in natural language; an LLM turns that into an agent config that runs on the same runtime.
- **Workers are the building blocks** people create, edit, and reuse. **Orchestrators are the "products."** Once a custom worker is in your library, the orchestrator can pick it like any built-in one.

## Design principles

### The orchestrator must do more than summarize
If it just concatenates worker outputs, judges will see a prompt chain. It does five things a summarizer can't:

| Responsibility | What it means |
|---|---|
| **Plan** | Decide *which* workers to call based on the question and area, rather than calling all of them every time. |
| **Cross-reference** | Combine findings from *different* workers into an insight none could produce alone. **Powers Insights mode.** |
| **Reconcile** | When two workers disagree about the same place, flag the conflict and explain which source it trusts and why. |
| **Re-dispatch** | Spot gaps or follow-ups and send a worker back out with a narrower task. |
| **Spawn** | When no existing worker can fill a gap, create a new one instead of giving up. |

Each insight cites the findings it was built from, so a user can click through to the pins and sources.

### Shared finding schema
Every worker (built-in, user-created, or spawned) returns findings in this shape, so the orchestrator reasons over all of them the same way and the map renders any worker's output without custom code.

```json
{
  "claim": "Lot at 1420 Valencia approved for 6-story mixed-use",
  "geometry": { "type": "Point", "coordinates": [-122.421, 37.749] },
  "source_url": "https://...",
  "source_type": "permit_record",
  "observed_at": "2026-09-14",
  "confidence": 0.85,
  "worker_id": "sf-permits-v1"
}
```

- `geometry` (GeoJSON, Point or Polygon) ties every finding to the map.
- `observed_at` + `source_type` let the orchestrator resolve conflicts (a permit from last month beats a listing from last year).
- `worker_id` gives provenance: *which agent found what*.

### Keep the Agent Hub thin
An agent is just a **saved config**:
- name + one-line description (the orchestrator reads this to decide relevance)
- prompt
- allowed tools / data sources
- inputs (URL, channel, search term) and output schema (the finding schema)

"Editing an agent" = a form. "Running an agent" = the same runtime with different settings. **Prompt-to-create** is an LLM call that fills in the form; the user reviews it before saving. Generated agents may only use a **fixed set of tool primitives**:

| Primitive | Example custom agent |
|---|---|
| Fetch/scrape a URL | "Scrape the listings at `<url>` and pin each address" |
| Transcribe video/audio | "Transcribe these city council meeting videos and pull out mentions of this area" |
| Web/news search | "Find local news about road closures here" |
| Call a public API (GET) | "Pull air-quality readings from `<api>`" |

### Guardrails for agents creating agents
- **Same tool primitives only.** A spawned agent can't get more access than a user-created one.
- **Depth limit** (e.g. 2).
- **Per-run cap** on created agents (e.g. 3–5), plus a time/token budget per run.
- **Check the library first.** Reuse before creating.
- **Visible and temporary by default.** Shown with their parent; saved only if the user keeps them.

### Depth over breadth in the demo
"Any place, any topic, any agent" is a framework, not a product. **Build one orchestrator end to end and make it really good.** If time allows, a ~10-second clip of a second orchestrator reusing the same workers proves the reuse claim.
