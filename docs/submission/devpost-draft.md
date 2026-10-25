# Devpost draft: GeoSwarm (working title)

> **Source:** codebase (`web/`), project docs, team test runs, Sat 2026-10-24; agent creation and worker list updated Sun 2026-10-25.  
> **Summary:** Paste-ready text for each Devpost section. Numbers come from a real Mission District test run. Fill every `[BRACKETED]` placeholder before submitting (deadline Sun 9:00 AM PDT, aim for 8:45). Project name is still open in [decisions.md](../project/decisions.md); find/replace "GeoSwarm" if it changes.

**Placeholders to fill:** [TEAM NAMES] · [DEMO VIDEO LINK] · [REPO LINK] · [SCREENSHOTS] · [TAGLINE, if renamed] · [NAMED COMMUNITY, see tracks.md]

---

## Tagline (one line)

Draw a box on a map of San Francisco and a team of AI agents pulls live public data on that block, cross-references it, and tells you what no single dataset shows.

## Inspiration

Questions about a place, like "is it risky to build here?" or "is this a good block for a coffee shop?", have answers spread across a dozen public datasets that nobody reads together. FEMA's flood map covers San Francisco's shoreline but not the inland neighborhoods that flood in heavy storms. The city's own 100-year storm flood map does cover them, but it sits in a separate ArcGIS viewer. Building permits are on DataSF. 311 sewer-backup reports are in yet another place. The useful finding is usually where two of these overlap, for example a newly permitted building sitting on a buried creek, and no single source will tell you that.

[TEAM: one or two sentences on who you talked to or what you lived through. Anthropic judges want a firsthand problem. See tracks.md for candidate communities.]

## What it does

1. **Pick an area.** Draw a box or polygon, or drop a pin, on a 3D dark map of San Francisco.
2. **Pick an orchestrator.** Site Risk Analyst ("is it safe and smart to build here?"), Storefront Scout ("where should I open my shop?"), or Disaster Response ("what's happening on the ground right now?"). Each one encodes a different user's priorities and uses the same pool of worker agents.
3. **Pick a mode.** **Ask** a question, and the orchestrator sends only the agents that question needs. Or run **Insights**, where a broader survey looks for findings that combine into something notable.
4. **Watch the agents work.** Up to 13 built-in worker agents appear as drones, cars, rovers and satellites. Each one flies to its finding before the pin drops, so you can see which agent found what. Every pin links to its source record.
5. **The orchestrator reasons across agents.** It:
   - **plans** which workers to send,
   - **dispatches** them in parallel,
   - **re-dispatches** the terrain drone to measure ground elevation at the specific permitted parcels that look risky,
   - **cross-references** findings spatially (permits × flood zones × filled-in former water × 311 flooding reports × low elevation),
   - **flags conflicts**, such as FEMA showing minimal hazard where residents keep reporting flooding,
   - writes **insights that cite the finding ids they rest on**, then answers the question.
6. **Missing an agent? It makes one.** Describe a data source in the Agent Hub and Claude drafts a new worker you can edit and save. In Ask mode the orchestrator does this itself when its planner finds a gap: the new agent runs immediately, is marked "created by" its parent, and after the run you keep it or discard it.
7. **Share it live.** Every mission is stored in Convex. A `/?run=<id>` link streams the same mission live on any device and replays finished ones.

**Real result (Mission District, Site Risk Analyst, Insights):** about 124 findings in about 10 seconds, including:
- "6 permitted projects inside a mapped flood zone (SFPUC 100-year storm), ≈$3.1M of permitted work"
- "6 projects built on filled-in former water" (historical lagoon/creek fill, which brings settlement and liquefaction risk)

### Live data sources (all public, fetched at query time)

| Agent | Source |
|---|---|
| Flood Recon | FEMA National Flood Hazard Layer |
| Storm Scout | SFPUC 100-Year Storm Flood Risk Map + historical creeks and water bodies |
| Permit Patrol | SF Dept. of Building Inspection permits (DataSF), last 2 years |
| Street Pulse | SF 311 cases (DataSF), last 90 days |
| Terrain Scanner | Open-Meteo Elevation API (Copernicus DEM) |
| Sky Sentinel | NWS active alerts + Open-Meteo air quality |
| Quake Watch | USGS Earthquake Catalog |
| Street Scout | OpenStreetMap via OpenFreeMap vector tiles |
| News Uplink | Google News RSS |
| Census Rover | US Census Geocoder + ACS 5-year |
| Sentinel Eye | ESA Copernicus Sentinel-2 L2A (Element84 Earth Search) + USGS Landsat Collection 2 |
| Orbit Planner | CelesTrak element sets, propagated with SGP4 (satellite.js) |
| Earth Events | NASA EONET v3 |

## How we built it

- **Frontend:** Next.js 15 (App Router, React 19), Tailwind 4. MapLibre GL on OpenFreeMap vector tiles. deck.gl draws the animated agent fleet, trails, scan beams and insight arcs. Turf.js handles region geometry. Zustand holds client state.
- **Orchestrator** (`web/src/lib/orchestrator/run.ts`): plan → dispatch → re-dispatch → cross-reference → insights → answer. It reverse-geocodes the region, drops SF-only workers when the region is outside SF, and streams typed `RunEvent`s (`plan`, `agent_status`, `finding`, `insight`, `answer_delta`, …).
- **Claude (Anthropic SDK)** handles the three reasoning steps: the plan (which agents, why, and with what focus), the insights, and the streamed answer. Plan and insights use structured outputs validated with zod. Any insight citation that doesn't match a real finding id is dropped. If there's no API key, or a call fails, a deterministic fallback takes over (keyword planner, rule-based insights, templated answer), so the demo never depends on one API call.
- **Spatial cross-referencing** (`crossref.ts`) is deterministic: Turf point-in-polygon and distance joins produce candidate connections (permits in flood zones, permits on fill, 311 reports corroborating hazard maps, FEMA vs. ground-truth conflicts, civic facilities in flood zones, incoming housing units). Claude gets these joins as grounded candidates rather than inventing the connections itself.
- **Shared finding schema:** every worker emits `{claim, geometry (GeoJSON), source_url, source_type, observed_at, confidence, worker_id}`, so the map renders any agent's output and the orchestrator reasons over all of it the same way.
- **Convex** is the live shared mission state. The server writes each run, its append-only ordered event log (batched every ~100 ms), and denormalized findings indexed by run, worker and category. Browsers subscribe reactively, which powers share links, mission history and replay. Without Convex the app falls back to server-sent events.
- **Agents creating agents:** generated agents are configs, not code. One structured-output Claude call either reuses a library agent or drafts a new config (name, brief, tools, data sources, coverage). A shared runtime runs it as a bounded Claude tool-use loop (6 turns, 45 s, 15 findings) with only its allowed tools: web search, web fetch, an `http_get` that blocks private and loopback hosts, and an `emit_findings` tool that enforces the finding schema. Addresses are geocoded and findings far outside the region are dropped. The orchestrator spawns agents for planner gaps and once after the first sweep if a coverage check finds one, capped at depth 2 and 4 per run. Spawned agents are temporary until the user keeps them.
- **Hosting:** Vercel plus Convex cloud. Claude runs are rate-limited per IP and globally, and over the cap a run falls back to heuristic mode.

## Challenges we ran into

- **FEMA doesn't map inland San Francisco.** Our first flood agent found nothing in the Mission because FEMA's flood map only covers SF's shoreline. Adding the SFPUC 100-year storm map (and its historical creeks and water bodies layers) is what made "permits inside a flood zone" show up where flooding actually happens.
- **Making the orchestrator more than a summarizer.** Handing an LLM 120+ findings and asking for insights produced plausible text with weak grounding. Running the spatial joins deterministically first, then having Claude rank, explain and cite them, gave insights you can trace back to specific pins.
- **Heterogeneous public APIs.** These include ArcGIS feature services, Socrata (SoQL `within_polygon`), RSS, vector tiles, and REST APIs with different timeouts and failure modes. Each worker handles its own errors, so one slow or failing source marks that agent as errored and the rest of the mission continues.
- **Live sharing without a second code path.** Streaming over SSE to one browser was easy. Making the same mission stream to a judge's phone meant moving the event log into Convex with strictly ordered sequence numbers, and replaying both live and finished runs through the same dispatcher.
- **Animation that carries information.** The vehicles had to arrive at the actual finding location before the pin drops, so the animation shows which agent found what.

## Accomplishments that we're proud of

- 13 built-in agents on 15+ live public sources, with no mocked or hardcoded data in the demo path.
- A real cross-source finding in the Mission: 6 permitted projects (≈$3.1M of work) inside the SFPUC 100-year storm flood zone, and 6 projects on filled-in former water. FEMA's map alone doesn't show either.
- About 124 findings in about 10 seconds, all streamed onto the map with sources.
- The orchestrator re-dispatches an agent to specific parcels, which is a follow-up step rather than a single fan-out.
- Every insight cites finding ids, and citations to findings that don't exist are filtered out.
- Live shared missions: open the share link on a phone and watch the same mission run.
- The whole app still runs end to end with no LLM key, using the heuristic fallback.

## What we learned

- The value is in the overlap between datasets. A single source rarely tells you much on its own, and joins across sources are where the findings come from.
- Using deterministic geometry for the "what overlaps" step and the LLM for "what does it mean, and for whom" produced better and more checkable results than asking the LLM for both.
- Regulatory maps lag. FEMA's maps are built for insurance, not for describing where stormwater actually floods. Showing that disagreement is useful in itself.
- A reactive database as the event log made sharing, history and replay mostly a side effect rather than separate features.

## What's next for GeoSwarm

- **A shared agent library:** move saved agents into Convex so the agents users and orchestrators create are shared across everyone, with usage counts.
- **Beyond San Francisco:** about half the workers are already national or global (FEMA, USGS, NWS, Census, OSM, elevation, news). Adding a city means adding its permits, 311 and local flood-map agents. Socrata and ArcGIS cover a lot of US cities.
- **Parcel reports** a user can export or hand to a buyer, lender or community group, with every claim linked to its source.
- **Watch mode:** re-run a saved area on a schedule and alert when a new permit, flood report or hazard alert appears.
- [TEAM: one line on the named community and the next step with them]

## Built with

```
next.js, react, typescript, tailwindcss, maplibre-gl, deck.gl, turf.js, zustand, convex,
anthropic-claude, anthropic-sdk, zod, openfreemap, openstreetmap,
fema-nfhl, sfpuc-flood-map, datasf (dbi-permits, sf-311), open-meteo, nws-api, usgs-earthquake-api,
us-census-api, google-news-rss, nominatim, arcgis-rest, socrata,
sentinel-2, landsat, celestrak, satellite.js, nasa-eonet, vercel
```

[ADD: bright-data / apify only if a worker actually uses them by submission time]

## Links

- Live demo: https://geoswarm.vercel.app
- Demo video: [DEMO VIDEO LINK]
- Repo: [REPO LINK]
- Team: [TEAM NAMES]
