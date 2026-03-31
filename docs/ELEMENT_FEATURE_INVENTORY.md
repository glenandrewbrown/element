# Element - Complete Feature & UI Component Inventory

**Version:** 1.0
**Date:** 2026-03-31
**Purpose:** Exhaustive catalogue of every feature, tool, built-in node, UI component, interaction pattern, and system capability in Kushview Element. Used to map what UI needs to go where in the redesign.

**Sources cross-referenced:** README.md, CLAUDE.md (project config), docs/index.rst (manual TOC), GitHub release notes (v0.20-v1.0.0), KVR Audio product listing & forum threads (11 pages), Scaler community post, kushview.net product page, Gumroad listing, source file inventory (src/ui/, src/engine/, src/nodes/, src/services/).

---

## 1. APPLICATION MODES

| Feature | Description | Current UI Location | Source |
|---|---|---|---|
| Standalone application | Full windowed app on macOS/Linux/Windows | Main window | README |
| Plugin-in-DAW | Runs as VST3/AU/CLAP inside host DAW | DAW plugin window | README |
| Shared UI | Both modes use the same internal UI | - | CLAUDE.md |

---

## 2. PLUGIN HOSTING ENGINE

### 2.1 Plugin Format Support

| Format | Platform | Status | Source |
|---|---|---|---|
| AU (Audio Unit) | macOS | Supported | README |
| VST3 | All | Supported | README |
| VST2 (Legacy) | All | Optional (requires SDK) | CLAUDE.md |
| LV2 | All | Supported | README |
| CLAP | All | Supported (added v0.46) | Release notes |
| LADSPA | Linux | Supported | README |

### 2.2 Plugin Management

| Feature | Description | Current UI | Source |
|---|---|---|---|
| Plugin scanner | Discovers installed plugins | Background process | CLAUDE.md |
| Out-of-process scanning | Plugin scan in separate process (prevents host crash) | Automatic | Release notes |
| Plugin browser | Tree view sorted by category with search | Left nav panel (PLUGINS section) | UI_UX_DESIGN_BRIEF |
| Plugin search | Text filter on plugin names | Search box in PLUGINS panel | UI_UX_DESIGN_BRIEF |
| Favourites tracking | PluginUsageTracker records frequently used | [NEW - not yet in UI] | CLAUDE.md |
| Recently used tracking | PluginUsageTracker records recent plugins | [NEW - not yet in UI] | CLAUDE.md |
| VST paths configuration | Set directories to scan for VST plugins | Preferences dialog | Docs index |
| VST presets | Load/save VST preset files | Plugin editor context | Docs index |
| Format badges | Show plugin format (AU/VST3/CLAP/LV2) | [Partially - in plugin list] | UI_UX_DESIGN_BRIEF |
| Placeholder nodes | When plugins are missing, audio passes through | Graph editor | README, KVR |
| Plugin sandbox isolation | Out-of-process hosting protects from crashes | Automatic per-node | README, CLAUDE.md |
| Sandbox crash recovery | Automatic state restoration after crash | Automatic | README |
| Xrun detection | Detects audio dropouts, graceful degradation | Status indicator | README |

### 2.3 Plugin GUI Display

| Feature | Description | Current UI | Source |
|---|---|---|---|
| Floating plugin window | Opens plugin GUI in separate window | Double-click node | Legacy |
| Embedded plugin UI | Plugin GUI displayed inside graph editor | Graph canvas | Release notes v0.46 |
| Generic parameter editor | Fallback UI for plugins without custom GUI | Inspector/Node panel | CLAUDE.md |
| Plugin preset browser | Load plugin-native presets | Within plugin editor | KVR forum |

---

## 3. GRAPH SYSTEM

### 3.1 Graph Structure

| Feature | Description | Current UI | Source |
|---|---|---|---|
| Session (Project) | Master file containing all graphs and state | File > New/Open/Save | CLAUDE.md |
| Multiple graphs per session | A session can contain many graphs | Session tree panel | CLAUDE.md |
| Active graph | One graph active at a time for audio | Graph selector | CLAUDE.md |
| Sub-graphing | Nest graphs within each other (depth unlimited) | Double-click sub-graph node | README |
| Graph importing | Load .elg graph files into a session | File menu / drag-drop | Release notes |
| Graph exporting | Save individual graphs as .elg files | File menu | Release notes |
| Switching graphs | Change active graph (for live performance) | Session panel / keyboard | Docs index |
| Graph MIDI channel | Assign MIDI channel per graph | Graph settings | Docs index |

### 3.2 Graph Editor (Canvas)

| Feature | Description | Current UI | Source |
|---|---|---|---|
| Node canvas | Infinite pannable/zoomable 2D canvas | Main content area | CLAUDE.md |
| Snap-to-grid | Nodes align to grid when dragging | Toggle in toolbar | README |
| Auto-align | Align selected nodes horizontally/vertically | Context menu / toolbar | README |
| Lasso selection | Drag to select multiple nodes | Drag on empty canvas | README |
| Shift+click extend | Add to selection with Shift | Mouse interaction | README |
| Minimap navigation | Bird's-eye view (Shift+M to toggle) | Bottom-right overlay | README, CLAUDE.md |
| Node search | Find and insert nodes by name (Cmd+F) | Overlay popup | README, CLAUDE.md |
| QuickAdd | Right-click canvas > search > insert at cursor | Context menu popup | CLAUDE.md |
| Comment boxes | Visual grouping with colour labels (Shift+C) | Canvas overlay, 7 colour presets | README, CLAUDE.md |
| Molecule templates | Save/reload reusable node group patterns | MoleculeLibrary | README, CLAUDE.md |
| Wire activity animation | Audio glow and animated MIDI dots on connections | Canvas cables | README |
| Plugin insertion into wires | Drag plugin onto connection to insert inline | Drag interaction | README |
| Toolbar | 28px bar: breadcrumb, zoom controls, snap toggle, layout direction, comment box button | Top of canvas | CLAUDE.md |
| Breadcrumb navigation | Hierarchical trail showing current graph depth | Graph toolbar | CLAUDE.md |
| Zoom controls | Zoom in/out/fit (Cmd+=/Cmd+-/Cmd+0) | Graph toolbar (always visible) | CLAUDE.md |
| Layout direction toggle | Horizontal / Vertical flow | Graph toolbar | CLAUDE.md |
| Cable routing | Point-to-point bezier curves | Between ports | UI_UX_DESIGN_BRIEF |
| Ghost connectors | Auto-connect suggestions | When dragging near ports | UI_UX_DESIGN_BRIEF |
| Undo/Redo | Multiple levels of undo | Cmd+Z / Cmd+Shift+Z | README |
| Copy/Paste nodes | Duplicate selections | Cmd+C / Cmd+V | Standard |
| Duplicate nodes | Duplicate selected (Cmd+D) | Keyboard shortcut | CLAUDE.md |
| Rename nodes | Rename selected (Cmd+T / Cmd+R) | Keyboard shortcut | CLAUDE.md |

### 3.3 Node (Block) Properties

| Feature | Description | Current UI | Source |
|---|---|---|---|
| Node colour | Set node header colour (8 presets) | Right-click > Colour | Release notes, UI_UX_DESIGN_BRIEF |
| Block display modes | Compact and Small display options | Right-click menu | Release notes |
| Bypass toggle | Bypass individual node | Per-node control | Standard |
| Mute toggle | Mute individual node | Per-node control | Standard |
| Node ports (Audio) | Audio input/output connectors | On node edges | CLAUDE.md |
| Node ports (MIDI) | MIDI input/output connectors | On node edges | CLAUDE.md |
| Node I/O configuration | Channel count and routing per node | Inspector panel | UI_UX_DESIGN_BRIEF |
| Node latency display | Latency introduced by this node | Inspector panel | UI_UX_DESIGN_BRIEF |

### 3.4 Reroute Nodes (NEW)

| Feature | Description | Current UI | Source |
|---|---|---|---|
| Generic reroute | Signal reroute for cleaner layouts | Insert in graph | README, CLAUDE.md |
| Audio reroute | Audio-specific reroute node | Insert in graph | README, CLAUDE.md |
| MIDI reroute | MIDI-specific reroute node | Insert in graph | README, CLAUDE.md |

---

## 4. BUILT-IN NODE TYPES

| Node | ID | Purpose | Category | Source |
|---|---|---|---|---|
| Audio Router | `el.AudioRouter` | Route audio between channels | Logic | CLAUDE.md |
| MIDI Router | `el.MidiRouter` | Route MIDI between channels | Logic | CLAUDE.md |
| MIDI Monitor | `el.MidiMonitor` | Display MIDI messages | Logic | CLAUDE.md |
| MIDI Channel Splitter | `el.MidiChannelSplitter` | Split MIDI by channel | Logic | CLAUDE.md |
| MIDI Program Map | `el.MidiProgramMap` | Map MIDI programs | Logic | CLAUDE.md |
| MIDI Set List | - | Set list with tempo change per entry | Logic | Release notes |
| OSC Sender | `el.OSCSender` | Send OSC messages | Logic | CLAUDE.md |
| OSC Receiver | `el.OSCReceiver` | Receive OSC messages | Logic | CLAUDE.md |
| Script (Lua) | `el.Script` | Custom Lua DSP/UI node | Logic | CLAUDE.md |
| Reroute (Generic) | `el.Reroute` | Generic signal reroute | Utility | CLAUDE.md |
| Audio Reroute | `el.AudioReroute` | Audio-only reroute | Utility | CLAUDE.md |
| MIDI Reroute | `el.MidiReroute` | MIDI-only reroute | Utility | CLAUDE.md |
| Audio File Player | - | Play audio files with transport | Generator | Release notes |
| Placeholder | - | Passes audio when plugin is missing | Utility | README, KVR |
| Audio Input | - | System audio input device | Generator | Standard |
| Audio Output | - | System audio output device | Modifier | Standard |
| MIDI Input | - | System MIDI input device | Generator | Standard |
| MIDI Output | - | System MIDI output device | Logic | Standard |

---

## 5. NAVIGATION & PANELS

### 5.1 Navigation Panel (Left Sidebar)

Current implementation: Icon sidebar with 4 panels (replaces old 7-section accordion).

| Panel | Shortcut | Purpose | Contents | Source |
|---|---|---|---|---|
| Session | Cmd+1 | Session structure | Session tree (graphs, nodes hierarchy) | CLAUDE.md |
| Browse | Cmd+2 | Plugin + Session browser | Tabbed: Plugins tab + Sessions tab | CLAUDE.md |
| Inspector | Cmd+3 | Properties of selection | Node properties, Graph properties (tabbed, auto-activates) | CLAUDE.md |
| Editor | Cmd+4 | Node editor view | Plugin parameter editor / Lua script editor | CLAUDE.md |

### 5.2 Main Content Area

| View | Description | When Shown | Source |
|---|---|---|---|
| Graph Editor | Node canvas with connections | Default view | CLAUDE.md |
| Plugin Editor | Selected plugin's native GUI | Double-click node (or embedded) | CLAUDE.md |
| Preferences | App settings | View menu | CLAUDE.md |
| Console | Lua scripting console | View menu | CLAUDE.md |

### 5.3 Top Toolbar (Transport Bar)

| Control | Description | Source |
|---|---|---|
| BPM display/edit | Tempo in beats per minute | UI_UX_DESIGN_BRIEF |
| TAP tempo | Tap to set tempo | UI_UX_DESIGN_BRIEF |
| Time Signature | Beats per bar and beat division | UI_UX_DESIGN_BRIEF |
| Transport Play/Stop | Space bar toggles | Standard |
| Rewind | Return to start | Standard |

### 5.4 Status Bar (Bottom)

| Info | Description | Source |
|---|---|---|
| Audio device name | Currently selected audio device | UI_UX_DESIGN_BRIEF |
| Engine status | Running / Stopped / Error | UI_UX_DESIGN_BRIEF |
| Sample rate | Current sample rate | CLAUDE.md |
| Buffer size | Current buffer size | CLAUDE.md |
| Latency | Total system latency | CLAUDE.md |

---

## 6. AUDIO ENGINE

| Feature | Description | Source |
|---|---|---|
| Audio device management | Select input/output devices, sample rate, buffer size | DeviceService, CLAUDE.md |
| JACK support | JACK audio server on Linux/macOS/Windows | Release notes v0.46 |
| Root graph channel independence | Root graph channels independent from audio interface | Release notes |
| Lock-free audio processing | No mutex on audio thread, atomic pointer swap | CLAUDE.md |
| Graph builder | Builds processing graph from node topology | CLAUDE.md |
| Oversampling | Process at higher sample rate for quality | Release notes |
| Automatic connections | Auto-connect nodes when inserted | Docs index |

---

## 7. MIDI SYSTEM

| Feature | Description | Current UI | Source |
|---|---|---|---|
| MIDI routing | Route MIDI between any nodes | Graph connections | README |
| MIDI controller mapping | Map MIDI CC/notes to parameters | Mapping panel / learn mode | Docs index, KVR |
| MIDI clock sync (external) | Sync to external MIDI clock | Preferences | README, Docs index |
| MIDI clock send | Send MIDI clock to external devices | Preferences | Standard |
| Virtual keyboard | Built-in on-screen MIDI keyboard | Toggle panel | README, Docs index |
| Keyboard splits | Split keyboard range for different instruments | Docs index feature | Docs index |
| Velocity curves | Customise MIDI velocity response | Docs index feature | Docs index |
| MIDI channel per graph | Assign MIDI channels to graphs | Graph settings | Docs index |
| MIDI program change | Switch presets/graphs via program change | MIDI mapping | CLAUDE.md |

---

## 8. SCRIPTING SYSTEM (Lua)

| Feature | Description | Current UI | Source |
|---|---|---|---|
| Lua scripting engine | Execute Lua scripts for custom DSP | Script node / Console | CLAUDE.md, Docs |
| Script node | Custom Lua DSP processor in graph | Graph node | CLAUDE.md |
| Custom DSP scripts | Write audio/MIDI processing in Lua | Script editor | Docs index |
| Custom DSP UI scripts | Create custom UIs for script nodes | Script editor | README |
| Script types | Multiple script types (DSP, UI, utility) | Script editor | Docs index |
| Element Lua API | Full Lua API for Element control | api.kushview.net/lua/el/latest | Docs index |
| Console view | Interactive Lua REPL console | View menu | CLAUDE.md |

---

## 9. OSC (Open Sound Control)

| Feature | Description | Source |
|---|---|---|
| OSC send | Send OSC messages from graph | OSCSender node, Docs index |
| OSC receive | Receive OSC messages into graph | OSCReceiver node, Docs index |
| OSC service | System-level OSC communication | OscService, CLAUDE.md |

---

## 10. SESSION & FILE MANAGEMENT

| Feature | Description | Current UI | Source |
|---|---|---|---|
| Session files (.els) | Complete project save/load | File menu | CLAUDE.md |
| Graph files (.elg) | Individual graph export/import | File menu / drag-drop | Release notes |
| Preset files (.eln/.elpreset) | Node/chain presets | Context menu | UI_UX_DESIGN_BRIEF |
| Controller files (.elc) | MIDI controller mappings | Mapping panel | UI_UX_DESIGN_BRIEF |
| Session browser | Browse saved sessions by date | Sessions tab in Browse panel | CLAUDE.md |
| Data path browser | Raw filesystem tree browser | [REMOVED - via File menu now] | CLAUDE.md |
| File > Open Recent | Recent sessions submenu | File menu | UI_UX_DESIGN_BRIEF |
| Session backup | Manual backup recommended before v1.0 migration | - | Release notes |

---

## 11. PREFERENCES / SETTINGS

| Setting Category | Settings | Source |
|---|---|---|
| Audio | Device selection, sample rate, buffer size, channel config | Docs index |
| MIDI | MIDI device selection, MIDI clock sync | Docs index |
| Plugins | VST/AU/LV2/CLAP search paths, scan behaviour | Docs index |
| General | Key mappings, UI preferences | Docs index |
| Scripting | Script paths, console settings | CLAUDE.md |

---

## 12. KEYBOARD SHORTCUTS

| Shortcut | Action | Source |
|---|---|---|
| Cmd+1/2/3/4 | Switch sidebar panels | CLAUDE.md |
| Cmd+= / Cmd+- | Zoom in/out | CLAUDE.md |
| Cmd+0 | Fit graph to view | CLAUDE.md |
| Cmd+D | Duplicate selected nodes | CLAUDE.md |
| Cmd+T / Cmd+R | Rename selected node | CLAUDE.md |
| Cmd+F | Open node search | CLAUDE.md |
| Cmd+S | Save session | Standard |
| Cmd+N | New session | Standard |
| Cmd+Z / Cmd+Shift+Z | Undo / Redo | Standard |
| Shift+C | Create comment box | CLAUDE.md |
| Shift+M | Toggle minimap | CLAUDE.md |
| Delete / Backspace | Delete selected | Standard |
| Space | Toggle play/stop | Standard |
| Right-click canvas | QuickAdd popup | CLAUDE.md |
| Custom mappings | User-configurable shortcuts | Docs index |

---

## 13. PERFORMANCE & MONITORING

| Feature | Description | Current UI | Source |
|---|---|---|---|
| Meter bridge | Audio interface signal level display | View (added v0.46) | Release notes |
| Graph mixer | Fader-based mixer view for graph nodes | View | Release notes |
| CPU monitoring | Per-node and total CPU load | Status bar / [per-node planned] | CLAUDE.md |
| Performance parameters | Exposed parameters for DAW automation (plugin mode) | Plugin version | Docs index |
| Macro controls | User-tagged parameters exposed in plugin | Plugin version | KVR forum |

---

## 14. PLATFORM-SPECIFIC FEATURES

| Feature | Platform | Source |
|---|---|---|
| JACK audio support | Linux, macOS, Windows | Release notes |
| CoreAudio | macOS | Standard |
| ASIO support | Windows (optional build flag) | CLAUDE.md |
| ALSA | Linux | Standard |
| Code signing | macOS (codesign + notarize scripts) | CLAUDE.md |
| DMG/PKG installer | macOS | CLAUDE.md |
| AppImage | Linux | Release notes |

---

## 15. FEATURES FROM CLAUDE.md (NEW/IN-PROGRESS)

These features are documented in the project's CLAUDE.md but may not yet be fully exposed in the UI:

| Feature | Status | Source File | Description |
|---|---|---|---|
| Plugin sandbox isolation | Implemented | sandboxhost.hpp, sandboxworker.hpp | Out-of-process plugin hosting with shared memory IPC |
| Lock-free shared audio buffer | Implemented | sandboxipc.hpp | SharedAudioBuffer for sandbox communication |
| Reroute nodes (3 types) | Implemented | reroutenode.hpp | Generic, Audio, MIDI reroute |
| Molecule library | Implemented | moleculemanager.hpp | Reusable node template patterns |
| Plugin usage tracker | Implemented | pluginusagetracker.hpp | Favourites + recently used (owned by PluginManager) |
| Graph editor toolbar | Implemented | graphtoolbar.hpp | 28px bar with breadcrumb, zoom, toggles |
| Browse panel (tabbed) | Implemented | browsepanel.hpp | Plugins + Sessions tabs |
| Inspector panel (tabbed) | Implemented | inspectorpanel.hpp | Node + Graph properties with auto-activation |
| Icon sidebar navigation | Implemented | navigation.hpp | 4-panel icon navigation replacing accordion |
| QuickAdd component | Implemented | quickaddcomponent.hpp | Right-click canvas search popup |
| Comment box component | Implemented | commentboxcomponent.hpp | Visual grouping with colours |
| Minimap component | Implemented | minimapcomponent.hpp | Bird's-eye navigation |
| Node search component | Implemented | nodesearchcomponent.hpp | Cmd+F search overlay |
| AX-based UI verification | Implemented | tools/automation/ | Automated UI testing via Accessibility API |
| WebView bridge | PLANNED | [New] | React frontend via WebBrowserComponent |

---

## 16. UI COMPONENT MAP (Source File to Feature)

Every C++ UI source file and what it renders:

| Source File | UI Component | What the User Sees |
|---|---|---|
| `src/ui/grapheditorcomponent.hpp` | Graph Editor | Main node canvas (~2000 lines) |
| `src/ui/block.hpp/cpp` | Node Blocks | Individual plugin/node rectangles |
| `src/ui/grapheditorcomponent.cpp` (ConnectorComponent) | Connections/Cables | Wires between nodes |
| `src/ui/minimapcomponent.hpp/cpp` | Minimap | Bird's-eye view overlay |
| `src/ui/commentboxcomponent.hpp/cpp` | Comment Boxes | Coloured grouping rectangles |
| `src/ui/nodesearchcomponent.hpp/cpp` | Node Search | Cmd+F search overlay |
| `src/ui/quickaddcomponent.hpp/cpp` | QuickAdd | Right-click insert popup |
| `src/ui/moleculemanager.hpp/cpp` | Molecules | Saved node templates |
| `src/ui/pluginusagetracker.hpp` | Usage Tracking | Favourites/recently used data |
| `src/ui/graphtoolbar.hpp` | Graph Toolbar | Breadcrumb, zoom, toggles bar |
| `src/ui/browsepanel.hpp` | Browse Panel | Tabbed plugins + sessions |
| `src/ui/inspectorpanel.hpp` | Inspector Panel | Node/graph properties |
| `src/ui/navigation.cpp` | Navigation Sidebar | 4-icon panel switcher |
| `src/ui/pluginspanelview.cpp/hpp` | Plugin Browser | Plugin list with search |
| `src/ui/sessionbrowserpanel.cpp/hpp` | Session Browser | Session file list |
| `src/ui/standard.cpp` | Main Content | Content area routing |
| `src/ui/style.cpp` + `include/element/ui/style.hpp` | Theme/Colours | All colour definitions |
| `src/ui/contextmenus.hpp` | Context Menus | Right-click menus throughout |

---

## 17. SERVICES (Backend Systems with UI Implications)

| Service | File | UI Touchpoints |
|---|---|---|
| DeviceService | `src/services/deviceservice.cpp` | Audio/MIDI device preferences, status bar |
| EngineService | `src/services/engineservice.cpp` | Engine start/stop, status indicator |
| GuiService | `src/services/guiservice.cpp` | Window management, panel layout |
| MappingService | `src/services/mappingservice.cpp` | MIDI controller mapping UI |
| OscService | `src/services/oscservice.cpp` | OSC configuration |
| PresetService | `src/services/presetservice.cpp` | Preset save/load/browse |
| SessionService | `src/services/sessionservice.cpp` | Session file management |

---

## 18. FEATURE SUMMARY BY COUNT

| Category | Count |
|---|---|
| Plugin formats supported | 6 (AU, VST3, VST2, LV2, CLAP, LADSPA) |
| Built-in node types | 16+ |
| UI panels/views | 8 (4 sidebar + graph editor + plugin editor + preferences + console) |
| Graph editor tools | 12 (minimap, search, quickadd, comment, molecule, snap, align, lasso, breadcrumb, zoom, layout, wire animation) |
| Keyboard shortcuts | 15+ default (user-customisable) |
| File types | 5 (.els, .elg, .eln, .elpreset, .elc) |
| Backend services | 7 |
| C++ UI source files | 18+ |
| Documentation pages | 16 (from docs/index.rst TOC) |

---

*This inventory is derived from publicly available sources and the uploaded project files. Features marked [NEW] or [PLANNED] may not be in the current shipping build but are documented in the project's CLAUDE.md.*
