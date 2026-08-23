# Element Forensic Audit Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all CRITICAL and HIGH bugs identified by the 6-agent forensic audit, validated by Gemini peer review and JUCE 8 Context7 documentation research.

**Architecture:** Phased approach — Phase 0 fixes one-line crashers + Lua RCE in 1-2 days. Phase 1 removes RT violations in 1 week. Phase 2 stabilizes services. Phase 3 disables broken sandbox. Each phase produces a commit.

**Tech Stack:** C++20, JUCE 8.0.12, Boost.Test, CMake, sol2 (Lua)

**JUCE 8 Documentation Findings (Context7):**

- `triggerAsyncUpdate()`: JUCE docs explicitly warn "beware of calling from real-time thread, involves posting message to system queue, may block on most OSes" — **audit finding CONFIRMED, Gemini false-positive claim OVERRULED**
- `suspendProcessing()`: Cooperative mechanism — audio thread must check `isSuspended()` voluntarily. Spin-loop on message thread **will hang** if audio thread isn't actively calling processBlock
- `AudioBuffer::setSize(avoidReallocating=true)`: Only avoids realloc if neither channel count nor sample count increase — must pre-allocate to max in `prepareToRender`
- `ScopedNoDenormals`: Not mentioned anywhere in Element codebase — **gap confirmed**

---

## Phase 0: Stop the Bleeding + Lua RCE (1-2 days)

### Task 1: Lua RCE Closure (CRITICAL — 10 minute fix, prevents machine compromise)

**Files:**

- Modify: `src/scripting/bindings.cpp`

- Modify: `src/el/script.lua` (if it exists as embedded resource)

- Test: `test/scripting/dspscripttest.cpp`

- [ ] **Step 1: Write failing test — verify `load()` is blocked**

Add to `test/scripting/dspscripttest.cpp`:

```cpp
BOOST_AUTO_TEST_CASE (LuaSandboxBlocksLoad)
{
    sol::state lua;
    element::Lua::initializeState (lua);

    // load() must not be available — it enables arbitrary code compilation
    sol::object loadFn = lua["load"];
    BOOST_CHECK (loadFn == sol::lua_nil);

    // loadfile() must not be available
    sol::object loadfileFn = lua["loadfile"];
    BOOST_CHECK (loadfileFn == sol::lua_nil);

    // dofile() must not be available
    sol::object dofileFn = lua["dofile"];
    BOOST_CHECK (dofileFn == sol::lua_nil);

    // package.cpath must be empty (prevents native .so/.dylib loading)
    auto cpath = lua["package"]["cpath"].get_or<std::string>("");
    BOOST_CHECK (cpath.empty());

    // package.path must be empty or restricted
    auto path = lua["package"]["path"].get_or<std::string>("");
    BOOST_CHECK (path.find("/usr") == std::string::npos);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd build-bugfix && cmake --build . -j8 && ctest -R "dspscript" --output-on-failure`
Expected: FAIL — `load`, `loadfile`, `dofile` are currently available

- [ ] **Step 3: Strip dangerous globals from Lua state initialization**

In `src/scripting/bindings.cpp`, find `initializeState` and add after existing removals:

```cpp
// Close the Lua sandbox — prevent RCE via session files
lua["load"]     = sol::lua_nil;
lua["loadfile"]  = sol::lua_nil;
lua["dofile"]    = sol::lua_nil;
lua["io"]        = sol::lua_nil;
lua["os"]        = sol::lua_nil;
lua["package"]["cpath"] = "";
lua["package"]["path"]  = "";
lua["package"]["loadlib"] = sol::lua_nil;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd build-bugfix && cmake --build . -j8 && ctest -R "dspscript" --output-on-failure`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scripting/bindings.cpp test/scripting/dspscripttest.cpp
git commit -m "security: close Lua sandbox — strip load/loadfile/dofile/io/os/package.cpath"
```

---

### Task 2: connectChannels Wrong Null Guard (CRITICAL — 1 char fix)

**Files:**

- Modify: `src/engine/graphbuilder.cpp`

- Test: `test/GraphNodeTests.cpp`

- [ ] **Step 1: Write failing test**

```cpp
BOOST_AUTO_TEST_CASE (ConnectChannelsHandlesMissingNodes)
{
    PreparedGraph pg;
    // Connecting with one invalid node ID should not crash
    // (exercises the null guard in connectChannels)
    BOOST_CHECK_NO_THROW (pg.graph.connectChannels (
        PortType::Audio, 99999, 0, 99998, 0));
}
```

- [ ] **Step 2: Run test — should crash or throw (current bug: `&&` instead of `||`)**

Run: `cd build-bugfix && cmake --build . -j8 && ctest -R "GraphNode" --output-on-failure`

- [ ] **Step 3: Fix the null guard**

In `src/engine/graphbuilder.cpp`, find the `connectChannels` null guard and change:

```cpp
// BEFORE (bug):
if (src == nullptr && dst == nullptr)
    return;

// AFTER (fix):
if (src == nullptr || dst == nullptr)
    return;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd build-bugfix && cmake --build . -j8 && ctest -R "GraphNode" --output-on-failure`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/graphbuilder.cpp test/GraphNodeTests.cpp
git commit -m "fix: connectChannels null guard && to || — prevents crash when node missing"
```

---

### Task 3: lastGraph = -1 Crash Guard (CRITICAL)

**Files:**

- Modify: `src/engine/audioengine.cpp`

- [ ] **Step 1: Find and fix the unguarded `getUnchecked(-1)`**

In `src/engine/audioengine.cpp` around line 242, find where `lastGraph` is used with `getUnchecked` and add a bounds check:

```cpp
// BEFORE:
auto* root = graphs.getUnchecked (lastGraph);

// AFTER:
if (lastGraph < 0 || lastGraph >= graphs.size())
    return; // no active graph — output silence
auto* root = graphs.getUnchecked (lastGraph);
```

- [ ] **Step 2: Build and run all tests**

Run: `cd build-bugfix && cmake --build . -j8 && ctest --output-on-failure`
Expected: All pass (33/33)

- [ ] **Step 3: Commit**

```bash
git add src/engine/audioengine.cpp
git commit -m "fix: guard lastGraph bounds — prevents getUnchecked(-1) crash"
```

---

### Task 4: PortBuffer::reset() Atom Header Corruption (CRITICAL)

**Files:**

- Modify: `src/engine/portbuffer.cpp`

- [ ] **Step 1: Fix atom header write guard**

In `src/engine/portbuffer.cpp` `reset()`, guard the LV2 atom header write so it only applies to Atom/Event ports, not Audio ports:

```cpp
void PortBuffer::reset()
{
    if (isAtom() || isEvent())
    {
        // Write atom/event header — only for Atom/Event type ports
        auto* atom = buffer.atom;
        atom->size = 0;
        atom->type = /* appropriate type */;
    }
    // Audio/CV/Control ports: just zero the buffer
    // Do NOT write atom header into float audio data
}
```

- [ ] **Step 2: Fix `ev->type` wrong field at line ~142**

```cpp
// BEFORE (bug):
ev->type = type;

// AFTER (fix):
ev->body.type = type;
```

- [ ] **Step 3: Build and run tests**

Run: `cd build-bugfix && cmake --build . -j8 && ctest --output-on-failure`

- [ ] **Step 4: Commit**

```bash
git add src/engine/portbuffer.cpp
git commit -m "fix: PortBuffer::reset() — guard atom header write, fix ev->type field"
```

---

### Task 5: Service Layer Null Deref Guards (CRITICAL — 4 locations)

**Files:**

- Modify: `src/services/engineservice.cpp`

- Modify: `src/services/sessionservice.cpp`

- [ ] **Step 1: Fix engineservice.cpp:445**

```cpp
// BEFORE:
sibling<UI>()->stabilizeContent();

// AFTER:
if (auto* ui = sibling<UI>())
    ui->stabilizeContent();
```

- [ ] **Step 2: Fix engineservice.cpp:1126**

```cpp
// BEFORE:
sibling<GuiService>()->stabilizeViews();

// AFTER:
if (auto* gui = sibling<GuiService>())
    gui->stabilizeViews();
```

- [ ] **Step 3: Fix sessionservice.cpp:74**

```cpp
// BEFORE:
sibling<GuiService>()->stabilizeContent();

// AFTER:
if (auto* gc = sibling<GuiService>())
    gc->stabilizeContent();
```

- [ ] **Step 4: Fix sessionservice.cpp:60 — changeResetter null check**

```cpp
// BEFORE:
changeResetter->cancelPendingUpdate();

// AFTER:
if (changeResetter)
    changeResetter->cancelPendingUpdate();
```

- [ ] **Step 5: Build and run tests**

Run: `cd build-bugfix && cmake --build . -j8 && ctest --output-on-failure`

- [ ] **Step 6: Commit**

```bash
git add src/services/engineservice.cpp src/services/sessionservice.cpp
git commit -m "fix: add null guards to 4 sibling<GuiService>() calls — prevents shutdown crash"
```

---

### Task 6: Division-by-Zero Guards (CRITICAL)

**Files:**

- Modify: `src/nodes/combfilter.hpp`

- Modify: `src/nodes/allpassfilter.hpp`

- [ ] **Step 1: Fix CombFilter::process() line ~61**

```cpp
// BEFORE:
bufferIndex = (bufferIndex + 1) % bufferSize;

// AFTER:
if (bufferSize > 0)
    bufferIndex = (bufferIndex + 1) % bufferSize;
```

- [ ] **Step 2: Fix AllPassFilter::process() line ~46 — same pattern**

```cpp
if (bufferSize > 0)
    bufferIndex = (bufferIndex + 1) % bufferSize;
```

- [ ] **Step 3: Build and run tests**

- [ ] **Step 4: Commit**

```bash
git add src/nodes/combfilter.hpp src/nodes/allpassfilter.hpp
git commit -m "fix: guard CombFilter/AllPassFilter modulo — prevents div-by-zero crash"
```

---

### Task 7: Remaining One-Line Fixes (CRITICAL)

**Files:**

- Modify: `src/nodes/mididevice.cpp`

- Modify: `src/nodes/audiomixer.cpp`

- Modify: `src/nodes/audiorouter.cpp`

- Modify: `src/nodes/midirouter.cpp`

- [ ] **Step 1: Fix `deviceIsAvailable()` — both overloads at ~399-415**

```cpp
// BEFORE (both overloads):
return true;  // fall-through after for-loop

// AFTER:
return false;  // device not found in list
```

- [ ] **Step 2: Fix AudioMixer RMS hardcoded 2-channel at ~493**

```cpp
// BEFORE:
for (int i = 0; i < 2; ++i)

// AFTER:
for (int i = 0; i < juce::jmin (2, output.getNumChannels()); ++i)
```

- [ ] **Step 3: Fix AudioRouter `set()` assertion at ~344**

```cpp
// BEFORE:
jassert (src >= 0 && src < numSources && dst >= 0 && numDestinations < 4);

// AFTER:
jassert (src >= 0 && src < numSources && dst >= 0 && dst < numDestinations);
```

- [ ] **Step 4: Fix MidiRouter `set()` same assertion bug at ~142**

```cpp
// BEFORE:
jassert (src >= 0 && src < numSources && dst >= 0 && numDestinations < 4);

// AFTER:
jassert (src >= 0 && src < numSources && dst >= 0 && dst < numDestinations);
```

- [ ] **Step 5: Build and run tests**

- [ ] **Step 6: Commit**

```bash
git add src/nodes/mididevice.cpp src/nodes/audiomixer.cpp src/nodes/audiorouter.cpp src/nodes/midirouter.cpp
git commit -m "fix: deviceIsAvailable fall-through, AudioMixer RMS bounds, Router assertion bugs"
```

---

### Task 8: Add ScopedNoDenormals (GAP — missed by audit)

**Files:**

- Modify: `src/engine/rootgraph.cpp` (or wherever the top-level `processBlock`/`render` is)

- [ ] **Step 1: Add denormal protection at root of audio processing**

```cpp
void RootGraph::processBlock (juce::AudioBuffer<float>& buffer,
                               juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;  // ADD THIS LINE
    // ... existing processing ...
}
```

- [ ] **Step 2: Build and run tests**

- [ ] **Step 3: Commit**

```bash
git add src/engine/rootgraph.cpp
git commit -m "perf: add ScopedNoDenormals at graph processing root — prevents CPU spikes"
```

---

## Phase 1: Real-time Safety (1 week)

### Task 9: GraphNode::render() — Fix Audio Thread Allocation

**Files:**

- Modify: `src/engine/graphnode.cpp`

- Modify: `src/engine/graphnode.hpp`

- [ ] **Step 1: Pre-allocate in prepareToRender**

In `prepareToRender()`:

```cpp
currentAudioOutputBuffer.setSize (
    juce::jmax (1, getNumAudioOutputs()),
    estimatedSamplesPerBlock,
    false, true, false);
```

- [ ] **Step 2: Use avoidReallocating in render()**

```cpp
// BEFORE:
currentAudioOutputBuffer.setSize (jmax (1, rc.audio.getNumChannels()), numSamples);

// AFTER:
currentAudioOutputBuffer.setSize (
    juce::jmax (1, rc.audio.getNumChannels()), numSamples,
    false, false, true /* avoidReallocating */);
```

- [ ] **Step 3: Build and run tests**

- [ ] **Step 4: Commit**

```bash
git add src/engine/graphnode.cpp src/engine/graphnode.hpp
git commit -m "fix(rt): pre-allocate GraphNode output buffer — remove malloc from audio thread"
```

---

### Task 10: AudioRouter/AudioMixer — Pre-allocate Temp Buffers

**Files:**

- Modify: `src/nodes/audiorouter.cpp`

- Modify: `src/nodes/audiomixer.cpp`

- [ ] **Step 1: AudioRouter — pre-allocate in prepareToRender**

```cpp
void AudioRouterNode::prepareToRender (double sr, int maxBlock) override
{
    // Pre-allocate to max expected size
    tempAudio.setSize (getNumAudioOutputs(), maxBlock, false, true, false);
    // ... existing code ...
}
```

In `render()`, change to:

```cpp
tempAudio.setSize (numChannels, numFrames, false, false, true /* avoidReallocating */);
```

- [ ] **Step 2: AudioMixer — same pattern in prepareToPlay/processBlock**

- [ ] **Step 3: Build and run tests**

- [ ] **Step 4: Commit**

```bash
git add src/nodes/audiorouter.cpp src/nodes/audiomixer.cpp
git commit -m "fix(rt): pre-allocate AudioRouter/Mixer temp buffers — remove malloc from audio thread"
```

---

### Task 11: ScriptNode — Lock-free Script Swap + Async Logger

**Files:**

- Modify: `src/nodes/scriptnode.cpp`

- Modify: `src/nodes/scriptnode.hpp`

- [ ] **Step 1: Replace CriticalSection with atomic pointer swap in render()**

In `scriptnode.hpp`, change the lock pattern:

```cpp
// Replace: juce::CriticalSection lock;
// With:
std::atomic<DSPScript*> activeScript { nullptr };
std::unique_ptr<DSPScript> ownedScript;
```

In `render()`:

```cpp
void ScriptNode::render (RenderContext& rc)
{
    // No lock — atomic read
    if (auto* s = activeScript.load (std::memory_order_acquire))
        s->process (/* ... */);
}
```

In `loadScript()`:

```cpp
void ScriptNode::loadScript (const juce::String& code)
{
    // Prepare entirely on message thread
    auto newScript = std::make_unique<DSPScript> (/* ... */);
    newScript->prepare (sampleRate, blockSize);

    // Atomic swap — audio thread sees new script next callback
    auto* old = activeScript.exchange (newScript.get(), std::memory_order_release);

    // Transfer ownership
    auto oldOwned = std::move (ownedScript);
    ownedScript = std::move (newScript);

    // Old script destroyed here on message thread (safe)
}
```

- [ ] **Step 2: Replace MessageManagerLock in print() with lock-free ring buffer**

```cpp
// Replace the print() lambda with:
lua["print"] = [this](const std::string& msg) {
    // Lock-free: write to ring buffer, drain on timer
    printBuffer.write (msg);
};
```

- [ ] **Step 3: Disable Lua GC on audio thread**

In `prepareToRender`:

```cpp
lua_gc (lua.lua_state(), LUA_GCSTOP, 0);
```

Run incremental GC steps on the message thread timer instead.

- [ ] **Step 4: Build and run tests**

- [ ] **Step 5: Commit**

```bash
git add src/nodes/scriptnode.cpp src/nodes/scriptnode.hpp
git commit -m "fix(rt): ScriptNode lock-free swap, async logger, stop Lua GC on audio thread"
```

---

### Task 12: ProcessBufferOp — Remove Property Lock from Audio Thread

**Files:**

- Modify: `src/engine/graphbuilder.cpp`

- [ ] **Step 1: Replace getPropertyLock() with atomic reads**

In `ProcessBufferOp::perform()`, replace the CriticalSection acquisition with direct atomic reads of the properties needed. Use `juce::Atomic<>` or cache the values in `prepareToRender`.

- [ ] **Step 2: Build and run tests**

- [ ] **Step 3: Commit**

```bash
git add src/engine/graphbuilder.cpp
git commit -m "fix(rt): replace getPropertyLock with atomic reads in ProcessBufferOp"
```

---

## Phase 2: Services Stabilization (1 week)

### Task 13: Fix Stale GuiService::sessionRef Cache

**Files:**

- Modify: `src/services/guiservice.cpp`

- [ ] **Step 1: Remove the cache — always delegate to Context::session()**

```cpp
// BEFORE:
SessionRef GuiService::session()
{
    if (! sessionRef)
        sessionRef = world.session();
    return sessionRef;
}

// AFTER:
SessionRef GuiService::session()
{
    return world.session();
}
```

- [ ] **Step 2: Build and run tests**

- [ ] **Step 3: Commit**

```bash
git add src/services/guiservice.cpp
git commit -m "fix: remove stale GuiService::sessionRef cache — always use live session"
```

---

### Task 14: Fix changeBusesLayout Spin Loop

**Files:**

- Modify: `src/services/engineservice.cpp`

- [ ] **Step 1: Replace busy-wait with timeout**

```cpp
// BEFORE:
while (! gp->isSuspended())
    gp->suspendProcessing (true);

// AFTER:
gp->suspendProcessing (true);
auto deadline = juce::Time::getMillisecondCounter() + 500; // 500ms timeout
while (! gp->isSuspended() && juce::Time::getMillisecondCounter() < deadline)
    juce::Thread::sleep (1);

if (! gp->isSuspended())
{
    DBG ("WARNING: Audio processor did not suspend within timeout");
    return; // abort layout change rather than hang
}
```

Apply same pattern to the resume loop.

- [ ] **Step 2: Build and run tests**

- [ ] **Step 3: Commit**

```bash
git add src/services/engineservice.cpp
git commit -m "fix: replace changeBusesLayout spin loop with timeout — prevents UI hang"
```

---

### Task 15: Fix Remaining Service Null Guards

**Files:**

- Modify: `src/services/engineservice.cpp`

- Modify: `src/services/sessionservice.cpp`

- Modify: `src/services/deviceservice.cpp`

- [ ] **Step 1: Fix addPlugin null format (engineservice.cpp:879)**

```cpp
auto* format = context().plugins().getAudioPluginFormat (desc.pluginFormatName);
if (format == nullptr)
    return Node();
```

- [ ] **Step 2: Fix saveSession null gui (sessionservice.cpp:197)**

```cpp
if (auto* guiSvc = sibling<GuiService>())
{
    if (auto* cc = guiSvc->content())
    {
        juce::String state;
        cc->getSessionState (state);
        // ... rest of save logic
    }
}
```

- [ ] **Step 3: Fix DeviceService::remove null session (deviceservice.cpp:120)**

- [ ] **Step 4: Fix removeGraph index mismatch (use model-based lookup)**

- [ ] **Step 5: Build and run tests**

- [ ] **Step 6: Commit**

```bash
git add src/services/engineservice.cpp src/services/sessionservice.cpp src/services/deviceservice.cpp
git commit -m "fix: remaining service null guards — addPlugin, saveSession, DeviceService, removeGraph"
```

---

## Phase 3: Disable Broken Sandbox (3 days)

### Task 16: Disable Sandbox Feature Flag

The sandbox IPC system is fundamentally broken (process-local semaphores, std::atomic UB in shared memory, double placement-new). Rather than attempting a 2-week rewrite, disable the feature for this release.

**Files:**

- Modify: `src/engine/nodefactory.cpp` (or wherever sandbox is offered)

- Create: `docs/plans/2026-03-30-sandbox-ipc-redesign.md` (tracking issue for future)

- [ ] **Step 1: Add build flag to disable sandbox**

In CMakeLists.txt or a config header:

```cpp
#define ELEMENT_ENABLE_SANDBOX 0
```

Guard all sandbox-related code paths:

```cpp
#if ELEMENT_ENABLE_SANDBOX
    // ... sandbox code ...
#endif
```

- [ ] **Step 2: Ensure non-sandbox plugin loading works without sandbox code paths**

- [ ] **Step 3: Build and run tests**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: disable broken sandbox IPC — will redesign in future release"
```

---

## Phase 4: Additional Node Fixes (3 days)

### Task 17: MediaPlayer Missing setSource(nullptr)

**Files:**

- Modify: `src/nodes/mediaplayer.cpp`

- [ ] **Step 1: Add `player.setSource(nullptr)` in releaseResources()**

```cpp
void MediaPlayerProcessor::releaseResources()
{
    player.setSource (nullptr);  // ADD — detach source before stopping thread
    player.stop();
    player.releaseResources();
    formats.clearFormats();
    thread.stopThread (14);
}
```

- [ ] **Step 2: Build and run tests**

- [ ] **Step 3: Commit**

---

### Task 18: GainComputer Division by Zero (kneeDB = 0)

**Files:**

- Modify: `src/nodes/compressor.hpp`

- [ ] **Step 1: Guard recalcAs()**

```cpp
void recalcAs()
{
    if (kneeDB <= 0.0f)
    {
        aFF = 0.0f;
        return;
    }
    aFF = (1.0f - (1.0f / ratio.getTargetValue())) / (2.0f * kneeDB);
}
```

- [ ] **Step 2: Build and run tests**

- [ ] **Step 3: Commit**

---

## Verification Checklist

After all phases complete:

- [ ] `cd build-bugfix && cmake --build . -j8 && ctest --output-on-failure` — all tests pass
- [ ] No new warnings introduced
- [ ] Run with `-fsanitize=address` once to verify no buffer overflows
- [ ] Manually test: create session, add nodes, save, reload, remove all graphs, shutdown — no crashes
- [ ] Manually test: load Lua script node, verify `print()` doesn't freeze, verify `load()` is blocked

---

## Summary of Changes

| Phase   | Tasks       | Fixes                                          | Est. Time |
| ------- | ----------- | ---------------------------------------------- | --------- |
| Phase 0 | Tasks 1-8   | Lua RCE, 9 crasher one-liners, denormals       | 1-2 days  |
| Phase 1 | Tasks 9-12  | RT safety (allocations, locks, ScriptNode)     | 1 week    |
| Phase 2 | Tasks 13-15 | Services (stale cache, spin loop, null guards) | 1 week    |
| Phase 3 | Task 16     | Disable broken sandbox                         | 3 days    |
| Phase 4 | Tasks 17-18 | Remaining node fixes                           | 3 days    |

Total unique bugs addressed: ~45 CRITICAL + HIGH findings.
