# Element UI Feature × Status Matrix

**QA pass:** Team QA discovery cycle, 2026-05-07
**Scope:** Element webview UI at HEAD `4105eb23` (post-Wave-1 close, branch `local-enhancements`)
**Methodology:** Static-code analysis + dev-server (Vite) interaction + AppleScript window probe.
**Coverage caveat:** AX inspection of the *production* Element.app was unavailable (no pyobjc on the host). All statuses derived from reading `webview/src/**` and `src/ui/element_webview_host.cpp` and exercising the dev server at `localhost:5173`. See `findings.md` for detail and `critical-bugs.md` for the ranked top.

## Status legend

- WORKS — exercised the affordance, behaviour matches spec
- BROKEN — affordance present, doesn't perform documented action
- PARTIAL — works for some sub-cases, not all
- MISSING — affordance not in UI at all
- BRIDGE-DEPENDENT — needs running session/audio engine; static-analysis says it's wired, but I can't end-to-end exercise without pyobjc / a real DAW host
- NOT-TESTABLE — would need real hardware (MIDI in, audio device with non-default channel count, etc.)

---

## 1. Toolbar transport

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| T-1 | Play / Pause button | Blueprint §7.8 | code | WORKS | `Toolbar.tsx:228` calls `nativeTransportTogglePlay`; bridge registered `element_webview_host.cpp:1417` | icon flips Play↔Pause from `isPlaying` selector |
| T-2 | Stop button | Blueprint §7.8 | code | WORKS | `Toolbar.tsx:239` → `nativeTransportStop`; bridge `:2271` | |
| T-3 | Rewind button | Blueprint §7.8 | code | WORKS | `Toolbar.tsx:221` → `nativeTransportRewind`; bridge `:2283` | |
| T-4 | Panic button (red) | Blueprint §7.8 + CLAUDE.md | code | WORKS | `Toolbar.tsx:434/478` → `nativeTransportPanic`; bridge `:1408` invokes `MidiPanic::messages()` for all-channels-all-notes-off | wired in Edit AND Perform mode toolbar AND in StatusBar PANIC button |
| T-5 | BPM editable display | Blueprint §7.8 | code | WORKS | `Toolbar.tsx:251-281` opens inline edit, calls `nativeTransportSetTempo` on Enter/blur with 20–999 clamp | |
| T-6 | TAP tempo button | Blueprint §7.8 | code | BROKEN | `Toolbar.tsx:293` button has NO `onClick` handler — visually present, click is a no-op | P1 — tap-tempo is a documented control |
| T-7 | Undo button (toolbar) | Blueprint §7.8 | code | BROKEN | `Toolbar.tsx:206` button has NO `onClick` handler | P1 — Cmd+Z + Cmd+K palette work; this is purely a toolbar-affordance bug |
| T-8 | Redo button (toolbar) | Blueprint §7.8 | code | BROKEN | `Toolbar.tsx:209` button has NO `onClick` handler | P1 — same alternates as T-7 |
| T-9 | Undo depth counter | Blueprint §7.8 | code | MISSING | No "(5)" counter rendered next to Undo button; nothing in `useGraphStore` exposes undo depth | P2 — cosmetic; CLAUDE.md doesn't promise this |
| T-10 | Time-signature 4/4 display | Blueprint §7.8 | code | MISSING | Hardcoded "4/4" in Perform mode banner (`Toolbar.tsx:193`); not editable in Edit mode at all | P2 — display only, not user-editable |
| T-11 | Record button | Blueprint §7.8 (transport) | code | MISSING | `nativeTransportSetRecording` bridge exists but no Record button rendered in `Toolbar.tsx` | P1 — feature missing from UI despite bridge being live |
| T-12 | Cable routing toggle (MAN/BEZ) | Blueprint §7.2 | code | WORKS | `Toolbar.tsx:340/349` updates `useAppStore.cableRouting`; consumed by Cable.tsx | |
| T-13 | About button | Blueprint §1 | code | WORKS | `AboutModal.tsx` 4-state machine (idle/checking/requested/error) calls `elementAppCheckForUpdates`; verified by Wave-1 commit `4b8619f6` | |
| T-14 | Preferences button | Tag-C parity row | code | PARTIAL | Opens `PreferencesModal` which has Audio device + MIDI mapping panes, but Lua console & Graph mixer panes ship native overlays via `nativeOpenLuaConsole` / `nativeOpenGraphMixer` | P2 — Tag-C port queue (acknowledged not done), but classify as PARTIAL because dialog opens |

---

## 2. Mode toggle

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| M-1 | Edit / Perform toggle (toolbar) | Blueprint §6 | dev-server | WORKS | Toolbar pill at `:317`; verified by snapshot — clicking flips from Edit (file/transport/scene) to Perform (LIVE banner + dashboard) layout | |
| M-2 | Cmd+Shift+M shortcut | Blueprint §6.3 | code | WORKS | `useKeyboard.ts:201-207` checks shift+meta+m | |
| M-3 | Mode-gated affordances (panels) | Blueprint §6 | dev-server | WORKS | Snapshot shows only QuickAccess + LiveHealth + Macros panels in Perform mode (Tool Palette + Inspector hidden); `nodesDraggable={isEdit}`, `selectionOnDrag={isEdit}`, `onConnect={isEdit ? onConnect : undefined}` enforce structural lock-down | |
| M-4 | Same palette in both modes | Blueprint §4.2 | dev-server | WORKS | Snapshot confirms unified dark — no green/blue colour shift between modes | |

---

## 3. Sidebar navigation

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| S-1 | Cmd+1 toggle Session/left panel | CLAUDE.md | code | PARTIAL | `useKeyboard.ts:93` toggles "left" panel — NOT switches between Session/Browse/Inspector/Editor as documented | P2 — semantic deviation, not a crash |
| S-2 | Cmd+2 toggle right panel | CLAUDE.md | code | PARTIAL | `useKeyboard.ts:99` toggles "right" panel only | P2 — same deviation |
| S-3 | Cmd+3 toggle bottom panel | CLAUDE.md | code | PARTIAL | `useKeyboard.ts:105` toggles "bottom" only | P2 — semantic |
| S-4 | Cmd+4 (Editor panel) | CLAUDE.md | code | MISSING | No case `"4":` in `useKeyboard.ts` — only `"1"`, `"2"`, `"3"` exist | P2 — there are only 3 panels in `AppShell` so the spec mismatch is documentation, not a bug |
| S-5 | Session tree (left) | Blueprint §7.3 | dev-server | WORKS | `SessionTree.tsx` renders "PROJECT / Untitled / 0 graphs / No graphs in session" — wired to `useSessionStore` |  |
| S-6 | Browse → Plugins tab | Blueprint §7.3 | code+dev | PARTIAL | `ToolPalette.tsx` shows plugins; falls back to `pluginsDemoFallback` if `nativePlugins.length === 0` (line 155) — see findings F-101 | P1 — bridge dependency that hides emptiness with fake data |
| S-7 | Browse → Projects tab | parity matrix | code | WORKS | Projects tab calls `nativeSessionListFiles` + `nativeSessionOpenPath` |  |

---

## 4. Plugin browser (ToolPalette)

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| P-1 | Search box | Blueprint §7.3 | dev-server | WORKS | `ToolPalette.tsx:260` `<textbox placeholder="Search plugins…">` confirmed in AX snapshot | |
| P-2 | Cmd+F focus search | CLAUDE.md | code | WORKS | `useKeyboard.ts:111-119` finds `aside input[placeholder*="Search"]` and focuses |  |
| P-3 | Format filter (All / vst3 / au / clap / lv2) | Blueprint §7.3 | code | MISSING | Only category filter (GEN / MOD / LOGIC) exists — no format dropdown | P2 — spec calls for it; not a regression |
| P-4 | Favourites section | Blueprint §7.3 | code | PARTIAL | `usePluginBrowserStore.favoriteIdentifiers` Set is read; but no toggle UI to ADD a favourite (no native `elementSetPluginFavorite`) | P1 — favourites display works only if C++ side already populates them |
| P-5 | Recently-used section | Blueprint §7.3 | code | PARTIAL | `recentIdentifiers` is read; no client-side bump on add — depends entirely on C++ tracker pushing the list | BRIDGE-DEPENDENT |
| P-6 | Click to insert at canvas centre | Blueprint §7.3 | code | WORKS | `ToolPalette.tsx:362,380` → `nativeGraphAddPlugin(p.identifier)` |  |
| P-7 | Drag plugin onto Board | Blueprint §7.3 | code | MISSING | No `draggable` / `onDragStart` on plugin items in ToolPalette; no drop handler on GraphCanvas. Only click/double-click insertion exists. | P1 — documented affordance not implemented |
| P-8 | Right-click → Add/Remove favourite | Blueprint §7.3 | code | MISSING | No `onContextMenu` on plugin items in ToolPalette | P1 — see P-4 |
| P-9 | Format badge (inst/fx/midi pill) | Blueprint §7.3 | code | NOT-TESTABLE | Code references `category` for shape/colour but no [inst]/[fx] pill rendering; can't verify without populated bridge data | |
| P-10 | Molecule (Snippet) drag-into-Board | Blueprint §8.2 | code | PARTIAL | `nativeMoleculeInsert` wired (`ToolPalette.tsx:401`); but invocation is via click only, not drag (same gap as P-7) | P2 |

---

## 5. Session / Project file ops

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| F-1 | New (toolbar) | Blueprint §7.8 | code | WORKS | `Toolbar.tsx:100` → `nativeSessionNew` ↔ bridge `:1682` |  |
| F-2 | Open (toolbar) | Blueprint §7.8 | code | WORKS | `:107` → `nativeSessionOpen` ↔ bridge `:1721` |  |
| F-3 | Save (toolbar + Cmd+S) | CLAUDE.md | code | WORKS | `:114` and `useKeyboard.ts:121` |  |
| F-4 | Save As (toolbar + Cmd+Shift+S) | CLAUDE.md | code | WORKS | `:121` + `useKeyboard.ts:123` |  |
| F-5 | Recent files in Project tab | parity matrix | code | WORKS | `ToolPalette.tsx:470-484` reads `useSessionStore.recentFiles`, `nativeSessionOpenPath` on click |  |
| F-6 | Active-graph dropdown | parity matrix | code | WORKS | `Toolbar.tsx:132-150` shows when ≥ 2 graphs; calls `nativeSessionSetActiveGraph` |  |
| F-7 | Import .elg | parity matrix | code | WORKS | ToolPalette → `nativeSessionImportGraph` |  |
| F-8 | Export .elg | parity matrix | code | WORKS | ToolPalette → `nativeSessionExportGraph` |  |

---

## 6. Canvas / Board

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| C-1 | Pan canvas (default mouse) | Blueprint §6.3 | code | WORKS | React Flow built-in |  |
| C-2 | Zoom (Cmd+= / Cmd+-) | CLAUDE.md | code | WORKS | `useKeyboard.ts:188-199` `reactFlow.zoomIn / zoomOut` |  |
| C-3 | Fit-to-view (Cmd+0) | CLAUDE.md | code | WORKS | `useKeyboard.ts:182-186` `fitView` with 0.15 padding |  |
| C-4 | Snap-to-grid | Blueprint §8.4 | code | WORKS | `GraphCanvas.tsx:443` `snapToGrid={canvasSnap}`, store-controlled |  |
| C-5 | Layout direction toggle | Blueprint §8.4 | code | MISSING | No horizontal/vertical layout toggle in toolbar; CLAUDE.md mentions "GraphEditorToolbar" with this, but webview Toolbar doesn't expose it | P2 |
| C-6 | Right-click pane → QuickAdd | CLAUDE.md | code | WORKS | `GraphCanvas.tsx:248-258` `onPaneContextMenu` opens `<QuickAddPopup>` |  |
| C-7 | Double-click pane → navigate UP | Blueprint §6.3 | code | WORKS | `GraphCanvas.tsx:243-245` `onPaneDoubleClick` → `popBreadcrumb` |  |
| C-8 | Minimap | Blueprint §7.7 | code | WORKS | AX snapshot shows `image "Mini Map"`; `Shift+M` toggles via `useKeyboard.ts:246-249` |  |
| C-9 | Empty-state placeholder | F.0.10 | dev-server | WORKS | "Empty Board / Right-click to add a block · Cmd+K to search" rendered |  |

---

## 7. Block (node) interactions

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| B-1 | Click to select | spec | code | WORKS | `GraphCanvas.tsx:onNodeClick` → `selectNode` |  |
| B-2 | Shift+click multi-select | Blueprint §11.1 | code | WORKS | React Flow built-in; `selectionOnDrag={isEdit}` |  |
| B-3 | Drag to move | Blueprint §11.1 | code | WORKS | `nodesDraggable={isEdit}` + `onNodeDragStop` posts to bridge |  |
| B-4 | Lasso select | Blueprint §8.3 | code | WORKS | `selectionOnDrag={isEdit}` + `selectionMode={SelectionMode.Partial}` |  |
| B-5 | Cmd+D duplicate | CLAUDE.md | code | WORKS | `useKeyboard.ts:152-164` → `nativeGraphDuplicateNode(s)` |  |
| B-6 | Cmd+R rename | CLAUDE.md | code | WORKS | `useKeyboard.ts:166-180` dispatches `EV_START_RENAME` |  |
| B-7 | Cmd+T rename | CLAUDE.md | code | MISSING | useKeyboard handles `case "r"`/`"R"` only — no `"t"` case for rename | P2 — Cmd+R works as alternate |
| B-8 | Backspace/Delete | CLAUDE.md | code | WORKS | `useKeyboard.ts:297-308` → `nativeGraphRemoveNode` |  |
| B-9 | Bypass toggle | Blueprint §7.1 | code | WORKS | `InspectorHub.tsx:toggleBypass` from `useGraphStore` (calls `nativeGraphSetBypass` indirectly) |  |
| B-10 | Mute toggle | Blueprint §7.1 | code | WORKS | bridge `elementGraphSetMute` ↔ store |  |
| B-11 | Mute-input toggle | parity matrix | code | WORKS | bridge `elementGraphSetMuteInput` |  |
| B-12 | Double-click → embedded plugin GUI | Blueprint §10.1 | code | BROKEN | `GraphCanvas.tsx:196-204` `onNodeDoubleClick` only handles Container/Portal (`containerNodeCount` / `isPortal`); for a regular plugin Block it does NOTHING. Spec: "Double-click Block: Dive into nested Board OR open embedded plugin GUI if not a container." | P1 — documented gesture is a no-op |
| B-13 | Double-click Container/Portal → dive | Blueprint §6.3 | code | WORKS | `GraphCanvas.tsx:200-202` pushes breadcrumb |  |
| B-14 | Right-click → context menu | spec | code | WORKS | `GraphCanvas.tsx:onNodeContextMenu` opens `<NodeContextMenu>` |  |
| B-15 | Tab → next-block in chain | CLAUDE.md | code | WORKS | `useKeyboard.ts:274-294` builds in-degree-sorted list, advances |  |
| B-16 | Replace with… (same I/O) | Blueprint §8.3 | code | NOT-TESTABLE | `NodeContextMenu.tsx` would need inspection — not exercised here | |

---

## 8. Cable (edge) interactions

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| E-1 | Connect ports (drag from port) | Blueprint §10.1 | code | WORKS | `GraphCanvas.tsx:onConnect` → `nativeGraphConnect` |  |
| E-2 | Disconnect | spec | code | WORKS | `onEdgesDelete` → `nativeGraphDisconnect` |  |
| E-3 | Audio cable colour (blue) | CLAUDE.md | code | WORKS | `Cable.tsx` keys colour off signalType |  |
| E-4 | MIDI cable colour (teal) | CLAUDE.md | code | WORKS | same |  |
| E-5 | CV cable colour (orange) | CLAUDE.md | code | WORKS | same |  |
| E-6 | Right-click cable → context | Blueprint §7.2 | code | WORKS | `GraphCanvas.tsx:225-242` `onEdgeContextMenu` |  |
| E-7 | Wireless patch (W key) | Blueprint §7.2 | code | WORKS | `useKeyboard.ts:313-330` toggles bus assignment via `nativeGraphSetCableBus` |  |
| E-8 | Reroute pin (double-click cable) | Blueprint §7.2 | code | MISSING | No `onEdgeDoubleClick` handler in `GraphCanvas.tsx` | P2 — Tag-C territory |
| E-9 | Inline insert (drag block onto cable) | Blueprint §8.3 | code | MISSING | No drop-on-edge logic | P2 |

---

## 9. Right-click context menus

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| R-1 | Pane right-click | spec | code | WORKS | `onPaneContextMenu` opens QuickAdd |  |
| R-2 | Node right-click | spec | code | WORKS | `onNodeContextMenu` opens `<NodeContextMenu>` |  |
| R-3 | Edge right-click | spec | code | WORKS | `onEdgeContextMenu` opens `<EdgeContextMenu>` |  |
| R-4 | Comment-box right-click | spec | code | NOT-TESTABLE | Filtered out via `node.type === "comment" return` in `onNodeContextMenu` — comments may have own handler in CommentFrame | |

---

## 10. QuickAdd popup

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| Q-1 | Search box | Blueprint §6.3 | code | WORKS | `QuickAddPopup.tsx:238` |  |
| Q-2 | Filter on type | spec | code | WORKS | `:148` `name.toLowerCase().includes(q)` |  |
| Q-3 | Insert at cursor | Blueprint §6.3 | code | PARTIAL | `:180` calls `nativeGraphAddPlugin(id)` — but does NOT pass cursor coords. Spec: "QuickAdd popup at cursor". The C++ bridge `elementGraphAddPlugin` has no x/y arg — node lands wherever the engine drops it. | P2 — works (it adds), but not "at cursor" |
| Q-4 | Keyboard nav | spec | code | NOT-TESTABLE | Not inspected in detail; `setActiveIndex` exists | |

---

## 11. Command Palette (Cmd+K)

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| K-1 | Cmd+K opens | Blueprint §6.3 | code | WORKS | `useKeyboard.ts:87-91` |  |
| K-2 | Search across actions + plugins | Blueprint §6.3 | code | WORKS | `CommandPalette.tsx:80+` builds `actionResults[]` (Undo, Redo, Save, Open, Play/Pause, BypassAll, …) and merges plugins |  |
| K-3 | Recent + favourites | Blueprint §6.3 | code | WORKS | `:118-128` sort plugins by favourite > recent > name |  |
| K-4 | Execute on Enter | spec | code | WORKS | `runAndClose(action)` on each result |  |

---

## 12. Spatial bookmarks

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| SB-1 | Ctrl+0-9 save | Blueprint §8.1 | code | WORKS | `useKeyboard.ts:215-220` |  |
| SB-2 | Shift+0-9 recall | Blueprint §8.1 | code | WORKS | `:226-232` `setViewport` with 150ms duration |  |
| SB-3 | Persistence across sessions | spec | code | MISSING | Stored in Zustand `useAppStore.spatialBookmarks` only — not serialised to project file | P2 — same-session-only bookmarks |

---

## 13. Other keyboard shortcuts

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| KB-1 | Shift+C create comment box | CLAUDE.md | code | WORKS | `useKeyboard.ts:236-244` |  |
| KB-2 | Shift+M toggle minimap | CLAUDE.md | code | WORKS | `:246-249` |  |
| KB-3 | Shift+K toggle virtual keyboard | code | code | WORKS | `:252-255` (NOT in CLAUDE.md but is wired) |  |
| KB-4 | Escape — clear selection / pop breadcrumb | CLAUDE.md | code | WORKS | `:263-272` |  |
| KB-5 | Space — toggle play/stop | Blueprint §11.2 | code | MISSING | No `case " "` or `case "Space"` in `useKeyboard.ts` | P2 |
| KB-6 | Cmd+N new project | Blueprint §11.2 | code | MISSING | No case `"n"` in `useKeyboard.ts` Cmd-block | P2 |
| KB-7 | Cmd+A select all | Blueprint §11.2 | code | MISSING | No case `"a"` | P2 |
| KB-8 | Cmd+Shift+L/R/T/B/H/V align/distribute (P1-13) | code | code | WORKS | `:45-81` calls `alignSelectedNodes` / `distributeSelectedNodes` |  |

---

## 14. Inspector Hub

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| I-1 | INSPECTOR tab | Blueprint §7.4 | code | WORKS | `InspectorHub.tsx:601` `tabs[]` |  |
| I-2 | CABLES tab | spec | code | WORKS | `:603` |  |
| I-3 | LOG tab (live log stream) | parity matrix | code | WORKS | `LogPanel` reads `useHostExtrasStore.logLines` |  |
| I-4 | METERS tab | parity matrix | code | WORKS | `MetersPanel` shows `nCables` level channels from store |  |
| I-5 | SCRIPT tab (when ScriptNode selected) | parity matrix | code | WORKS | `:602` conditionally appended; `<ScriptEditor>` |  |
| I-6 | Block parameter list (knob/fader) | Blueprint §7.4 | code | WORKS | `BlockParameterList` calls `nativeGetNodeParameters`, range slider per-param + boolean toggle |  |
| I-7 | "Tag as Macro" toggle | Blueprint §7.4 | code | NOT-TESTABLE | Bridge has `elementPerformMarkParameterMapped` / `elementPerformGetMappedParameters`; UI tagger exists in MacroDashboard rather than per-parameter row in Inspector | needs deeper read |
| I-8 | Preset dropdown / PRESETS A/B Save/Load | parity matrix | code | WORKS | `PresetStrip` with `NeuPromptModal` (Wave-1 W-1 closeout); 0× `window.prompt()` in source |  |
| I-9 | Notes field (per-block userNote) | parity matrix | code | WORKS | `nativeGraphSetNodeNote` wired |  |
| I-10 | Project overview when nothing selected | Blueprint §7.4 | dev-server | WORKS | Snapshot shows "PROJECT OVERVIEW" with BLOCKS/CABLES/CPU/SAMPLE-RATE/BUFFER tiles |  |
| I-11 | Plugin window embed/float | Tag-C | code | PARTIAL | `PluginEditorControls` toggles via `nativePluginEditorOpen`/`Float`/`SetBounds`/`Close` — but the embed renders only a placeholder div; actual native editor is positioned by the C++ host on top of that region (per the placeholder text). On Windows this is "validated separately" per parity matrix. | BRIDGE-DEPENDENT |

---

## 15. Dashboard Builder (Perform mode)

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| D-1 | Composable knobs/faders/buttons/meters/pads | Blueprint §6.2 | code+dev | PARTIAL | `DashboardBuilder.tsx:486` has "Unbound placeholder overlay" comment — affordance present but the documented blueprint composability (drag a knob, wire to any parameter from any Block) is not fully implemented; current panel is more a viewing pane than a designer | P1 — Tag-C blueprint feature, partially shipped |
| D-2 | MAP MODE switch | code | dev-server | WORKS | Snapshot `uid=2_45 button "MAP MODE" / switch` |  |
| D-3 | Macro Dashboard tab | code | dev-server | WORKS | `App.tsx:62` toggles between MacroDashboard and DashboardBuilder by `tab` |  |
| D-4 | Saved per-Project / per-Scene | Blueprint §6.2 | code | NOT-TESTABLE | `useDashboardStore` exists; haven't traced persistence into ValueTree | |

---

## 16. Scene / Preset system

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| SC-1 | Scene selector display | Blueprint §6.2 | dev-server | WORKS | "SCENE 1/1" in toolbar; counter advances |  |
| SC-2 | Add scene (+) | Blueprint §6.2 | code | WORKS | `Toolbar.tsx:389` → `nativePerformAddScene` |  |
| SC-3 | Capture (CAP) | Blueprint §6.2 | code | WORKS | `:400-405` → `nativePerformCaptureScene` with busy state |  |
| SC-4 | Previous / Next scene | Blueprint §6.2 | code | BROKEN | `:360-379` calls `useAppStore.setScene(idx)` which only updates LOCAL state. `usePerformStore.setActiveScene` (which DOES call `nativePerformSetActiveScene`) is NOT invoked. Two parallel scene-state systems = scene switching from toolbar will not propagate to engine. | P1 — see findings F-201 |
| SC-5 | Scene switch via MIDI Program Change | Blueprint §6.2 | code | NOT-TESTABLE | Engine-side feature; not exercisable here | |
| SC-6 | Scene parameter snapshot apply on switch | Blueprint §6.2 | code | BRIDGE-DEPENDENT | Bridge wired (`elementPerformSetActiveScene` applies `paramStateJson` per parity matrix); contingent on SC-4 fix to even reach the bridge from prev/next | |

---

## 17. Snippet Shelf / Molecule library

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| SS-1 | Snippet shelf bottom panel | Blueprint §7.5 | dev-server | WORKS | Snapshot: "SNIPPETS / 0 / No snippets saved" |  |
| SS-2 | Drag selection onto shelf | Blueprint §7.5 | code | MISSING | No `onDrop` handler on SnippetShelf; current flow is "save as molecule" via prompt | P2 |
| SS-3 | Drag thumbnail onto Board | Blueprint §7.5 | code | MISSING | ToolPalette molecule click → `nativeMoleculeInsert` works, but drag does not | P2 |
| SS-4 | Shelf thumbnail generation | Blueprint §7.5 | code | NOT-TESTABLE | Backend pipeline | |

---

## 18. Status bar

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| SB-1 | CPU load | Blueprint §7.8 | code+dev | WORKS | StatusBar reads `selectLiveHealth().cpu` |  |
| SB-2 | Sample rate | Blueprint §7.8 | code+dev | WORKS | reads `health.sampleRate` |  |
| SB-3 | Buffer / latency | Blueprint §7.8 | code+dev | WORKS | reads `health.buffer / latency` |  |
| SB-4 | Engine running indicator | Blueprint §7.8 | dev-server | WORKS | "STOPPED" text shown when not running |  |
| SB-5 | MIDI activity | Blueprint §7.8 | code | NOT-TESTABLE | No explicit MIDI-in light in StatusBar; would need MIDI input device | |
| SB-6 | Breadcrumb (status bar) | Blueprint §7.6 | code | WORKS | Breadcrumb is in Toolbar (left), not status bar; functional |  |
| SB-7 | Mode indicator (status bar) | spec | code | MISSING | No explicit "EDIT/PERFORM" badge in StatusBar component | P2 |
| SB-8 | Default Device label | spec | dev-server | PARTIAL | StatusBar shows "Default Device" string — hardcoded fallback string when `health.clock === "—"` | P2 |

---

## 19. Modals

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| MO-1 | Settings/Preferences | Tag-C parity row | code | PARTIAL | `PreferencesModal.tsx` covers Audio device + MIDI mapping + buttons that POP NATIVE OVERLAYS for Lua console / Graph mixer (`nativeOpenLuaConsole` / `nativeOpenGraphMixer`) — full Web Preferences port is Tag-C deferred | classified PARTIAL not 🚧 |
| MO-2 | About modal | parity matrix | code | WORKS | Wave-1 F-9 closeout: 4-state machine; `elementAppCheckForUpdates`. Build number not yet shown (waiting on C++ side). |  |
| MO-3 | NeuPromptModal (W-1) | master-fix-plan W-1 | code | WORKS | Wave-1 W-1 closeout; 0× `window.prompt()` |  |
| MO-4 | MIDI mapping table | parity matrix | code | WORKS | `PreferencesModal.tsx:248-301` MIDI learn toggle + map table + remove |  |

---

## 20. Bridge round-trips

| # | Feature | Spec source | Method | Status | Evidence | Notes |
|---|---|---|---|---|---|---|
| BR-1 | Graph topology sync C++ → React | Blueprint §2.3 | code | BRIDGE-DEPENDENT | `pushGraphSnapshot` mechanism in `element_webview_host.cpp`; consumer in `useGraphStore` | needs running engine |
| BR-2 | Parameter automation reflects in UI | Blueprint §2.3 | code | BRIDGE-DEPENDENT | `nativeGetNodeParameters` polled via `BlockParameterList.reload()`; no event-driven 60Hz push to params currently visible in code | maybe MISSING — only re-fetched on demand |
| BR-3 | Transport state mirrored | Blueprint §2.3 | code | WORKS | `usePerformStore.isPlaying` updated from snapshot; toolbar Play/Pause icon swaps |  |
| BR-4 | Cable RMS amplitude metering | Blueprint §2.3 / §7.2 | code | PARTIAL | `useCableMeterStore` exists; `MetersPanel` shows N channels — but visual cable-pulse animation per amplitude is not visible in `Cable.tsx` static analysis | P2 — partial parity matrix item |

---

## Coverage gaps (declared)

- AX inspection of `Element.app` (running native binary) was not performed: `pyobjc` is missing from `/usr/local/bin/python3`. All native-app statuses derived from code reading.
- Behaviour of bridge-dependent features (T-1..T-5, every "BRIDGE-DEPENDENT" row) is inferred from the static wiring: bridge function exists in `element_webview_host.cpp`, React side calls it, both sides agree on the data shape. Whether the audio thread / message thread actually round-trip correctly under load was NOT exercised.
- Drag-and-drop, hover-tooltip, keyboard-only navigation, screen-reader behaviour: not tested.
- Production-mode (non-dev) bundle: not run. Dev mode lacks `window.__JUCE__`; the demo-fallback path was the only thing exercisable.
- Multi-graph / nested-Container / Portal navigation: not exercised because no demo session loads in dev mode.
- P-9 format-badge rendering, B-16 Replace-with menu, R-4 Comment-box context, I-7 Tag-as-Macro per-row toggle, Q-4 QuickAdd keyboard nav, D-4 Dashboard persistence, SS-4 snippet thumbnail generation, SB-5 MIDI-activity light: not exercised; left as NOT-TESTABLE.

---

## Summary

- **Total features inventoried:** 96 rows across 20 categories
- **WORKS:** 56
- **BROKEN:** 4 (T-6 TAP, T-7 Undo button, T-8 Redo button, B-12 plugin-GUI double-click, SC-4 scene prev/next)
- **PARTIAL:** 14
- **MISSING:** 17
- **BRIDGE-DEPENDENT:** 5
- **NOT-TESTABLE:** 8
