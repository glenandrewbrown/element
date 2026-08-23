# Container Block — Option 2: Count Badges + IO Summary

## Concept

Three compact zones added below the block header — no thumbnail. Zone 1: category composition chips (one per category present, count + ●▲◆⬡ glyph). Zone 2: signal IO summary bar (input/output signal types and counts in a pressed-inset row). Zone 3: action row (Enter button primary, Edit secondary). The block stays close to normal block height.

A compact tier at low zoom collapses to category-colour dots + a minimal IO string — no text labels.

Portal variant: same zones, with a linked filename shown in the composition row and a teal accent border.

## States

| State | Body content |
|-------|-------------|
| Normal | Cat chips + IO summary + action row + ports |
| Hover | No change (action row buttons highlight) |
| Compact (zoom < 0.55) | 1 dot per block (colour-coded) + "2↓ · 2↑" IO string |
| Portal | Same + teal border + filename link in composition row |
| Error | Red shadow on block shell (same as normal block error state) |

## Dimensions

- Block width: 220px (same footprint as a wide normal block)
- Zone 1 (cat chips): 34px
- Zone 2 (IO summary): 28px
- Zone 3 (action row): 30px
- Total additional height vs normal block: ~40–50px

## Data requirements

| Field | Source | Status |
|-------|--------|--------|
| Block count | `BlockData.containerNodeCount` | Already exists |
| Category breakdown (N per category) | Derived from container's block list | Small addition needed |
| IO signal types + counts | Container's port list (already in `BlockData.ports`) | Already exists |
| Portal filename | `BlockData.isPortal` + portal path | `isPortal` exists; path field may need adding |

## Implementation cost

**Low.** No SVG generation. No snapshot logic. Category chips derive from the container's block list (one pass). IO summary reads `BlockData.ports` (already present). Action row is two `NeuButton` instances.

The category breakdown (how many VI / MIDI / FX / Mod inside) needs either:
- A new `containerCategoryBreakdown: Record<BlockCategory, number>` field on `BlockData`, populated host-side alongside `containerNodeCount`, OR
- A client-side derivation from the container's child block list in the graph store

The client-side approach avoids a host-side change but requires a graph store traversal on every render. Recommended: add the host-side field — it is a trivial addition to the graph snapshot serialiser.

## Trade-offs

**Pro:**
- Near-zero implementation risk
- Always accurate — live data, no staleness
- Compact footprint — does not disrupt canvas layout
- Scales identically to Portal variant (just swap badge text + border colour)
- Compact tier (dots) works at all zoom levels without special logic

**Con:**
- No spatial identity — two containers with identical composition look the same
- Does not communicate internal wiring topology
- The "Enter" button duplicates the double-click gesture — could be removed to save space if the double-click affordance is clearly communicated elsewhere

## Recommendation

Best default choice. Low cost, always correct, compact. If Glen later wants spatial identity for containers, Option 1 can be added as a toggle (a "show thumbnail" setting per-container). Start with Option 2; Option 1 is an upgrade path, not a prerequisite.
