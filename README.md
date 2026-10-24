# Geo Research Agents (working title)

> **Status:** Planning / early build (Cal Hacks 13.0).
> **Deadline:** Devpost submission **Sunday 9:00 AM**. Nothing after that counts.

Drag/select a region on a map, ask a question about it (or ask for **Insights**), and the relevant agents spin up and work together. Findings stream onto the map as pins with sources, and an orchestrator cross-references them into an answer, e.g. "3 approved developments sit inside a projected flood zone." An **Agent Hub** lets users (and agents) create new workers from a plain-English prompt.

**▶ Running the app:** the code lives in [`web/`](web/). See [`web/README.md`](web/README.md) for setup, architecture, the worker list, and the agent-creation contract.

## Docs

Everything lives in [`docs/`](docs/INDEX.md). Start with the index.

- **Project:** [overview & demo moment](docs/project/overview.md) · [architecture](docs/project/architecture.md) · [decisions log](docs/project/decisions.md)
- **Sponsor tracks:** [shortlist & requirements](docs/tracks/shortlist.md)
- **Event:** [rules, deadlines, judging, logistics](docs/event/overview.md) · [full schedule](docs/sources/hive-schedule.md)

Refresh live prize/schedule data with `python scripts/pull_hive.py`.
