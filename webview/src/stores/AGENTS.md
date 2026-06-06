<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# stores/ — Zustand 5 state stores

All client-side state lives here as Zustand 5 stores. The host pushes JSON
snapshots at ~60 Hz via the bridge; stores receive and normalise them. Stores
are the single source of truth for UI — components never call bridge functions
directly for reads.

## CRITICAL: Zustand v5 useShallow gotcha

Derived selectors that return **arrays or objects** MUST be wrapped with
`useShallow` from `zustand/react/shallow`:

```ts
import { useShallow } from "zustand/react/shallow";
const nodes = useGraphStore(useShallow((s) => s.nodes));
```

Without `useShallow`, the selector returns a new reference every render
regardless of content equality → infinite mount loop. This was the root cause
of the blank-webview bug. Primitive selectors (`string`, `number`, `boolean`)
are safe without `useShallow`.

## Store inventory

| File | Purpose |
|------|---------|
| `useAppStore.ts` | Global app state: edit/perform mode, `flowDebug` (session-only FLOW toggle, keyboard `D`), modal visibility, sidebar panel |
| `useGraphStore.ts` | React Flow node/edge state for the active Board; synced from `nativeEngineSnapshot` |
| `useSessionStore.ts` | Project/session tree, active graph id |
| `usePerformStore.ts` | Perform-mode state (scene triggers, panic, transport) |
| `useCableMeterStore.ts` | 60Hz cable level + CV value records. Uses epsilon-diff (`LEVEL_EPSILON`) to avoid reference churn: only updates `levels`/`values` Records when a value changes by more than epsilon. Pair all derived selectors with `useShallow`. |
| `useNodeMeterStore.ts` | Per-node output level meters (RMS/peak) |
| `useNodeChannelMeterStore.ts` | Per-channel metering within a node |
| `useParameterStore.ts` | Live parameter values for selected Block |
| `usePluginBrowserStore.ts` | Plugin browser filter/search/scroll state |
| `usePluginScanStore.ts` | Plugin scan progress and results |
| `useEngineSnapshotStore.ts` | Engine status snapshot (CPU, latency, buffer size, drop count) |
| `useHostExtrasStore.ts` | DAW host extras (tempo, time-sig, transport position from host) |
| `useInstancesStore.ts` | Multi-instance registry (U11) — Element PluginProcessors in same DAW process |
| `useBusStore.ts` | Audio bus routing state |
| `useDashboardStore.ts` | Dashboard store (shelved — store intact, UI unwired per D3 2026-05-30) |
| `useSandboxCrashStore.ts` | Sandbox worker crash notifications / recovery state |

## For AI Agents

- **NOTHING-fake**: stores must be populated from real bridge snapshots in the
  shipped app. Demo/mock initialisers are acceptable only for Storybook stories.
- **60Hz meter stores** (`useCableMeterStore`, `useNodeMeterStore`): wrap ALL
  derived array/object selectors with `useShallow` or in quantised primitive
  selectors — the epsilon-diff keeps the Record reference stable, but individual
  cable selectors must still guard against object-identity churn.
- `flowDebug` in `useAppStore` is NOT persisted — it resets on page reload. The
  FLOW button in Toolbar and keyboard `D` are the only entry points.
- `useDashboardStore` is intentionally not wired to nav — do not add routes to it.
- Test command: `npx vitest run --dir src/stores`

## Dependencies

- Internal: `src/bridge/` (all native modules), `src/events.ts`
- External: Zustand 5, `zustand/react/shallow`
