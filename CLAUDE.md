# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

Element is an advanced audio plugin host built with JUCE, supporting AU/LV2/VST/VST3/CLAP plugin formats. It provides a modular node-based graph system for creating complex audio routing, instruments, and effects chains.

**Target platforms:** macOS, Linux, Windows
**C++ Standard:** C++20
**License:** GPL-3.0-or-later

## Build Commands

```bash
# Configure (from repo root)
cmake -B build

# Build
cmake --build build

# Build with parallel jobs
cmake --build build -j8

# Run tests
cd build && ctest --output-on-failure

# Run specific test suite
cd build && ctest -R "NodeTests"

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
- **Git submodules:** `git submodule update --init --recursive`

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
│   │   └── ...
│   ├── nodes/             # Built-in node implementations
│   ├── ui/                # User interface components
│   │   ├── grapheditorcomponent.hpp  # Main graph editor
│   │   ├── block.hpp                 # Node block UI
│   │   ├── minimapcomponent.hpp      # Graph minimap navigation
│   │   ├── commentboxcomponent.hpp   # Visual grouping boxes
│   │   ├── nodesearchcomponent.hpp   # Quick node search
│   │   └── moleculemanager.hpp       # Node template management
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
├── scripts/               # Lua scripts
├── data/                  # Resources (icons, fonts, etc.)
└── deps/                  # Git submodules (JUCE, sol2, lvtk, clap-juce-extensions)
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

### Audio Processing Flow

1. Session contains root `Graph` nodes
2. `GraphManager` builds engine representation
3. `GraphBuilder` creates `GraphOp` sequence
4. Audio thread executes ops in order
5. Each `GraphNode` wraps a `Processor`

### Plugin Support

- **Internal:** Built-in nodes (audio I/O, MIDI, reroute, etc.)
- **AU:** AudioUnit (macOS)
- **VST3:** Steinberg VST3
- **VST2:** Legacy VST (optional, requires SDK)
- **LV2:** Linux Audio Plugins
- **CLAP:** CLever Audio Plugin

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
| Reroute | `el.Reroute` | Generic signal reroute |
| AudioReroute | `el.AudioReroute` | Audio signal reroute |
| MidiReroute | `el.MidiReroute` | MIDI signal reroute |

## Testing

Uses **Boost.Test** framework with CTest integration.

```bash
# Run all tests
cd build && ctest

# Run specific test
./test_element --run_test=NodeTests

# Run with verbose output
./test_element --log_level=all
```

### Test Structure
- `test/fixture/` - Test fixtures (headers: TestNode.h, PreparedGraph.h, context.hpp)
- `test/engine/` - Engine-specific tests (LinearFade, MidiChannelMap, VelocityCurve)
- `test/scripting/` - Lua scripting tests
- `test/integration/` - Integration tests (SessionChanged)
- `test/TestMain.cpp` - Main test runner with JUCE MessageManager fixture

## Coding Guidelines

### Style
- Uses `.clang-format` for formatting
- Namespace: `element`
- Header guards: `#pragma once`
- JUCE coding conventions

### Patterns
- PIMPL idiom for implementation hiding (`class Impl`)
- ValueTree for serializable state
- Listener pattern for callbacks
- Factory pattern for node creation

### Real-time Safety
- No allocations in audio callbacks
- Use lock-free structures for audio thread
- `RingBuffer` for thread-safe communication
- Pre-allocate buffers

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

## Graph Editor Features

The graph editor (`GraphEditorComponent`) provides visual node editing with these features:

- **Comment Boxes:** Visual grouping with color-coding (`CommentBoxComponent`)
- **Minimap Navigation:** Bird's eye view for large graphs (`MinimapComponent`)
- **Node Search:** Quick node insertion via search (`NodeSearchComponent`)
- **Molecules:** Reusable node templates (`MoleculeManager`)
- **Alignment Tools:** Snap-to-grid, node alignment
- **Lasso Selection:** Multi-select with Shift+click or drag

See `docs/GraphEditorEnhancements_UserManual.md` for detailed usage.

## Common Issues

**Plugin not loading:** Check plugin format support is enabled in build options and plugin paths are configured.

**Audio dropouts:** Increase buffer size in audio settings, check for allocations in audio path.

**Build errors (submodules):** Run `git submodule update --init --recursive`

**Test failures:** Ensure JUCE MessageManager is initialized (handled by test fixtures).

**Lua script errors:** Check scripts in `scripts/` directory. Bindings are in `src/el/`.

## Code Quality Notes

Based on recent code review (see `CODE_REVIEW_REPORT.md`):

- **Magic numbers:** Define named constants instead of hardcoded values (e.g., menu item IDs)
- **Large files:** Consider splitting files over 1000 lines into focused modules
- **Memory:** Prefer `std::make_unique` over raw `new` for immediate smart pointer wrapping
