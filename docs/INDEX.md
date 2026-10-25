# Docs index

Read this first, then open only the docs your task needs. Each doc starts with its source, capture date, and a one-line summary.

**Now:** Saturday Oct 24, 2026. **Devpost deadline: Sunday 9:00 AM PDT** (aim for 8:45). Priorities: (1) working live demo, (2) submitted Devpost, (3) sponsor-track fit, (4) everything else.

## Project: what we're building

| Doc | Read when |
|---|---|
| [project/overview.md](project/overview.md) | You need the idea, user flow, candidate users, demo moment, or build order |
| [project/architecture.md](project/architecture.md) | You're writing agent/orchestrator code, the finding schema, or the Agent Hub |
| [project/decisions.md](project/decisions.md) | You need to know what's decided vs open, or you just decided something (log it) |

## Tracks: what sponsors want

| Doc | Read when |
|---|---|
| [tracks/shortlist.md](tracks/shortlist.md) | Choosing tracks, or checking a targeted track's requirements and deliverables |
| [sources/hive-prizes.md](sources/hive-prizes.md) | You need verbatim text for any track, including ones not on the shortlist |
| [sources/fetch-ai-hackpack.md](sources/fetch-ai-hackpack.md) | Working on Fetch.ai integration or its submission |
| [sources/figma-track.md](sources/figma-track.md) | Working on the Figma stage log / slides |
| [sources/hive-starter-packs.md](sources/hive-starter-packs.md) | You need a sponsor's starter pack link (credits, API keys, docs) |

## Submission: Devpost, pitch, track claims

| Doc | Read when |
|---|---|
| [submission/devpost-draft.md](submission/devpost-draft.md) | Writing or pasting the Devpost sections (fill the `[BRACKETED]` placeholders) |
| [submission/pitch.md](submission/pitch.md) | Rehearsing the 2-minute pitch, demo click path, Wi-Fi/API fallback, or judge Q&A |
| [submission/tracks.md](submission/tracks.md) | Deciding which tracks to list, or closing a track's gaps (incl. picking the Anthropic named community) |

## Event: rules, deadlines, logistics

| Doc | Read when |
|---|---|
| [event/overview.md](event/overview.md) | Deadlines, rules that disqualify, judging, Slack/help, food/sleep/buses |
| [sources/hive-schedule.md](sources/hive-schedule.md) | You need an exact time or room (workshops, meals, ceremonies) |

## Keeping it fresh

- `sources/hive-*.md` are generated. Re-pull with `python scripts/pull_hive.py`; don't hand-edit them.
- Curated docs (`project/`, `tracks/`, `event/`, `submission/`) are hand-maintained. If a re-pull changes a track's rules, update `tracks/shortlist.md`.
- Originals not stored in the repo: the 13.0 Hacker Guide PDF and the Figma track PDF (both transcribed into the docs above).
