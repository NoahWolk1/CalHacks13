# Track checklists: how we qualify, what to say, what's missing

> **Source:** [tracks/shortlist.md](../tracks/shortlist.md) requirements, [sources/hive-prizes.md](../sources/hive-prizes.md), codebase as of Sun 2026-10-25.  
> **Summary:** For each track we're considering: evidence we qualify, the one-line pitch for that sponsor's judges, and the gaps to close before Sun 9:00 AM. **Biggest gap: Anthropic (and Microsoft) need a named community, and the team has to pick one.** The final track list is still open in [decisions.md](../project/decisions.md).

## Summary

| Track | Status | Blocking gap |
|---|---|---|
| Spacetime ($2,048 / $1,024 / $512) | **Ready** | Set the SpacetimeDB env vars on Vercel and redeploy; show the share-link moment. |
| Convex | **Not claimed** | We switched to SpacetimeDB (one of Convex/Spacetime per team). Convex code stays as a fallback only. |
| Anthropic | **Blocked on a decision** | Name the community + a firsthand problem |
| Bright Data / Apify | **Not qualified yet** | Neither is integrated. A README mention alone disqualifies for Bright Data. |
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

## Bright Data / Apify (only if we add them)

**Requirements:** *Bright Data:* live public web data must be essential to the core. It must handle blocks, slowness and empty results. **Disqualified for mocked/hardcoded demo data, scraping behind logins, or Bright Data only mentioned in the README.** *Apify:* meaningful use; separate Best Actor award for an actor built at the event.

**How we qualify today**
- [x] The product depends entirely on live public data, with no mocks in the demo path. That's the spirit of Bright Data's criteria.
- [ ] **Neither SDK is used anywhere in the code.** As things stand we do not qualify for either.

**Realistic paths (pick at most one, only if there are spare hours after the demo is solid)**
- [ ] **Apify actor as the "scrape a URL" primitive** for agent creation (the `scrape` tool in `web/src/lib/agents/runtime.ts`, currently Claude's `web_fetch`), e.g. "scrape the listings at <url> and pin each address". Building one custom actor also enters Best Actor.
- [ ] **Bright Data** behind the News Uplink worker or a new listings/news-site scraper (Web Unlocker / SERP API), replacing Google News RSS for richer article data. It must appear in the live demo, not just the README.

**What to say (if added):** "Agents that scrape the web use [Apify actor / Bright Data] so they get through blocks and slow sites. Remove it and the [listings/news] agent goes blank."

**Still missing:** everything above. **Do not list these tracks on Devpost unless the integration runs in the demo.**

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
