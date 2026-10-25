# Track checklists: how we qualify, what to say, what's missing

> **Source:** [tracks/shortlist.md](../tracks/shortlist.md) requirements, [sources/hive-prizes.md](../sources/hive-prizes.md), codebase as of Sun 2026-10-25.  
> **Summary:** For each track we're considering: evidence we qualify, the one-line pitch for that sponsor's judges, and the gaps to close before Sun 9:00 AM. **Biggest gap: Anthropic (and Microsoft) need a named community, and the team has to pick one.** The final track list is still open in [decisions.md](../project/decisions.md).

## Summary

| Track | Status | Blocking gap |
|---|---|---|
| Spacetime ($2,048 / $1,024 / $512) | **Ready** | Set the SpacetimeDB env vars on Vercel and redeploy; show the share-link moment. |
| Convex | **Not claimed** | We switched to SpacetimeDB (one of Convex/Spacetime per team). Convex code stays as a fallback only. |
| Anthropic | **Blocked on a decision** | Name the community + a firsthand problem |
| Bright Data / Apify | **Built, waiting on keys** | Code is in (4 workers + generated-agent fetch + custom Actor). Needs the API keys set locally and on Vercel, the Actor pushed, and one demo beat that shows their pins live. |
| Best Planet-First Hack | Ready (no stated criteria) | Frame the climate angle in Devpost |
| Most Technically Complex Hack | Ready (no stated criteria) | None |
| Microsoft: Built for the Real World | Medium | Same named community + production/measurement story |

Note: the general prize is called **"Most Technically Complex Hack"** on the prizes page, not "Most Technically Advanced."

---

## Spacetime ($2,048 / $1,024 / $512)

**Requirement (shortlist):** SpacetimeDB as the *core* real-time backend, not a side add-on. They call out AI agent coordination, live dashboards, and "AI systems coordinating in a persistent world state."

**How we qualify**
- [x] SpacetimeDB is the source of truth for missions: `runs`, an append-only `events` log (one row per RunEvent, contiguous `seq` enforced by the `append_events` reducer), and denormalized `findings` (`web/spacetime/src/index.ts`). Published to maincloud as `geoswarm`.
- [x] The orchestrator and ~10 worker agents coordinate through it: every plan, dispatch, status change, finding and insight is a reducer-committed row. Browsers subscribe (`SELECT * FROM events WHERE run_id = …`) so the map, agent panel and status bar are a live dashboard on every screen; `/?run=<id>` streams the mission on any device and finished missions replay.
- [x] Mission history (**Missions ▾**, a subscription on `runs`), Share, and Stop/recall (`request_stop` → `stop_requested`, polled by the orchestrator across serverless instances) all go through SpacetimeDB.
- [x] Claude rate limits are a reducer too (`reserve_llm`: atomic per-IP + global hourly caps in the private `llm_usage` table).
- [x] Auth: only the server's allowlisted identity can call write reducers; browsers are anonymous read-only subscribers.

**What to say:** "SpacetimeDB is our agents' shared world. Ten agents write into one ordered event log through reducers, and every screen watching that mission, including your phone, is subscribed to it, so the map is a live dashboard of the swarm. Share links, history, replay, stop and even our Claude rate limits all live in the same database."

**Still missing**
- [ ] Set `SPACETIME_HOST`, `SPACETIME_DB`, `SPACETIME_TOKEN` on Vercel and redeploy (see [web/README.md](../../web/README.md#deploy-to-vercel)).
- [ ] Put the phone share-link moment in the live pitch (it's in [pitch.md](pitch.md)); say "SpacetimeDB" there instead of Convex.
- [ ] Devpost "How we built it": replace Convex with SpacetimeDB; screenshot of the phone mirroring the laptop and/or the SpacetimeDB dashboard (https://spacetimedb.com/geoswarm).

## Anthropic

**Requirements (shortlist / prizes page):** (1) a **named community** at the level of "transfer students at Berkeley trying to find housing", (2) a real problem you lived or heard firsthand, (3) it works and is usable Monday, (4) thoughtful use of Claude, knowing where it could go wrong.

**How we qualify today**
- [x] (3) Works end to end on live data, with ~124 findings in ~10 s in the Mission.
- [x] (4) Claude does plan / insights / answer with structured outputs (zod). Insight citations are validated against real finding ids. The spatial joins are deterministic, so Claude explains and ranks overlaps instead of inventing them. There's a heuristic fallback when Claude is unavailable. **Where it could go wrong:** over-confident risk language, stale regulatory maps, and spawned agents. Mitigations are confidence on every finding, the conflict-flagging insight, and spawn guardrails.
- [ ] **(1) Named community: NOT chosen.** The generic "anyone with a question about a place" framing fails this criterion.
- [ ] **(2) Firsthand problem: NOT documented.** Someone on the team needs to have talked to a member of the community (even a quick conversation or Slack/phone call tonight counts) and quote them in Devpost.

**Candidate communities. The team must pick one.** Each fits what's built without new code.

| Candidate | Why it fits what's built | Problem in their words (to verify) | Orchestrator / demo |
|---|---|---|---|
| **A. First-time buyers and small-property owners (1–4 units) in the Mission and SoMa** checking a property before they buy or renovate | The demo result is literally about them: permits inside the SFPUC 100-year storm zone and on filled-in former creek/lagoon land, which FEMA's map misses. [Verify: SF ties a flood-risk disclosure to the SFPUC map, so buyers may meet this map for the first time at signing.] | "The FEMA check said I'm not in a flood zone, then the disclosure said I am." / "I didn't know the block was an old creek." | Site Risk Analyst, Ask: "What hazards should a homebuyer know about?" |
| **B. Community land trusts and affordable-housing nonprofits in SF** (e.g. groups like the San Francisco Community Land Trust, Mission-based housing orgs) vetting buildings to acquire | They evaluate many small buildings on thin staff and budgets. Flood, fill and liquefaction exposure plus nearby permit activity is exactly their due-diligence screen, and every claim is sourced. | "We can't afford an engineering report on every building we look at." | Site Risk Analyst, Insights on a candidate parcel |
| **C. Mission District small-business owners opening or relocating a storefront** (e.g. through a neighborhood merchants' association) | Storefront Scout is built: competition density from OSM, Census income/rent, 311 street conditions, and new housing units in the permit pipeline. The flood overlap is a bonus (ground-floor retail floods first). | "I signed a lease on a block that floods every winter." | Storefront Scout, Ask: "Is this a good spot for a coffee shop?" |

Recommendation: **A or B** matches the strongest demo result (flood × permits) without changing the pitch. C matches the Storefront Scout orchestrator but makes the headline insight secondary. Whichever we pick, write it into: the Devpost tagline + Inspiration, the last line of the pitch, the Site Risk Analyst `persona` copy (optional), and [decisions.md](../project/decisions.md).

**What to say:** "[Community] check a property using FEMA's map, which in San Francisco only covers the shoreline. GeoSwarm shows them the city's storm flood map, the buried creeks and the permit activity on their block, with every claim cited, in ten seconds."

**Still missing:** [ ] pick the community · [ ] one firsthand conversation + a quote · [ ] update Devpost/pitch placeholders · [ ] log the decision with the date.

## Bright Data / Apify

**Requirements:** *Bright Data:* live public web data must be essential to the core. It must handle blocks, slowness and empty results. **Disqualified for mocked/hardcoded demo data, scraping behind logins, or Bright Data only mentioned in the README.** *Apify:* meaningful use; separate **Best Actor** award for an actor built at the event.

**What's built (2026-10-25).** Every worker below runs live on each request. They have no mock or fixture fallback: recorded HTML is used only in unit tests. Without keys each one logs "needs <KEY>" and returns nothing.

| Worker | Sponsor product | Live source | What lands on the map |
|---|---|---|---|
| **Rent Scout** (`brightdata-rent`) | Bright Data **Web Unlocker** | Craigslist apartment search around the area (public page; it blocks datacenter IPs, which is why Unlocker is needed) | Median asking rent overall and by bedroom count, plus up to 25 listing pins with links |
| **Local Pulse** (`brightdata-pulse`) | Bright Data **SERP API** (parsed JSON) | Google results for "<neighborhood>" + topic, plus Reddit/Nextdoor threads | Area-level news and resident-discussion findings with links |
| Generated agents' `scrape` tool | Bright Data **Web Unlocker** (markdown) | Any public URL an agent picks (still checked by `urlGuard`) | Whatever the spawned agent finds. Falls back to a direct fetch if Bright Data errors |
| **Review Radar** (`apify-reviews`) | Apify `compass/crawler-google-places` | Google Maps listings for the question's category, restricted to the drawn polygon | Ratings, review counts, price level, closures; saturation (places/km²), entrenched leaders, ratings gap |
| **Hearing Watch** (`apify-planning-notices`) | **Our Actor** `sf-planning-notices` (built at the event) | sfplanning.org public notices table + DataSF address registry | Upcoming Planning Commission / variance hearings near the area, with notice and plan PDFs |

**How it handles blocks, slowness and empty results (Bright Data's criteria):**
- **Blocks:** Unlocker gets past Craigslist's bot wall.
- **Slowness:** 20 s Apify / 25 s Bright Data budgets, all under the orchestrator's 30 s per-agent limit; Apify calls are capped by `timeout`, `maxItems` and `maxTotalChargeUsd`, with no retries (each retry would be billed); Bright Data gets one retry.
- **Empty results:** an empty Google Maps result becomes a finding ("no direct competition"). Parsers return `[]` on layout changes instead of inventing data.
- **Repeat runs:** results are cached for 6 h, so a repeated demo run doesn't re-bill.

**What to say:** "Storefront owners need to know what's on the block *today*. GeoSwarm's agents pull it live: Apify scrapes Google Maps for every café in the polygon (ratings, review counts, closures), Bright Data's Web Unlocker pulls the current rent listings Craigslist blocks bots from, and the SERP API finds what residents are saying on Reddit. Take Bright Data out and Rent Scout and Local Pulse go blank. For Best Actor, we built `sf-planning-notices`: SF Planning publishes upcoming hearings as one HTML table with no API and no coordinates. Our Actor turns it into geocoded JSON you can filter by radius, and our Hearing Watch agent pins the hearings on the map."

**Demo beat:** Storefront Scout, Mission District, "Is this a good spot for a café?" Show Review Radar's mint pins and its saturation line, Rent Scout's median rent, a Local Pulse Reddit thread, and a Hearing Watch pin with its PDF.

**Still missing**
- [ ] Keys in `web/.env.local` and on Vercel: `BRIGHTDATA_API_TOKEN`, `BRIGHTDATA_UNLOCKER_ZONE`, `BRIGHTDATA_SERP_ZONE`, `APIFY_TOKEN`, `APIFY_PLANNING_ACTOR` (see [web/README.md](../../web/README.md#sponsor-data-workers-bright-data--apify)).
- [ ] `npm run apify:login && npm run apify:push` (from `web/`). Then make the Actor public in Apify Console with its README, which Best Actor judges will look at.
- [x] ~~The planner must skip workers whose keys are missing~~: done (`hasKeys` filter in `run.ts`, also applied to hand-added agents).
- [ ] One live rehearsal with keys: check the Craigslist parse (`rent.ts`) and that the Google Maps Actor finishes within the 20 s budget. If it returns few places, raising `TIMEOUT_S` above 20 also means raising `WORKER_TIMEOUT_MS` in `run.ts`.
- [ ] Devpost: list both tracks only once the demo shows their pins live.

## Best Planet-First Hack (Cal Hacks general prize)

**Requirement:** none published beyond the title (prize: America the Beautiful Parks Pass).

**How we qualify**
- [x] Climate adaptation: we surface stormwater flood risk, buried creeks and fill, low-lying ground exposed to sea-level rise ("projects on low-lying ground outside mapped flood zones" insight), and FEMA-vs-ground-truth conflicts.
- [x] Disaster Response orchestrator: live NWS alerts, air quality, and critical facilities inside hazard zones.

**What to say:** "Climate risk shows up block by block, and federal maps lag behind it. GeoSwarm helps people avoid building, buying or investing where the water is going to go."

**Still missing:** [ ] one sentence in Devpost "Inspiration" or "What's next" that frames this as climate adaptation · [ ] optionally demo the low-elevation insight in a bayside area (Mission Bay / Embarcadero) for a sea-level-rise example.

## Most Technically Complex Hack (Cal Hacks general prize)

**Requirement:** none published beyond the title.

**How we qualify**
- [x] Multi-agent orchestrator: LLM planning → parallel dispatch of up to 13 workers → targeted re-dispatch → deterministic spatial joins (Turf) → cited insights → streamed answer. Includes a heuristic fallback path.
- [x] 10+ heterogeneous live sources (ArcGIS feature services, Socrata SoQL `within_polygon`, vector-tile decoding of OSM, RSS, REST), each with its own error handling.
- [x] Real-time shared state in SpacetimeDB (ordered event log, live + replay through the same dispatcher), with Convex and SSE fallbacks.
- [x] deck.gl fleet simulation where vehicles travel to the actual finding coordinates, plus insight arcs between cited findings.
- [x] Agents spawning agents with guardrails: planner gaps and a post-sweep coverage check spawn generated agents that run on a bounded Claude tool-use loop (`lib/agents/factory.ts`, `runtime.ts`), capped by `SPAWN_LIMITS`, with Keep/Discard after the run.

**What to say:** walk through the pipeline in one breath, then point at the re-dispatch and the insight arcs.

**Still missing:** [ ] rehearse one spawn live (Storefront Scout, "good spot for a café?"), since it's the most technically impressive beat · [ ] an architecture diagram image for Devpost (the ASCII diagram in `web/README.md` is the starting point).

## Microsoft: Built for the Real World (+ Customer Impact Award)

**Criteria:** customer understanding, measurable usefulness, path from prototype to production, responsible design, end-to-end functionality.

**How we qualify**
- [x] End-to-end functionality on live data.
- [x] Responsible design: source link + `observed_at` + confidence on every finding, citation validation, conflict flagging instead of silently picking a source, spawn guardrails (fixed primitives, depth/per-run caps, temporary by default), graceful degradation.
- [x] Path to production: deployed at https://geoswarm.vercel.app (Vercel + SpacetimeDB Maincloud, Convex as fallback), persistent mission history, per-agent timeouts and failure isolation, Claude rate limits with heuristic fallback.
- [ ] **Customer understanding:** same blocker as Anthropic (the named community).
- [ ] **Measurable usefulness:** no metric stated yet.

**What to say:** "For [community], the check that used to mean opening five city portals and a FEMA viewer now takes about ten seconds, and every claim links to the official record."

**Still missing:** [ ] the named community (shared with Anthropic) · [ ] one measurable claim, e.g. time to assemble the same findings by hand vs. ~10 s, or the number of sources checked (10) vs. the one a typical buyer checks (FEMA). Time yourselves doing it manually once. · [ ] a 2–3 line "path to production" paragraph in Devpost (more cities via Socrata/ArcGIS, scheduled watch mode, exportable parcel reports).
