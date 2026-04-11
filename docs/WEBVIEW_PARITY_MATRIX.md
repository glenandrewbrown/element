# WebView vs classic UI — parity matrix

**Purpose:** Backlog for bringing the React/WebView shell to feature parity with classic JUCE UI.  
**Blueprint audit (MVP UI gate):** [WEBVIEW_BLUEPRINT_AUDIT_CHECKLIST.md](WEBVIEW_BLUEPRINT_AUDIT_CHECKLIST.md).  
**Port policy:** Nothing is **accepted** as native-only long term. Tag **C** = **port queue** (not shipped in Web yet); classic UI is **reference / stopgap** until bridged. See [WEBVIEW_HYBRID_POLICY.md](WEBVIEW_HYBRID_POLICY.md) (full port mandate).

**Tag legend:**

| Tag | Meaning |
|-----|---------|
| **A** | Snapshot-only — extend `buildActiveGraphJson` / TS types; no new native mutation |
| **B** | Bridge mutation — add `element*` native function in `element_webview_host.cpp` (or extend handler) |
| **C** | **Port queue** — must land in Web shell + bridge; classic path is temporary only |
| **D** | Pure React — components, keyboard, layout; calls existing bridge |

**Classic reference:** [ELEMENT_FEATURE_INVENTORY.md](ELEMENT_FEATURE_INVENTORY.md), section 16 (UI component map).

---

## 1. Application modes

| Feature | Tag | Classic / notes | Web status |
|---------|-----|-----------------|------------|
| Standalone / plugin host | A/D | Same binary | Web shell in both when `WebContent` active |
| Shared internal UI | — | `standard.cpp` vs `web_content.cpp` | Factory chooses content type |
| Main menu vs Web shell | — | `mainmenu.cpp` | When `WebContent` active: thinner File/Edit/View to reduce duplication with Toolbar/bridge; `ELEMENT_STANDARD_CONTENT=1` keeps full classic menus |
| About / check updates | B+D | `AboutDialog`, `Updater` | **B** `elementAppGetAbout`, `elementAppCheckForUpdates` + **D** Web modal (Toolbar **About**) |
| Perform scenes (session) | A+B | `PresetService` / future scene engine | **A** `perform` from session `webPerform` VT; **B** `elementPerformSetActiveScene`, `elementPerformAddScene`, `elementPerformCaptureScene`; active scene applies `paramStateJson` snapshot on host |

---

## 2. Plugin hosting (engine)

| Feature | Tag | Classic file | Web status |
|---------|-----|----------------|------------|
| Format support (AU/VST3/…) | — | engine | N/A (backend) |
| Plugin browser + search | A/B/D | `pluginspanelview`, `browsepanel` | Partial: `elementGetPluginList` + ToolPalette |
| Favourites / recently used | B+D | `pluginusagetracker.hpp` | Partial: snapshot favourites/recent ids + ToolPalette |
| VST paths / scan prefs | C+B+D | `preferences`, `pluginmanagercomponent` | **C** port queue → React prefs + bridge |
| Plugin GUI | C+B+D | `pluginwindow`, `grapheditor` | **B** `elementPluginEditorOpen` / `Close` / `SetBounds` / `Float` + host overlay embed; **D** Inspector embed/float; floating path retained. **Windows:** WebView2 HWND parenting vs child plugin HWND must be validated separately (compositing / z-order). |
| Generic parameter editor | B+D | `nodepropertiesview`, `inspectorpanel` | Partial: Inspector + `elementGetNodeParameters` |
| Placeholder / sandbox | A | graph model | Shown as blocks from snapshot |

---

## 3. Graph system

### 3.1 Structure

| Feature | Tag | Classic file | Web status |
|---------|-----|----------------|------------|
| Session file path / dirty | A | `sessionservice`, `sessiondocument` | **A** `session.filePath`, `session.dirty` (snapshot) |
| New / Open / Save / Save As | B | `sessionservice`, `guiservice` | **B** `elementSession*` natives |
| Open recent list | A+B | `UI::recentFiles`, main menu | **A** `session.recentFiles` + **B** `elementSessionOpenPath` |
| Multiple graphs / active graph | A+B | `session.cpp`, session tree | **A** `graphs[]` + **B** `elementSessionSetActiveGraph` |
| Sub-graph / nest | B+D | `grapheditorcomponent` | Partial: double-click container — needs **B** if not wired |
| Import/export .elg | B+D | `sessionservice::importGraph` / export | **B** + Web UI (chooser via bridge OK) |

### 3.2 Canvas

| Feature | Tag | Classic file | Web status |
|---------|-----|----------------|------------|
| Pan/zoom/snap | B+D | `grapheditorcomponent`, `graphtoolbar` | Partial: **A** `canvas` snapshot + **B** `elementGraphSetCanvasOptions`; React Flow snap/grid from prefs |
| Minimap | D | `minimapcomponent` | **D** MiniMap + **A** `canvas.viewport` / `canvas.graphBounds`; **B** `elementGraphSetViewport` on pan/zoom end |
| Lasso / multi-select | D | graph editor | **D** React Flow |
| Node search / QuickAdd | B+D | `nodesearchcomponent`, `quickaddcomponent` | Partial: CommandPalette / plugins |
| Comment boxes | B+D | `commentboxcomponent` | Wired: comment CRUD natives |
| Molecules | B | `moleculemanager` | **B** `elementMoleculeInsert` + ToolPalette (insert by name; classic internal wiring after insert still limited) |
| Wire animation / inline insert | A+D | connectors | **A** metering partial; full **B** for insert-on-wire |
| Undo/redo | B | `guiservice` | Wired: `elementUndo` / `elementRedo` |
| Copy/paste / duplicate / rename | B | messages | Wired |

### 3.3 Node properties

| Feature | Tag | Classic file | Web status |
|---------|-----|----------------|------------|
| Colour / compact modes | B | context menus | **A** `color` on block + Web block outline; host `Colour::toString` |
| Bypass | B | block | Wired |
| Mute | B | block | Wired: **B** `elementGraphSetMute`, `elementGraphSetMuteInput`; snapshot `muted`, `muteInput` |
| I/O config / latency display | A+B | inspector | **A** in snapshot + inspector **D** |

---

## 4. Navigation & panels

| Panel | Tag | Classic | Web status |
|-------|-----|---------|------------|
| Session tree | A+B+D | `sessiontreepanel` | **A** `graphs[]` + **A** `activeGraphOutline` (nested blocks) + **D** ToolPalette |
| Browse (plugins/sessions) | B+D | `browsepanel` | Plugins: `elementGetPluginList` + ToolPalette; Projects: **B** `elementSessionListFiles` + `elementSessionOpenPath` tab |
| Inspector | B+D | `inspectorpanel` | `InspectorHub` + parameters |
| Editor (plugin/Lua) | C+B+D | `nodeeditorview` | **C** port queue → Web editor / embed |
| Transport bar | B+D | main window | Toolbar partial |
| Status (device, SR, buffer) | A+D | status bar | **A** `engine` snapshot + **D** |

---

## 5. Session & file (this milestone)

| Feature | Tag | Implementation |
|---------|-----|----------------|
| Snapshot: `filePath`, `dirty`, `recentFiles`, `graphs[]` | A | `element_webview_host.cpp` |
| `elementSessionNew`, `Save`, `SaveAs`, `Open`, `OpenPath`, `SetActiveGraph` | B | `element_webview_host.cpp` + `SessionService` / `GuiService` |

---

## 6. Preferences, MIDI mapping, Lua, OSC

| Area | Tag | Notes |
|------|-----|-------|
| Full preferences | **C+B+D** | **Must** become React + bridge; native dialog = stopgap |
| Mapping / Lua console / OSC UI | **C+B+D** | **B** `midiMapping` snapshot + `elementMappingSetLearning`, `elementMappingRemoveMap`; **D** Preferences table + learn toggle; Lua/OSC partial via prefs |

---

## 7. Services map (for bridge design)

| Service | File | Typical **B** actions |
|---------|------|------------------------|
| SessionService | `sessionservice.cpp` | new/open/save/saveAs/import/export |
| EngineService | `engineservice.cpp` | add/remove graph, engine graph ops |
| DeviceService | `deviceservice.cpp` | device list, apply audio settings |
| GuiService | `guiservice.cpp` | undo/redo, stabilize, choosers |
| PresetService / MappingService / OscService | respective `.cpp` | Future milestones |

---

## 8. How to use this doc

1. Pick a row; implement **A** before **B** before **D** for that feature.  
2. **C** rows: scheduled port — track in [WEBVIEW_HYBRID_POLICY.md](WEBVIEW_HYBRID_POLICY.md) queue; do not mark “done” until Web UX exists.  
3. After shipping a row, update **Web status** and add a line to [WEBVIEW_QA.md](WEBVIEW_QA.md) checklist (see **Session / file bridge** section).

*Derived from [ELEMENT_FEATURE_INVENTORY.md](ELEMENT_FEATURE_INVENTORY.md) and bridge state as of 2026-04-02.*
