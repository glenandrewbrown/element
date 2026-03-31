# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## UI/UX Overhaul Context

You are working on the Element audio plugin host UI/UX overhaul.

**CRITICAL CONTEXT:** Load and read `docs/ELEMENT_UNIFIED_BLUEPRINT.md` before doing anything. This is the single source of truth. V3.0 — the Instrument Paradigm.

### Key Facts

- Element is a modular audio plugin host (VST3/AU/LV2/CLAP) built with JUCE 8 / C++20
- UI: React/Tailwind frontend hosted in JUCE's `WebBrowserComponent`
- Graph engine: `@xyflow/react` (React Flow v12) with aggressive memoisation
- Bridge: `window.__JUCE__` API for C++ <-> JS communication
- State: `juce::ValueTree` single source of truth, synced to React via 60Hz Timer
- Three signal types: Audio (blue `#4A90D9`), MIDI (teal `#2BC4C4`), Value/CV (orange `#E8A838`)

### Design Paradigm — The Instrument

Element is a precision creative instrument for expert users in flow state. NOT for beginners. Technical depth surfaced beautifully. Speed of iteration is the supreme metric. Information density IS the beauty. One unified dark palette. No mode-switching colour gimmicks.

### Visual Language — Neumorphism (NOT glass)

No glassmorphism. No backdrop-blur. No transparency. The entire UI is one continuous dark chassis with controls extruded from or pressed into the surface via paired soft shadows. Narrow tonal range between surfaces (critical for the "same material" illusion):

| Token | Hex | Usage |
|-------|-----|-------|
| Canvas | `#1E1E22` | Main background |
| Panel | `#222226` | Side panels, toolbars |
| Surface | `#252529` | Cards, blocks |
| Elevated | `#2A2A2E` | Hover states |
| Pressed | `#1A1A1E` | Inset fields, tracks |

- Raised: light shadow top-left `rgba(255,255,255,0.05)` + dark bottom-right `rgba(0,0,0,0.4)`, 8px blur min
- Pressed: inner shadows inverted. Buttons press INTO the surface on click.
- Micro-glow: 4px outer glow of semantic hue at 25% opacity on active elements

### Semantic Colours (colour-blind safe, each with shape indicator)

- Generators: `#4A90D9` Blue + Circle (●)
- Modifiers: `#E8A838` Orange + Diamond (◆)
- Logic: `#2BC4C4` Teal + Triangle (▲)
- Text: `#E5E5EA` primary, `#8E8E93` secondary

### Speed-First Navigation

| Gesture | Action |
|---------|--------|
| Double-click Block | Dive into nested Board (150ms) |
| Double-click empty canvas | Navigate UP one level (150ms) |
| `Cmd+K` | Command palette (search everything) |
| Right-click canvas | QuickAdd at cursor |
| `Ctrl+0-9` / `Shift+0-9` | Spatial bookmarks |
| `Tab` | Jump to next block in signal chain |
| `Escape` | Deselect / close / back out one level |

### Key Features

- Edit Mode (workshop) / Perform Mode (stage) — structural change, NOT palette change
- Dashboard Builder in Perform Mode (freely composable knobs/faders/buttons/meters/pads)
- Scene/Preset system (multiple parameter snapshots per project, switchable without plugin reload)
- Panic button (red, always visible, sends Note Off to all MIDI outputs)
- Value Events as third signal type (CV/control data independent of MIDI)

### Terminology (mandatory)

| Legacy | New Term | Definition |
|--------|----------|------------|
| Session | **Project** | Master file containing all routings |
| Graph | **Board** | Visual routing canvas |
| Node/Plugin | **Block** | Individual instrument/effect/utility |
| Sub-Graph | **Container** | Nested Board local to project |
| Sub-Graph (linked) | **Portal** | Nested Board linked to external `.elboard` |
| Connection/Arc | **Cable** | Signal path between ports |
| Preset/Template | **Snippet** | Reusable group of Blocks and Cables |

### WebView Frontend Commands

```bash
cd webview

# Install dependencies
npm install

# Development (hot reload at localhost:5173)
npm run dev

# Type check
npx tsc -b

# Production build (outputs to webview/dist/)
npm run build
```

### Frontend Architecture

```
webview/src/
├── data/           # Types, demo graph data, demo perform data
├── stores/         # Zustand stores (useGraphStore, useAppStore, usePerformStore)
├── hooks/          # useKeyboard (global shortcuts)
├── components/
│   ├── neu/        # Neumorphic primitives (NeuButton, NeuKnob, NeuFader, etc.)
│   ├── layout/     # AppShell, Toolbar, panels (ToolPalette, InspectorHub, etc.)
│   └── canvas/     # GraphCanvas, Block, Cable, QuickAddPopup, CommandPalette
└── index.css       # Tailwind + design system tokens + neumorphic utilities
```

---

## Project Overview

Element is an advanced audio plugin host built with JUCE, supporting AU/LV2/VST/VST3/CLAP plugin formats. It provides a modular node-based graph system for creating complex audio routing, instruments, and effects chains.

**Target platforms:** macOS, Linux, Windows
**C++ Standard:** C++20
**JUCE Version:** 8.0.12
**License:** GPL-3.0-or-later

## Build Commands

```bash
# Configure (from repo root)
cmake -B build

# Configure for macOS Sonoma compatibility (required on macOS)
cmake -B build -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0

# Build
cmake --build build

# Build with parallel jobs
cmake --build build -j8

# Preferred build directories:
# build-merged  — development builds (debug, incremental)
# build-release — release builds for installers
# Note: Sources use file(GLOB_RECURSE) — new .cpp files require cmake reconfigure

# Run tests
cd build-merged && ctest --output-on-failure

# Run specific test suite
cd build-merged && ctest -R "NodeTests"

# Clean build
rm -rf build && cmake -B build && cmake --build build
```

### Build Options

```bash
# Enable plugin builds (AU/LV2/VST3)
cmake -B build -DELEMENT_BUILD_PLUGINS=ON

# Enable VST2 support (requires SDK)
cmake -B build -DELEMENT_ENABLE_VST2=ON

# Enable LTO
cmake -B build -DELEMENT_ENABLE_LTO=ON

# Windows ASIO support
cmake -B build -DELEMENT_ENABLE_ASIO=ON
```

### Dependencies

- **macOS:** `brew install boost`
- **Linux:** `apt-get install libboost-dev libfreetype-dev libx11-dev libjack-dev libasound2-dev lv2-dev liblilv-dev libsuil-dev libcurl4-openssl-dev`
- **CMake FetchContent:** JUCE (8.0.12), sol2, lvtk, and clap-juce-extensions are fetched automatically by CMake at configure time. No manual submodule initialization is required for these dependencies.
- **Other submodules:** `git submodule update --init --recursive` (for any remaining submodules)

## Architecture

### Directory Structure
```
element/
├── include/element/       # Public headers
│   ├── context.hpp        # Main application context
│   ├── node.hpp           # Node model (graph nodes)
│   ├── graph.hpp          # Graph model
│   ├── processor.hpp      # Audio processor base
│   └── ...
├── src/
│   ├── engine/            # Audio/MIDI engine
│   │   ├── audioengine.cpp
│   │   ├── graphbuilder.cpp
│   │   ├── graphnode.cpp
│   │   ├── midiengine.cpp
│   │   ├── nodefactory.cpp
│   │   ├── sandboxhost.hpp       # Out-of-process plugin coordination
│   │   ├── sandboxworker.hpp     # Isolated plugin processing worker
│   │   ├── sandboxipc.hpp        # IPC protocol (SharedAudioBuffer, SandboxMessageHeader)
│   │   ├── sandboxsemaphore.hpp  # Cross-platform semaphore (Mach/POSIX/Win)
│   │   ├── sandboxsharedmemory.hpp # Cross-platform shared memory (shm_open/mmap)
│   │   └── ...
│   ├── nodes/             # Built-in node implementations
│   │   ├── sandboxedprocessor.hpp  # SandboxedProcessorNode (graph node wrapper)
│   │   ├── reroutenode.hpp         # RerouteNode, AudioRerouteNode, MidiRerouteNode
│   │   └── ...
│   ├── ui/                # User interface components
│   │   ├── grapheditorcomponent.hpp  # Main graph editor
│   │   ├── block.hpp                 # Node block UI
│   │   ├── minimapcomponent.hpp      # Graph minimap navigation
│   │   ├── commentboxcomponent.hpp   # Visual grouping boxes
│   │   ├── nodesearchcomponent.hpp   # Quick node search
│   │   ├── moleculemanager.hpp       # Molecule, MoleculeLibrary
│   │   ├── pluginusagetracker.hpp    # PluginUsageTracker (owned by PluginManager)
│   │   ├── graphtoolbar.hpp          # Graph editor toolbar (zoom, breadcrumb, toggles)
│   │   ├── browsepanel.hpp           # Tabbed Plugins + Sessions wrapper
│   │   ├── inspectorpanel.hpp        # Tabbed Node + Graph properties wrapper
│   │   └── moleculemanager.cpp
│   ├── services/          # Application services
│   │   ├── deviceservice.cpp
│   │   ├── engineservice.cpp
│   │   ├── guiservice.cpp
│   │   ├── mappingservice.cpp
│   │   ├── oscservice.cpp
│   │   ├── presetservice.cpp
│   │   └── sessionservice.cpp
│   ├── el/                # Lua binding implementations
│   └── lua/               # Lua integration (sol2 wrappers)
├── test/                  # Boost.Test unit tests
│   ├── fixture/           # Test fixtures (headers)
│   ├── engine/            # Engine-specific tests
│   ├── scripting/         # Lua scripting tests
│   └── integration/       # Integration tests
├── scripts/               # Shell scripts and Lua scripts
│   ├── codesign-macos.sh  # macOS code signing
│   ├── notarize-macos.sh  # macOS notarization
│   └── sign-all-macos.sh  # Sign all targets
├── installer/
│   ├── build_pkg.sh       # PKG + DMG installer build (entry point)
│   └── build_dmg.sh       # DMG wrapping (called by build_pkg.sh)
├── cmake/
│   └── entitlements.plist # macOS sandbox entitlements
├── data/                  # Resources (icons, fonts, etc.)
└── docs/                  # User documentation
```

### Core Concepts

**Context** - Main application context managing all subsystems:
- `AudioEngine` - Audio processing graph
- `MidiEngine` - MIDI routing
- `PluginManager` - Plugin discovery/loading
- `ScriptingEngine` - Lua scripting
- `DeviceManager` - Audio/MIDI device management
- `MappingEngine` - MIDI controller mapping
- `Services` - UI and session services

**Node** - Model class representing processors in the graph:
- Wraps a `Processor` (audio processor implementation)
- Contains ports, connections, and state
- Can be a Graph containing other Nodes
- Uses `ValueTree` for serialization

**Graph** - Specialized Node containing other Nodes:
- Manages audio routing via `Arc` connections
- Built into a processing graph via `GraphBuilder`

**Processor** - Base class for audio processing:
- Reference-counted (`ReferenceCountedObject`)
- Uses `RenderContext` for audio/MIDI/CV buffers
- Key methods: `prepareToRender()`, `render()`, `releaseResources()`

**Sandbox** - Out-of-process plugin isolation system:
- `SandboxHost` coordinates the host-side of sandboxed plugins
- `SandboxWorker` runs in a separate process handling isolated plugin processing
- Audio data is exchanged via lock-free shared memory (`SharedAudioBuffer`)
- Control messages use JUCE pipes; synchronization uses platform semaphores

### Key Classes

| Class | File | Purpose |
|-------|------|---------|
| `Context` | include/element/context.hpp | Main application context |
| `Node` | include/element/node.hpp | Node model |
| `Graph` | include/element/graph.hpp | Graph model |
| `Processor` | include/element/processor.hpp | Audio processor base |
| `GraphNode` | src/engine/graphnode.cpp | Engine-side node wrapper |
| `GraphBuilder` | src/engine/graphbuilder.cpp | Builds processing graph |
| `GraphManager` | src/engine/graphmanager.cpp | Manages graph lifecycle |
| `NodeFactory` | src/engine/nodefactory.cpp | Creates node instances |
| `PluginManager` | include/element/plugins.hpp | Plugin management |
| `GraphEditorComponent` | src/ui/grapheditorcomponent.hpp | Visual graph editor |
| `SandboxHost` | src/engine/sandboxhost.hpp | Out-of-process plugin coordination |
| `SandboxWorker` | src/engine/sandboxworker.hpp | Isolated plugin processing worker |
| `SharedAudioBuffer` | src/engine/sandboxipc.hpp | Lock-free shared memory audio buffer |
| `SandboxedProcessorNode` | src/nodes/sandboxedprocessor.hpp | Graph node wrapper for sandboxed plugins |
| `RerouteNode` | src/nodes/reroutenode.hpp | Generic, audio, and MIDI reroute nodes |
| `CommentBoxComponent` | src/ui/commentboxcomponent.hpp | Visual grouping boxes in the graph editor |
| `MinimapComponent` | src/ui/minimapcomponent.hpp | Bird's eye minimap navigation |
| `NodeSearchComponent` | src/ui/nodesearchcomponent.hpp | Quick node insertion via search |
| `QuickAddComponent` | src/ui/quickaddcomponent.hpp | Right-click → search → insert at cursor |
| `MoleculeLibrary` | src/ui/moleculemanager.hpp | Reusable node template library |
| `PluginUsageTracker` | src/ui/pluginusagetracker.hpp | Favorites + recently used tracking (owned by PluginManager) |
| `GraphEditorToolbar` | src/ui/graphtoolbar.hpp | 28px toolbar: breadcrumb + zoom + snap/layout toggles |
| `NavigationPanel` | include/element/ui/navigation.hpp | Icon sidebar navigation (replaces ConcertinaPanel) |
| `BrowsePanel` | src/ui/browsepanel.hpp | Tabbed Plugins + Sessions wrapper |
| `InspectorPanel` | src/ui/inspectorpanel.hpp | Tabbed Node + Graph properties with auto-activation |

### Navigation Architecture

The sidebar uses `NavigationPanel` (icon sidebar with 4 panels), NOT an accordion.
`NavigationConcertinaPanel` is a backward-compat alias for `NavigationPanel`.
Panels are accessed via typed accessors (e.g., `nav->getSessionTreePanel()`),
NOT via `findPanel<T>()`. The `DataPathTreeComponent` panel was removed —
data path access is via File menu.

### Audio Processing Flow

1. Session contains root `Graph` nodes
2. `GraphManager` builds engine representation (message thread)
3. `GraphBuilder` creates `GraphOp` sequence, published via atomic pointer swap
4. Audio thread loads active ops via `std::atomic::load(acquire)` — no lock
5. Each `GraphNode` wraps a `Processor`
6. Sandboxed plugins run in a separate process via `SandboxHost`/`SandboxWorker`; audio crosses the process boundary through lock-free `SharedAudioBuffer` in shared memory, with semaphore signaling for synchronization and JUCE pipes for control messages

### Plugin Support

- **Internal:** Built-in nodes (audio I/O, MIDI, reroute, etc.)
- **AU:** AudioUnit (macOS)
- **VST3:** Steinberg VST3
- **VST2:** Legacy VST (optional, requires SDK)
- **LV2:** Linux Audio Plugins
- **CLAP:** CLever Audio Plugin
- **Sandboxed:** Any format can be wrapped in `SandboxedProcessorNode` for out-of-process isolation

### Built-in Node Types

| Node | ID | Purpose |
|------|---|---------|
| AudioRouter | `el.AudioRouter` | Route audio between channels |
| MidiRouter | `el.MidiRouter` | Route MIDI between channels |
| MidiMonitor | `el.MidiMonitor` | Monitor MIDI messages |
| MidiChannelSplitter | `el.MidiChannelSplitter` | Split MIDI by channel |
| MidiProgramMap | `el.MidiProgramMap` | Map MIDI programs |
| OSCSender | `el.OSCSender` | Send OSC messages |
| OSCReceiver | `el.OSCReceiver` | Receive OSC messages |
| Script | `el.Script` | Lua script node |
| Reroute | `el.Reroute` / `element.reroute` | Generic signal reroute |
| AudioReroute | `el.AudioReroute` / `element.audioReroute` | Audio signal reroute |
| MidiReroute | `el.MidiReroute` / `element.midiReroute` | MIDI signal reroute |

## Testing

Uses **Boost.Test** framework with CTest integration.

```bash
# Run all tests
cd build-merged && ctest --output-on-failure

# Run specific test
cd build-merged && ctest -R "NodeTests"

# Run with verbose output
cd build-merged && ctest --output-on-failure
```

### Test Structure
- `test/fixture/` - Test fixtures (headers: TestNode.h, PreparedGraph.h, context.hpp)
- `test/engine/` - Engine tests (LinearFade, MidiChannelMap, VelocityCurve, SandboxIPC, GraphNodeLockFree)
- `test/scripting/` - Lua scripting tests
- `test/integration/` - Integration tests (SessionChanged)
- `test/SettingsCredentialTest.cpp` - Credential obfuscation round-trip tests
- `test/TestMain.cpp` - Main test runner with JUCE MessageManager fixture

## UI Verification

AX-based autonomous UI verification — no screenshots needed. See `tools/automation/`.

```bash
# Run all UI verification suites (Element must be running)
cd tools/automation && python3 element_verify.py --suite all

# Map the Accessibility tree (for debugging UI issues)
python3 element_ax_map.py --depth 5
```

Suites: `plugin-browser`, `session-browser`, `navigation`, `toolbar`

## Coding Guidelines

### Style
- Uses `.clang-format` for formatting
- Namespace: `element`
- Header guards: `#pragma once`
- JUCE coding conventions
- **Never use `using namespace juce;` in headers** — qualify with `juce::` prefix. Allowed in `.cpp` files only.

### Gotchas
- **PluginProcessor init:** Do NOT initialize the full Context in the constructor — DAW plugin scans call the constructor just to query metadata. Heavy init is deferred to `prepareToPlay()` or `createEditor()`.
- **PluginEditor teardown:** Close plugin windows and clear content BEFORE removing from JUCE component hierarchy — prevents heap corruption in VST3 wrapper.
- **JUCE AXWindows:** `AXWindows` attribute may return empty for JUCE apps. Use `AXMainWindow`/`AXFocusedWindow` as fallback when querying via Accessibility API.

### Patterns
- PIMPL idiom for implementation hiding (`class Impl`)
- ValueTree for serializable state
- Listener pattern for callbacks
- Factory pattern for node creation

### Real-time Safety
- No allocations in audio callbacks
- No mutexes on audio thread — all audio-thread data access uses atomic pointer swaps
- `GraphNode` render ops: `std::atomic<Array<void*>*>` — message thread builds new ops, publishes via `exchange(acq_rel)`, audio thread reads via `load(acquire)`
- MIDI output: `std::atomic<MidiOutput*>` — audio thread reads lock-free, message thread swaps on device change
- Sandbox IPC: lock-free shared memory + platform semaphores (Mach/POSIX/Win), spin-wait + bounded sem_timedwait
- `RingBuffer` for thread-safe communication
- Pre-allocate buffers in `prepareToRender()`, never in `render()`

### Error Handling
- `jassert()` for debug assertions
- JUCE `Result` for error returns
- Logging via `Logger::writeToLog()`

## Common Tasks

### Adding a New Node Type

1. Create processor in `src/nodes/`:
```cpp
#include "nodes/baseprocessor.hpp"

class MyNode : public BaseProcessor {
public:
    MyNode() : BaseProcessor (false) {
        setName ("My Node");
    }

    void prepareToRender (double sampleRate, int maxBufferSize) override {
        // Initialize resources
    }

    void render (RenderContext& rc) override {
        auto& audio = rc.audio;
        auto& midi = rc.midi;
        // Process buffers
    }

    void releaseResources() override {
        // Clean up
    }

    void getState (MemoryBlock& block) override {
        // Save state
    }

    void setState (const void* data, int sizeInBytes) override {
        // Restore state
    }
};
```

2. Register in `NodeFactory` (src/engine/nodefactory.cpp):
```cpp
add (new SingleNodeProvider<MyNode> ("el.MyNode"));
```

3. Add editor in `src/nodes/` if needed (inherit from `Editor`)

4. To run the node out-of-process, wrap it in `SandboxedProcessorNode` instead of registering it directly.

### Working with Sessions

```cpp
auto session = context.session();
auto graph = session->getActiveGraph();
for (int i = 0; i < graph.getNumNodes(); ++i) {
    auto node = graph.getNode(i);
    // Process node...
}
```

### Lua Scripting

Scripts in `scripts/` directory. Bindings in `src/el/`.

```lua
-- Access node
local node = el.node.current()
node:bypass(true)

-- MIDI processing
function process(midi)
    for msg in midi:iter() do
        -- Process messages
    end
end
```

### Building the macOS Installer

The default installer format is a DMG wrapping a PKG. Build numbers auto-increment via `build_number.txt`.

```bash
# Full pipeline: build, sign, package
cmake -B build-release -DCMAKE_BUILD_TYPE=Release -DELEMENT_BUILD_PLUGINS=ON -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0
cmake --build build-release -j8

# Sign all targets (ad-hoc without Developer ID, or set DEVELOPER_ID_APP)
scripts/sign-all-macos.sh build-release

# Build versioned PKG + DMG (auto-increments build number)
# Produces Element-<version>.<build>.dmg
installer/build_pkg.sh 1.2.0 build-release installer/output
```

Build numbering: `build_number.txt` is read and incremented each time `build_pkg.sh` runs. Output files are named `Element-<version>.<build>.pkg` and `.dmg` (e.g., `Element-1.1.0.3.dmg`).

## Graph Editor Features

The graph editor (`GraphEditorComponent`) provides visual node editing with these features:

- **Toolbar:** 28px bar with breadcrumb navigation, zoom controls (always visible), snap-to-grid toggle, layout direction, comment box button. Responsive — optional controls hide at narrow widths.
- **Comment Boxes:** Visual grouping with color-coding (`CommentBoxComponent`)
- **Minimap Navigation:** Bird's eye view for large graphs (`MinimapComponent`)
- **Node Search:** Quick node insertion via search (`NodeSearchComponent`)
- **QuickAdd:** Right-click canvas → inline search popup → insert at cursor (`QuickAddComponent`)
- **Molecules:** Reusable node templates managed by `MoleculeLibrary`; `PluginUsageTracker` records frequently used plugins for quick access
- **Alignment Tools:** Snap-to-grid, node alignment
- **Lasso Selection:** Multi-select with Shift+click or drag

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+1/2/3/4 | Switch sidebar panels (Session/Browse/Inspector/Editor) |
| Cmd+= / Cmd+- | Zoom in/out |
| Cmd+0 | Fit graph to view |
| Cmd+D | Duplicate selected nodes |
| Cmd+T / Cmd+R | Rename selected node |
| Cmd+F | Open node search |
| Shift+C | Create comment box |
| Shift+M | Toggle minimap |
| Delete/Backspace | Delete selected nodes |
| Right-click canvas | QuickAdd popup |

See `docs/GraphEditorEnhancements_UserManual.md` for detailed usage.

## Common Issues

**Plugin not loading:** Check plugin format support is enabled in build options and plugin paths are configured.

**Audio dropouts:** Increase buffer size in audio settings, check for allocations in audio path.

**Build errors (missing dependencies):** JUCE, sol2, lvtk, and clap-juce-extensions are fetched via CMake FetchContent at configure time. Ensure you have an internet connection on first configure. For any remaining submodules run `git submodule update --init --recursive`.

**macOS build errors:** Pass `-DCMAKE_OSX_DEPLOYMENT_TARGET=14.0` to cmake for Sonoma compatibility.

**Sandbox plugin crash:** Check that `cmake/entitlements.plist` includes the required entitlements and that `scripts/codesign-macos.sh` has been run on the worker binary.

**Test failures:** Ensure JUCE MessageManager is initialized (handled by test fixtures).

**Lua script errors:** Check scripts in `scripts/` directory. Bindings are in `src/el/`.

## Code Quality Notes

- **Magic numbers:** Define named constants instead of hardcoded values (e.g., menu item IDs in preferences.cpp, grapheditorcomponent.cpp)
- **Large files:** Consider splitting files over 1000 lines (`clapprovider.cpp` 1867, `node.cpp` 1453, `preferences.cpp` 1315)
- **Memory:** Prefer `std::make_unique` over raw `new` for immediate smart pointer wrapping
- **Namespace:** One remaining `using namespace juce` in a header (`include/element/juce.hpp`) — has FIXME comment
