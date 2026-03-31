# Code Review Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all critical, high, and medium issues identified in the code review and validated by Gemini second opinion.

**Architecture:** Three phases - Phase 1 fixes mechanical safety issues (SPDX, dead code, bare keys, memory leak, dangling pointers). Phase 2 fixes sandbox IPC critical issues (buffer overflow, race condition, binary state, modal callbacks). Phase 3 redesigns the sandbox audio path to be lock-free.

**Tech Stack:** C++20, JUCE 8.0.12, Boost.Test, CMake

---

## Phase 1: Mechanical Safety Fixes (Low Risk)

### Task 1: Fix SPDX License Identifiers

**Files:**
- Modify: `src/engine/sandboxhost.hpp:1-2`
- Modify: `src/engine/sandboxipc.hpp:1-2`
- Modify: `src/engine/sandboxworker.hpp:1-2`
- Modify: `src/nodes/sandboxedprocessor.hpp:1-2`
- Modify: `src/nodes/reroutenode.hpp:1-2`
- Modify: `src/ui/commentboxcomponent.hpp:1-2`
- Modify: `src/ui/minimapcomponent.hpp:1-2`
- Modify: `src/ui/nodesearchcomponent.hpp:1-2`
- Modify: `src/ui/moleculemanager.hpp:1-2`
- Modify: `src/ui/moleculemanager.cpp:1-2`

**Step 1: Replace all incorrect SPDX identifiers**

In every file listed above, change:
```cpp
// SPDX-License-Identifier: GPL3-or-later
```
to:
```cpp
// SPDX-License-Identifier: GPL-3.0-or-later
```

**Step 2: Verify no incorrect identifiers remain**

Run: `grep -rn "GPL3-or-later" src/ include/ --include="*.hpp" --include="*.cpp" --include="*.h"`
Expected: No matches

**Step 3: Commit**

```bash
git add src/engine/sandbox*.hpp src/nodes/sandboxedprocessor.hpp src/nodes/reroutenode.hpp src/ui/commentboxcomponent.hpp src/ui/minimapcomponent.hpp src/ui/nodesearchcomponent.hpp src/ui/moleculemanager.*
git commit -m "fix: correct SPDX license identifiers to GPL-3.0-or-later"
```

---

### Task 2: Remove Dead Code in block.hpp

**Files:**
- Modify: `src/ui/block.hpp:383-384`

**Step 1: Remove unused member variables**

Remove these two lines from BlockComponent's private section:
```cpp
std::chrono::steady_clock::time_point lastProcessStart;
std::atomic<float> processingTimeMs { 0.0f };
```

**Step 2: Verify no references exist**

Run: `grep -rn "lastProcessStart\|processingTimeMs" src/ include/ --include="*.hpp" --include="*.cpp"`
Expected: No matches

**Step 3: Build**

Run: `cmake --build build-merged -j8 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/ui/block.hpp
git commit -m "fix: remove unused lastProcessStart and processingTimeMs from BlockComponent"
```

---

### Task 3: Fix Bare Keyboard Shortcuts

**Files:**
- Modify: `src/ui/grapheditorview.cpp:94-105`

**Step 1: Add modifier key requirements**

Replace the bare 'C' and 'M' key handlers. Find (around line 94):
```cpp
if (key.getKeyCode() == 'c' || key.getKeyCode() == 'C')
{
    _editor.createCommentBox();
    return true;
}
```

Replace with:
```cpp
if ((key.getKeyCode() == 'c' || key.getKeyCode() == 'C') && key.getModifiers().isShiftDown())
{
    _editor.createCommentBox();
    return true;
}
```

Find the 'M' handler (around line 101):
```cpp
if (key.getKeyCode() == 'm' || key.getKeyCode() == 'M')
```

Replace with:
```cpp
if ((key.getKeyCode() == 'm' || key.getKeyCode() == 'M') && key.getModifiers().isShiftDown())
```

**Step 2: Build and verify**

Run: `cmake --build build-merged -j8 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/ui/grapheditorview.cpp
git commit -m "fix: require Shift modifier for comment box (Shift+C) and minimap (Shift+M) shortcuts"
```

---

### Task 4: Fix Memory Leak in LambdaChangeListener

**Files:**
- Modify: `src/ui/block.cpp:609-640`

**Step 1: Store listener as unique_ptr member**

In `src/ui/block.hpp`, add a private member to BlockComponent (near the other members around line 380):
```cpp
std::unique_ptr<LambdaChangeListener> colorChangeListener;
```

**Step 2: Fix the buttonClicked handler**

In `src/ui/block.cpp`, in the colorButton section of `buttonClicked()`, replace the leak:
```cpp
selector->addChangeListener (new LambdaChangeListener ([weakThis] (ChangeBroadcaster* src) {
```

With:
```cpp
colorChangeListener = std::make_unique<LambdaChangeListener> ([weakThis] (ChangeBroadcaster* src) {
```

And add after creating it:
```cpp
selector->addChangeListener (colorChangeListener.get());
```

**Step 3: Build and verify**

Run: `cmake --build build-merged -j8 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/ui/block.hpp src/ui/block.cpp
git commit -m "fix: store LambdaChangeListener as member to prevent memory leak per color picker use"
```

---

### Task 5: Fix Dangling Raw Pointers with SafePointer

**Files:**
- Modify: `src/ui/commentboxcomponent.hpp:378`
- Modify: `src/ui/nodesearchcomponent.hpp:174`
- Modify: `src/ui/minimapcomponent.hpp:136-137`

**Step 1: Fix CommentBoxComponent::ContainedNode**

In `commentboxcomponent.hpp`, change `ContainedNode::component` from:
```cpp
Component* component = nullptr;
```
to:
```cpp
juce::Component::SafePointer<juce::Component> component;
```

Update any code that checks `comp != nullptr` to use `comp.getComponent() != nullptr` if needed (SafePointer supports `operator bool` so direct null checks still work).

**Step 2: Fix NodeSearchComponent**

In `nodesearchcomponent.hpp`, change:
```cpp
Array<BlockComponent*> searchResults;
```
to:
```cpp
juce::Array<juce::Component::SafePointer<BlockComponent>> searchResults;
```

**Step 3: Fix MinimapComponent**

In `minimapcomponent.hpp`, change:
```cpp
GraphEditorComponent* graphEditor = nullptr;
Viewport* viewport = nullptr;
```
to:
```cpp
juce::Component::SafePointer<GraphEditorComponent> graphEditor;
juce::Component::SafePointer<juce::Viewport> viewport;
```

**Step 4: Build and verify**

Run: `cmake --build build-merged -j8 2>&1 | tail -5`
Expected: Build succeeds

**Step 5: Run tests**

Run: `cd build-merged && ctest --output-on-failure 2>&1 | tail -5`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/ui/commentboxcomponent.hpp src/ui/nodesearchcomponent.hpp src/ui/minimapcomponent.hpp
git commit -m "fix: use SafePointer for all stored component references to prevent dangling pointers"
```

---

## Phase 2: Critical Bug Fixes

### Task 6: Fix Non-Atomic Buffer Swap

**Files:**
- Modify: `src/engine/sandboxipc.hpp:253-260`

**Step 1: Write failing test**

In `test/engine/`, create or add to a test file:
```cpp
BOOST_AUTO_TEST_CASE (SharedAudioBufferSwapIsAtomic)
{
    // Verify swapBuffers uses atomic RMW
    SharedAudioBuffer buf;
    buf.allocate (2, 512);
    auto* header = buf.getHeader();
    BOOST_CHECK_EQUAL (header->activeBuffer.load(), 0);
    buf.swapBuffers();
    BOOST_CHECK_EQUAL (header->activeBuffer.load(), 1);
    buf.swapBuffers();
    BOOST_CHECK_EQUAL (header->activeBuffer.load(), 0);
}
```

**Step 2: Fix swapBuffers()**

In `sandboxipc.hpp`, replace the swapBuffers implementation:
```cpp
void swapBuffers()
{
    if (header == nullptr)
        return;
    header->activeBuffer.store (1 - header->activeBuffer.load());
}
```
with:
```cpp
void swapBuffers()
{
    if (header == nullptr)
        return;
    header->activeBuffer.fetch_xor (1, std::memory_order_acq_rel);
}
```

**Step 3: Build and run tests**

Run: `cmake --build build-merged -j8 && cd build-merged && ctest --output-on-failure 2>&1 | tail -10`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/engine/sandboxipc.hpp test/engine/
git commit -m "fix: use atomic fetch_xor for SharedAudioBuffer swap to prevent TOCTOU race"
```

---

### Task 7: Fix Buffer Overflow in Shared Audio Buffer

**Files:**
- Modify: `src/engine/sandboxipc.hpp:216-250`
- Modify: `src/engine/sandboxworker.hpp:424-433`

**Step 1: Clamp numSamples in writeInputAudio()**

In `sandboxipc.hpp`, at the start of `writeInputAudio()`:
```cpp
void writeInputAudio (const juce::AudioSampleBuffer& source, int numSamples)
{
    if (header == nullptr || data == nullptr)
        return;
    numSamples = std::min (numSamples, static_cast<int> (header->maxSamples));
    // ... rest of method
```

**Step 2: Clamp numSamples in readOutputAudio()**

Same pattern in `readOutputAudio()`:
```cpp
void readOutputAudio (juce::AudioSampleBuffer& dest, int numSamples)
{
    if (header == nullptr || data == nullptr)
        return;
    numSamples = std::min (numSamples, static_cast<int> (header->maxSamples));
    // ... rest of method
```

**Step 3: Clamp in sandboxworker.hpp handleProcessBlock()**

At line ~424, after reading numSamples from header:
```cpp
const int numSamples = std::min (
    static_cast<int> (header->numSamples.load()),
    processBuffer.getNumSamples());
const int inChannels = std::min (
    static_cast<int> (header->numInputChannels.load()),
    processBuffer.getNumChannels());
```

**Step 4: Build and run tests**

Run: `cmake --build build-merged -j8 && cd build-merged && ctest --output-on-failure 2>&1 | tail -5`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/engine/sandboxipc.hpp src/engine/sandboxworker.hpp
git commit -m "fix: clamp numSamples in shared audio buffer to prevent buffer overflow"
```

---

### Task 8: Fix Plugin State Caching (Binary, Not XML)

**Files:**
- Modify: `src/engine/sandboxhost.hpp:411-419` (setPluginState)
- Modify: `src/engine/sandboxhost.hpp:590-641` (attemptRestart)

**Step 1: Change lastKnownState type**

Find the member declaration (around line 196):
```cpp
std::unique_ptr<juce::XmlElement> lastKnownState;
```
Replace with:
```cpp
juce::MemoryBlock lastKnownState;
```

**Step 2: Fix setPluginState()**

Replace the caching line in `setPluginState()`:
```cpp
lastKnownState = juce::parseXML (stateData.toString());
```
with:
```cpp
lastKnownState = stateData;
```

**Step 3: Fix attemptRestart()**

Replace the state restoration block in `attemptRestart()`:
```cpp
if (lastKnownState)
{
    setPluginState (juce::MemoryBlock (lastKnownState->toString().toRawUTF8(),
                                        lastKnownState->toString().getNumBytesAsUTF8()));
}
```
with:
```cpp
if (lastKnownState.getSize() > 0)
{
    setPluginState (lastKnownState);
}
```

**Step 4: Build and run tests**

Run: `cmake --build build-merged -j8 && cd build-merged && ctest --output-on-failure 2>&1 | tail -5`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/engine/sandboxhost.hpp
git commit -m "fix: cache plugin state as MemoryBlock instead of XML (state is binary, not XML)"
```

---

### Task 9: Fix Raw `this` in Async Modal Callbacks

**Files:**
- Modify: `src/ui/grapheditorcomponent.cpp` (renameSelectedNodes ~line 1996, saveSelectionAsMolecule ~line 2555)

**Step 1: Fix renameSelectedNodes()**

Find the modal callback that captures `[this]`:
```cpp
aw->enterModalState (true, ModalCallbackFunction::create ([this] (int result)
```
Replace with:
```cpp
juce::Component::SafePointer<GraphEditorComponent> safeThis (this);
aw->enterModalState (true, ModalCallbackFunction::create ([safeThis] (int result)
{
    if (safeThis == nullptr)
        return;
```
And replace all `this->` references in the callback body with `safeThis->`.

**Step 2: Fix saveSelectionAsMolecule()**

Same pattern. Find:
```cpp
aw->enterModalState (true, ModalCallbackFunction::create ([this, nodeIds] (int result)
```
Replace with:
```cpp
juce::Component::SafePointer<GraphEditorComponent> safeThis (this);
aw->enterModalState (true, ModalCallbackFunction::create ([safeThis, nodeIds] (int result)
{
    if (safeThis == nullptr)
        return;
```

**Step 3: Build and verify**

Run: `cmake --build build-merged -j8 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/ui/grapheditorcomponent.cpp
git commit -m "fix: use SafePointer in async modal callbacks to prevent use-after-free"
```

---

### Task 10: Consolidate Connector Timers

**Files:**
- Modify: `src/ui/grapheditorcomponent.cpp` (ConnectorComponent constructor ~line 151, timerCallback ~line 651)
- Modify: `src/ui/grapheditorcomponent.hpp` (add centralized timer)

**Step 1: Remove per-connector timer**

In `ConnectorComponent` constructor, remove:
```cpp
startTimerHz (30);
```

Remove the `timerCallback()` override from `ConnectorComponent`. Keep the `updateSignalActivity()` method.

**Step 2: Add centralized timer to GraphEditorComponent**

In `grapheditorcomponent.hpp`, ensure GraphEditorComponent inherits from Timer (it likely already does or can be added). Add a method:
```cpp
void updateAllConnectorActivity();
```

**Step 3: Implement centralized polling**

In `grapheditorcomponent.cpp`, start a single 30Hz timer in the constructor:
```cpp
startTimerHz (30);
```

In the `timerCallback()`:
```cpp
void GraphEditorComponent::timerCallback()
{
    for (auto* comp : getChildren())
    {
        if (auto* connector = dynamic_cast<ConnectorComponent*> (comp))
            connector->updateSignalActivity();
    }
}
```

**Step 4: Build and verify**

Run: `cmake --build build-merged -j8 2>&1 | tail -5`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/ui/grapheditorcomponent.cpp src/ui/grapheditorcomponent.hpp
git commit -m "perf: consolidate per-connector 30Hz timers into single centralized timer"
```

---

## Phase 3: Sandbox Audio Path Redesign (Future)

> **Note:** This phase requires significant architectural work. Tasks 6-8 above make the current implementation safer but do not eliminate the fundamental real-time violation (blocking mutex on audio thread). Phase 3 is the proper fix.

### Task 11: Design Lock-Free Audio IPC (Design Only)

**Goal:** Replace `waitForResponse()` + `sendMessage()` in `processBlock()` with lock-free shared-memory signaling.

**Architecture:**
1. Audio thread writes input to shared buffer, sets atomic `hostReady` flag
2. Worker polls `hostReady`, processes, sets atomic `pluginDone` flag
3. Audio thread polls `pluginDone` (non-blocking). If not done, output silence.
4. No mutex, no condition_variable, no pipe writes on audio thread
5. Control messages (load/state/bypass) go through separate non-RT pipe

**Files to create:**
- `src/engine/sandboxaudiobridge.hpp` - Lock-free audio bridge
- `src/engine/sandboxcontrolchannel.hpp` - Non-RT control messaging

**Files to modify:**
- `src/engine/sandboxhost.hpp` - Replace processBlock() internals
- `src/engine/sandboxworker.hpp` - Replace handleProcessBlock() internals
- `src/engine/sandboxipc.hpp` - Add proper memory ordering to all atomics

**Deferred:** This task should be planned in detail in a separate plan document once Phase 1-2 are complete.

---

## Summary

| Task | Phase | Severity | Est. Effort |
|------|-------|----------|-------------|
| 1. SPDX identifiers | 1 | Medium | 5 min |
| 2. Dead code removal | 1 | Low | 2 min |
| 3. Keyboard shortcuts | 1 | Medium | 5 min |
| 4. Memory leak fix | 1 | Medium | 10 min |
| 5. SafePointer fixes | 1 | Medium | 15 min |
| 6. Atomic buffer swap | 2 | Critical | 10 min |
| 7. Buffer overflow fix | 2 | Critical | 15 min |
| 8. Binary state caching | 2 | High | 10 min |
| 9. Modal callback safety | 2 | High | 10 min |
| 10. Timer consolidation | 2 | Medium | 20 min |
| 11. Lock-free audio IPC | 3 | Critical | Multi-day |
