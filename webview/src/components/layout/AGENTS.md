<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# layout/ — shell, toolbar, and panels

Application shell and all panel/overlay components that frame the canvas.
`AppShell.tsx` is the outermost layout container. `Toolbar.tsx` owns the top
bar including the FLOW debug toggle. Panels (InspectorHub, BottomStrip,
ToolPalette, LiveHealth, SessionTree, SnippetShelf, etc.) slot into AppShell's
panel regions. Several shelved components (DashboardBuilder, MacroDashboard,
SceneLauncher) exist here but must NOT be wired into navigation.

## Key Files

| File | Description |
|------|-------------|
| `AppShell.tsx` | Outermost layout — positions Toolbar, ToolPalette, canvas, InspectorHub, BottomStrip |
| `Toolbar.tsx` | Top bar: breadcrumb, zoom controls, snap toggle, FLOW toggle (flow-debug, keyboard `D`), mode indicators. FLOW button reads/writes `useAppStore.flowDebug` |
| `ToolPalette.tsx` | Left icon-strip tool palette |
| `InspectorHub.tsx` | Right panel — tabbed node + graph property inspector (auto-activates on selection) |
| `BottomStrip.tsx` | Bottom status/transport strip |
| `LiveHealth.tsx` | Real-time engine health indicators (CPU, buffer, drop count) — must show live data |
| `StatusBar.tsx` | Thin status line (current project path, engine state) |
| `Breadcrumb.tsx` | Board navigation breadcrumb (dive path) |
| `SessionTree.tsx` | Project/session tree browser panel |
| `SnippetShelf.tsx` | Snippet (reusable block group) browser |
| `BusInspector.tsx` | Audio bus routing inspector |
| `ConnectionEditor.tsx` | Cable/port connection detail editor |
| `BlockTabStrip.tsx` | Tab strip for multi-block inspector views |
| `InstanceSwitcher.tsx` | Switcher for multiple Element plugin instances in one DAW session |
| `MirrorPanel.tsx` | Embedded plugin editor mirror — reflects native plugin window into webview chrome |
| `PreferencesModal.tsx` | Preferences/settings modal |
| `AboutModal.tsx` | About dialog |
| `NeuPromptModal.tsx` | Neumorphic modal wrapper for confirm/prompt dialogs |
| `QuickAccess.tsx` | Quick-access favourites / recently used plugins panel |
| `VirtualKeyboard.tsx` | On-screen MIDI keyboard |
| **SHELVED — do not wire into nav** | |
| `DashboardBuilder.tsx` | Dashboard builder (shelved D3 2026-05-30) |
| `MacroDashboard.tsx` | Macro dashboard (shelved D3 2026-05-30) |
| `SceneLauncher.tsx` | Scene launcher (shelved D3 2026-05-30) |

## For AI Agents

- `flowDebug` is a **session-only** toggle in `useAppStore` (not persisted). The
  Toolbar FLOW button (keyboard `D`) is the only entry point.
- `LiveHealth`, `StatusBar`, and `BusInspector` must display live engine data — no
  placeholder strings. Check `useEngineSnapshotStore` / bridge for data sources.
- Shelved components (DashboardBuilder / MacroDashboard / SceneLauncher) have stories
  and may be rendered in Storybook for review, but must NOT appear in AppShell routing
  or any navigation flow.
- Test command: `npx vitest run --dir src/components/layout`
- Story render-gate: `npm run verify-stories` — known pre-existing fail:
  `layout-bottomstrip--edit-tempo`.

## Dependencies

- Internal: `src/stores/useAppStore`, `useGraphStore`, `useSessionStore`,
  `useEngineSnapshotStore`, `useInstancesStore`; `src/bridge/nativeApp`,
  `nativeSession`, `nativePerform`
- External: React 19, framer-motion 12, lucide-react (Icon allowlist)
