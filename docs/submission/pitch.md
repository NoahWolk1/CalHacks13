# Pitch: 2-minute script, demo click path, fallback, judge Q&A

> **Source:** codebase (`web/`), project docs, team test runs, Sat 2026-10-24; agent lineup and numbers updated Sun 2026-10-25 from finished Mission District runs in SpacetimeDB.  
> **Summary:** What to say and click at the judging table (Sun 10:30 AM–12:30 PM, whole team at the table). Rehearse with a timer at least twice.

**Presenter:** [TEAM: name] · **Demo driver:** [TEAM: name] · **Phone holder:** [TEAM: name]

## Before judging (checklist)

- [ ] App open at https://coordinate-agents.vercel.app (live backend: SpacetimeDB maincloud; `/api/agents` shows `live.backend: "spacetime"`). Hard-refresh once. Run `npm run warm` against the deployed site beforehand (see `web/README.md`).
- [ ] `ANTHROPIC_API_KEY` set (the LLM badge shows on). The heuristic fallback still works without it.
- [ ] **Run the demo mission once that morning** in the exact Mission District box. Save its `/?run=<id>` link and open it in a second tab. That's the fallback.
- [ ] A phone open to a past run's share link on the same Wi-Fi (`http://<laptop-ip>:<port>/?run=<id>`), or the deployed app (SpacetimeDB maincloud) if off-LAN.
- [ ] Map pre-zoomed to the Mission, with Site Risk Analyst + Insights already selected. Be on the map page, not `/agents`.
- [ ] Know the numbers. Recent Site Risk Insights runs on the Mission: **~170 findings from 12 agents in 15–20 s, re-dispatch to 11–12 permitted parcels, 21 permitted projects (277 units) in the state liquefaction zone, 3 projects on 17th St / Shotwell St (≈$8.9M) in the storm flood zone + liquefaction zone + former lagoon fill.** Claude's insight wording changes run to run: re-check against the morning run and say whatever it shows.

## The demo spot

**Mission District, Site Risk Analyst, Insights mode.** Use the same box as the tested run, roughly the low-lying blocks of the former Mission Creek / Laguna de los Dolores area (around 17th–20th St, between Mission and Harrison). FEMA shows little or nothing here, while the SFPUC storm map, buried creeks and recent permits all overlap. [TEAM: DEMO CORNERS. Write the exact corner streets you draw from so the demo driver repeats it precisely.]

## Script (≈2:00)

| Time | Say | Do / point at |
|---|---|---|
| **0:00–0:15** | "If you're about to buy, build on, or insure a lot in San Francisco, the answer to 'is this a bad idea?' is spread across a dozen public datasets nobody reads together. FEMA's flood map doesn't even cover the Mission." | Map already on screen, Mission in view. |
| **0:15–0:25** | "Coordinate: you draw an area, ask anything about it, and a team of AI agents goes and gets the live data." | **Draw the box** over the Mission demo spot. |
| **0:25–0:35** | "I'll ask for Insights, so no question needed: that sends the Site Risk Analyst's survey team. With a question, Claude picks the specialist and the agents itself." | Confirm **Find insights** (Research focus stays on **Auto**), hit **Research this area**. Point at the live status line in the panel (the orchestrator's latest step) and the agents fanning out on the map. The full plan is behind **How this was researched** once results are in. |
| **0:35–0:55** | "Twelve agents, each one a live public source: FEMA, the city's storm flood map, the state's liquefaction zones, sea-level rise, elevation, USGS, CAL FIRE, building permits, zoning, property sales, 311 and schools. Each one flies to what it found before the pin drops. Every pin links to its source record." | Point at **drones/cars/rovers fanning out**. Click **one permit pin** to show the DBI source link. |
| **0:55–1:10** | "This is the orchestrator doing more than summarizing. It saw permits that looked risky and sent the terrain drone back to measure the ground at those specific parcels." | Point at the **terrain drone re-dispatch** (thought line: "Re-dispatching Terrain Scanner…"). |
| **1:10–1:35** | "Then it cross-references. Twenty-one permitted projects sit in the state's liquefaction zone, and three on 17th and Shotwell, about $9 million of work, are in the city's 100-year storm flood zone, a liquefaction zone and old lagoon fill all at once. FEMA's map alone shows none of that." (Swap in the morning run's numbers.) | **When the insight arcs appear**, point along an arc from the **permit pin to the flood polygon**. Click the top insight so its **cited findings highlight**. |
| **1:35–1:45** | "Every insight cites the finding ids it's built on. If Claude cites something that doesn't exist, we drop it." | Point at the **finding ids** in the insight card. |
| **1:45–1:55** | "Missions live in SpacetimeDB, so this link streams the same mission live on any device." | Hand the judge the **phone**, or click **Share** and open the link in a new tab. |
| **1:55–2:00** | "Same agents, different orchestrators: ask about a coffee shop and it routes to Storefront Scout; ask what's happening right now and it goes to Disaster Response. And when no agent fits, the orchestrator creates one. Built for [TEAM: NAMED COMMUNITY]." | Point at the **Research focus** select (**Auto**) and the "Routed to …" line. Stop. |

If there's time left (judges asking for more), run an **Ask** question (Auto routes it to Site Risk Analyst): *"Which new developments are most exposed to flooding?"* and show the streamed answer with citations. Or show **agents creating agents**: leave Research focus on **Auto** (the panel shows "Routed to Storefront Scout", tagged auto-picked), draw a box in the Mission (around 24th & Valencia) and ask *"Is this a good spot for a café? Factor in how nearby restaurants score on health inspections."* When results land, click **1 new agent to review** in the panel, point at the new agent marked "created by" (it pulls SF restaurant health-inspection scores from DataSF), then click **Keep in library**. Use that exact wording: the plain café question usually doesn't spawn anything. In a rehearsal on Oct 25 (local, real Claude), the spawn fired 5 of 5 times and the agent pinned 6–8 real inspections 4 of 5 times, about 35 s after spawning. Before the demo, delete any kept "Inspection Scout" on the Agents page (`/agents`); otherwise the planner reuses it and nothing spawns. The DataSF dataset's newest records are from 2019, so say "inspection history" rather than "current scores". Fallback: create the same agent from the Agents page.

**Space beat (optional, ~20 s).** Zoom all the way out: the real night sky sits behind the globe (stars, constellations, planets at their current positions, day/night shading). Then open **Sky** (top bar), pick **TRAPPIST-1**, type *"Could any of these planets be habitable?"* and hit Research. Say: "Same pattern, pointed up: three sky agents query SIMBAD, NASA's Exoplanet Archive and JPL Horizons live, and Claude answers with citations to real catalog records." In testing (Oct 25) it named planets d, e and f as temperate (flux 0.37–1.1× Earth), and said plainly that the catalogs can't confirm atmospheres. Results land in about 1.5 s; the answer takes about 7 s.

**Apify beat (Bright Data / Apify judges):** in a Storefront Scout run on the Mission, point at **Review Radar**'s pins (Google Maps via Apify) and its summary line (in a recent run: "30 restaurants, avg 4.56★, 21 entrenched leaders"). For **Best Actor**, ask *"Are there upcoming planning hearings near here?"*: **Hearing Watch** pins hearings scraped by our own Actor `rocketlaunchers/sf-planning-notices`, each with its notice PDF. Don't mention Bright Data unless its keys are live and Rent Scout / Local Pulse show pins.

## 30-second fallback (Wi-Fi or an API down)

Say: "The venue Wi-Fi is struggling, so here's the mission we ran this morning. It's stored in SpacetimeDB, so it replays exactly what happened, event by event."

1. Open **Missions ▾** at the top of the map (or the saved `/?run=<id>` tab) and pick the morning Mission District run. The finished mission **replays with staggered events**, so the fleet still flies, pins drop and arcs draw.
2. Give the same beats: re-dispatch, "21 permitted projects in the liquefaction zone", the 17th St / Shotwell triple-hazard projects, cited finding ids.
3. If only Claude is down: run live anyway. The heuristic fallback plans, cross-references and answers without the LLM. Say: "Claude is unreachable, so it fell back to deterministic rules. The spatial joins are the same."
4. If one data source times out, that agent shows an error and the rest finish. Point it out: "Each agent fails independently."

## Likely judge Q&A

1. **How fresh is the data?**
   Each run fetches from the live sources. Responses are cached for up to 6 hours, so a repeated demo run is instant and doesn't re-bill, and if a source is down we serve the last good copy. Permits cover the last 2 years of DBI filings. 311 covers the last 90 days. NWS alerts and air quality are current. USGS is the live catalog. Flood maps (FEMA, SFPUC) and Census ACS 5-year (2023) are only as current as the agencies' publications, and each finding carries `observed_at` and `source_type` so the orchestrator can weigh recency.

2. **Why not just ask ChatGPT or Claude directly?**
   A chat model doesn't have today's permit filings or last month's 311 reports, and it can't do point-in-polygon against the city's flood map. We pull the actual records, do the geometry deterministically, and use Claude for what it's good at: deciding what to look at and explaining what the overlaps mean for this user.

3. **How do you prevent hallucinated insights?**
   Three ways. (1) The connections come from Turf spatial joins on real geometry, and Claude gets them as grounded candidates. (2) Insights use structured output and must cite finding ids. Ids that don't exist in this run are filtered out. (3) Every finding links to its source record, so any claim can be checked in one click. With no LLM, the joins become the insights directly.

4. **Agents creating agents sounds dangerous. What are the guardrails?**
   Spawned agents get the same fixed tool primitives as user-created ones (web search, web fetch, an HTTP GET that blocks private and loopback addresses, and an OpenStreetMap features tool), with no extra access, and every result has to pass the finding schema. The limits are depth ≤ 2 and ≤ 4 spawns per run, and each agent gets at most 6 turns, 45 seconds and 15 findings. The orchestrator checks the library before creating anything. Spawned agents are shown with their parent ("created by …") and are temporary unless the user keeps them.

5. **Does this work outside San Francisco?**
   Partly today. FEMA, USGS, NWS, Census, OpenStreetMap, elevation and news work across the US (several globally), and questions that fit no specialist go to the general Area Researcher, whose team works anywhere. SF-only agents (permits, 311, SFPUC) are dropped automatically outside SF. Adding a city means adding its permits, 311 and flood-map agents. Many US cities publish these on Socrata or ArcGIS, the same platforms we already query.

6. **Who is this for, and who pays?**
   [TEAM: NAMED COMMUNITY, one sentence on who they are and the problem they told you about.] Free for individuals and community groups. Paid per-parcel reports or watch-mode alerts for professionals who make this check repeatedly: small developers, lenders, insurers, real-estate agents. The cost per mission is a few public API calls plus a few Claude calls.

7. **What's actually the orchestrator vs. a prompt chain?**
   It plans (sends only relevant agents), re-dispatches (sends the terrain drone back to specific parcels after the first sweep, and a coverage check can send up to two agents back out with a narrower task), cross-references across agents, and reconciles conflicts (FEMA says minimal hazard, but 311 reports and low elevation disagree). A prompt chain would summarize each source on its own.

8. **Why SpacetimeDB?**
   Missions are the agents' shared world state. The server writes an ordered event log and findings through reducers (seq order enforced in the database), and every browser subscribes to SQL queries over WebSocket. That gives us share links, live viewing on a second device, mission history, replay, stop and our Claude rate limits from one database, with no sync layer of our own. Only our server's identity can write; browsers are read-only subscribers.

9. **How accurate is the flood result? Is SFPUC's map authoritative?**
   It's the SF Public Utilities Commission's own 100-year storm flood risk map. [TEAM: VERIFY OR CUT. We believe SF ties a flood-risk disclosure requirement for sales/leases to this map; don't say it unless someone has checked.] FEMA's map is the federal insurance map and is coastal-only in SF. We show both and flag when they disagree rather than picking one silently. This is a screening tool, not a survey or an engineering report.

10. **What was hardest?**
    Discovering that FEMA had nothing inland, so our headline insight never fired in the Mission until we added the SFPUC storm map. Second hardest: getting insights grounded, which we fixed by running deterministic joins first and having Claude cite them.

11. **(Bonus) What happens when an API is slow or down?**
    Each agent has its own timeout and error state, so one failure doesn't stop the mission. If the Claude call fails, the heuristic fallback takes over. If SpacetimeDB is unreachable at run start, the app streams the mission straight to the browser over SSE instead.
