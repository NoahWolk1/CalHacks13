# Geo Research Agents (working title)

> **Status:** Planning / early build (Cal Hacks 13.0).
> **Deadline:** Devpost submission **Sunday 9:00 AM**. Nothing after that counts.

**▶ Running the app:** the code lives in [`web/`](web/). See [`web/README.md`](web/README.md) for setup, architecture, the worker list, and the agent-creation contract.

---

## 1. The idea in one paragraph

A tool where you **drag/select a region on a map** (draw a box/polygon or drop a pin), **ask a question about that area**, and the **relevant agents spin up and work together** to answer it. Results stream back onto the map as pins/regions with sources attached, and an orchestrator agent synthesizes them into an answer. Even without a question, the agents can **generate insights** about the area by cross-referencing each other's findings (e.g. one agent finds the area is likely to flood, another finds new buildings planned there, and together they flag that building there may be a bad idea). There's also an **agent hub/library** where users can browse our built-in agents and **prompt the creation of new ones** for niche tasks our defaults don't cover (e.g. "scrape the site at `<url>`", "transcribe these videos").

### User flow

1. **Select a region.** Drag a box, draw a polygon, or drop a pin on the map.
2. **Pick a mode:**
   - **Ask:** type a question ("Is this a good spot for a coffee shop?"). The orchestrator picks only the agents relevant to that question and dispatches them.
   - **Insights:** no question needed. A broad set of agents surveys the area, and the orchestrator looks for findings that *combine* into something notable (risks, opportunities, contradictions).
3. **Watch agents work.** Each active agent shows up in a side panel with its status; its findings drop onto the map as they arrive.
4. **Get the answer / insights.** The orchestrator returns a written answer or a ranked list of insights, each linked to the pins and sources that support it.
5. **Missing an agent?** Open the **Agent Hub**, describe the agent you need in plain English, and it's generated, saved to your library, and available for the next run. Agents can also **create new agents themselves** mid-run when no existing one fits (see §2).

---

## 2. Architecture (decided)

Two tiers of agents:

### Orchestrator agents: one per user type
- Each orchestrator is built for a specific kind of user (e.g. small business owner scouting a storefront, insurance adjuster assessing a disaster zone).
- The orchestrator holds the **domain knowledge**: what this user cares about, which data matters, how to weigh it.
- It receives the user's area + question (or an Insights request), decides which worker agents are relevant, spins them up, and combines their output into a final answer or a set of insights.

### Worker agents: simple, reusable data gatherers
- Narrow, less complex agents that each pull one kind of data: e.g. permits, news, listings, demographics/census, reviews, flood/hazard maps.
- Workers are **generic and shared across orchestrators**. The storefront orchestrator and the disaster orchestrator might both use the same permits worker.

### How agents work together
Workers don't just report back in isolation. All findings land in a **shared findings store** for the current region, so:
- The orchestrator can **cross-reference** findings from different workers (flood risk × planned construction → "this development is in a likely flood zone").
- A finding from one worker can **trigger another worker** (permits worker finds a new 6-story build → orchestrator sends the hazard worker to check that exact parcel).

### Agents can create agents
If no agent in the library can do what's needed, an agent can **create a new one on the fly**, using the same prompt-to-create path users have in the Agent Hub. Examples:
- The orchestrator is asked about noise complaints, finds no worker for it, and generates a "scrape the city 311 portal" worker.
- The news worker finds a city council meeting about the area, and spawns a "transcribe this meeting video" worker to pull out the relevant part.

Generated agents run immediately as part of the current task. They show up in the agent panel marked **"created by `<parent agent>`"**, and after the run the user can **keep** (save to library) or **discard** them. Guardrails are in §3c.

### How the Agent Hub fits
- **Built-in library:** the workers we ship (permits, news, hazards, etc.), browsable with a description of what each one does and what data it uses.
- **Prompt-to-create:** users describe a new worker in natural language ("scrape the listings at `<url>`", "transcribe the city council videos on this channel and pull out anything about this neighborhood"). An LLM turns that description into an agent config (see §3c) that runs on the same runtime.
- **Workers are the building blocks** people create, edit, and reuse. **Orchestrators are the "products"** that combine workers for a specific user. Once a custom worker is in your library, the orchestrator can pick it like any built-in one.

---

## 3. Design principles we agreed on

### 3a. The orchestrator must do more than summarize
If it just concatenates worker outputs into a paragraph, judges will see a prompt chain. It should do five things a summarizer can't:

| Responsibility | What it means |
|---|---|
| **Plan** | Decide *which* workers to call based on the question and area, rather than calling all of them every time. |
| **Cross-reference** | Combine findings from *different* workers into an insight none of them could produce alone (flood risk + planned construction → "risky development"). **This powers Insights mode** (see §5). |
| **Reconcile** | When two workers disagree about the same place, flag the conflict and explain which source it trusts and why. |
| **Re-dispatch** | Spot gaps ("no foot-traffic data for the east half of the polygon") or follow-ups ("check flood risk for this specific parcel") and send a worker back out with a narrower task. |
| **Spawn** | When no existing worker can fill a gap, create a new one (e.g. a scraper for a specific site) instead of giving up. |

Each insight should cite the findings it was built from, so a user can click through to the pins and sources behind it.

### 3b. Every worker returns findings in one shared schema
This lets the orchestrator reason over all findings the same way, and lets the map render any worker's output without custom code per worker.

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

- `geometry` (GeoJSON) is what ties every finding to the map. Can be Point or Polygon.
- `observed_at` + `source_type` are what let the orchestrator resolve conflicts sensibly (e.g. a permit from last month beats a listing from last year).
- `worker_id` gives provenance so we can show *which agent found what*.

### 3c. Keep the Agent Hub thin
We have very little time. An agent is just a **saved config**:
- name + one-line description (the orchestrator reads this to decide when the agent is relevant)
- prompt
- allowed tools / data sources
- inputs (e.g. a URL, a channel, a search term) and output schema (the finding schema above for workers)

"Editing an agent" = a form. "Running an agent" = the same orchestrator/worker runtime with different settings. That's enough to show the concept without building a real marketplace.

**Prompt-to-create** is just an LLM call that fills in that form from the user's description. The user reviews/edits the generated config before saving. To keep generated agents safe and working, they can only use a **fixed set of tool primitives** we provide, for example:

| Primitive | Example custom agent |
|---|---|
| Fetch/scrape a URL | "Scrape the listings at `<url>` and pin each address" |
| Transcribe video/audio | "Transcribe these city council meeting videos and pull out mentions of this area" |
| Web/news search | "Find local news about road closures here" |
| Call a public API (GET) | "Pull air-quality readings from `<api>`" |

Every generated agent must still emit findings in the shared schema, so the map and orchestrator work with it without custom code.

**When agents create agents**, the same rules apply, plus a few limits so it can't run away:
- **Same tool primitives only.** A spawned agent can't get more access than a user-created one.
- **Depth limit** (e.g. 2): spawned agents can spawn at most one more level.
- **Per-run cap** on how many agents can be created (e.g. 3–5), plus a time/token budget for the run.
- **Check the library first.** Reuse an existing agent if one fits; only create when nothing does.
- **Visible and temporary by default.** Spawned agents appear in the UI with their parent, and only get saved if the user keeps them.

### 3d. Depth over breadth in the demo
"Any place, any topic, any agent" is a framework, not a product. Judges get ~2 minutes at our table. **Build one orchestrator end to end and make it really good.** If time allows, show a second orchestrator reusing the same workers with a different plan. A ~10-second clip of that proves the reuse claim without doubling the work.

---

## 4. Candidate user types / orchestrators (NOT yet decided)

Pick **one** to build first. It determines which workers we need and which data sources are realistic to hit by tomorrow morning.

| User | Example question | Likely workers |
|---|---|---|
| **Small business owner** scouting a storefront | "Which of these three blocks is best for a coffee shop?" | foot traffic, competitors, permits, rent/listings signals |
| **Insurance adjuster / relief volunteer** | "What's the damage and status inside this wildfire/flood zone?" | news, official alerts, imagery/reports, infrastructure status |
| **Journalist** investigating a block | "Who owns this land and what's being built here?" | property records, permits, news, corporate filings |

---

## 5. The demo moment

Design the build backward from this. Example:

1. User drags a box over a neighborhood and hits **Insights** (or asks a question).
2. The relevant workers spin up; pins appear on the map in real time, each with a source.
3. **The hazard worker finds the area is likely to flood. The permits worker finds new buildings approved there.**
4. The orchestrator connects the two: "3 approved developments sit inside a projected flood zone; building here may not be a good idea," and links the insight to both sets of pins. Ideally it re-dispatches the hazard worker to check each parcel individually.
5. **Bonus beat:** user opens the Agent Hub, types "scrape the listings at `<url>`", and the new agent shows up in the next run. Or, even better, the orchestrator hits a gap, **spawns that scraper itself**, and it appears in the agent panel mid-run.

The cross-agent insight is the moment that shows the system is doing real reasoning, not just summarizing. A conflict-catch (a listing says a lot is vacant, but permits show construction approved last month) is a good second example of the same idea.

---

## 6. Build order

| # | Step | Notes |
|---|---|---|
| 1 | Map with drag/polygon/pin selection + finding schema rendering as pins | Foundation for everything else |
| 2 | 2–3 workers returning **real** data in the finding schema | Pick sources that are reachable today; a hazard/flood worker + a permits worker sets up the demo moment |
| 3 | Orchestrator loop (Ask mode): plan → dispatch relevant workers → synthesize, findings **streaming** onto the map | **Put a draft on Devpost once this works** |
| 4 | Insights mode: cross-reference findings across workers + re-dispatch | This is the demo moment |
| 5 | Agent Hub: library view + prompt-to-create a worker (scrape URL, transcribe video), then let agents call that same create path mid-run | Strong bonus; shows extensibility. Agent-spawning is cheap once user-creation works |
| 6 | Conflict detection between sources | Bonus |
| 7 | Second orchestrator reusing the same workers | Bonus |

**Steps 1–4 are the demo. Steps 5–7 are bonus, in that order.**

---

## 7. Sponsor tracks this could target

We're **pivoting away from the Hyphenate track** (autonomous finance systems), which had the largest prize pool ($8k / $5k / $3k + expedited interviews for top 5). That's a deliberate tradeoff; this idea doesn't fit that track.

Tracks that fit the new idea (from the Hacker Guide):

| Track | Why it fits | Prize |
|---|---|---|
| **Fetch.ai** | Most natural fit for the marketplace piece; their workshop is "Build, Deploy & Monetise AI Agents." Details: fetch.ai/events/calhacks-13-0 | $1,500 / $1,000 / $500 |
| **Elastic** | Their workshop is "Build an Agent That Does the Research: Context Engineering with Elasticsearch," which is basically our core loop. Criteria listed as "coming soon." | Meta Quest 3S / Bose QC headphones |
| **Apify** | Scraping workers could be built as Apify actors. Separate award for best actor built at the event. Must be meaningful use. | Top 5: $2,000 / $1,000 / $800 / $400 / $400; Best Actor $400 |
| **Spacetime** | Agents writing findings into shared live state the map subscribes to. They explicitly call out AI agent coordination and live dashboards. Must be core, not bolted on. | $2,048 / $1,024 / $512 |
| **Convex** | Reactive backend alternative to Spacetime for the same live-findings pattern. | $5,000 to winner |
| **Anthropic** | Only works if we pick a **named community**. Their first criterion rules out a generic tool. Also wants a real problem, something that works, and thoughtful use of Claude (including where it could go wrong). | $5,000 Claude credits + 1Y Claude Max 20x + office hours |
| **Microsoft "Built for the Real World"** | Production-minded agent for a high-impact domain. Judged on customer understanding, measurable usefulness, path to production, responsible design, end-to-end functionality. | Surface laptop per member + FDE tech talk + mentorship |

Stacking 2–3 of these is realistic **if each is actually part of the build**. Note Spacetime and Convex overlap; pick one backend.

General Cal Hacks judging criteria: impact, quality, technical complexity, creativity. A live demo is required.

---

## 8. Open decisions

- [x] **Which orchestrator / user type first** (blocks most other decisions)
  → decided: **Site Risk Analyst** built first. Storefront Scout and Disaster Response also exist and reuse the same workers (`web/src/lib/orchestrator/profiles.ts`).
- [x] Which 2–3 workers, and their real data sources (need a hazard/flood source + a permits/development source for the demo)
  → decided: **FEMA NFHL flood zones + SF DBI permits** for the demo moment, plus 7 more (elevation, SF 311, OSM places, USGS quakes, NWS alerts/air quality, news, census). Table in `web/README.md`.
- [x] How Insights mode picks workers when there's no question (all built-ins? a default set per orchestrator?)
  → decided: a default set per orchestrator (`defaultAgents` on each profile).
- [ ] Which tool primitives generated agents get (scrape, transcribe, search, API GET?) and which transcription service
- [x] How the shared findings store works (same as the backend choice below?)
  → decided for now: in-memory per run, streamed to the map over SSE. Swapping in Convex/Spacetime is still open (see backend below).
- [ ] Limits for agents creating agents (depth, per-run cap) and whether spawning needs user approval or just shows up in the panel
  → still open, owned by the agent-creation teammate. Placeholder defaults are `maxDepth: 2, maxPerRun: 4` in `web/src/lib/agents/factory.ts`.
- [ ] Which sponsor tracks we're targeting (drives backend + tooling choices)
- [ ] Backend: Spacetime vs Convex vs something else
- [x] Map library (Leaflet or Mapbox are common choices; Turf.js is handy for geometry ops like "is this point inside the polygon")
  → decided: **MapLibre GL + deck.gl** on OpenFreeMap tiles, with Turf.js for geometry and the cross-reference spatial joins.
- [x] LLM provider for orchestrator and workers
  → decided: **Claude** via the Anthropic SDK for planning, insights and answers. Falls back to heuristics when no API key is set. Built-in workers don't call an LLM.
- [ ] Project name

---

## 9. Hackathon logistics (Cal Hacks 13.0)

- **Venue:** Palace of Fine Arts, 3601 Lyon St, San Francisco
- **Submission:** Devpost (cal-hacks-13-0.devpost.com) by **Sunday 9:00 AM**. Late = not judged. Add all teammates on Devpost. Guide strongly recommends submitting a draft Saturday night and editing until the deadline.
- **Judging:** Sunday 10:30 AM – 12:30 PM. Table numbers assigned shortly after 9 AM; be at the table by 10:30. **The whole team must stay at the table for the full window**, or we won't be judged. Tables are shared by 2–3 teams.
- **Pitch:** prepare a ~2-minute pitch plus a **live demo** (required).
- **Rules:** project must be started during the event; teams of 1–4.
- **Help:** Slack `#1-ask-mentors` or the in-person Mentor Tables; `#0-ask-directors` for event questions.
- **Closing ceremony:** Sunday 2:00–4:00 PM.
