# Sponsor tracks: shortlist for Geo Research Agents

> **Sources:** live prizes API (2026-10-24), Hacker Guide PDF, Fetch.ai hackpack, Figma track doc.  
> **Summary:** The tracks that plausibly fit our project, what each one *requires*, how well we fit, and the risks. Verbatim text for every track (including ones not listed here, e.g. the 15 MLH tracks) is in [sources/hive-prizes.md](../sources/hive-prizes.md).  
> **Rule of thumb:** each targeted track must be real, core use, not bolted on. Realistically stack 2–3.

## At a glance

| Track | Prize | Fit | Hard requirement / risk | Workshop (Sat, PDT) |
|---|---|---|---|---|
| [Bright Data](#bright-data) | $1.5k/$1k/$500 credits + $500/$350/$250 Amazon | **Strong** | Live public web data must be essential; no mocks in demo | 10 AM (done) |
| [Apify](#apify) | $2k/$1k/$800/$400/$400 + Best Actor $400 | **Strong** | Meaningful Apify use; overlaps Bright Data (scraping) | 11 AM (done) |
| [Convex](#convex--spacetime) | $5,000 (one winner) | **Strong** | Pick Convex *or* Spacetime | 4 PM, Gate 3 |
| [Spacetime](#convex--spacetime) | $2,048/$1,024/$512 | **Strong** | Must be core real-time backend | 4 PM, Theater (same slot as Convex) |
| [Anthropic](#anthropic) | $5k Claude credits + 1y Max 20x | Medium → strong *if* we name a community | Needs a narrow named community + real problem | 1 PM (done) |
| [Microsoft](#microsoft-built-for-the-real-world) | Surface laptop each + FDE talk + mentorship | Medium | Production-minded, measurable usefulness | 10 AM (done) |
| [Fetch.ai](#fetchai) | $1,250/$750/$500 + 2×$250 + interviews | **Conflict** | Primary workflow must run in ASI:One chat, **no custom frontend** | 3 PM, Theater |
| [Elastic](#elastic) | Meta Quest 3S / Bose QC | Unknown | Criteria still "coming soon"; no workshop on live schedule | — |
| [Figma](#figma) | $2k Workflow, $2k Stage Log, $500 Design, $500 Creative | Medium (process track) | Figma Slides + stage log + public Figma files + edu verification | — |
| Atlassian: Best Agent / Best Security for Agents | AirPods Max | Unknown | Criteria in a Google Doc not yet pulled | — |
| MLH: Best Use of Gen AI / Gemini / MongoDB Atlas | small prizes | Cheap add-on | Only if we already use that API | — |
| General: Best Planet-First Hack | Parks Pass | Possible | Flood-risk angle | — |

## Bright Data

- **Criteria:** Bright Data essential to the core; if live public web data were removed, the product wouldn't work. Solve a clear real-world problem for a specific user; run live; handle blocks, slow responses, empty results; turn raw data into clean output. Extra credit: choosing and combining the right Bright Data tools; a two-minute story using real results.
- **Disqualified if:** scraping behind login/paywall, collecting non-public personal data, **mocked or hardcoded data in the demo**, or Bright Data only mentioned in the README.
- **Fit:** our workers *are* public-web-data gatherers (permits, news, listings). Strong.
- **Starter pack:** https://github.com/ScrapeAlchemist/public-data-hackpack

## Apify

- **Criteria:** top 5 projects using Apify meaningfully; judged on project quality + other criteria. Separate **Best Actor** award for an actor built at the event.
- **Fit:** scraping workers (and the Agent Hub's "scrape this URL" primitive) could be Apify actors. Building one custom actor (e.g. a city permit-portal scraper) targets Best Actor too.
- **Tension:** Apify and Bright Data both cover scraping. Both can be real if they serve different workers, but picking one is simpler.
- **Starter pack:** https://drive.google.com/drive/folders/1RqT3r6i1MqSBAJoAIwXc3lEMmQCnshVt

## Convex / Spacetime

- **Convex:** "reactive backend platform … database, functions, workflow, sync, search, file storage. All TypeScript." $5,000 to one team. Docs: https://docs.convex.dev/home
- **Spacetime:** wants SpacetimeDB as the *core* real-time backend; explicitly lists **AI agent coordination**, **live dashboards**, and "AI systems coordinating in a persistent world state." Must not be a side add-on. Also a separate Scrabblebot tournament (Sun 12 AM).
- **Fit:** the shared findings store that workers write to and the map subscribes to *is* this pattern. Choose one; the backend decision depends on it.
- **Note:** both workshops are Sat 4 PM, in different rooms.

## Anthropic

- **Criteria:** (1) a **named community** ("transfer students at Berkeley trying to find housing" level), (2) a real problem you've lived or heard firsthand, (3) it works, usable Monday, (4) thoughtful use of Claude, knowing where it could go wrong.
- **Fit:** depends entirely on the orchestrator/user-type decision. A generic "any place, any question" tool fails criterion 1. Choosing e.g. "SF small-business owners scouting a first storefront" makes this viable.
- Prize on live site currently says "Coming soon!"; guide says $5k credits + 1y Claude Max 20x + office hours.

## Microsoft: Built for the Real World

- **Challenge:** production-minded AI agent for a meaningful problem in a high-impact domain.
- **Criteria:** customer understanding, measurable usefulness, path from prototype to production, responsible design, end-to-end functionality.
- **Fit:** medium; rewards the same narrowing as Anthropic plus a credible production story (source provenance, confidence, guardrails on spawned agents help).
- Customer Impact Award (tech talk + mentorship) shares the criteria.

## Fetch.ai

Full rules: [sources/fetch-ai-hackpack.md](../sources/fetch-ai-hackpack.md).

- **Mandatory:** at least one agent on Agentverse; Agent Chat Protocol; discoverable & usable through ASI:One; meaningful tool execution or multi-agent orchestration; **primary user workflow entirely inside an ASI:One conversation, no custom frontend**; public repo.
- **Extra deliverables:** README with agent names/addresses + two Innovation Lab badges; 3–5 min video; register via the ASI:One Submission Agent in addition to Devpost.
- **Criteria:** functionality 25%, Fetch.ai tech use 20%, innovation 20%, impact 20%, UX 15%.
- **Conflict:** our core interaction is drawing on a map. To qualify, the ASI:One chat flow (e.g. "research the area around 1420 Valencia St") would have to be a primary workflow in its own right, with the map as a secondary view. Doable (orchestrator as a uAgent) but it's a second front-end surface.
- Hacker Guide lists $1,500/$1,000/$500; Fetch.ai's own page says $1,250/$750/$500 + 2×$250. Trust the Fetch.ai page.

## Elastic

- Criteria and workshop still "coming soon." Workshop title in the guide: "Build an Agent That Does the Research: Context Engineering with Elasticsearch."
- **Fit if criteria allow:** findings store in Elasticsearch with `geo_shape` queries ("findings inside this polygon") plus text search over sources. Ask at their booth or in Slack.

## Figma

Full rules: [sources/figma-track.md](../sources/figma-track.md).

- Judged on **workflow**, not technical difficulty: stage log covering ideation → prototyping → handoff → code generation, with tools, minutes, 1–5 rating, and how output reached the final build.
- **Deliverables:** ≤3 min video, stage log (≤200 words/stage), **Figma Slides** (required) with embedded public Figma files + repo link; **edu verified**.
- **Fit:** only if we actually design the map UI / agent panel in Figma (Design or Make) and log it honestly as we go. Low code cost, real documentation cost; must start logging now since it's about process.
