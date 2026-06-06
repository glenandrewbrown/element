<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# hooks/ — React hooks

Custom hooks that wire global keyboard shortcuts and the JUCE bridge event
stream into React state. Components consume these hooks rather than reaching
into `window.__JUCE__` or adding raw `keydown` listeners.

## Key Files

| File | Description |
|------|-------------|
| `useKeyboard.ts` | Global keydown listener. Handles: `Cmd+K` (CommandPalette), `Escape` (deselect / close / back out one level), `d` / `D` (toggle `flowDebug` via `useAppStore.toggleFlowDebug`), `Cmd+0-9` / spatial bookmarks, `Tab` (next block in signal chain), `Delete`/`Backspace` (delete selected), and all other shortcuts documented in `CLAUDE.md §Keyboard Shortcuts`. |
| `useJuceBridge.ts` | Subscribes to native bridge events (e.g. `cable_levels`, `engine_snapshot`, `graph_update`). Dispatches payloads into the appropriate stores. This is the only place bridge event subscriptions should be set up. |
| `useBlockNodeLevelBallistic.ts` | Per-block ballistic level decay hook — smooths raw meter values from `useNodeMeterStore` for display. |
| `useNodeSpectrum.ts` | Per-node spectrum data hook — bridges `nativeNodeSpectrum` events into a consumable React state shape. |

## For AI Agents

- `useKeyboard` is mounted once at `App.tsx` level — do not mount it again in
  child components.
- The `d` key binding (flow-debug toggle) goes through `useKeyboard` →
  `useAppStore.toggleFlowDebug`. The Toolbar FLOW button is the visual indicator.
  Do not add a second `keydown` listener for `d` anywhere else.
- `useJuceBridge` must remain the single subscription point for all bridge events.
  Components read data from stores, not directly from bridge callbacks.
- Test command: `npx vitest run --dir src/hooks`

## Dependencies

- Internal: `src/stores/useAppStore`, `useGraphStore`, `useCableMeterStore`,
  `useEngineSnapshotStore`, `useNodeMeterStore`, `useNodeChannelMeterStore`;
  `src/bridge/` (nativeGraph, nativeEngineSnapshot, nativeNodeSpectrum)
- External: React 19
