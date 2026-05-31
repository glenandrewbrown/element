# UI Bug Root-Cause Categories

**Companion to** [ui-bug-master-list.md](./ui-bug-master-list.md).
**Date:** 2026-05-08
**HEAD:** `a3502dda`
**Total bugs:** 73 across 9 root-cause clusters; 12 P0, 21 P1, 38 P2, 1 P3.

Glen's brief was "about 50 broken things"; we found 73. The single largest cluster (C-1+C-2+C-3,
the engine-state pipe) accounts for ~13 bugs and unblocks the remaining ones in §1 once fixed.

---

## C-1 Engine snapshot missing CPU

- **Affected fields:** D-1 StatusBar CPU, D-23 onMetering aliasing, D-10 / D-11
  InspectorHub TOTAL CPU / HOST CPU, partial root for D-2 engine-running indicator
- **Root cause:** No `engine.cpu` property is set in `buildActiveGraphJson()` at
  `src/ui/element_webview_host.cpp:4017-4029`. The C++ side already has the value
  (`devices.getCpuUsage() * 100.f` is used by the legacy footer at `src/ui/content.cpp:314`); it
  simply never crosses the bridge. The React side then FAKES CPU as `peak * 320` from the
  metering callback (`webview/src/hooks/useJuceBridge.ts:411`).
- **Fix path:** Either (a) add `engine->setProperty ("cpu", devices.getCpuUsage() * 100.0)` on the
  existing 60 Hz snapshot path, or (b) add a dedicated `elementGetEngineSnapshot` Identifier in
  `element_webview_host.cpp` polled by React at 30 Hz, or (c) extend `onMetering` to additionally
  carry CPU. Option (a) is the smallest diff. After landing, delete the `peak * 320` line and add
  a `useEngineSnapshotStore` (or fold the new field into `usePerformStore.liveHealth.cpu`).
- **Estimated fix:** 30-45 min including unit test on the JSON shape.
- **Touched files:** `src/ui/element_webview_host.cpp` (snapshot builder),
  `webview/src/hooks/useJuceBridge.ts` (delete fake CPU + thread real CPU through hydrateFromEngine),
  `webview/src/components/layout/StatusBar.tsx` (verify cpu read),
  `webview/src/components/layout/InspectorHub.tsx` (PROJECT OVERVIEW tile).

## C-2 Engine block omitted on empty graphs

- **Affected fields:** D-3 device name, D-4 sample rate, D-5 buffer, D-6 latency, D-12
  Inspector tile group, D-14 transport play state mirror on empty session, D-17 record state
- **Root cause:** `buildActiveGraphJson` early-returns at `element_webview_host.cpp:4005`
  whenever `! gn.isGraph()` (no active graph). The early-return path writes `canvas` and
  `activeGraphOutline` but skips the `engine` block entirely (it lives at lines 4017-4029, AFTER
  the return). A fresh "Untitled Session: Graph" hits this path, so all engine-derived fields
  arrive at React as `undefined` and the store keeps its `"—"`/`0` defaults.
- **Fix path:** Hoist the engine DynamicObject construction to BEFORE the
  `if (! gn.isGraph())` block, or duplicate the engine block inside the early-return branch. The
  engine block does not depend on `Graph G` — it only needs `context.audio()` and
  `context.devices()`. Additionally, `engine->setProperty ("isPlaying", ...)` should be set even
  when no transport monitor exists, defaulting `false`.
- **Estimated fix:** 15-30 min plus a regression test that reads engine state from an empty
  session.
- **Touched files:** `src/ui/element_webview_host.cpp` (single hoist), no React changes
  required (`useJuceBridge.ts:282-306` already reads optional engine fields safely).

## C-3 `engineRunning` derived from CPU

- **Affected fields:** D-2 RUNNING/STOPPED indicator, V-7 semantic mismatch
- **Root cause:** `webview/src/components/layout/StatusBar.tsx:19` computes
  `const engineRunning = cpuPercent > 0;`. Because `cpuPercent` is the FAKE CPU (peak meter
  amplitude × 320), the running indicator mirrors audio-meter activity, not engine state. Even
  after C-1+C-2 land, this line will keep using the wrong source unless rewritten.
- **Fix path:** Read `engine.isPlaying` (already piped on non-empty graphs) and a new
  `engine.isRunning` flag (sourced from `AudioEngine::isRunning()` C++ side) directly. Keep CPU
  for its own row only.
- **Estimated fix:** 20 min once C-1/C-2 land.
- **Touched files:** `webview/src/stores/usePerformStore.ts` (add `isRunning` to LiveHealth),
  `webview/src/components/layout/StatusBar.tsx:19`,
  `src/ui/element_webview_host.cpp` (one extra `engine->setProperty ("isRunning", ...)`).

## C-4 Toolbar dead-button cluster

- **Affected affordances:** M-13 TAP tempo, M-14 Undo button, M-15 Redo button, M-16 Record button
- **Root cause:** Four buttons render in `webview/src/components/layout/Toolbar.tsx` (lines 206,
  209, 293, plus the missing Record at the same band) WITHOUT `onClick` handlers. The bridge
  functions exist for all four (`elementUndo`, `elementRedo`, `elementTransportSetTempo` for tap,
  `elementTransportSetRecording`); only the wiring is missing. Tap-tempo also needs a small
  rolling-buffer helper.
- **Fix path:** Add 3 trivial `onClick` calls + 1 small `useTapTempo` hook (rolling timestamp
  buffer, 5-tap window, BPM = 60000 / median-interval). Add Record button to the toolbar pill row.
- **Estimated fix:** 30-45 min including TAP helper.
- **Touched files:** `webview/src/components/layout/Toolbar.tsx`,
  optional `webview/src/hooks/useTapTempo.ts` (new).

## C-5 Scene state divergence (two parallel stores)

- **Affected affordances:** V-2 prev/next scene from toolbar (cycle-1 SC-4 / F-201)
- **Root cause:** Toolbar `< / >` buttons (`Toolbar.tsx:65-66, 360-379`) call
  `useAppStore.setScene(idx)` which only mutates client state. The actual bridge call lives in
  `usePerformStore.setActiveScene` which calls `nativePerformSetActiveScene`. Two parallel
  scene-state systems = SCENE label increments visually but parameter snapshot is never restored.
- **Fix path:** Collapse `useAppStore.activeScene` and `usePerformStore.activeSceneIndex` into a
  single bridge-aware selector. Toolbar prev/next should use `usePerformStore.activateScene` (which
  already calls the bridge).
- **Estimated fix:** 1-2 hours (careful — touches store contracts).
- **Touched files:** `webview/src/stores/useAppStore.ts` (deprecate `activeScene` field or proxy
  it to perform store), `webview/src/components/layout/Toolbar.tsx:360-379`, all consumers of
  `useAppStore.activeScene`.

## C-6 Plugin browser fakery & missing CRUD

- **Affected affordances:** V-1 fake demo plugins, M-18 format filter, M-19 drag-from-palette,
  M-20 favourite right-click, M-21 format badge, partial M-32 dashboard composability
- **Root cause:** `webview/src/components/layout/ToolPalette.tsx:155` falls through to a hardcoded
  array of 4 fake plugins when `nativePlugins.length === 0`; clicking these will fail because IDs
  don't match real bridge identifiers. Additionally, no `elementSetPluginFavorite` bridge fn
  exists, no HTML5 `draggable` on plugin rows, no `onContextMenu` for favourite toggle.
- **Fix path:** Delete `pluginsDemoFallback`; render an empty-state card with a link to
  Preferences > Scan. Add `elementSetPluginFavorite` bridge fn + star-button UI. Add HTML5 dnd
  on plugin rows + `<ReactFlow onDrop>`.
- **Estimated fix:** 4-6 hours total (the bridge fn + dnd are independent ~1.5 hr stories).
- **Touched files:** `webview/src/components/layout/ToolPalette.tsx`,
  `webview/src/bridge/nativeGraph.ts` (add wrapper),
  `src/ui/element_webview_host.cpp` (new Identifier `elementSetPluginFavorite`),
  `webview/src/components/canvas/GraphCanvas.tsx` (onDrop).

## C-7 Canvas double-click gap

- **Affected affordances:** M-22 plugin GUI on block double-click (cycle-1 B-12 / F-105)
- **Root cause:** `GraphCanvas.tsx:196-204` only handles Container/Portal blocks
  (`containerNodeCount != null || isPortal`); for ordinary plugin Blocks it does NOTHING. Spec
  (Blueprint §10.1, CLAUDE.md): "Double-click Block: Dive into nested Board OR open embedded
  plugin GUI if not a container."
- **Fix path:** Add `else { nativePluginEditorOpen(node.id); }` branch.
- **Estimated fix:** 15 min.
- **Touched files:** `webview/src/components/canvas/GraphCanvas.tsx` (single else-branch).

## C-8 Native menu strip (File/Edit/View menus emptied for WebContent)

- **Affected affordances:** M-1 New Session, M-2 Save / Save As, M-3 Import / Export, M-4 Edit
  menu items, M-5 entire View menu, M-33 audio device chooser shortcuts, M-34 SR/buffer quick
  pickers, M-35 Rotate / Session Properties
- **Root cause:** Per the parity matrix: "When `WebContent` active: thinner File/Edit/View to
  reduce duplication with Toolbar/bridge". The trim went too far — even fundamental items like
  `New Session` (Cmd+N) and the entire `View` menu (Plugin Manager, Channel Strip, Patch Bay,
  Meter Bridge, Console, Key Mappings) are gone with no React replacement. Result: discoverability
  collapse on the WebContent side.
- **Fix path:** Restore File/Edit/View menu items in WebContent mode (they can call into the same
  bridge functions / Cmd+K palette actions). Long-term: port Plugin Manager / Channel Strip /
  Patch Bay / Meter Bridge to React (Tag-C in parity matrix).
- **Estimated fix:** Menu restoration: 1-2 hours. Full React port of native-only views: weeks.
- **Touched files:** `src/ui/mainmenu.cpp`, `src/ui/element_webview_host.cpp` (menu predicate),
  long-term various `webview/src/components/**`.

## C-9 Spec-mode keyboard gaps

- **Affected affordances:** M-25 Cmd+T, M-26 Space, M-27 Cmd+N, M-28 Cmd+A
- **Root cause:** Four shortcuts called for in CLAUDE.md / blueprint §11.2 are absent from
  `webview/src/hooks/useKeyboard.ts`.
- **Fix path:** Add four `case` branches to the existing keyboard-handler switch.
- **Estimated fix:** 30 min total.
- **Touched files:** `webview/src/hooks/useKeyboard.ts`.

---

## Recommended ralph story sequencing

| Order | Story | Clusters | Effort | Bugs cleared |
|------:|-------|----------|--------|--------------|
| 1 | "C-2 hoist engine block above empty-graph early return" | C-2 | 30 min | 7 (D-3..D-6, D-12, D-14, D-17) |
| 2 | "C-1 add real CPU to engine snapshot + delete peak*320" | C-1 | 45 min | 4 (D-1, D-10, D-11, D-23) + assists C-3 |
| 3 | "C-3 read engine.isRunning + isPlaying directly in StatusBar" | C-3 | 20 min | 2 (D-2, V-7) |
| 4 | "C-4 wire toolbar dead buttons (TAP/Undo/Redo/Record)" | C-4 | 45 min | 4 (M-13..M-16) |
| 5 | "C-5 collapse scene state into single store" | C-5 | 1.5 hr | 1 (V-2) but unblocks scene UX |
| 6 | "C-6a delete plugin demo fallback" | C-6 | 30 min | 1 (V-1) |
| 7 | "C-7 add plugin-GUI open on block double-click" | C-7 | 15 min | 1 (M-22) |
| 8 | "C-9 add 4 keyboard shortcuts" | C-9 | 30 min | 4 (M-25..M-28) |
| 9 | "C-6b favourite CRUD + drag from palette" | C-6 | 4-6 hr | 4 (M-18, M-19, M-20, M-21) |
| 10 | "C-8 restore File/Edit/View menu items for WebContent" | C-8 | 1-2 hr | 8+ (M-1..M-5, M-33..M-35) |

Stories 1-8 fit in roughly 5-6 hours and clear ~24 of the 73 bugs (including all 12 P0s plus 12
P1s). Story 10 (menu restoration) is independent and high-leverage. Stories 9 + the long-tail of
P2s belong in a Wave-2 polish pass.
