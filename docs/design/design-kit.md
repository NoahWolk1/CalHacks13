# GeoSwarm design kit

Source: working doc, started 2026-10-25 on branch `design-language`. Summary: outline of the new design language. Each section lists what the app does **today** (from the code) and what is still **open**. Fill in each **New** line as we decide it, and log the final call in [../project/decisions.md](../project/decisions.md).

Status: **outline**, nothing decided yet.

---

## 0. Identity

- **Today:** "Night survey sheet" (decided 2026-10-24). Warm graphite, colour only for data, one sodium-orange accent.
- **Open:**
  - What 3 to 5 words should the product feel like?
  - What should a judge remember from 10 seconds of demo?
  - Reference apps or sites to steal from, and things to avoid.
- **New:** _TBD_

## 1. Principles

3 to 5 rules that settle arguments, each with a do and a don't.

- **Today:** colour is for data, not chrome. Solid panels, no glass or glow. Sentence case. Mono only for numbers and IDs.
- **New:** _TBD_

## 2. Colour

| Group | Tokens today | Where it lives |
|---|---|---|
| Surfaces | `bg` `panel` `raised` `active` | `globals.css` `:root`, `theme.ts` `UI` |
| Lines | `line` `line-strong` | same |
| Text | `fg1` to `fg4` | same |
| Accent | `accent` #e8853d (AOI, live, focus) | same |
| Semantic | `risk` `ok` | `globals.css` `@theme` |
| Data: agents | 13 categorical colours, OKLCH L about 0.72 to 0.82 | `theme.ts` `AGENT_COLORS` |
| Data: insight kinds | risk, opportunity, conflict, note | `theme.ts` `KIND_COLORS` |
| Map | basemap re-tints, flood zones, buildings, light | `theme.ts` `MAP` `BASEMAP` `BUILDING_RAMP` |

- **Open:**
  - Dark, light, or both?
  - Accent hue, and whether there is one accent or more.
  - Should agent colours change with it? They're copied into per-worker `color` fields.
  - Contrast target (today: at least 6:1 for agent colours on `panel`).
- **New:** _TBD_

## 3. Typography

- **Today:** Geist Sans and Geist Mono. Sizes in use: 10, 11, **12** (the default, 55 uses), 13, 14, 20 and 22px. Weights: 400, 500, 600.
- **Open:**
  - Typefaces: keep Geist, or add a display or serif face?
  - A named type scale (caption, body, label, title, display) instead of ad-hoc `text-[Npx]`.
  - Case: sentence case or uppercase labels?
  - Where mono shows up.
- **New:** _TBD_

## 4. Space and layout

- **Today:** Tailwind default spacing (mostly gap-1.5 or 2, px-2 to 4). Resizable right panel of 400px by default. A 36px rail when collapsed. A 48px top bar. Mobile bottom sheet below 1024px.
- **Open:**
  - Base unit (4px?) and the allowed steps.
  - Panel density: compact or roomy?
  - Does the layout itself change, or only the skin?
- **New:** _TBD_

## 5. Shape and elevation

- **Today:** mostly `rounded-md`, with `rounded-full` for dots and avatars. Two surface types: `.dock` (solid, no shadow) and `.surface`/`.glass` (solid, hairline, one soft shadow).
- **Open:**
  - Radius scale: sharp, soft, or mixed.
  - Border vs shadow vs blur.
  - How many elevation levels.
- **New:** _TBD_

## 6. Iconography

- **Today:** lucide-react, imported in 10 files. Custom vehicle silhouettes (`VehicleGlyph`) tinted in the agent's colour.
- **Open:**
  - Icon stroke and size.
  - Should the vehicle art change style?
  - Do we need a logo or mark?
- **New:** _TBD_

## 7. Motion

- **Today:** panel glide of 320ms `cubic-bezier(0.22, 1, 0.36, 1)`. framer-motion fades of about 160 to 200ms. Agents page fade in with staggered sections. Static streaming caret with no blink, and no pings.
- **Open:**
  - Duration and easing tokens.
  - What gets motion: agents moving, findings landing, the AOI draw.
  - Is a "signature moment" worth it for the demo?
- **New:** _TBD_

## 8. Components

The inventory to restyle. Files are under `web/src/components/`.

| Component | File(s) | Notes |
|---|---|---|
| Top bar | `TopBar.tsx` | |
| Place search | `PlaceSearch.tsx` | |
| Research form (ask) | `ResearchForm.tsx` | |
| Right panel / findings list | `RightPanel.tsx` | |
| Finding inspector | `FindingInspector.tsx` | |
| Status bar / toasts | `StatusBar.tsx` | |
| Agents page (Hub) | `AgentsPage.tsx` | |
| Mission history | `MissionHistory.tsx` | |
| Rail, sash | `Rail.tsx`, `Sash.tsx` | |
| Mobile sheet | `MobileSheet.tsx` | |
| Space / satellite controls | `SpaceControls.tsx` | |
| Primitives | `ui.tsx` | StatusPill, SectionLabel, AgentAvatar, VehicleGlyph |

Missing shared primitives to define: button (primary, secondary, ghost), input, tag or chip, card or row, popover, tooltip, empty state, loading state.

- **New:** _TBD_

## 9. Map language

- **Today:** OpenFreeMap dark, re-tinted to graphite. 3D buildings with dim lighting. The AOI in accent. Agent vehicles in agent colour with neutral labels. Insight arcs in paper white. Satellite layer in `MapView.tsx`.
- **Open:**
  - Basemap style.
  - Styles for the AOI, pins, arcs and agent trails.
  - How findings "land" on the map.
- **New:** _TBD_

## 10. Voice and copy

- **Today:** sentence case. Status words: Standby, Queued, Deploying, Scanning, Reported, Failed.
- **Open:**
  - Tone: tactical, friendly, or neutral?
  - Naming: missions, agents, findings.
- **New:** _TBD_

## 11. Implementation plan

- Token sources: `web/src/app/globals.css` (CSS vars plus Tailwind `@theme`) and `web/src/lib/client/theme.ts` (JS mirror for the map and deck.gl). Keep them in sync.
- Order: tokens, then primitives (`ui.tsx`), then the demo-path screens, then everything else.
- Guard rails: no regressions to the live demo. Check desktop and mobile. Check map frame rate if we add blur or shadows.
- **Deadline fit:** Devpost closes Sun Oct 25, 9:00 AM PDT. Decide by section how much ships before then.
