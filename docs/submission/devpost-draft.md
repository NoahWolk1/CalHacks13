# Devpost draft: Coordinate

> **Source:** codebase (`web/`), project docs, and finished runs stored in SpacetimeDB maincloud (Mission District, Sun 2026-10-25 early morning).  
> **Summary:** Paste-ready text, one block per Devpost field, in the form's order. Figures come from real Mission District runs. Fill every `[TEAM: ...]` placeholder, paste or drop the two marked optional/pending blocks, then submit (deadline Sun 9:00 AM PDT, aim for 8:45).

**Before you paste, fill these:**
- [ ] `[TEAM: NAMED COMMUNITY]` (Inspiration, What's next). Pick one from [tracks.md](tracks.md#anthropic).
- [ ] `[TEAM: FIRSTHAND LINE]` (Inspiration): who you talked to, plus a short quote.
- [ ] `[TEAM: MANUAL TIMING]` (Accomplishments): how long the same check took by hand.
- [ ] `[OPTIONAL: Bright Data]` blocks: paste them in only if `BRIGHTDATA_*` keys are live and Rent Scout / Local Pulse show pins on the deployed site. Otherwise delete them.
- [ ] `[TEAM: DEMO VIDEO LINK]`, `[TEAM: SCREENSHOTS]`, `[TEAM: TEAM NAMES]`.

---

## Project name

Coordinate

## Elevator pitch (Devpost "tagline", ≤200 chars)

Draw an area on a map and ask about it. AI agents pull live public data, cross-reference it, and show what no single dataset can, with every claim linked to its source.

## Inspiration

Questions about a place, like "is it risky to build here?" or "is this a good block for a café?", have answers spread across dozens of public datasets that nobody reads together. In San Francisco, FEMA's flood map covers the shoreline but not inland neighborhoods like the Mission, which flood in heavy storms. The city's own storm flood map does cover them, but it lives in a separate viewer. Permits are on DataSF, liquefaction zones are on a state map, and buried creeks are on a historical layer. The useful answer is usually where two of these overlap, like a newly permitted building on liquefiable former marsh, and no single source shows that.

Climate risk shows up block by block, and the federal maps lag behind it. We wanted a tool that puts the city, state and federal layers in one place and says where they disagree.

[TEAM: FIRSTHAND LINE. One or two sentences on who in [TEAM: NAMED COMMUNITY] you talked to and what they told you, ideally a short direct quote.]

## What it does

1. **Ask about a place.** Draw a box, polygon or pin on the map (or search for a place) and type a question. Coordinate routes it to a specialist orchestrator: **Site Risk Analyst**, **Storefront Scout**, **Disaster Response**, or the general **Area Researcher** for anything else. Or run **Insights** with no question.
2. **Watch the agents work.** The orchestrator picks agents from a library of **37**, each backed by a live public data source. They appear on the map as drones, cars, rovers, boats and satellites and travel to each finding before its pin drops. Every finding carries its source link, source type, observation date and a confidence score.
3. **The orchestrator reasons across agents.** It plans, dispatches agents in parallel, then **re-dispatches**: it sends the terrain drone back to measure ground elevation at the specific permitted parcels that look risky, and a coverage check can send up to two more agents back out with a narrower task. It **cross-references** findings spatially, **flags conflicts** between sources, and writes insights that **cite the finding ids** they rest on. In Ask mode it then streams a written answer.
4. **Missing an agent? It makes one.** Describe a data source on the Agents page and Claude drafts a new agent you can edit and save. In Ask mode the orchestrator does this itself when nothing in the library fits: asked whether a block is a good spot for a café "factoring in health inspections", it created an *Inspection Scout* that pinned real restaurant inspection records from DataSF mid-run. After the run you keep it or discard it.
5. **Share it live.** Every mission lives in SpacetimeDB. A share link streams the same mission live on another device, and finished missions replay event by event.

**Real results (Mission District):**
- **Site Risk, Insights:** about 170 findings from 12 agents in 15–20 seconds, then a re-dispatch to 11–12 permitted parcels. Insights included "21 permitted projects (277 units) inside the state liquefaction zone", among them a 9-story, 136-unit building at 2970 16th St, and three projects on 17th St and Shotwell St (about $8.9M of permitted work) that sit in the city's 100-year storm flood zone, a liquefaction zone, and former lagoon fill at once.
- **Storefront, Insights:** about 300 findings from 12 agents. "Storefronts grew net +56 in 12 months next to 16th St BART, yet the 30 mapped restaurants (Google Maps via Apify) average 4.56★ with 21 entrenched leaders": strong foot traffic, saturated niche.
- **Conflicts:** the orchestrator flags bad source data instead of repeating it, e.g. a permit listing $400M of construction for a 4-story auto-repair building.

### Agents (37, all live public data)

- **Hazards:** FEMA flood zones, SFPUC 100-year storm flood map plus buried creeks and filled lagoons, CGS liquefaction/landslide/tsunami zones, Bay Area sea-level rise plus NOAA tide gauges, CAL FIRE fire hazard zones, USGS earthquakes, ground elevation, NWS alerts and air quality, OpenFEMA disaster history, CalEnviroScreen.
- **City (DataSF):** building permits, 311 reports, crime incidents, evictions, business openings/closures, injury crashes plus the High Injury Network, zoning and height limits, assessed values and sales, fire/EMS calls, active street work, Muni/BART access, street trees.
- **Context:** OpenStreetMap places and settlements, Census, Wikipedia landmarks, Inside Airbnb, California public schools, weather and heat history, local news.
- **Space:** Sentinel-2 and Landsat scenes over the area (with thumbnails), predicted satellite imaging passes (CelesTrak TLEs + SGP4), NASA EONET natural events.
- **Apify:** **Review Radar** (Google Maps places in the drawn polygon via `compass/crawler-google-places`) and **Hearing Watch**, powered by **our own Actor built at the event**, [`rocketlaunchers/sf-planning-notices`](https://apify.com/rocketlaunchers/sf-planning-notices). SF Planning publishes upcoming hearings as one HTML table with no API and no coordinates. The Actor turns it into geocoded JSON you can filter by radius, and Hearing Watch pins the hearings with their notice and plan PDFs.

> **[OPTIONAL: Bright Data] Paste only if keys are live and pins show on the deployed site.** Add this bullet to the agent list above:
>
> - **Bright Data:** **Rent Scout** (live Craigslist apartment listings via Web Unlocker, since Craigslist blocks datacenter IPs) and **Local Pulse** (Google news plus Reddit/Nextdoor threads via the SERP API). When Bright Data is configured, agents that Claude creates also fetch pages through Web Unlocker.

## How we built it

- **Frontend:** Next.js 15, React 19, Tailwind 4. MapLibre GL on OpenFreeMap tiles with a globe intro; deck.gl draws the agent fleet, trails and insight arcs; Turf.js for geometry; zustand for state. Resizable panels, a phone layout with a bottom sheet, and a guided tour.
- **Orchestrator:** route → plan → dispatch → re-dispatch → cross-reference → insights → answer, streamed as typed events. Each agent has its own timeout (30 s for built-ins) and error state, so one slow source never stalls the mission. Agents with SF-only coverage are dropped outside San Francisco.
- **Claude (Anthropic SDK):** one planning call with structured output (zod) picks the specialist *and* the agents, so routing costs no extra round trip. Insights and the answer run in parallel and stream. Insight citations to finding ids that don't exist in the run are dropped. Without a key or over the rate limit, deterministic fallbacks take over: a keyword router and planner, and rule-based insights.
- **Deterministic cross-referencing first:** point-in-polygon and distance joins between findings from *different* agents (permits × flood / liquefaction / fill / sea-level rise, schools × hazard zones, severe crashes near schools, storefronts × crime hotspots, evictions × short-term rentals, business churn × transit, FEMA vs. 311 flood reports and low ground, and more). Claude ranks, explains and cites these grounded candidates instead of inventing connections.
- **One finding schema** (`claim, geometry, source_url, source_type, observed_at, confidence, worker_id`) for all agents, so the map and the orchestrator handle any agent the same way, including ones Claude creates.
- **SpacetimeDB** is the agents' shared world. A TypeScript module holds runs, an append-only event log whose `append_events` reducer only accepts the next contiguous sequence number, denormalized findings, and Claude rate-limit counters. Only the server's identity can write; every browser subscribes over WebSocket. That gives share links, live viewing on a second device, mission history, replay, and stop across serverless instances from one database.
- **Agents creating agents:** configs, not code. Claude drafts a config (or reuses a library agent if one fits); a bounded tool-use runtime runs it: at most 6 turns, 45 seconds and 15 findings, with web search, web fetch, an HTTP GET that blocks private and loopback addresses, and an OpenStreetMap features tool. Every result has to pass the finding schema. Spawning is capped at depth 2 and 4 per run, and a failed spawned agent can be replaced once.
- **Resilience:** HTTP responses are cached (10 minutes in memory, 6 hours on disk) and the last good copy is served if a live request fails. Public APIs get two retries; paid Apify calls get none, so a retry is never billed twice.
- **Hosting:** Vercel + SpacetimeDB Maincloud. Claude-powered runs are rate-limited per IP and globally through a SpacetimeDB reducer, so the caps hold across serverless instances.

**Validation layer.** Our agents read the open web, so everything they read is treated as untrusted. Scraped pages and tool results are fenced off as data before a generated agent sees them, and its system prompt says never to follow instructions found there. Every finding then passes one deterministic validator before it reaches the map, the spatial joins or Claude. It rejects malformed geometry, findings outside the drawn area, unsafe or missing source links, text that looks like injected instructions, and duplicates. Claude's output is checked too: an insight that doesn't cite a real finding is dropped, and its money, percentage and count claims are compared with the cited data. The tally shows in the orchestrator log, for example "Validated 180 findings · 1 rejected (1 duplicate)". If the validator itself fails, the run continues instead of breaking.

## Challenges we ran into

- **FEMA doesn't map inland San Francisco.** Our first flood agent found nothing in the Mission. Adding the city's storm flood map, buried creeks and the state's liquefaction zones is what made the real risks show up.
- **Making the orchestrator more than a summarizer.** Handing an LLM 150 findings produced plausible but ungrounded insights. Running spatial joins first, then having Claude rank and cite them, made every insight traceable to pins.
- **Thirty-seven different sources.** ArcGIS feature services, Socrata, RSS, vector tiles, STAC, TLEs, scrapers: each fails differently. Per-agent timeouts, retries, a disk cache with stale fallback, and coverage checks (SF-only agents sit out elsewhere) keep a mission alive when a source is down.
- **Paid scrapers inside a 30-second budget.** The Google Maps Actor has to finish in 20 seconds, so we cap results, skip detail pages and never retry. Apify also enforces a $0.50 minimum per-run charge cap, which we found the hard way.
- **Animation that carries information.** Vehicles travel to the actual finding before the pin drops, so you can see which agent found what.

> **[OPTIONAL: Bright Data] Paste only if Bright Data is live.** Add this challenge:
>
> - **Live data that's actually live.** Craigslist has bait-priced scam listings, so Rent Scout drops anything under 40% of the local median. A date-filtered Google SERP query took about 35 seconds, so we dropped the filter to stay inside the agent budget.

## Accomplishments that we're proud of

- 37 agents on live public data, with no mocked data anywhere in the demo path.
- Cross-source findings no single map shows, e.g. 21 permitted projects on liquefiable ground in the Mission, and projects that sit in a storm flood zone, a liquefaction zone and former lagoon fill at once.
- Ask a plain question and it routes itself to the right specialist and agents.
- The orchestrator creates a new agent mid-mission when nothing in its library fits.
- A public Apify Actor built at the event, `sf-planning-notices`, turning SF Planning's hearing notices into geocoded data.
- One mission checks 12 sources in about 15 seconds. Doing the same check by hand took us [TEAM: MANUAL TIMING].
- Share a link and watch the same mission live on a phone.

## What we learned

- The value is in the overlap between datasets; joins across sources are where findings come from.
- Deterministic geometry for "what overlaps" plus an LLM for "what it means, and for whom" works better than asking the LLM to do both.
- Regulatory maps lag reality, and showing that disagreement is useful in itself.
- A reactive database as the event log made sharing, history and replay nearly free.

## What's next for Coordinate

- **Beyond San Francisco:** about half the agents already work across the US or globally, and many large US cities publish permits and 311 on Socrata or ArcGIS, the platforms we already query.
- **Parcel reports** a buyer, lender or community group can export, every claim linked to its source.
- **Watch mode:** re-run a saved area on a schedule and alert on new permits, hearings, flood reports or hazards.
- **A shared agent library** where agents users create are reusable by everyone.
- [TEAM: one line on [TEAM: NAMED COMMUNITY] and the next step with them, e.g. who you'll put it in front of this week.]

## Built with (Devpost tags)

```
next.js, react, typescript, tailwindcss, maplibre, deck.gl, turf.js, zustand, spacetimedb, claude, anthropic, zod,
apify, vercel, openstreetmap, openfreemap, datasf, socrata, arcgis, fema, usgs, noaa, nasa, sentinel-2,
landsat, celestrak, satellite.js, open-meteo, census, wikipedia, vitest
```

[OPTIONAL: Bright Data] add `bright-data` to the tags only if the Bright Data blocks above are pasted.

## "Try it out" links

- Live app: https://coordinate-agents.vercel.app
- Repo: https://github.com/NoahWolk1/CalHacks13
- Apify Actor: https://apify.com/rocketlaunchers/sf-planning-notices
- Demo video: [TEAM: DEMO VIDEO LINK]

## Image gallery

[TEAM: SCREENSHOTS] Suggested: (1) the Mission with the fleet mid-run and insight arcs, (2) an insight card with its cited findings highlighted, (3) the phone mirroring the laptop through a share link, (4) the "created by" agent after a spawn.

## Team

[TEAM: TEAM NAMES]
