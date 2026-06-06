<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# lib/ — utility helpers

Pure utility modules with no React dependencies. Two focused helpers: a graph
auto-layout algorithm and a dynamic neumorphic shadow generator.

## Key Files

| File | Description |
|------|-------------|
| `autoLayout.ts` | Deterministic layered (Sugiyama-lite) left-to-right layout for the active Board. Reads real node/edge data from `useGraphStore` and computes positions. Called from Toolbar's auto-layout action. No side effects — returns a position map; caller applies it via store action. |
| `neu.ts` | `neu(opts)` → `{ boxShadow, background }`. Computes neumorphic raised/pressed/inset shadow pairs from a base surface colour and distance parameter. Used by `neu/` primitives and any component needing dynamic shadow values. Also exports `neuRaised` and `neuPressed` convenience presets. |

## For AI Agents

- `neu()` is the authoritative shadow computation — do not hand-roll `box-shadow`
  strings in components. For static surfaces, prefer the CSS utilities in
  `src/index.css` (`.neu-raised`, `.neu-pressed`).
- `autoLayout` operates on real graph data only — never pass demo fixtures to it.
- Test command: `npx vitest run --dir src/lib`

## Dependencies

- Internal: `src/stores/useGraphStore` (autoLayout only)
- External: none
