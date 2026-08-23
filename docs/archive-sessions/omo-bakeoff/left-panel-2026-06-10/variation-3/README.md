# Variation 3 — Compact Grid + List Toggle

**Two view modes. Grid for visual browsing, list for search.**

## Concept

Same header and facet system as V1, but the primary surface can switch between a 3-column card grid and a dense list. Cards are neumorphic raised surfaces with a category-colour accent top strip and large glyph for visual recognition. Typing in the search field auto-switches to list mode for density; the user can override back to grid.

## Key decisions

| Decision | Rationale |
|----------|-----------|
| Grid cards with 2px colour accent strip | Same neumorphic vocabulary as the canvas block header. Visual recognition without reading the name. |
| Auto-switch to list on search | Grid is poor for search results (too few rows visible). List is better for scanning 4 matching results. Mirrors Finder behaviour. |
| 3-column grid at 260px | Each card is ~76px wide with 5px gap. Names up to 2 lines via `-webkit-line-clamp`. |
| Sub-section headers in grid | Within a category filter, section dividers (Synthesizers / Samplers…) span all 3 columns using `grid-column: 1 / -1`. |
| ⠿ drag hint bottom-right on hover | Via CSS `::after` pseudo — zero JS cost. |

## Dimensions

- Panel: 260px × (fills parent)
- Grid card: ~76px wide × 64px tall minimum
- List row: 28px (tighter than V1's 34px — optimised for search-result reading)
- Header: same as V1 (~72px)

## Component mapping

| UI zone | Existing / new component |
|---------|--------------------------|
| Panel shell | `ToolPalette` |
| View toggle | New 2-button segmented control in header (`list` / `grid`) |
| Grid surface | Reuse/extend existing `PluginCard` (already in `palette/PluginCard.tsx`) |
| List surface | `PluginList` (unchanged) |
| Auto-switch logic | `useEffect` in `ToolPalette` watching `search !== ''` → set `viewMode = 'list'` |

## What changes vs today

- `ToolPalette` gains `viewMode` state and a view toggle in the header
- `PluginCard.tsx` extended to support grid layout with accent strip + large glyph
- `PluginList` search-result rows tightened to 28px for this mode
- Auto-switch on search (one `useEffect`)

## Trade-offs vs V1

| | V1 (list) | V3 (grid+list) |
|--|-----------|----------------|
| Plugins visible in viewport | ~18 | ~12 (grid) / ~22 (list) |
| Search-by-name speed | Fast | Same (auto-switches to list) |
| Category-browse speed | Medium | Fast (grid cards + colour) |
| Implementation cost | Low | Low-medium (grid card extension) |

## Implementation cost

**Low-medium.** The `PluginCard` component already exists. The grid layout is a CSS grid on the existing list container. The auto-switch is a single `useEffect`. Biggest risk: `PluginCard` name truncation at 2 lines must be verified against long plugin names (e.g. "RX 10 Voice De-noise").
