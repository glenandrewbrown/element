<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# canvas/ — graph editing surface

React Flow (v12 / @xyflow/react) canvas components. `GraphCanvas.tsx` owns the
`<ReactFlow>` instance, gesture-scoped `will-change` promote/demote, and the
`autoRouteSuggestions` ghost-connector overlay. `Block.tsx` is the custom node
renderer (lean layout, param-visibility config, hostColor header tint).
`Cable.tsx` is the custom edge renderer with flow-debug chip overlay.
Everything else is contextual UI (menus, popups, comments, script editor).

## Key Files

| File | Description |
|------|-------------|
| `GraphCanvas.tsx` | `<ReactFlow>` host. Promotes `.react-flow__viewport` to composited layer ONLY during pan/zoom gestures via pointer/wheel handlers; demotes on gesture-end to force re-raster (prevents WKWebView bitmap-stretch blur at zoom). Do NOT add static `will-change: transform`. |
| `Block.tsx` | Custom node. Lean layout — no generic GAIN/PAN/MIX/FREQ/Q knobs. Header tinted by `hostColor` override (category default unless overridden). Right-click → Configure Parameters → `ParamConfigPopover` for per-block param visibility. |
| `Cable.tsx` | Custom edge. Renders flow-debug chip when `flowDebug` (useAppStore) is true. Exports pure helpers: `chipActive(signalType, amp, cvValue)` → boolean; `chipText(signalType, amp, cvValue)` → string (audio → dBFS, value/CV → signed 2dp, MIDI → activity dot, idle → "—"). |
| `autoRouteSuggestions.ts` | Ghost-connector proximity logic — suggests cable routes based on port nearness. Pure computation, no React. |
| `GhostEdge.tsx` | Animated ghost edge rendered during auto-route suggestion hover. |
| `QuickAddPopup.tsx` | Right-click-canvas inline search → insert Block at cursor. |
| `CommandPalette.tsx` | `Cmd+K` overlay — searches all Blocks, actions. |
| `ParamConfigPopover.tsx` | Per-block param visibility configuration (right-click → Configure Parameters). State persisted via native bridge. |
| `BlockEmbed.tsx` | Embedded plugin editor mirror panel inside the Block chrome. |
| `CommentFrame.tsx` | Visual grouping frame (colour-coded annotation boxes). |
| `NestedChrome.tsx` | Container dive UI — breadcrumb chrome for nested Boards. |
| `depthTokens.ts` | Z-index / depth token constants for canvas layering. |
| `ScriptEditor.tsx` | Lua script editor embedded in Script Blocks. |
| `NodeContextMenu.tsx` / `EdgeContextMenu.tsx` / `CanvasContextMenu.tsx` | Right-click context menus for nodes, edges, empty canvas. |
| `_ReviewBlock.stories.tsx` / `_ReviewQuickAdd.stories.tsx` | Guided side-by-side review stories (Chromatic UI review workflow). |

## For AI Agents

- **will-change rule**: Read the comment block in `src/index.css` before touching
  `GraphCanvas.tsx` compositing. Permanent `will-change` causes WKWebView blur —
  promote only during gesture, demote on end.
- **NOTHING-fake**: Block VU meters and BlockEmbed must show real engine data
  (from `useCableMeterStore` / `useNodeMeterStore`). No idle placeholder levels.
- **Lean Blocks**: Do NOT restore generic GAIN/PAN/MIX/FREQ/Q knobs removed in
  commit `fe8477d5`. Per-block param visibility is configured via `ParamConfigPopover`.
- **Cable chip helpers are exported pure functions** — test them directly in
  `__tests__/Cable.test.ts` without mounting the component.
- Test command: `npx vitest run --dir src/components/canvas`
- Story render-gate: `npm run verify-stories` (2 known pre-existing fails elsewhere;
  do not add new failures).

## Dependencies

- Internal: `src/stores/useGraphStore`, `useCableMeterStore`, `useAppStore`,
  `useNodeMeterStore`, `useParameterStore`; `src/bridge/nativeGraph`, `nativePluginEditor`
- External: `@xyflow/react` 12, `framer-motion` 12, `lucide-react` (via Icon allowlist)
