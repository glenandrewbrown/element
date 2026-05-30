# Taxonomy Records Schema — FROZEN

> **Status: FROZEN** — Wave F, 2026-05-30. No new fields may be added without going through the orchestrator.
> Component tasks (G-12/G-17/G-20/etc.) consume catConfig as **read-only**.

## Canonical location

`webview/src/components/canvas/Block.tsx` — `export const catConfig`

```typescript
export const catConfig: Record<
  BlockCategory,
  { hex: string; bg: string; shape: string; glowClass: string; label: string }
>
```

## Final field set (5 fields × 4 categories)

| Field | Type | Purpose | Added |
|-------|------|---------|-------|
| `hex` | `string` | Raw hex colour (`#RRGGBB`) for inline style / canvas use | Wave 2 |
| `bg` | `string` | Tailwind `bg-[...]` class for background utility | Wave 2 |
| `shape` | `string` | Tailwind classes rendering the category shape dot indicator | Wave 2 |
| `glowClass` | `string` | CSS class name (`glow-blue` etc.) for active micro-glow | Wave 2 |
| `label` | `string` | Human-readable display name for tree rows + filter tabs | Wave F |

## Exhaustive entries (4 of 4 — required for TypeScript exhaustiveness)

| Category key | hex | label |
|---|---|---|
| `instrument` | `#4A90D9` | "Virtual Instrument" |
| `audiofx` | `#E8A838` | "Audio Effect" |
| `midifx` | `#2BC4C4` | "MIDI Effect" |
| `modulator` | `#A87FE0` | "Modulator / Utility" |

All 4 entries have all 5 fields populated. TypeScript `Record<BlockCategory, …>` enforces exhaustiveness at compile time.

## Rationale for `label` addition

- **G-12 SessionTree** requires a human-readable category label per tree row ("component type" display per the redesign brief). Using the raw enum value (`audiofx`, `midifx`) is not user-facing.
- **G-17 ToolPalette** requires category filter tab labels. Same need.
- Added ONCE to the canonical config rather than each task adding its own local map. Downstream tasks **import catConfig** from `Block.tsx`; do NOT create new local `Record<BlockCategory, …>` objects.

## What was NOT added (and why)

| Considered field | Verdict |
|---|---|
| `description: string` (tooltip copy) | Not provably needed by G-12/G-17 at this wave — deferred |
| `iconGlyph: string` (●▲◆⬡) | QuickAddPopup already has local `CAT_ICON` React components; G-12/17 can derive from shape token; deferred |
| `shortLabel: string` | Can be derived from `label` at the consumer; not a separate source of truth |

## Fragmented consumer sites (do NOT consolidate this wave)

The following components maintain their **own local** `Record<BlockCategory, …>` duplicating hex/bg/dot info. Each component task MAY migrate to importing `catConfig` if it touches that file, but is NOT required to — that is clean-up scope for a later wave.

| File | Local map | Fields duplicated |
|---|---|---|
| `QuickAddPopup.tsx:75` | `CAT_ICON` | React icon components per category |
| `InspectorHub.tsx:198` | `colorClass` | Tailwind border-colour classes |
| `QuickAccess.tsx:9` | `categoryDot` | Tailwind bg-colour classes |
| `ConnectionEditor.tsx` | `CATEGORY_DOT` | Tailwind bg-colour classes |

## Import path for downstream tasks

```typescript
import { catConfig } from "../../components/canvas/Block";
// or adjust relative path per consumer location
```

## Verification

`cd webview && npx tsc -b` — exit 0 confirms the `Record<BlockCategory, …>` type is exhaustive with all 4 entries present.
