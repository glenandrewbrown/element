---
name: add-node
description: Scaffold a new audio processor node with processor class, NodeFactory registration, and optional editor. Use when "add node", "new node", "create processor", "new effect", "new instrument".
---

# Add Node to Element

Scaffold a new audio processor node with all required boilerplate.

## Arguments

The user should provide:
- **Node name** (e.g., "Compressor", "Delay", "GainStage")
- **Node ID** (optional — defaults to `el.{Name}`)
- **Has editor** (optional — defaults to no)
- **Port configuration** (optional — defaults to stereo audio in + out)

## Steps

### 1. Create Processor Class

Create `src/nodes/{name_lower}.hpp`:

```cpp
#pragma once

#include "nodes/baseprocessor.hpp"

namespace element {

class {Name}Node : public BaseProcessor
{
public:
    {Name}Node()
        : BaseProcessor (false)
    {
        setName ("{Name}");
        // Define ports in constructor — no heavy init here
    }

    ~{Name}Node() override = default;

    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        // Pre-allocate all buffers here — NOT in render()
    }

    void render (RenderContext& rc) override
    {
        auto& audio = rc.audio;
        auto& midi = rc.midi;
        // Process buffers — NO allocations, NO locks
    }

    void releaseResources() override
    {
        // Free pre-allocated buffers
    }

    void getState (juce::MemoryBlock& block) override
    {
        // Serialize parameters
    }

    void setState (const void* data, int sizeInBytes) override
    {
        // Deserialize parameters
    }

private:
    // Pre-allocated buffers and state go here
};

} // namespace element
```

### 2. Register in NodeFactory

Edit `src/engine/nodefactory.cpp` — add to the registration section:

```cpp
#include "nodes/{name_lower}.hpp"

// In NodeFactory constructor or init:
add (new SingleNodeProvider<{Name}Node> ("el.{Name}"));
```

### 3. (Optional) Create Editor

If the node needs a custom UI, create `src/nodes/{name_lower}editor.hpp` with a `juce::Component` subclass. Register it in the node's `createEditor()` override.

### 4. Rebuild

Since sources use `file(GLOB_RECURSE)`, a CMake reconfigure is needed:

```bash
cmake -B build-merged -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0
cmake --build build-merged -j8
```

### 5. Update CLAUDE.md

Add the new node to the "Built-in Node Types" table in CLAUDE.md.

## Checklist

- [ ] Processor class created in `src/nodes/`
- [ ] Registered in `NodeFactory` with `el.{Name}` ID
- [ ] No allocations in `render()` — all buffers pre-allocated in `prepareToRender()`
- [ ] No mutex/locks in audio path
- [ ] State serialization implemented (`getState`/`setState`)
- [ ] CMake reconfigured (GLOB_RECURSE needs it for new files)
- [ ] Builds and runs without errors
- [ ] Added to Built-in Node Types table in CLAUDE.md

## Real-time Safety Reminder

The `render()` method runs on the audio thread. NEVER:
- Allocate memory (`new`, `std::string`, `juce::String`)
- Use mutexes or locks
- Perform file I/O or network calls
- Call `DBG()` or `Logger::writeToLog()`

Use `prepareToRender()` to set up all resources.
