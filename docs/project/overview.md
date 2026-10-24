# Project overview: Geo Research Agents (working title)

> **Source:** team README / planning conversations, Sat 2026-10-24.  
> **Summary:** What we're building, the user flow, candidate users, the demo moment, and build order. Architecture details are in [architecture.md](architecture.md); open questions in [decisions.md](decisions.md).

## The idea in one paragraph

A tool where you **drag/select a region on a map** (draw a box/polygon or drop a pin), **ask a question about that area**, and the **relevant agents spin up and work together** to answer it. Results stream back onto the map as pins/regions with sources attached, and an orchestrator agent synthesizes them into an answer. Even without a question, the agents can **generate insights** about the area by cross-referencing each other's findings (e.g. one agent finds the area is likely to flood, another finds new buildings planned there, and together they flag that building there may be a bad idea). There's also an **agent hub/library** where users can browse our built-in agents and **prompt the creation of new ones** for niche tasks our defaults don't cover (e.g. "scrape the site at `<url>`", "transcribe these videos").

## User flow

1. **Select a region.** Drag a box, draw a polygon, or drop a pin on the map.
2. **Pick a mode:**
   - **Ask:** type a question ("Is this a good spot for a coffee shop?"). The orchestrator picks only the agents relevant to that question and dispatches them.
   - **Insights:** no question needed. A broad set of agents surveys the area, and the orchestrator looks for findings that *combine* into something notable (risks, opportunities, contradictions).
3. **Watch agents work.** Each active agent shows up in a side panel with its status; its findings drop onto the map as they arrive.
4. **Get the answer / insights.** The orchestrator returns a written answer or a ranked list of insights, each linked to the pins and sources that support it.
5. **Missing an agent?** Open the **Agent Hub**, describe the agent you need in plain English, and it's generated, saved to your library, and available for the next run. Agents can also **create new agents themselves** mid-run when no existing one fits (see [architecture.md](architecture.md#agents-can-create-agents)).

## Candidate user types / orchestrators (NOT yet decided)

Pick **one** to build first. It determines which workers we need, which data sources are realistic by Sunday morning, and whether the Anthropic/Microsoft tracks are viable (they reward a narrow, named user).

| User | Example question | Likely workers |
|---|---|---|
| **Small business owner** scouting a storefront | "Which of these three blocks is best for a coffee shop?" | foot traffic, competitors, permits, rent/listings signals |
| **Insurance adjuster / relief volunteer** | "What's the damage and status inside this wildfire/flood zone?" | news, official alerts, imagery/reports, infrastructure status |
| **Journalist** investigating a block | "Who owns this land and what's being built here?" | property records, permits, news, corporate filings |

## The demo moment

Design the build backward from this.

1. User drags a box over a neighborhood and hits **Insights** (or asks a question).
2. The relevant workers spin up; pins appear on the map in real time, each with a source.
3. **The hazard worker finds the area is likely to flood. The permits worker finds new buildings approved there.**
4. The orchestrator connects the two: "3 approved developments sit inside a projected flood zone; building here may not be a good idea," and links the insight to both sets of pins. Ideally it re-dispatches the hazard worker to check each parcel individually.
5. **Bonus beat:** user opens the Agent Hub, types "scrape the listings at `<url>`", and the new agent shows up in the next run. Or, even better, the orchestrator hits a gap, **spawns that scraper itself**, and it appears in the agent panel mid-run.

The cross-agent insight shows the system is doing real reasoning, not just summarizing. A conflict-catch (a listing says a lot is vacant, but permits show construction approved last month) is a good second example.

Judges get ~2 minutes at the table and a **live demo is required** ([event/overview.md](../event/overview.md#judging)).

## Build order

| # | Step | Notes |
|---|---|---|
| 1 | Map with drag/polygon/pin selection + finding schema rendering as pins | Foundation for everything else |
| 2 | 2–3 workers returning **real** data in the finding schema | Pick sources reachable today; a hazard/flood worker + a permits worker sets up the demo moment. Real data also matters for Bright Data/Apify rules. |
| 3 | Orchestrator loop (Ask mode): plan → dispatch relevant workers → synthesize, findings **streaming** onto the map | **Put a draft on Devpost once this works** |
| 4 | Insights mode: cross-reference findings across workers + re-dispatch | This is the demo moment |
| 5 | Agent Hub: library view + prompt-to-create a worker (scrape URL, transcribe video), then let agents call that same create path mid-run | Strong bonus; shows extensibility |
| 6 | Conflict detection between sources | Bonus |
| 7 | Second orchestrator reusing the same workers | Bonus |

**Steps 1–4 are the demo. Steps 5–7 are bonus, in that order.**
