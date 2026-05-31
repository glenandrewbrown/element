# Element Web-Shell Coverage Manifest

**Task:** Plan item 5 — enumerate every user-facing Web-shell surface as a re-audit checklist.
**Scope:** React WebView frontend (`webview/src/`) ONLY. Classic/native-only JUCE panels are EXCLUDED.
**Branch:** local-enhancements. **Date:** 2026-05-29.
**Method:** Static traversal of the rendered component tree (`App.tsx` → `AppShell.tsx` → panels/canvas/modals) + import/mount-site search + per-component store/bridge-call mapping. No runtime injection performed in this task; the empty audit columns are for re-audit item 11 to fill with live evidence.

This manifest is the exhaustive checklist. Item 11 (re-audit) fills the four blank columns per row: **repro steps · severity · evidence path · verdict**. Every row records the **real (non-mock) bridge data** required to exercise the surface with live data, so the re-auditor knows what to inject / what C++ must supply.

---

## 1. Rendered component tree (ground truth)

Traced from `webview/src/App.tsx` (mount root) downward. `→` = renders/mounts.

```
App (App.tsx)
└─ ReactFlowProvider
   └─ AppInner
      ├─ useKeyboard()            global shortcuts (hooks/useKeyboard.ts)
      ├─ useJuceBridge()          bridge wiring → hydrates 8 stores (hooks/useJuceBridge.ts)
      ├─ AppShell (layout/AppShell.tsx)   ── structural edit/perform switch
      │   ├─ toolbar           = <Toolbar/>                    (layout/Toolbar.tsx)
      │   ├─ [EDIT] left       = <SessionTree/> + <ToolPalette/>
      │   ├─ [EDIT] right      = <InspectorHub/>               (layout/InspectorHub.tsx)
      │   ├─ [EDIT] bottom     = <SnippetShelf/>               (layout/SnippetShelf.tsx)
      │   ├─ [PERFORM] left    = <QuickAccess/>                (layout/QuickAccess.tsx)
      │   ├─ [PERFORM] right   = <LiveHealth/>                 (layout/LiveHealth.tsx)
      │   ├─ [PERFORM] bottom  = PerformBottomPanel → tabs: <MacroDashboard/> | <DashboardBuilder/>
      │   ├─ statusBar         = <StatusBar/>                  (layout/StatusBar.tsx)
      │   ├─ [EDIT] canvas top = <Breadcrumb/> + <BlockTabStrip/>
      │   └─ children          = <GraphCanvas/> (+ <PanicButton/> in perform)  (canvas/GraphCanvas.tsx)
      ├─ <VirtualKeyboard/>   (AnimatePresence-gated by useAppStore.virtualKeyboardOpen)  (layout/VirtualKeyboard.tsx)
      └─ <CommandPalette/>    (state-gated by Cmd+K)            (canvas/CommandPalette.tsx)
```

### Nested / conditionally-mounted surfaces (not direct children of App)

| Surface | Mounted by | Evidence |
|---|---|---|
| `Toolbar` → `PreferencesModal` | `Toolbar.tsx:594` (gear icon / `EV_OPEN_PREFERENCES`) | grep Toolbar.tsx |
| `Toolbar` → `AboutModal` | `Toolbar.tsx:597` ("About" button) | grep Toolbar.tsx |
| `AboutModal` → `NeuPromptModal` | imports NeuPromptModal | grep |
| `InspectorHub` → `ScriptEditor` | `InspectorHub.tsx:680` (SCRIPT tab, only for Script nodes) | grep |
| `InspectorHub` → `BusInspector` | `InspectorHub.tsx:731` | grep |
| `InspectorHub` → `ConnectionEditor` | `InspectorHub.tsx:737` (CABLES tab) | grep |
| `InspectorHub` → `NeuPromptModal` | rename prompts | grep |
| `GraphCanvas` → `Block` (node type) | `nodeTypes={ block: Block }` GraphCanvas.tsx:51 | read |
| `GraphCanvas` → `CommentFrame` (node type) | `nodeTypes={ comment: CommentFrame }` GraphCanvas.tsx:51 | read |
| `GraphCanvas` → `Cable` (edge type) | `edgeTypes={ cable: Cable }` GraphCanvas.tsx:52 | read |
| `GraphCanvas` → `MiniMap` | `showMinimap && <MiniMap/>` GraphCanvas.tsx:491 | read |
| `GraphCanvas` → `QuickAddPopup` | right-click pane `contextMenu` GraphCanvas.tsx:533 | read |
| `GraphCanvas` → `NodeContextMenu` | right-click node GraphCanvas.tsx:540 | read |
| `GraphCanvas` → `EdgeContextMenu` | right-click cable GraphCanvas.tsx:548 | read |
| `GraphCanvas` → inline Rename overlay | `EV_START_RENAME` GraphCanvas.tsx:557 | read |
| `Block` → `BlockEmbed` | `Block.tsx:533` | grep |
| `MacroDashboard` → `SceneLauncher` | `MacroDashboard.tsx:206` (Scenes tab) | grep |
| `MacroDashboard` → `PanicButton` | exported `MacroDashboard.tsx:270`; also mounted in canvas (perform) | read App.tsx:105 |

---

## 2. Surface manifest (re-audit checklist)

Severity scale for item 11: **P0** blocker · **P1** high · **P2** medium · **P3** cosmetic.
"Bridge data needed (real, non-mock)" lists the C++ bridge function(s) and/or the engine-snapshot field(s) that must return live data for the surface to be exercisable. Where the prior `REACT_UI_AUDIT_2026-05-24.md` already has a finding, the relevant BUG-id is noted in the **Prior coverage** column (item 4 fold-in).

### 2A. Toolbar & global chrome

| # | Surface | Component path | Bridge data needed (real, non-mock) | Prior coverage | Repro steps | Severity | Evidence path | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | Toolbar — session file ops (New/Open/Save/As) | `components/layout/Toolbar.tsx` | `elementSessionNew/Open/Save/SaveAs`; `useSessionStore.filePath/dirty` (from `onGraphState` hydrate) | BUG-010 (fire-and-forget, no feedback); BUG-019 (native dialog) | | | | |
| 2 | Toolbar — Board (graph) selector dropdown | `components/layout/Toolbar.tsx` | `elementSessionSetActiveGraph`; `useSessionStore.graphs[]` (needs >1 graph) | BUG-027 (switch returns undefined → no switch) | | | | |
| 3 | Toolbar — Breadcrumb crumbs | `components/layout/Toolbar.tsx` + `layout/Breadcrumb.tsx` | `useGraphStore.breadcrumbs` (`selectBreadcrumbs`); driven by `pushBreadcrumb`/`popBreadcrumb` | (Verified Working: nav) | | | | |
| 4 | Toolbar — Transport (Rewind/Play/Stop/Record) | `components/layout/Toolbar.tsx` | `elementTransportRewind/TogglePlay/Stop/SetRecording`; `useEngineSnapshotStore` (`selectTransportPlaying/Recording`) at 4Hz | BUG-008 (snapshot null in dev); BUG-014 (two truth sources) | | | | |
| 5 | Toolbar — Undo / Redo | `components/layout/Toolbar.tsx` | `elementUndo` / `elementRedo` | (not in prior audit — NEW row) | | | | |
| 6 | Toolbar — BPM display + edit + TAP tempo | `components/layout/Toolbar.tsx` | `elementTransportSetTempo`; `usePerformStore.bpm` (`selectBpm`) | BUG-026 (was static — now editable per code) | | | | |
| 7 | Toolbar — Metrics (BUFFER/SAMPLE/LATENCY) | `components/layout/Toolbar.tsx` | `usePerformStore.liveHealth` (`selectLiveHealth`) from `onGraphState` | BUG-023 (em-dash until snapshot) | | | | |
| 8 | Toolbar — Edit/Perform mode toggle | `components/layout/Toolbar.tsx` | `useAppStore.mode/toggleMode` (local; no bridge) | (Verified Working: mode toggle) | | | | |
| 9 | Toolbar — Cable routing toggle (MAN/BEZ) | `components/layout/Toolbar.tsx` | `useAppStore.cableRouting` (`selectCableRouting`); local | (Verified Working: cable toggle) | | | | |
| 10 | Toolbar — Scene selector (prev/next/+/CAP) | `components/layout/Toolbar.tsx` | `useAppStore.activeScene`; `usePerformStore.scenes` (`selectScenes/selectActiveScene`); `elementPerformAddScene/CaptureScene` | (Verified Working: scene launcher) | | | | |
| 11 | Toolbar — engine LIVE/IDLE + time-sig (perform) | `components/layout/Toolbar.tsx` | `useEngineSnapshotStore` (`selectEngineRunning/selectTimeSig`) | BUG-014; BUG-025 | | | | |
| 12 | Toolbar — About button | `components/layout/Toolbar.tsx` | opens AboutModal (see #34) | BUG-009 | | | | |
| 13 | Toolbar — Preferences (gear) button | `components/layout/Toolbar.tsx` | opens PreferencesModal (see #33) | BUG-001/003 | | | | |
| 14 | Toolbar — PANIC button | `components/layout/Toolbar.tsx` | `elementTransportPanic` | (Blueprint: always-visible panic) | | | | |
| 15 | StatusBar | `components/layout/StatusBar.tsx` | `useEngineSnapshotStore` (`selectEngineRunning` + device/sr/buffer) + `usePerformStore` (`selectLiveHealth`) | BUG-024/025/028 (dev-mode placeholders) | | | | |

### 2B. Edit-mode panels

| # | Surface | Component path | Bridge data needed (real, non-mock) | Prior coverage | Repro steps | Severity | Evidence path | Verdict |
|---|---|---|---|---|---|---|---|---|
| 16 | SessionTree (left top) | `components/layout/SessionTree.tsx` | `elementSessionGetGraphTree` on mount; `useSessionStore.graphs`; `elementSessionSetActiveGraph` | BUG-006 (not called on boot) | | | | |
| 17 | ToolPalette (left bottom) | `components/layout/ToolPalette.tsx` | `usePluginBrowserStore` (`elementGetPluginList`) — needs a completed plugin scan | BUG-001/002/005 (browser always empty) | | | | |
| 18 | InspectorHub — INSPECTOR tab | `components/layout/InspectorHub.tsx` | `useGraphStore.selectedNode` (name/category/format/cpuLoad/ports); `useParameterStore` (`elementGetNodeParameters`); `elementGraphSetBypass/SetMute/SetMuteInput/SetNodeNote` | BUG-007 (params never load); BUG-012/013 (category/format inferred); Verified Working: inspector | | | | |
| 19 | InspectorHub — SCRIPT tab → ScriptEditor | `components/layout/InspectorHub.tsx` + `canvas/ScriptEditor.tsx` | `elementScriptGetSource/SetSource/Compile/GetRuntimeState`; tab only shown for Script nodes | (not in prior audit — NEW row) | | | | |
| 20 | InspectorHub — CABLES tab → ConnectionEditor | `components/layout/InspectorHub.tsx` + `layout/ConnectionEditor.tsx` | `elementGraphGetConnectionList`; `useGraphStore.edges`; `elementGraphDisconnect` | (partial — connections under Verified Working) | | | | |
| 21 | InspectorHub — LOG tab (LogPanel) | `components/layout/InspectorHub.tsx` | `useHostExtrasStore.logLines` (from `onLog` bridge push) | (not in prior audit — NEW row) | | | | |
| 22 | InspectorHub — METERS tab (MetersPanel) | `components/layout/InspectorHub.tsx` | `useCableMeterStore.levels` (from `onCableMeters` push) | (not in prior audit — NEW row) | | | | |
| 23 | InspectorHub — Graph-properties / BusInspector | `components/layout/InspectorHub.tsx` + `layout/BusInspector.tsx` | `useBusStore` (bus assignments); graph aggregate stats from `useGraphStore` | (not in prior audit — NEW row) | | | | |
| 24 | SnippetShelf (edit bottom) | `components/layout/SnippetShelf.tsx` | `useHostExtrasStore.molecules`; `elementMoleculeInsert` (load only) | BUG-017 (no save action / no create bridge) | | | | |

### 2C. Perform-mode panels

| # | Surface | Component path | Bridge data needed (real, non-mock) | Prior coverage | Repro steps | Severity | Evidence path | Verdict |
|---|---|---|---|---|---|---|---|---|
| 25 | QuickAccess (perform left) | `components/layout/QuickAccess.tsx` | `useGraphStore.nodes`; `usePerformStore` (session name / blocks on board) | (Verified Working: quick access) | | | | |
| 26 | LiveHealth (perform right) | `components/layout/LiveHealth.tsx` | `usePerformStore` (`selectLiveHealth`, `selectAlerts`) — CPU/buffer/latency/I-O | BUG-015 (latency unformatted); BUG-022 (I/O n/a) | | | | |
| 27 | MacroDashboard (perform bottom, Macros tab) | `components/layout/MacroDashboard.tsx` | `useGraphStore.nodes` (non-generator blocks); `usePerformStore.toggleMapMode`; `elementGraphSetBypass` | (Verified Working: macros area) | | | | |
| 28 | MacroDashboard — MAP MODE overlay | `components/layout/MacroDashboard.tsx` + `AppShell.tsx` map-mode banner | `usePerformStore.mapModeActive` (`selectMapMode`); `mappedParameters` (`selectMappedParameters`) | BUG-016 (MIDI/macro learn = stub) | | | | |
| 29 | SceneLauncher (Macro→Scenes tab) | `components/layout/SceneLauncher.tsx` | `usePerformStore.scenes`; `elementPerformAddScene/CaptureScene/DeleteScene/RenameScene/SetActiveScene` | (Verified Working: scene launcher) | | | | |
| 30 | DashboardBuilder (perform bottom, Dashboard tab) | `components/layout/DashboardBuilder.tsx` | `elementDashboardGetLayout/SetLayout`; `useParameterStore` + `elementGetNodeParameters/SetNodeParameter`; `useGraphStore.nodes` | (Blueprint §Dashboard Builder; not runtime-verified prior) | | | | |
| 31 | PerformBottomPanel tab strip (Macros/Dashboard) | `App.tsx` (`PerformBottomPanel`) | `useDashboardStore.widgets` (initial tab choice); local | (not in prior audit — NEW row) | | | | |
| 32 | PanicButton (perform canvas overlay) | `components/layout/MacroDashboard.tsx` (exported); mounted `App.tsx:105` | `elementTransportPanic` | (Blueprint: panic) | | | | |

### 2D. Modals & overlays

| # | Surface | Component path | Bridge data needed (real, non-mock) | Prior coverage | Repro steps | Severity | Evidence path | Verdict |
|---|---|---|---|---|---|---|---|---|
| 33 | PreferencesModal | `components/layout/PreferencesModal.tsx` | Audio: `useHostExtrasStore.audioSetup` + `elementAudioApplySetup`; Mapping: `elementMappingSetLearning/RemoveMap`; OSC: `elementOscApplyHost`; Canvas: `elementGraphSetCanvasOptions`; tools: `elementOpenGraphMixer/OpenLuaConsole/HideAllPluginWindows/HostShowAllPluginWindows/WebDismissOverlay`. **Plugin-scan section + `elementScanPlugins`/path/format bridges MISSING** | BUG-001/002/003/004 (no scan UI; dropdowns ignore store data; no device-enum bridge); BUG-016 (MIDI learn stub) | | | | |
| 34 | AboutModal | `components/layout/AboutModal.tsx` | `elementAppGetAbout` (name/version/copyright); `elementAppCheckForUpdates`; uses NeuPromptModal | BUG-009 (version "—" without bridge) | | | | |
| 35 | NeuPromptModal (reusable prompt) | `components/layout/NeuPromptModal.tsx` | none direct (controlled by parent: AboutModal / InspectorHub rename) | (not in prior audit — NEW row) | | | | |
| 36 | VirtualKeyboard | `components/layout/VirtualKeyboard.tsx` | `elementVirtualKeyboardNoteOn/NoteOff`; gated by `useAppStore.virtualKeyboardOpen` | BUG-020 (sparse array → undefined key holes) | | | | |
| 37 | CommandPalette (Cmd+K) | `components/canvas/CommandPalette.tsx` | `usePluginBrowserStore` (search); `useHostExtrasStore`; `useGraphStore`; `useAppStore` | BUG-011 (data-starved: empty plugin list) | | | | |

### 2E. Canvas surfaces & context menus

| # | Surface | Component path | Bridge data needed (real, non-mock) | Prior coverage | Repro steps | Severity | Evidence path | Verdict |
|---|---|---|---|---|---|---|---|---|
| 38 | GraphCanvas — node/cable render | `components/canvas/GraphCanvas.tsx` | `useGraphStore.nodes/edges/commentBoxes` (from `onGraphState`/`hydrateFromEngine`) | (Verified Working: canvas render) | | | | |
| 39 | GraphCanvas — Empty Board watermark | `components/canvas/GraphCanvas.tsx` | renders when `blocks.length===0` | (not in prior audit — NEW row) | | | | |
| 40 | GraphCanvas — connect / disconnect (drag cable) | `components/canvas/GraphCanvas.tsx` | `elementGraphConnect` / `elementGraphDisconnect` (edit only) | (partial) | | | | |
| 41 | GraphCanvas — node drag persistence | `components/canvas/GraphCanvas.tsx` | `elementGraphMoveNodes`; comment: `elementGraphCommentUpsert` | (not in prior audit — NEW row) | | | | |
| 42 | GraphCanvas — viewport / zoom-tier push | `components/canvas/GraphCanvas.tsx` | `elementGraphSetViewport`; `useHostExtrasStore.canvas.graphBounds/gridSize/snapToGrid` | (not in prior audit — NEW row) | | | | |
| 43 | GraphCanvas — double-click block (dive / open editor) | `components/canvas/GraphCanvas.tsx` | container: `pushBreadcrumb`; plugin: `elementPluginEditorOpen` | BUG-018 (double-click path unverified) | | | | |
| 44 | GraphCanvas — double-click empty pane (navigate up) | `components/canvas/GraphCanvas.tsx` | `popBreadcrumb` (local) | (not in prior audit — NEW row) | | | | |
| 45 | GraphCanvas — inline Rename overlay (Cmd+R / event) | `components/canvas/GraphCanvas.tsx` | `elementGraphRenameNode`; `EV_START_RENAME` | (not in prior audit — NEW row) | | | | |
| 46 | Block (node) — body, ports, badges | `components/canvas/Block.tsx` | `useGraphStore.node` data (category/format/ports) | BUG-012/013 (badges mis-inferred) | | | | |
| 47 | BlockEmbed (nested plugin embed) | `components/canvas/BlockEmbed.tsx` | `useGraphStore` (`useShallow` selector — Zustand v5 fix); per-node embed data | (zustand selector fix landed f85e246c; render-verify gate) | | | | |
| 48 | Cable (edge render + manhattan fan-out) | `components/canvas/Cable.tsx` | `useGraphStore.nodes` (port positions); `useAppStore.cableRouting` | (Verified Working: cable routing) | | | | |
| 49 | CommentFrame (comment box node) | `components/canvas/CommentFrame.tsx` | `elementGraphCommentAdd/Upsert/Delete`; `useGraphStore.commentBoxes` | (not in prior audit — NEW row) | | | | |
| 50 | MiniMap | `components/canvas/GraphCanvas.tsx` (`MiniMap`) | `useGraphStore.minimapVisible` + node data | (Verified Working: minimap) | | | | |
| 51 | QuickAddPopup (right-click pane) | `components/canvas/QuickAddPopup.tsx` | `usePluginBrowserStore` (`elementGetPluginList`); `elementGraphAddPlugin` | BUG-011 (data-starved); BUG-017 (no molecule save) | | | | |
| 52 | NodeContextMenu (right-click node) | `components/canvas/NodeContextMenu.tsx` | `elementGraphDuplicateNodes/RemoveNode/RenameNode`; `useGraphStore` | (not in prior audit — NEW row) | | | | |
| 53 | EdgeContextMenu (right-click cable) | `components/canvas/EdgeContextMenu.tsx` | `elementGraphDisconnect/SetCableBus`; `useBusStore`; `useGraphStore` | (not in prior audit — NEW row) | | | | |
| 54 | Breadcrumb (canvas top, edit) | `components/layout/Breadcrumb.tsx` | `useGraphStore.breadcrumbs` (also in Toolbar #3) | (Verified Working: nav) | | | | |
| 55 | BlockTabStrip (canvas top, edit) | `components/layout/BlockTabStrip.tsx` | `useAppStore.openBlockTab` (tab state); `useGraphStore.nodes` | (not in prior audit — NEW row) | | | | |

---

## 3. Bridge-data dependency summary (for re-audit live-data setup)

The re-auditor (item 11) must arrange these data sources for each cluster of surfaces:

| Data source / bridge | Drives surfaces (#) | How to supply real data |
|---|---|---|
| `onGraphState` engine snapshot (`useJuceBridge.ts:281` → `hydrateFromEngine`) | 1,3,4,7,10,16,18,25,27,38,46,48 | Load a real session in JUCE host, or inject via `window.__elementNative.onGraphState(payload)` with C++ shape (`blocks`/`cables`) |
| `elementGetEngineSnapshot` 4Hz poll (`useEngineSnapshotStore.startPolling(250)`) | 4,11,15 | JUCE host live engine; dev returns undefined (BUG-008) |
| `elementGetPluginList` (after a completed scan) | 17,37,51 | **Requires plugin scan** — blocked by BUG-001/002 (no scan bridge in C++) |
| `elementSessionGetGraphTree` | 2,16 | Call on SessionTree mount (BUG-006 — currently not called on boot) |
| `elementGetNodeParameters` per selected node | 18,30 | JUCE host with a real plugin selected (BUG-007 untested at runtime) |
| `elementAppGetAbout` | 34 | JUCE host (BUG-009 — em-dash without bridge) |
| `useHostExtrasStore.audioSetup` (from snapshot) | 33 | Present in snapshot but PreferencesModal does not read it (BUG-003) |
| `onLog` / `onCableMeters` pushes | 21,22 | JUCE host engine running |
| `elementDashboardGetLayout` | 30 | JUCE host dashboard persistence |

---

## 4. Coverage delta vs prior `REACT_UI_AUDIT_2026-05-24.md`

- **Prior audit covered 28 bugs across ~22 features.** Its "Verified Working" table (doc lines 201–223) is folded into the **Prior coverage** column above as a baseline; the re-audit (item 11) must re-confirm each against the current build, since 6 UI bugs were fixed in commit `f85e246c` and Zustand v5 selector fixes landed.
- **NEW rows not present in the prior audit (need first-time runtime coverage):** #5 Undo/Redo, #19 ScriptEditor tab, #21 LogPanel, #22 MetersPanel, #23 BusInspector/graph-props, #31 PerformBottomPanel tab strip, #35 NeuPromptModal, #39 Empty Board, #41 node-drag persistence, #42 viewport push, #44 double-click-up navigation, #45 inline rename, #49 CommentFrame, #52 NodeContextMenu, #53 EdgeContextMenu, #55 BlockTabStrip. (16 surfaces.)
- **Carry-forward P0/P1 from prior audit still gating multiple surfaces:** BUG-001/002 (plugin scan) blocks #17/#37/#51; BUG-003/004 (audio device enum) blocks #33; BUG-006 (graph tree on boot) blocks #16; BUG-007 (params) blocks #18/#30.

---

## 5. Acceptance check

- [x] Every rendered top-level Web-shell surface appears as a manifest row (55 rows across 5 clusters).
- [x] Each row has the four empty audit columns (repro / severity / evidence path / verdict) ready for item 11.
- [x] Each row names the real (non-mock) bridge data required to exercise it.
- [x] Expected surfaces from the task brief all present: Toolbar(#1-14), ToolPalette(#17), SessionTree(#16), InspectorHub(#18-23), SnippetShelf(#24), QuickAccess(#25), LiveHealth(#26), MacroDashboard(#27-28), DashboardBuilder(#30), StatusBar(#15), VirtualKeyboard(#36), GraphCanvas(#38-42) + Block(#46) + Cable(#48) + CommandPalette(#37) + QuickAddPopup(#51) + Minimap(#50), PreferencesModal(#33), About(#34).
- [x] Classic/native-only JUCE panels excluded (scope = `webview/src/` React tree only).
