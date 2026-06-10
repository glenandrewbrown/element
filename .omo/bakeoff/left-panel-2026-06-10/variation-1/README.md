# Variation 1 — Search-Command

**One surface. Search is the only entry point.**

## Concept

The browser is a command-style interface: open it, type something, hit enter. No categories to think about upfront. Every plugin in one virtualized list. Facets (category / ★ / ⏱) are toggle chips that filter the same list — not separate sections stacked above the fold.

## Key decisions

| Decision | Rationale |
|----------|-----------|
| Facets as chips, not stacked sections | Removes Favourites + Recents from above the fold. Primary surface is immediately visible. Matches the brief's "search-first" IA [R-§E]. |
| Single scroll region | `PluginList` owns the only `overflow-y-auto`. No nested-scroll fight. |
| ●▲◆⬡ glyph in every row | Browser and canvas speak the same language. Colour-blind users read shape. |
| ⠿ drag handle on hover only | Rows are clean at rest. Drag affordance appears only when the user is about to act. |
| 40px icon rail when collapsed | Search icon = one-click expand+focus. Category glyph = expand+pre-filter. Never a blank strip. |

## Dimensions

- Panel: 260px × (fills parent)
- Row height: 34px
- Header: ~76px fixed
- Rail: 40px

## Component mapping

| UI zone | Existing component |
|---------|-------------------|
| Panel shell | `ToolPalette` |
| Search field | `PaletteSearch` |
| Facet chips | `FacetChips` (Fav/Recent already present as data) |
| Plugin rows | `PluginList` + `PluginCard` (list variant) |
| Snippets disclosure | `MoleculesSection` |
| Boards disclosure | `BoardsSection` |
| Collapsed rail | Unify on `ToolPalette` collapsed branch; delete `AppShell.CollapsedRail` |

## What changes vs today

- Facets/Recents stop being above-fold stacked sections — become chips
- `ToolPalette` body scroll removed; `PluginList` is the sole scroll owner
- Rail unified (one component, not two)
- `Cmd+F` search focus: replace brittle DOM query with `focusBrowserSearch` nonce in `useAppStore`

## Implementation cost

**Low.** Data structures unchanged. UI changes are layout only. Biggest risk: the scroll ownership change — must verify `PluginList` flex-1 correctly fills available space after removing the outer scroll.
