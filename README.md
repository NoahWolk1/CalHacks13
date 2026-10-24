c# Geo Research Agents (working title)

> **Status:** Planning / early build. Written Saturday, Oct 24, 2026 as a handoff so a teammate can pick this up with full context.
> **Deadline:** Devpost submission **Sunday 9:00 AM**. Nothing after that counts.

---

## 1. The idea in one paragraph

A tool where you **select an area on a map** (draw a polygon or drop a pin), **ask a question about that area**, and a team of AI agents goes out and researches it. Results stream back onto the map as pins/regions with sources attached, and an orchestrator agent synthesizes them into an answer. There's also an **agent workshop/marketplace** where users can create, edit, and reuse agents.

---

## 2. Architecture (decided)

Two tiers of agents:

### Orchestrator agents: one per user type
- Each orchestrator is built for a specific kind of user (e.g. small business owner scouting a storefront, insurance adjuster assessing a disaster zone).
- The orchestrator holds the **domain knowledge**: what this user cares about, which data matters, how to weigh it.
- It receives the user's area + question, dispatches worker agents, and combines their output into a final answer.

### Worker agents: simple, reusable data gatherers
- Narrow, less complex agents that each pull one kind of data: e.g. permits, news, listings, demographics/census, reviews.
- Workers are **generic and shared across orchestrators**. The storefront orchestrator and the disaster orchestrator might both use the same permits worker.

### How the marketplace fits
- **Workers are the building blocks** people publish, edit, and remix.
- **Orchestrators are the "products"** that combine workers for a specific user.

---

## 3. Design principles we agreed on

### 3a. The orchestrator must do more than summarize
If it just concatenates worker outputs into a paragraph, judges will see a prompt chain. It should do three things a summarizer can't:

| Responsibility | What it means |
|---|---|
| **Plan** | Decide *which* workers to call based on the question and area, rather than calling all of them every time. |
| **Reconcile** | When two workers disagree about the same place, flag the conflict and explain which source it trusts and why. **This is the demo moment** (see §5). |
| **Re-dispatch** | Spot gaps ("no foot-traffic data for the east half of the polygon") and send a worker back out with a narrower task. |

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

### 3c. Keep the marketplace thin
We have very little time. An agent is just a **saved config**:
- name
- prompt
- allowed tools / data sources
- output schema (the finding schema above for workers)

"Editing an agent" = a form. "Running an agent" = the same orchestrator/worker runtime with different settings. That's enough to show the concept without building a real marketplace.

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

1. User draws a polygon and asks a question.
2. Several workers fan out; pins appear on the map in real time, each with a source.
3. **One agent flags that two sources disagree**, e.g. a listing says a lot is vacant, but permit records show construction approved last month.
4. The orchestrator explains which source it trusts and why, and (ideally) re-dispatches a worker to settle it.

The conflict-catch is the moment that shows the system is doing real reasoning, not just summarizing.

---

## 6. Build order

| # | Step | Notes |
|---|---|---|
| 1 | Map with polygon/pin selection + finding schema rendering as pins | Foundation for everything else |
| 2 | 2–3 workers returning **real** data in the finding schema | Pick sources that are reachable today |
| 3 | Orchestrator loop: plan → dispatch → synthesize, findings **streaming** onto the map | **Put a draft on Devpost once this works** |
| 4 | Conflict detection + re-dispatch | This is the demo moment |
| 5 | Thin "workshop" UI: create/edit a worker config | Bonus |
| 6 | Second orchestrator reusing the same workers | Bonus |

**Steps 1–4 are the demo. Steps 5–6 are bonus.**

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

- [ ] **Which orchestrator / user type first** (blocks most other decisions)
- [ ] Which 2–3 workers, and their real data sources
- [ ] Which sponsor tracks we're targeting (drives backend + tooling choices)
- [ ] Backend: Spacetime vs Convex vs something else
- [ ] Map library (Leaflet or Mapbox are common choices; Turf.js is handy for geometry ops like "is this point inside the polygon")
- [ ] LLM provider for orchestrator and workers
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
