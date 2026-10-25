# Devpost draft: Coordinate

> **Source:** codebase (`web/`), project docs, live runs on https://coordinate-agents.vercel.app, Sun 2026-10-25.  
> **Summary:** Paste-ready text, one block per Devpost field, in the form's order. Numbers come from real runs on the Mission District. Fill every `[BRACKETED]` placeholder before submitting (deadline Sun 9:00 AM PDT, aim for 8:45).

**Placeholders to fill:** [TEAM NAMES] · [DEMO VIDEO LINK] · [SCREENSHOTS] · [NAMED COMMUNITY, see tracks.md] · [TEAM: firsthand line in Inspiration]

---

## Project name

Coordinate

## Elevator pitch (Devpost "tagline", ≤200 chars)

Ask a question about any San Francisco block. A swarm of AI agents pulls live public data, cross-references it, and shows you what no single dataset can.

## Inspiration

Questions about a place, like "is it risky to build here?" or "is this a good block for a coffee shop?", have answers spread across dozens of public datasets that nobody reads together. FEMA's flood map covers San Francisco's shoreline but not the inland neighborhoods that flood in heavy storms; the city's own storm flood map does, but it lives in a separate viewer. Permits are on DataSF, liquefaction zones are on a state map, rents are on Craigslist, and what residents say is on Reddit. The useful finding is usually where two of these overlap, like a newly permitted building on liquefiable fill, and no single source will tell you that.

[TEAM: one or two sentences on who you talked to or what you lived through. See tracks.md for candidate communities.]

## What it does

1. **Ask about a place.** Draw a box, polygon or pin on a 3D map (or pick a demo area) and type a question. Coordinate routes it to the right specialist automatically: Site Risk Analyst, Storefront Scout or Disaster Response. Or run **Insights** with no question at all.
2. **Watch the agents work.** The orchestrator picks the agents that question needs from a library of **36**, and they appear as drones, cars, rovers and satellites that fly to each finding before its pin drops. Every pin links to its source record.
3. **The orchestrator reasons across agents.** It plans, dispatches agents in parallel, **re-dispatches** the terrain drone to measure elevation at the specific permitted parcels that look risky, **cross-references** findings spatially, **flags conflicts** between sources, and writes insights that **cite the finding ids** they rest on, then streams an answer.
4. **Missing an agent? It makes one.** Describe a data source and Claude drafts a new agent you can edit and save. In Ask mode the orchestrator does this itself when it finds a gap: asked whether a block is good for a café "factoring in health inspections", it spawned an *Inspection Scout* that pinned real restaurant inspection scores mid-run. You keep it or discard it afterwards.
5. **Share it live.** Every mission lives in SpacetimeDB. A share link streams the same mission live on a judge's phone and replays finished ones.

**Real results (Mission District):**
- Site Risk: "21 permitted projects in a state liquefaction zone", "6 permitted projects inside the SFPUC 100-year storm flood zone (≈$3.1M of work)", "FEMA rates the area minimal hazard while the city's storm model floods ~0.5 km²" (conflict).
- Storefront: "Growing storefront corridor with strong transit (+56 businesses in 12 months)", "3 new storefronts within a block of a crime hotspot", on Valencia St, 30 Google Maps restaurants via Apify (avg 4.5★) and a median asking rent of $4,548/mo across 78 live listings via Bright Data.
- A full Insights mission: 120–240 findings from ~10 agents in about 15 seconds.

### Agents (36, all live public data)

- **Hazards:** FEMA flood zones, SFPUC storm flood map + buried creeks/filled lagoons, CGS liquefaction/landslide/tsunami zones, sea-level rise + live NOAA tides, CAL FIRE hazard zones, USGS earthquakes, ground elevation, NWS alerts + air quality, OpenFEMA disaster history, CalEnviroScreen.
- **City (DataSF):** building permits, 311 reports, crime incidents, evictions, business openings/closures, injury crashes + High Injury Network, zoning and height limits, assessed values and sales, fire/EMS calls, active street work, Muni/BART access, street trees.
- **Context:** OpenStreetMap places, Census, Wikipedia landmarks, Inside Airbnb, CA public schools, weather and heat history, local news.
- **Space:** Sentinel-2 and Landsat scenes over the area (with thumbnails), predicted satellite imaging passes and ISS sightings (CelesTrak + SGP4), NASA EONET natural events.
- **Bright Data:** Rent Scout (live Craigslist listings via Web Unlocker), Local Pulse (Google + Reddit/Nextdoor via SERP API), and the web-fetch backbone for agents that Claude creates.
- **Apify:** Review Radar (Google Maps places via `compass/crawler-google-places`) and Hearing Watch, powered by **our own Actor built at the event**: [`rocketlaunchers/sf-planning-notices`](https://apify.com/rocketlaunchers/sf-planning-notices), which scrapes SF Planning's public hearing notices and geocodes them.

## How we built it

- **Frontend:** Next.js 15, React 19, Tailwind 4. MapLibre GL on OpenFreeMap tiles with a globe intro; deck.gl draws the agent fleet, trails, beams and insight arcs; Turf.js for geometry. VS Code–style resizable panels, a phone layout with a bottom sheet, and a guided tour.
- **Orchestrator:** plan → dispatch → re-dispatch → cross-reference → insights → answer, streamed as typed events. Each agent has its own timeout and error state, so one slow source never stalls the mission.
- **Claude (Anthropic SDK):** one planning call picks the specialist *and* the agents (structured output); insights and the answer run in parallel and stream. Citations to finding ids that don't exist are dropped. Without a key, or over the rate limit, deterministic fallbacks take over (keyword router and planner, rule-based insights).
- **Deterministic cross-referencing first:** point-in-polygon and distance joins between *different* agents (permits × liquefaction / flood / sea-level rise, schools × hazard zones, storefronts × crime hotspots, evictions × short-term rentals, transit × business growth, …). Claude ranks, explains and cites these grounded candidates instead of inventing connections.
- **One finding schema** (`claim, geometry, source_url, source_type, observed_at, confidence, worker_id`) for all 36 agents, so the map and the orchestrator handle any agent the same way, including ones Claude creates.
- **SpacetimeDB** is the agents' shared world: a TypeScript module holds runs, an append-only event log whose reducer enforces strict ordering, findings, and rate-limit counters. Only the server's identity can write; every browser subscribes, which gives share links, live viewing on a second device, history, replay and cross-instance stop for free.
- **Agents creating agents:** configs, not code. Claude drafts a config; a bounded tool-use runtime (6 turns, 45 s, 15 findings, private-IP-blocked fetch through Bright Data, schema-checked findings) runs it. Capped at depth 2 and 4 spawns per run.
- **Hosting:** Vercel + SpacetimeDB Maincloud. Claude runs are rate-limited per IP and globally via SpacetimeDB.

## Challenges we ran into

- **FEMA doesn't map inland San Francisco.** Our first flood agent found nothing in the Mission. Adding the city's storm flood map and the state's liquefaction zones is what made the real risks show up.
- **Making the orchestrator more than a summarizer.** Handing an LLM 150 findings produced plausible but ungrounded insights. Running spatial joins first, then having Claude rank and cite them, made every insight traceable to pins.
- **Thirty-six different APIs.** ArcGIS, Socrata, RSS, vector tiles, STAC, TLEs, scrapers: each fails differently. Per-agent timeouts, retries, a disk cache with stale fallback, and honest coverage checks (SF-only agents skip themselves elsewhere) keep a mission alive when a source is down.
- **Live data that's actually live.** Craigslist has bait-priced scam listings (we filter anything under 40% of the local median); Google SERP with a date filter took 35 s (we dropped it to stay inside the agent budget); Apify enforces a $0.50 minimum run cap.
- **Animation that carries information.** Vehicles fly to the actual finding before the pin drops, so you can see which agent found what.

## Accomplishments that we're proud of

- 36 agents on live public data, no mocked data anywhere in the demo path.
- Cross-source findings no single map shows, e.g. 21 permitted projects on liquefiable ground in the Mission, and FEMA's "minimal hazard" contradicted by the city's own storm model.
- Ask a plain question and it routes itself to the right specialist and agents.
- The orchestrator creates a new agent mid-mission when nothing in its library fits.
- A public Apify Actor built at the event, and Bright Data powering both our agents and Claude-created ones.
- Share a link and watch the same mission live on a phone.

## What we learned

- The value is in the overlap between datasets; joins across sources are where findings come from.
- Deterministic geometry for "what overlaps" plus an LLM for "what it means, and for whom" beats asking the LLM to do both.
- Regulatory maps lag reality, and showing that disagreement is useful in itself.
- A reactive database as the event log made sharing, history and replay nearly free.

## What's next for Coordinate

- **Beyond San Francisco:** about half the agents are already national or global; Socrata and ArcGIS cover most large US cities' permits and 311.
- **Parcel reports** a buyer, lender or community group can export, every claim linked to its source.
- **Watch mode:** re-run a saved area on a schedule and alert on new permits, hearings, flood reports or hazards.
- **A shared agent library** where agents users create are reusable by everyone.
- [TEAM: one line on the named community and the next step with them]

## Built with (Devpost tags)

```
next.js, react, typescript, tailwindcss, maplibre, deck.gl, turf.js, zustand, spacetimedb, claude, anthropic, zod,
bright-data, apify, vercel, openstreetmap, openfreemap, datasf, socrata, arcgis, fema, usgs, noaa, nasa, sentinel-2,
landsat, celestrak, satellite.js, open-meteo, census, wikipedia, vitest
```

## "Try it out" links

- Live app: https://coordinate-agents.vercel.app
- Repo: https://github.com/NoahWolk1/CalHacks13
- Apify Actor: https://apify.com/rocketlaunchers/sf-planning-notices
- Demo video: [DEMO VIDEO LINK]

## Team

[TEAM NAMES]
