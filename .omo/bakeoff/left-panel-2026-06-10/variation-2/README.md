# Variation 2 — Category-Led

**Two columns. Category identity is always visible.**

## Concept

A 52px fixed category nav rail on the left drives what the right list pane shows. All 4 categories + ★ Fav + ⏱ Recent are always visible — tapping any of them instantly narrows the list. The right pane shows search + a sorted, sub-grouped list for the active category.

## Key decisions

| Decision | Rationale |
|----------|-----------|
| Fixed category rail | Category is always visible, never hidden behind a chip. Better for users who think "I want an EQ" before they think of a plugin name. |
| Sub-type dividers within category | Audio FX 147 plugins → auto-grouped by tag (EQ / Compression / Reverb…). Derived from existing `BrowserPlugin.tags`. Only appears when list > 12. |
| Inline ★ per-row | One-click favourite without leaving the list. Wired to existing `PluginUsageTracker`. |
| Active edge bar | Left-edge 2px colour bar on the active category mirrors canvas block accent language. |
| 280px width | 20px wider than V1 to accommodate 52px rail + readable list name column. |

## Dimensions

- Panel: 280px × (fills parent)
- Category rail: 52px
- List pane: 228px
- Row height: 32px
- Rail collapsed: 40px (same as V1 — only the list pane collapses)

## Component mapping

| UI zone | Existing / new component |
|---------|--------------------------|
| Category rail | New `CategoryRail` primitive (thin, reuses category icons + colours) |
| List pane header | `PaletteSearch` + category titlebar |
| Sort chips | New inline sort row (Name / Vendor / Format) |
| Plugin rows | `PluginList` rows + inline ★ |
| Sub-type dividers | Auto-inserted by `usePaletteFilters` from `BrowserPlugin.tags` |

## What changes vs today

- New `CategoryRail` component (52px persistent column)
- `ToolPalette` becomes a two-column flex layout
- `PluginList` receives sub-dividers when a category filter is active
- Panel width increases from 260 to 280 (`LEFT_W` constant)

## Implementation cost

**Medium.** Requires a new `CategoryRail` component and a layout restructure of `ToolPalette`. The sub-divider grouping in `PluginList` is additive. The 280px width change needs `AppShell` constant updated and verified against narrow viewport breakpoints.
