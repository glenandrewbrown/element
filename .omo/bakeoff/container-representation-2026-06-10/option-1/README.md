# Container Block — Option 1: Mini-Graph Thumbnail

## Concept

The container block shows a scaled-down snapshot of its internal graph inside a pressed-inset region. Mini pill-nodes are coloured by category; mini cables connect them as curved SVG paths. Below a complexity threshold (~6 nodes) it renders actual topology. Above the threshold it falls back to a category-coloured density bar — a visual sparkline of block complexity by category.

## States

| State | Thumbnail content |
|-------|------------------|
| ≤ 6 blocks | Mini topology: pill-nodes + curved cables |
| > 6 blocks | Density bar: coloured flex-divs proportional to CPU per block |
| Hover | Mini-nodes and cables brighten; "double-click to enter" hint appears |
| Compact (zoom < 0.55) | Thumbnail hidden; block collapses to title-only tier |

## Dimensions

- Block width: 240–260px (wider than standard to accommodate thumbnail)
- Thumbnail height: 96px (simple) / 80px (complex / density bar)
- Total block height: ~200px at macro tier (vs ~100px for a normal 4-port block)

## Data requirements

| Field | Source | Status |
|-------|--------|--------|
| Block count | `BlockData.containerNodeCount` | Already exists |
| Category per block | Container's block list from graph store | Needs traversal |
| Cable topology | Container's cable list from graph store | Needs traversal |
| CPU per block | `BlockData.cpuLoad` per child | Already exists |

## Implementation cost

**Moderate.** The thumbnail is a static SVG generated once on container save (not live React Flow). Two modes:
1. **Topology mode** (≤ 6 nodes): client-side layout of mini pill-nodes + bezier curves. Requires reading the container's internal block list and cable list — one extra host endpoint or a client-side graph traversal.
2. **Density mode** (> 6 nodes): purely from `containerNodeCount` + category distribution. Trivial to implement.

Key risk: keeping the static snapshot in sync with the container's actual contents. Recommended approach: regenerate the thumbnail any time `containerNodeCount` changes or the user exits the container after editing. Cache as a string on `BlockData`.

## Trade-offs

**Pro:**
- Spatial identity — topology shape is visually unique per container
- Communicates internal complexity without diving in
- "What's inside" is answerable without double-clicking

**Con:**
- +96px block height — large footprint on the canvas
- Moderate implementation risk (SVG snapshot generation + cache invalidation)
- Thumbnail can be stale if the container is modified and the snapshot is not regenerated

## Recommendation

Best for power users with many containers who need to distinguish them visually. If Glen regularly has 5+ containers on a board, the spatial identity payoff justifies the height cost. If containers are rare (1–2 per board), Option 2 is sufficient.
