# Feature-parity audit — React webview vs native JUCE Element

**Date:** 2026-05-31
**Author:** parity-audit subagent (read-only on code)
**Baseline:** native JUCE Element (`src/ui/**`) = the feature reference.
**Subject:** React webview (`webview/src/**`) + the `window.__JUCE__` bridge (`src/ui/element_webview_host.cpp`).
**Build spec:** 37 locked verdicts (`.omo/bakeoff/VERDICTS.md`). Objective: `.omo/HORIZON-v3-ui.md`. Method: `.omo/plans/mvp-bakeoff-plan.md`.
**Reference pattern:** the V3 Block (`webview/src/components/canvas/Block.tsx` + `.nodeblock-v3` design system in `webview/src/index.css`) — every carried-over component should follow it.

> **Status semantics**
> - **Present** = real React UI wired to a real bridge call (or snapshot field).
> - **Partial** = some React UI exists but a sub-capability or the wiring is incomplete / stopgap.
> - **MISSING** = no React UI carries it today. Split into:
>   - **MISSING-mapped** — a verdict in the 37 owns it (tracked; will be built).
>   - **MISSING-orphan** — **no verdict owns it → at-risk-of-loss.** This is the headline finding.
> - **Shelved** = deliberately cut (decisions D3 / Perform-shelved). NOT a gap.
> - **Backend** = engine/host, not user-facing UI. N/A for this audit.

---

## 0. Method note — what was actually verified

- Bridge surface read from `src/ui/element_webview_host.cpp` (≈90 `element*` natives registered).
- Webview call sites read from `webview/src/hooks/useJuceBridge.ts`, `webview/src/bridge/*`, and the Zustand stores.
- Native UI inventory from `src/ui/**` (≈90 `.cpp/.hpp` files) + `docs/ELEMENT_FEATURE_INVENTORY.md` + `docs/WEBVIEW_PARITY_MATRIX.md`.
- Every "Present" claim is backed by an existing component file + a bridge call; every "MISSING" claim was confirmed by a negative grep across `webview/src` (excluding tests/stories) **and** the C++ bridge.

---

## 1. Must-keep parity table (user-facing native features)

### 1.1 Plugin hosting / browser

| # | Native feature | Native source | Web status | Verdict owner | Notes |
|---|----------------|---------------|------------|---------------|-------|
| P1 | Plugin browser + search | `pluginspanelview.cpp`, `browsepanel.hpp` | **Present** | #5 | `elementGetPluginList` + `ToolPalette` / `usePluginBrowserStore`. |
| P2 | Favourites / recently used | `pluginusagetracker.hpp` | **Present** | #5 | snapshot fav/recent ids in browser store. |
| P3 | Format badges (AU/VST3/CLAP/LV2) | plugin list | **Present** | #13 | `NeuBadge` format chips. |
| P4 | **Plugin scan / rescan** | `pluginmanagercomponent.cpp` | **MISSING-mapped** | #5, #33 | No bridge fn, no React UI. HORIZON "#1 native gap, no app without it". |
| P5 | **Plugin search paths config** | `preferences.cpp` | **MISSING-mapped** | #5, #33 | Add/remove scan directories. None in webview. |
| P6 | **Format enable/disable toggles** | `preferences.cpp` | **MISSING-mapped** | #33 | Per-format scan toggles. Absent. |
| P7 | Floating plugin window | `pluginwindow.cpp` | **Present** | #6 | `elementPluginEditorOpen/Close/Float/SetBounds`. |
| P8 | Embedded plugin GUI (host overlay) | `pluginwindow.cpp` | **Partial** | #6 | Embed path exists; Windows HWND z-order parenting unverified (per matrix §2). |
| P9 | Generic parameter editor | `nodepropertiesview.cpp`, `inspectorpanel.hpp` | **Present** | #6 | `elementGetNodeParameters` / `elementSetNodeParameter` in `InspectorHub`. |
| P10 | Replace plugin in-place | `contextmenus.hpp` | **MISSING-mapped** | #28 | Native node-menu op dropped in React. |
| P11 | Oversampling (Off/2×/4×/8×) | `contextmenus.hpp` | **MISSING-mapped** | #28 | Native node-menu op dropped in React. |
| P12 | Node presets (save/default/factory/FXB-FXP/program) | `contextmenus.hpp`, `presetservice.cpp` | **Partial / MISSING-mapped** | #28, #20 | `elementPreset*` exists for A/B compare; the **full** native preset submenu (factory/FXB-FXP/program-select) is not in the React menu. |

### 1.2 Graph / canvas

| # | Native feature | Native source | Web status | Verdict owner | Notes |
|---|----------------|---------------|------------|---------------|-------|
| G1 | Node canvas pan/zoom/snap | `grapheditorcomponent.cpp`, `graphtoolbar.hpp` | **Present** | #3 | React Flow `GraphCanvas` + `elementGraphSetCanvasOptions`. |
| G2 | Lasso / shift-extend select | graph editor | **Present** | #3 | React Flow native. |
| G3 | Minimap (Shift+M) | `minimapcomponent.cpp` | **Present** | #21 | RF minimap (restyle pending). |
| G4 | Node search / QuickAdd | `nodesearchcomponent.hpp`, `quickaddcomponent.hpp` | **Present** | #27, #7 | `QuickAddPopup` + `CommandPalette`. |
| G5 | Comment boxes (Shift+C, colours) | `commentboxcomponent.hpp` | **Present** | #26 | `CommentFrame` + comment CRUD natives. |
| G6 | Molecules (templates) | `moleculemanager.cpp` | **Partial** | #20 | `elementMoleculeInsert` (insert-by-name); save/manage UX partial. |
| G7 | Wire activity animation | connectors | **Present** | #2 | `Cable` live RMS glow. |
| G8 | Insert plugin into wire (inline) | connectors | **Partial** | #2 | Add-on-wire not fully wired (matrix §3.2). |
| G9 | Undo / redo | `guiservice.cpp` | **Present** | — | `elementUndo` / `elementRedo`. |
| G10 | Copy / paste / duplicate / rename | messages | **Present** | — | `elementGraphCopyNodes`/`PasteNodes`/`Duplicate*`/`RenameNode`. |
| G11 | Bypass / mute / mute-input | `block.cpp` | **Present** | #1 | `elementGraphSetBypass`/`SetMute`/`SetMuteInput`. |
| G12 | Node colour (8 presets) | `contextmenus.hpp` | **MISSING-mapped** | #28 | `color` snapshot read; user-set colour menu op absent. |
| G13 | Disconnect submenu (All/MIDI/In/Out) | `contextmenus.hpp` | **MISSING-mapped** | #28 | Dropped native node-menu op. |
| G14 | Connect-via Sources/Destinations | `contextmenus.hpp` | **MISSING-mapped** | #28 | Dropped native node-menu op. |
| G15 | Auto-align / arrange | graph editor | **Partial** | #3 | arrange toolbar (H/V/distribute/Clean) is verdict-scoped, not yet built. |
| G16 | Breadcrumb + nested-board navigation | `breadcrumb.hpp`, `grapheditorcomponent.cpp` | **Partial** | #24 ⭐ | `Breadcrumb` exists; full enter/exit + nested-state chrome (frame/depth-ribbon/banner/EXIT) is Glen's TOP-priority build, not yet shipped. |
| G17 | Sub-graph / container nest + portals | `grapheditorcomponent.cpp` | **Partial** | #24 | dive gesture present in snapshot; full nested wiring partial. |
| G18 | I/O config / port table | `nodeportstable.cpp`, `ioconfigurationwindow.cpp` | **Partial** | #6, #31 | Inspector shows ports; full channel/bus I/O config window not ported. |

### 1.3 Navigation, panels, shell

| # | Native feature | Native source | Web status | Verdict owner | Notes |
|---|----------------|---------------|------------|---------------|-------|
| N1 | Session tree | `sessiontreepanel.cpp` | **Present** | — | `SessionTree` + `elementSessionGetGraphTree`. |
| N2 | Browse (plugins/sessions tabs) | `browsepanel.hpp`, `sessionbrowserpanel.cpp` | **Present** | #5 | Plugins + Projects tabs. |
| N3 | Inspector (node/graph tabbed) | `inspectorpanel.hpp` | **Present** | #6 | `InspectorHub`. |
| N4 | Toolbar / transport | main window, `transportbar.cpp` | **Partial** | #4, #22 | `Toolbar` exists; fresh Edit-only layout = design pass pending. |
| N5 | Status bar (device/SR/buffer/latency/CPU) | status bar | **Present** | #22 | `StatusBar` reads engine snapshot. |
| N6 | Node editor view (Lua / plugin) | `nodeeditorview.cpp`, `scripteditorview.cpp` | **Partial** | #36 | `ScriptEditor` exists; merge w/ syntax+line-numbers pending. |
| N7 | App shell / layout | `standard.cpp`, `content.cpp` | **Present** | #23 | `AppShell`; slot-model rebuild pending. |

### 1.4 Session / file

| # | Native feature | Native source | Web status | Verdict owner | Notes |
|---|----------------|---------------|------------|---------------|-------|
| S1 | New/Open/Save/Save As | `sessionservice.cpp` | **Present** | — | `elementSession*`. |
| S2 | Open recent | main menu | **Present** | — | `session.recentFiles` + `elementSessionOpenPath`. |
| S3 | Multiple / active graph | `session.cpp` | **Present** | — | `elementSessionSetActiveGraph`. |
| S4 | Import / export .elg | `sessionservice.cpp` | **Present** | — | `elementSessionImportGraph` / `ExportGraph`. |
| S5 | Session browser by date | `sessionbrowserpanel.cpp` | **Present** | #5 | Sessions tab via `elementSessionListFiles`. |
| S6 | Controller files (.elc) save/load | `controllermapsview.cpp` | **MISSING-orphan** | — | MIDI-map persistence to/from `.elc` not in webview prefs. |

### 1.5 Audio / MIDI / scripting / OSC

| # | Native feature | Native source | Web status | Verdict owner | Notes |
|---|----------------|---------------|------------|---------------|-------|
| A1 | Audio device enumeration + apply | `audiodeviceselector.cpp`, `deviceservice.cpp` | **Present** | #33 | `PreferencesModal` + `elementAudioApplySetup` (driver/in/out/SR/buffer). |
| A2 | MIDI controller mapping / learn | `controllermapsview.cpp`, `mappingservice.cpp` | **Present** | #33 | `elementMappingSetLearning` / `RemoveMap` + prefs table. |
| A3 | OSC host config | `oscservice.cpp` | **Present** | #33 | `elementOscApplyHost`. |
| A4 | Virtual keyboard | `virtualkeyboardview.cpp` | **Partial** | #18 | `VirtualKeyboard` + `elementVirtualKeyboardNoteOn/Off`; **velocity control** to re-add (#18). |
| A5 | Lua console (REPL) | `luaconsoleview.cpp` | **Partial** | #36 | `elementOpenLuaConsole` opens native; React console not ported. |
| A6 | Script node editor (save & compile) | `scripteditorview.cpp` | **Present** | #36 | `ScriptEditor` + `elementScriptCompile`/`Set/GetSource`. |
| A7 | **Key-command customisation (keymap editor)** | `keymapeditorview.cpp` | **MISSING-mapped** | #30, #33 | Pulled into MVP. `useKeyboard` has fixed shortcuts; no editor, no `?`-overlay. |
| A8 | **External MIDI clock sync** | `preferences.cpp`, midiengine | **MISSING-orphan** | — | No prefs control, no bridge fn. **No verdict owner.** |
| A9 | **MIDI clock send** | `preferences.cpp`, midiengine | **MISSING-orphan** | — | No prefs control, no bridge fn. **No verdict owner.** |
| A10 | **Keyboard splits (per-range routing)** | docs / midi | **MISSING-orphan** | — | Not in #18 (octave/channel steppers only). **No verdict owner.** |
| A11 | Velocity curves | docs / midi | **MISSING-orphan** | — | #18 re-adds a velocity *control*, not editable response curves. **No verdict owner.** |

### 1.6 Monitoring / performance views

| # | Native feature | Native source | Web status | Verdict owner | Notes |
|---|----------------|---------------|------------|---------------|-------|
| M1 | **Meter bridge** (per-interface-channel levels) | `meterbridge.cpp`, `simplemeter.cpp` | **MISSING-orphan** | — | #22 ships a **master** meter on the bottom strip — that is **not** the multi-channel meter bridge. **No verdict owner.** |
| M2 | **Graph mixer** (fader mixer per node) | `graphmixerview.cpp`, `channelstrip.cpp` | **Partial / MISSING-orphan** | — | React only calls `elementOpenGraphMixer` → opens the **native** window. No React port, **no verdict owner** for a port. Hybrid stopgap. |
| M3 | Per-node CPU + xrun indicator | status / engine | **MISSING-orphan** | — | `StatusBar` shows global CPU; per-node CPU + xrun indicator absent. **No verdict owner.** |
| M4 | Multi-instance / mirror | (Branch-A registry, planned) | **MISSING-mapped** | #19 | InstanceSwitcher + MirrorPanel, MVP-approved. |

### 1.7 Built-in node editors (native-specific)

| # | Native feature | Native source | Web status | Verdict owner | Notes |
|---|----------------|---------------|------------|---------------|-------|
| B1 | MIDI Program Map editor | `nodemidiprogramcomponent.cpp` | **MISSING-orphan** | — | Specialised native node editor; MVP = generic param editor only (HORIZON drift-watch). Backlog, but un-owned by a verdict. |
| B2 | MIDI Set List (tempo-per-entry) | release-notes node | **MISSING-orphan** | — | Specialised editor. Backlog / un-owned. |
| B3 | Connection grid / patch matrix | `connectiongrid.cpp`, `patchmatrix.cpp` | **Partial** | #31, #32 | `ConnectionEditor` + `BusInspector` cover cable-list editing; full grid/matrix view not ported. |
| B4 | Keymap editor view | `keymapeditorview.cpp` | see A7 | #30 | (mapped). |

---

## 2. Out of scope — do NOT treat as gaps

- **Perform mode / Scenes** (`PresetService` scene engine; `usePerformStore`, `SceneLauncher.tsx`) — **Shelved** (Perform stripped from MVP per VERDICTS global adaptation + decision D3). The parity-matrix "Perform scenes" row is **stale**.
- **Dashboard Builder** (`DashboardBuilder.tsx`) — **Shelved** (D3, hide-UI/keep-code).
- **Macro Dashboard** (`MacroDashboard.tsx`) — **Shelved** (D3).
- **Scene/Preset launcher UI** (`SceneLauncher.tsx`) — **Shelved** (D3).

These React files exist but must NOT be wired into V3 nav. They are not at-risk; they are deliberately cut.

## 3. Backend / engine (N/A — not user-facing UI)

Format support (AU/VST3/VST2/LV2/CLAP/LADSPA), out-of-process scanning, sandbox isolation + crash recovery, lock-free audio, graph builder, JACK/CoreAudio/ASIO/ALSA, root-graph channel independence — engine concerns, already marked backend in the matrix. Excluded from parity scoring.

---

## 4. At-risk-of-loss set (ORPHANS — no verdict owns them)

These confirmed native UI features have **no row in the 37 locked verdicts**. If the V3 build ships only the 37, these silently disappear from a feature that ships today. **Each needs a decision: assign to a verdict (extend #22/#28/#33), schedule as a new component, or explicitly accept as a regression.**

1. **Meter bridge** (M1) — per-interface-channel level meters (`meterbridge.cpp`). #22 ≠ this.
2. **Graph mixer** React port (M2) — fader mixer (`graphmixerview.cpp`); today only opens the native window via `elementOpenGraphMixer`.
3. **External MIDI clock sync** (A8).
4. **MIDI clock send** (A9).
5. **Keyboard splits** (A10).
6. **Velocity curves** (A11).
7. **Controller file (.elc) save/load** (S6) — MIDI-map persistence.
8. **Per-node CPU + xrun indicator** (M3).
9. **MIDI Program Map editor** (B1) — specialised native node editor.
10. **MIDI Set List editor** (B2) — specialised native node editor.

**Recommended homes** (for Glen to ratify): A8/A9 → extend **#33 Preferences (MIDI tab)**; A10/A11 → extend **#18 VirtualKeyboard** or #33; M1/M3 → extend **#22 BottomStrip** or a new monitoring component; M2 → confirm native-window stopgap is acceptable for MVP or schedule a React port; S6 → extend **#33 (MIDI tab)**; B1/B2 → confirm BACKLOG (per HORIZON drift-watch, MVP = generic editor only) so they are an *accepted* deferral, not an accidental loss.

---

## 5. Top 10 MISSING by priority

Ordered by explicit project signals (HORIZON m1.4 "#1 native gap"; #30 keymap pulled into MVP; orphans rank high because they silently drop a shipping feature).

| Rank | Missing feature | Class | V3 component owner |
|------|-----------------|-------|--------------------|
| 1 | Plugin scan / rescan / search-paths / format-toggles | MISSING-mapped | #5 Plugin Browser + #33 Preferences |
| 2 | Key-command customisation (keymap editor) + `?`-overlay | MISSING-mapped | #30 Keyboard shortcuts + #33 Preferences |
| 3 | Meter bridge (per-channel level meters) | **ORPHAN** | none — assign to #22 or new monitoring cmp |
| 4 | Graph mixer (React port; today native-window only) | **ORPHAN** | none — confirm stopgap or schedule port |
| 5 | Node context-menu native parity: Oversample · Replace · Color · Disconnect · Connect-via · full Presets/program | MISSING-mapped | #28 NodeContextMenu |
| 6 | External MIDI clock sync + clock send | **ORPHAN** | none — assign to #33 (MIDI tab) |
| 7 | Velocity control + velocity curves | mixed (control mapped #18 / curves ORPHAN) | #18 VirtualKeyboard (+ #33 for curves) |
| 8 | Keyboard splits (per-range routing) | **ORPHAN** | none — assign to #18 or #33 |
| 9 | Controller file (.elc) save/load | **ORPHAN** | none — assign to #33 (MIDI tab) |
| 10 | Per-node CPU + xrun indicator | **ORPHAN** | none — assign to #22 / Block overlay |

---

*Grounded in: `src/ui/**` (native), `webview/src/**` + `src/ui/element_webview_host.cpp` (web/bridge), `.omo/bakeoff/VERDICTS.md`, `.omo/HORIZON-v3-ui.md`, `docs/ELEMENT_FEATURE_INVENTORY.md`, `docs/WEBVIEW_PARITY_MATRIX.md`. Read-only; no code modified.*
