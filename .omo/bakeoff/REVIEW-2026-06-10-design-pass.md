# Design Pass Review — 2026-06-10

**Tasks covered:** T17 (Container block representation) · T18 (Left browser panel redesign)
**Status:** Design variations complete. Glen must pick one option per decision before implementation begins.
**Artifacts:** All mockups are static HTML — open in any browser. No build required.

---

## How to review

Open each `index.html` in a browser. The mockups are self-contained: dark background, correct token values, no external dependencies. They are design-only — no production code was modified.

```
.omo/bakeoff/
├── left-panel-2026-06-10/
│   ├── variation-1/index.html   ← Search-Command (recommended)
│   ├── variation-2/index.html   ← Category-Led
│   └── variation-3/index.html   ← Compact Grid + List Toggle
└── container-representation-2026-06-10/
    ├── option-1/index.html       ← Mini-Graph Thumbnail
    └── option-2/index.html       ← Count Badges + IO Summary (recommended)
```

---

## Decision 1 — Left Browser Panel (T18)

### The problem (why it needed redesign)

The current `ToolPalette` has five above-the-fold stacked sections (Favourites + Recents + ALL PLUGINS + Molecules + Boards) that push the primary list below the fold. It has two competing scroll regions. The collapsed state is inconsistent. `Cmd+F` focus uses a brittle DOM selector.

The brief mandates: search-first IA, one scroll region, unified collapsed rail, store-driven focus.

---

### Variation 1 — Search-Command

**File:** `left-panel-2026-06-10/variation-1/index.html`

Single flat list. Facets (category / ★ / ⏱) are toggle chips above the list — not stacked sections. The virtualized list is the only scroll surface. Collapsed to a 40px icon rail where tapping a category glyph reopens and pre-filters.

| | |
|---|---|
| **Panel width** | 260px (unchanged) |
| **Row height** | 34px |
| **Viewport capacity** | ~18 rows visible |
| **Implementation cost** | Low — layout refactor only, no new components |
| **Best for** | Users who know the plugin name and type it |

---

### Variation 2 — Category-Led

**File:** `left-panel-2026-06-10/variation-2/index.html`

Two-column: a fixed 52px category nav rail on the left; the right pane shows the list for the active category. All categories always visible. Sub-type dividers within a category (EQ / Compression / Reverb…) auto-derived from `BrowserPlugin.tags`. Inline per-row ★ favourite toggle.

| | |
|---|---|
| **Panel width** | 280px (+20px) |
| **Row height** | 32px |
| **Viewport capacity** | ~20 rows visible (narrower pane but tighter rows) |
| **Implementation cost** | Medium — new `CategoryRail` component, `ToolPalette` layout restructure |
| **Best for** | Users who browse by category type before knowing a specific name |

---

### Variation 3 — Compact Grid + List Toggle

**File:** `left-panel-2026-06-10/variation-3/index.html`

Same header/facet system as V1, but with a grid/list toggle in the header. Grid = 3-column neumorphic cards with large glyph and colour accent. List = 28px dense rows. Auto-switches to list when search has text (matches Finder behaviour). Sub-section headers in grid when a category filter is active.

| | |
|---|---|
| **Panel width** | 260px (unchanged) |
| **Grid capacity** | ~12 cards visible |
| **List capacity** | ~22 rows visible |
| **Implementation cost** | Low-medium — extends existing `PluginCard.tsx` for grid mode |
| **Best for** | Users who browse visually by recognition rather than by name |

---

### Side-by-side summary

| | V1 Search-Command | V2 Category-Led | V3 Grid+List |
|---|---|---|---|
| Width | 260px | 280px | 260px |
| Primary interaction | Type to search | Tap category then skim | Browse grid or type |
| Above-fold plugins | 18 | 20 (within category) | 12 grid / 22 list |
| Nested scroll problem | Fixed | Fixed | Fixed |
| Rail when collapsed | 40px icon rail | 40px icon rail | 40px icon rail |
| New components needed | None | `CategoryRail` | Grid mode for `PluginCard` |
| Cost | Low | Medium | Low-medium |

---

### Recommendation — V1 (Search-Command)

The brief explicitly cites the Bitwig-5 over-faceting backlash and mandates "search-first" IA [R-§E]. V1 is the direct implementation of that brief. It fixes every diagnosed failure mode (nested scroll, above-fold crowding, brittle focus, inconsistent rail) with the lowest implementation risk. The facet chips give the same category-filtering capability as V2's rail without the 20px width penalty.

V2 is the right choice only if Glen primarily browses by category type and rarely searches by name. V3 is the right choice only if Glen wants a visual card browser.

**Glen must pick: V1 / V2 / V3**

---

## Decision 2 — Container Block Representation (T17)

### The problem

`BlockData` has `containerNodeCount` and `isPortal` but the canvas Block component shows no container-specific affordance — a Container block looks identical to a normal block except for its name. Users cannot tell what is inside without double-clicking.

---

### Option 1 — Mini-Graph Thumbnail

**File:** `container-representation-2026-06-10/option-1/index.html`

A pressed-inset 96px thumbnail region below the header shows a scaled-down SVG snapshot of the container's internal graph. Mini pill-nodes coloured by category + curved SVG cables. Above 6 nodes, falls back to a category-coloured density bar. Brightens on hover with a "double-click to enter" hint.

| | |
|---|---|
| **Additional block height** | +96px thumbnail + ~20px IO row = ~116px above normal block |
| **Data required** | Child block list (category + topology) + cable list |
| **Snapshot freshness** | Regenerated on container-save; cached as string on `BlockData` |
| **Implementation cost** | Moderate — SVG snapshot generator + cache invalidation |
| **Spatial identity** | Yes — topology shape is unique per container |

---

### Option 2 — Count Badges + IO Summary

**File:** `container-representation-2026-06-10/option-2/index.html`

Three zones below the header: (1) category composition chips (count + ●▲◆⬡ per category present), (2) signal IO summary bar (input/output signal types and counts), (3) action row (Enter + Edit buttons). Compact tier at low zoom: one colour dot per block + minimal IO string. Portal variant: teal border + linked filename.

| | |
|---|---|
| **Additional block height** | +40–50px above normal block |
| **Data required** | `containerNodeCount` (exists) + category breakdown (small host-side addition) + `BlockData.ports` (exists) |
| **Always accurate** | Yes — live data, no snapshot |
| **Implementation cost** | Low |
| **Spatial identity** | No — two containers with identical composition look the same |

---

### Side-by-side summary

| | Option 1 Thumbnail | Option 2 Badges |
|---|---|---|
| Additional height | +116px | +40–50px |
| Spatial identity | Yes | No |
| Always accurate | No (snapshot can be stale) | Yes |
| Implementation cost | Moderate | Low |
| Portal support | Same thumbnail approach | Native (badge + teal border) |
| Compact-zoom support | Hide thumbnail | Dots + IO string |
| Upgrade path | Can add later | Already complete |

---

### Recommendation — Option 2 (Count Badges + IO Summary)

The canvas footprint argument is decisive: +116px per container block is a large cost on a dense board. If Glen has 3 containers on a board, they each consume ~300px of vertical canvas space — real estate that normal blocks use for signal routing.

Option 2 answers "what's inside" without spatial topology (you know there are 2 Audio FX and 1 VI), is always accurate, costs almost nothing to implement, and handles Portal/nested/compact tiers identically. If Glen later finds he needs spatial identity (e.g. he regularly has 5+ containers with similar composition), Option 1 can be added as a per-container toggle — it is an upgrade path, not a prerequisite.

**Glen must pick: Option 1 / Option 2**

---

## Implementation readiness

Once Glen picks, the implementation order is:

1. **T18 (Left Panel)** — whichever variation Glen picks, implementation touches `ToolPalette.tsx`, `FacetChips.tsx`, `PluginList.tsx`, `AppShell.tsx` (rail unification), `useAppStore.ts` (search focus nonce + persistence). Estimated: 1 focused session.

2. **T17 (Container Block)** — touches `Block.tsx` (new body zones), `BlockData` types (category breakdown field), host-side graph snapshot serialiser (one new field). Option 2 estimated: 0.5 sessions. Option 1: 1.5 sessions.

Neither task touches `GraphCanvas.tsx`, `Cable.tsx`, or existing panel owners (as required by the task brief).

---

## Design system compliance check

All variations use only locked tokens:

| Token | Value | Used |
|-------|-------|------|
| Canvas | `#1E1E22` | Background, dot grid |
| Panel | `#222226` | Panel shell, header |
| Surface | `#252529` | Cards, chips, plugin rows selected |
| Elevated | `#2A2A2E` | Hover states |
| Pressed | `#1A1A1E` | Search fields, inset regions, thumbnail |
| Text primary | `#E5E5EA` | Plugin names, active labels |
| Text secondary | `#8E8E93` | Metadata, port labels |
| Text dim | `#55555A` | Section headers, counts, inactive states |
| Cat instrument | `#4A90D9` | ● Circle glyphs |
| Cat midifx | `#2BC4C4` | ▲ Triangle glyphs |
| Cat audiofx | `#E8A838` | ◆ Diamond glyphs |
| Cat modulator | `#A87FE0` | ⬡ Hexagon glyphs |

No glassmorphism. No backdrop-blur. No transparency. All shadows use the locked raised/inset/button shadow formulas from `CLAUDE.md`.

---

*Design pass by: oh-my-claudecode:designer — 2026-06-10*
*Artifacts are review-only. No production component was modified.*
