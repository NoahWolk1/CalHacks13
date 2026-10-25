# Pitch: 2-minute script, demo click path, fallback, judge Q&A

> **Source:** codebase (`web/`), project docs, team test runs, Sat 2026-10-24; agent lineup updated Sun 2026-10-25.  
> **Summary:** What to say and click at the judging table (Sun 10:30 AM–12:30 PM, whole team at the table). The presenter and demo driver are still open in [decisions.md](../project/decisions.md). Rehearse with a timer at least twice.

## Before judging (checklist)

- [ ] App open at https://geoswarm.vercel.app (live backend: SpacetimeDB maincloud; `/api/agents` shows `live.backend: "spacetime"`). Hard-refresh once. Run `npm run warm` against the deployed site beforehand (see `web/README.md`).
- [ ] `ANTHROPIC_API_KEY` set (the LLM badge shows on). The heuristic fallback still works without it.
- [ ] **Run the demo mission once that morning** in the exact Mission District box. Save its `/?run=<id>` link and open it in a second tab. That's the fallback.
- [ ] A phone open to a past run's share link on the same Wi-Fi (`http://<laptop-ip>:<port>/?run=<id>`), or the deployed app (SpacetimeDB maincloud) if off-LAN.
- [ ] Map pre-zoomed to the Mission, with Site Risk Analyst + Insights already selected. Be on the map page, not `/agents`.
- [ ] Know the numbers: **~124 findings, ~10 s, 6 permits in the SFPUC 100-year storm zone, ≈$3.1M, 6 on filled-in former water.** Re-check them against the morning run and use whatever it shows.

## The demo spot

**Mission District, Site Risk Analyst, Insights mode.** Use the same box as the tested run, roughly the low-lying blocks of the former Mission Creek / Laguna de los Dolores area (around 17th–20th St, between Mission and Harrison). FEMA shows little or nothing here, while the SFPUC storm map, buried creeks and recent permits all overlap. [TEAM: write the exact corner streets you draw from so the demo driver repeats it precisely.]

## Script (≈2:00)

| Time | Say | Do / point at |
|---|---|---|
| **0:00–0:15** | "If you're about to buy, build on, or insure a lot in San Francisco, the answer to 'is this a bad idea?' is spread across a dozen public datasets nobody reads together. FEMA's flood map doesn't even cover the Mission." | Map already on screen, Mission in view. |
| **0:15–0:25** | "GeoSwarm: you draw an area, pick who you are, and a team of AI agents goes and gets the live data." | **Draw the box** over the Mission demo spot. |
| **0:25–0:35** | "I'm a Site Risk Analyst, and I'll ask for Insights, so no question needed. Claude plans which agents to send." | Confirm **Site Risk Analyst** + **Insights**, hit the run/launch button. Point at the **plan** in the right panel. |
| **0:35–0:55** | "Nine agents, each one a live public source: FEMA, the city's storm flood map, building permits, 311, elevation, USGS, weather alerts, news, and Sentinel-2 satellite imagery. Each one flies to what it found before the pin drops. Every pin links to its source record." | Point at **drones/cars/rovers fanning out**. Click **one permit pin** to show the DBI source link. |
| **0:55–1:10** | "This is the orchestrator doing more than summarizing. It saw permits that looked risky and sent the terrain drone back to measure the ground at those specific parcels." | Point at the **terrain drone re-dispatch** (thought line: "Re-dispatching Terrain Scanner…"). |
| **1:10–1:35** | "Then it cross-references. Six permitted projects, about $3.1 million of work, sit inside the city's 100-year storm flood zone, and six are built on filled-in former creek and lagoon. FEMA's map alone shows neither." | **When the insight arcs appear**, point along an arc from the **permit pin to the flood polygon**. Click the top insight so its **cited findings highlight**. |
| **1:35–1:45** | "Every insight cites the finding ids it's built on. If Claude cites something that doesn't exist, we drop it." | Point at the **finding ids** in the insight card. |
| **1:45–1:55** | "Missions live in SpacetimeDB, so this link streams the same mission live on any device." | Hand the judge the **phone**, or click **Share** and open the link in a new tab. |
| **1:55–2:00** | "Same agents, different orchestrators: Storefront Scout and Disaster Response. And when no agent fits, the orchestrator creates one. Built for [NAMED COMMUNITY]." | Point at the orchestrator picker. Stop. |

If there's time left (judges asking for more), run an **Ask** question with Site Risk Analyst: *"Which new developments are most exposed to flooding?"* and show the streamed answer with citations. Or show **agents creating agents**: switch to Storefront Scout, draw a box in the Mission (around 24th & Valencia) and ask *"Is this a good spot for a café? Factor in how nearby restaurants score on health inspections."* Point at the new agent marked "created by" (it pulls SF restaurant health-inspection scores from DataSF), then click **Keep in library**. Use that exact wording: the plain café question usually doesn't spawn anything. In a rehearsal on Oct 25 (local, real Claude), the spawn fired 5 of 5 times and the agent pinned 6–8 real inspections 4 of 5 times, about 35 s after spawning. Before the demo, delete any kept "Inspection Scout" in the Hub; otherwise the planner reuses it and nothing spawns. The DataSF dataset's newest records are from 2019, so say "inspection history" rather than "current scores". Fallback: create the same agent from the Agent Hub.

## 30-second fallback (Wi-Fi or an API down)

Say: "The venue Wi-Fi is struggling, so here's the mission we ran this morning. It's stored in SpacetimeDB, so it replays exactly what happened, event by event."

1. Open **Missions ▾** at the top of the map (or the saved `/?run=<id>` tab) and pick the morning Mission District run. The finished mission **replays with staggered events**, so the fleet still flies, pins drop and arcs draw.
2. Give the same beats: re-dispatch, "6 permits in the storm flood zone, ≈$3.1M", "6 on filled-in water", cited finding ids.
3. If only Claude is down: run live anyway. The heuristic fallback plans, cross-references and answers without the LLM. Say: "Claude is unreachable, so it fell back to deterministic rules. The spatial joins are the same."
4. If one data source times out, that agent shows an error and the rest finish. Point it out: "Each agent fails independently."

## Likely judge Q&A

1. **How fresh is the data?**
   Everything is fetched live when you hit Run, with no cache. Permits cover the last 2 years of DBI filings. 311 covers the last 90 days. NWS alerts and air quality are current. USGS is the live catalog. Flood maps (FEMA, SFPUC) and Census ACS 5-year (2023) are only as current as the agencies' publications, and each finding carries `observed_at` and `source_type` so the orchestrator can weigh recency.

2. **Why not just ask ChatGPT or Claude directly?**
   A chat model doesn't have today's permit filings or last month's 311 reports, and it can't do point-in-polygon against the city's flood map. We pull the actual records, do the geometry deterministically, and use Claude for what it's good at: deciding what to look at and explaining what the overlaps mean for this user.

3. **How do you prevent hallucinated insights?**
   Three ways. (1) The connections come from Turf spatial joins on real geometry, and Claude gets them as grounded candidates. (2) Insights use structured output and must cite finding ids. Ids that don't exist in this run are filtered out. (3) Every finding links to its source record, so any claim can be checked in one click. With no LLM, the joins become the insights directly.

4. **Agents creating agents sounds dangerous. What are the guardrails?**
   Spawned agents get the same fixed tool primitives as user-created ones (web search, web fetch, and an HTTP GET that blocks private and loopback addresses), with no extra access, and every result has to pass the finding schema. The limits are depth ≤ 2 and ≤ 4 spawns per run, and each agent gets at most 6 turns, 45 seconds and 15 findings. The orchestrator checks the library before creating anything. Spawned agents are shown with their parent ("created by …") and are temporary unless the user keeps them.

5. **Does this work outside San Francisco?**
   Partly today. FEMA, USGS, NWS, Census, OpenStreetMap, elevation and news work across the US (several globally). SF-only agents (permits, 311, SFPUC) are dropped automatically outside SF. Adding a city means adding its permits, 311 and flood-map agents. Many US cities publish these on Socrata or ArcGIS, the same platforms we already query.

6. **Who is this for, and who pays?**
   [NAMED COMMUNITY.] Free for individuals and community groups. Paid per-parcel reports or watch-mode alerts for professionals who make this check repeatedly: small developers, lenders, insurers, real-estate agents. The cost per mission is a few public API calls plus a few Claude calls.

7. **What's actually the orchestrator vs. a prompt chain?**
   It plans (sends only relevant agents), re-dispatches (sends the terrain drone back to specific parcels after the first sweep), cross-references across agents, and reconciles conflicts (FEMA says minimal hazard, but 311 reports and low elevation disagree). A prompt chain would summarize each source on its own.

8. **Why SpacetimeDB?**
   Missions are the agents' shared world state. The server writes an ordered event log and findings through reducers (seq order enforced in the database), and every browser subscribes to SQL queries over WebSocket. That gives us share links, live viewing on a second device, mission history, replay, stop and our Claude rate limits from one database, with no sync layer of our own. Only our server's identity can write; browsers are read-only subscribers.

9. **How accurate is the flood result? Is SFPUC's map authoritative?**
   It's the SF Public Utilities Commission's own 100-year storm flood risk map [TEAM: verify before saying it, since we believe SF ties a flood-risk disclosure requirement for sales/leases to this map]. FEMA's map is the federal insurance map and is coastal-only in SF. We show both and flag when they disagree rather than picking one silently. This is a screening tool, not a survey or an engineering report.

10. **What was hardest?**
    Discovering that FEMA had nothing inland, so our headline insight never fired in the Mission until we added the SFPUC storm map. Second hardest: getting insights grounded, which we fixed by running deterministic joins first and having Claude cite them.

11. **(Bonus) What happens when an API is slow or down?**
    Each agent has its own timeout and error state, so one failure doesn't stop the mission. If the Claude call fails, the heuristic fallback takes over. If SpacetimeDB is unreachable at run start, the app streams over SSE instead (Convex is also wired as a fallback backend).
