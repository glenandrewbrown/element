# Security & RT Safety — Final Code Review Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two remaining code review findings: plaintext credential storage in Settings and CriticalSection on the audio render path.

**Architecture:** Two independent tracks. Track A wraps update key storage with platform-obfuscated encryption (XOR + base64, not keychain — avoids platform-specific complexity for a non-critical credential). Track B replaces `CriticalSection seqLock` in `GraphNode` with an atomic pointer swap, eliminating the last mutex on the audio thread. Both tracks are independent and can be done in any order.

**Tech Stack:** C++20, JUCE 8.0.12, Boost.Test, `std::atomic<T*>`, `std::shared_ptr`

---

## File Structure

### Track A: Credential Obfuscation

| File | Action | Responsibility |
|------|--------|---------------|
| `src/settings.cpp` | Modify | Encrypt/decrypt update key on get/set |
| `include/element/settings.hpp` | Modify | Add obfuscation helper declarations |
| `test/SettingsCredentialTest.cpp` | Create | Round-trip encrypt/decrypt tests |

### Track B: Lock-Free Render Sequence

| File | Action | Responsibility |
|------|--------|---------------|
| `src/engine/graphnode.hpp` | Modify | Replace `CriticalSection seqLock` with `std::atomic<RenderSequence*>` |
| `src/engine/graphnode.cpp` | Modify | Atomic pointer swap in build/clear/render |
| `test/engine/GraphNodeLockFreeTest.cpp` | Create | Verify atomic swap semantics |

---

## Track A: Credential Obfuscation

### Task 1: Write Failing Test for Credential Round-Trip

**Files:**
- Create: `test/SettingsCredentialTest.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/settings.hpp>

using namespace element;

BOOST_AUTO_TEST_SUITE (SettingsCredentialTests)

BOOST_AUTO_TEST_CASE (ObfuscateRoundTrips)
{
    // A plaintext key should survive obfuscate -> deobfuscate
    juce::String original = "sk-test-abc123-xyz789";
    juce::String obfuscated = Settings::obfuscate (original);
    juce::String recovered = Settings::deobfuscate (obfuscated);

    BOOST_CHECK_EQUAL (recovered.toStdString(), original.toStdString());
    // Obfuscated form must differ from plaintext
    BOOST_CHECK (obfuscated != original);
}

BOOST_AUTO_TEST_CASE (ObfuscateEmptyString)
{
    BOOST_CHECK (Settings::obfuscate ("").isEmpty());
    BOOST_CHECK (Settings::deobfuscate ("").isEmpty());
}

BOOST_AUTO_TEST_CASE (ObfuscateHandlesSpecialChars)
{
    juce::String original = "p@$$w0rd!#%&*(){}[]";
    juce::String recovered = Settings::deobfuscate (Settings::obfuscate (original));
    BOOST_CHECK_EQUAL (recovered.toStdString(), original.toStdString());
}

BOOST_AUTO_TEST_SUITE_END()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cmake --build build-merged --target test_element -j8 && cd build-merged && ./test/test_element_artefacts/test_element --run_test=SettingsCredentialTests 2>&1 | tail -5`
Expected: FAIL — `Settings::obfuscate` not defined

- [ ] **Step 3: Commit test**

```bash
git add test/SettingsCredentialTest.cpp
git commit -m "test: add credential obfuscation round-trip tests (RED)"
```

---

### Task 2: Implement Obfuscation and Wire Into Settings

**Files:**
- Modify: `include/element/settings.hpp`
- Modify: `src/settings.cpp`

- [ ] **Step 1: Add static method declarations to Settings**

In `include/element/settings.hpp`, add inside the `Settings` class (public section):

```cpp
    /** Obfuscate a string for storage (XOR + base64). Not cryptographic —
        prevents casual plaintext exposure in preference files. */
    static juce::String obfuscate (const juce::String& plaintext);

    /** Reverse obfuscation. */
    static juce::String deobfuscate (const juce::String& obfuscated);
```

- [ ] **Step 2: Implement obfuscate/deobfuscate**

In `src/settings.cpp`, add before the `getUpdateKey()` method:

```cpp
static constexpr uint8_t obfuscationKey[] = {
    0x4b, 0x75, 0x73, 0x68, 0x76, 0x69, 0x65, 0x77,  // "Kushview"
    0x45, 0x6c, 0x65, 0x6d, 0x65, 0x6e, 0x74, 0x21   // "Element!"
};

juce::String Settings::obfuscate (const juce::String& plaintext)
{
    if (plaintext.isEmpty())
        return {};

    auto utf8 = plaintext.toUTF8();
    const int len = static_cast<int> (utf8.sizeInBytes() - 1); // exclude null
    juce::MemoryBlock block (static_cast<size_t> (len));

    for (int i = 0; i < len; ++i)
        static_cast<uint8_t*> (block.getData())[i] =
            static_cast<uint8_t> (utf8.getAddress()[i]) ^ obfuscationKey[i % 16];

    return block.toBase64Encoding();
}

juce::String Settings::deobfuscate (const juce::String& encoded)
{
    if (encoded.isEmpty())
        return {};

    juce::MemoryBlock block;
    if (! block.fromBase64Encoding (encoded))
        return encoded; // Not base64 — return as-is (legacy plaintext)

    const int len = static_cast<int> (block.getSize());
    juce::MemoryBlock decoded (static_cast<size_t> (len) + 1, true);

    for (int i = 0; i < len; ++i)
        static_cast<uint8_t*> (decoded.getData())[i] =
            static_cast<uint8_t*> (block.getData())[i] ^ obfuscationKey[i % 16];

    return juce::String::fromUTF8 (
        static_cast<const char*> (decoded.getData()), len);
}
```

- [ ] **Step 3: Wire obfuscation into get/set methods**

Replace `getUpdateKey()` and `setUpdateKey()`:

```cpp
juce::String Settings::getUpdateKey() const
{
    if (auto* p = getProps())
        return deobfuscate (p->getValue (updateKeyKey, ""));
    return "";
}

void Settings::setUpdateKey (const String& slug)
{
    if (auto p = getProps())
        p->setValue (updateKeyKey, obfuscate (slug.trim()));
}
```

Do the same for `getUpdateKeyUser()` / `setUpdateKeyUser()`:

```cpp
juce::String Settings::getUpdateKeyUser() const
{
    if (auto* p = getProps())
        return deobfuscate (p->getValue (updateKeyUserKey, ""));
    return "";
}

void Settings::setUpdateKeyUser (const String& user)
{
    if (auto p = getProps())
        p->setValue (updateKeyUserKey, obfuscate (user.trim()));
}
```

Note: `getUpdateKeyType()` and `getUpdateChannel()` are not sensitive (they are enum-like slugs like "patreon" or "element-v1"), so leave them as plaintext.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cmake --build build-merged --target test_element -j8 && cd build-merged && ./test/test_element_artefacts/test_element --run_test=SettingsCredentialTests 2>&1 | tail -5`
Expected: PASS (3/3)

- [ ] **Step 5: Run full test suite**

Run: `cd build-merged && ./test/test_element_artefacts/test_element 2>&1 | tail -3`
Expected: `*** No errors detected`

- [ ] **Step 6: Register CTest suite**

In `test/CMakeLists.txt`, add:

```cmake
add_test(NAME "SettingsCredentialTests" COMMAND test_element --run_test=SettingsCredentialTests)
```

- [ ] **Step 7: Commit**

```bash
git add include/element/settings.hpp src/settings.cpp test/SettingsCredentialTest.cpp test/CMakeLists.txt
git commit -m "security: obfuscate update keys in preferences (XOR + base64)"
```

---

## Track B: Lock-Free Render Sequence

### Task 3: Write Failing Test for Atomic Render Sequence Swap

**Files:**
- Create: `test/engine/GraphNodeLockFreeTest.cpp`

- [ ] **Step 1: Write the failing test**

```cpp
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <atomic>
#include <thread>
#include <vector>

// Test the atomic pointer swap pattern in isolation,
// without depending on GraphNode internals.

BOOST_AUTO_TEST_SUITE (AtomicRenderSwapTests)

BOOST_AUTO_TEST_CASE (AtomicPointerSwapIsLockFree)
{
    // Verify that std::atomic<void*> is lock-free on this platform
    std::atomic<void*> ptr { nullptr };
    BOOST_CHECK (ptr.is_lock_free());
}

BOOST_AUTO_TEST_CASE (SwapReplacesPointerAtomically)
{
    std::vector<int> seqA = { 1, 2, 3 };
    std::vector<int> seqB = { 4, 5, 6 };

    std::atomic<std::vector<int>*> activeSeq { &seqA };

    // Swap to B
    std::vector<int>* old = activeSeq.exchange (&seqB, std::memory_order_acq_rel);
    BOOST_CHECK (old == &seqA);
    BOOST_CHECK (activeSeq.load() == &seqB);
}

BOOST_AUTO_TEST_CASE (ReaderSeesConsistentSequence)
{
    // Simulate: writer builds a new sequence and atomically publishes it.
    // Reader always sees a complete, valid sequence (never a half-built one).

    struct RenderOps
    {
        int values[4] = { 0, 0, 0, 0 };
    };

    auto opsA = std::make_unique<RenderOps>();
    opsA->values[0] = 1;
    opsA->values[1] = 2;
    opsA->values[2] = 3;
    opsA->values[3] = 4;

    std::atomic<RenderOps*> activeOps { opsA.get() };
    std::atomic<bool> writerDone { false };
    std::atomic<int> readerErrors { 0 };

    // Reader thread: continuously reads and verifies consistency
    std::thread reader ([&] {
        while (! writerDone.load (std::memory_order_acquire))
        {
            const RenderOps* ops = activeOps.load (std::memory_order_acquire);
            if (ops == nullptr)
                continue;

            // All values should be from the same set (all 1-4 or all 10-13)
            int first = ops->values[0];
            for (int i = 1; i < 4; ++i)
            {
                int diff = ops->values[i] - ops->values[0];
                if (diff != i)
                    readerErrors.fetch_add (1);
            }
        }
    });

    // Writer: build new ops and swap
    auto opsB = std::make_unique<RenderOps>();
    opsB->values[0] = 10;
    opsB->values[1] = 11;
    opsB->values[2] = 12;
    opsB->values[3] = 13;

    // Publish atomically — reader never sees partial opsB
    RenderOps* oldOps = activeOps.exchange (opsB.get(), std::memory_order_acq_rel);
    BOOST_CHECK (oldOps == opsA.get());

    // Let reader spin a bit on the new ops
    std::this_thread::sleep_for (std::chrono::milliseconds (5));
    writerDone.store (true, std::memory_order_release);

    reader.join();
    BOOST_CHECK_EQUAL (readerErrors.load(), 0);
}

BOOST_AUTO_TEST_SUITE_END()
```

- [ ] **Step 2: Run test to verify it passes** (this tests the pattern, not GraphNode)

Run: `cmake --build build-merged --target test_element -j8 && cd build-merged && ./test/test_element_artefacts/test_element --run_test=AtomicRenderSwapTests 2>&1 | tail -5`
Expected: PASS — confirms atomic swap pattern works on this platform

- [ ] **Step 3: Register CTest suite and commit**

In `test/CMakeLists.txt`, add:
```cmake
add_test(NAME "AtomicRenderSwapTests" COMMAND test_element --run_test=AtomicRenderSwapTests)
```

```bash
git add test/engine/GraphNodeLockFreeTest.cpp test/CMakeLists.txt
git commit -m "test: add atomic render sequence swap pattern tests"
```

---

### Task 4: Replace CriticalSection with Atomic Pointer Swap in GraphNode

**Files:**
- Modify: `src/engine/graphnode.hpp:234`
- Modify: `src/engine/graphnode.cpp` (3 call sites: lines 369, 443, 574)

- [ ] **Step 1: Replace seqLock with atomic pointer in graphnode.hpp**

Replace line 234:

```cpp
CriticalSection seqLock;
```

With:

```cpp
/** Active rendering ops, swapped atomically.
    Audio thread reads via acquire load. Message thread writes via exchange.
    The old ops array is deleted on the message thread after swap. */
std::atomic<juce::Array<void*>*> activeRenderingOps { nullptr };
```

Keep the existing `Array<void*> renderingOps` as the "staging" buffer for building new sequences.

- [ ] **Step 2: Update clearRenderingSequence() in graphnode.cpp**

Replace the `seqLock` version (around line 364):

```cpp
void GraphNode::clearRenderingSequence()
{
    // Build empty ops and swap atomically
    auto* oldOps = activeRenderingOps.exchange (nullptr, std::memory_order_acq_rel);

    if (oldOps != nullptr)
    {
        deleteRenderOpArray (*oldOps);
        delete oldOps;
    }
}
```

- [ ] **Step 3: Update buildRenderingSequence() in graphnode.cpp**

Replace the `seqLock` version (around line 443). After the new ops are fully built in `renderingOps`, publish them atomically:

```cpp
    // ... (existing code that builds newRenderingOps) ...

    // Publish the new sequence atomically
    auto* published = new juce::Array<void*>();
    published->swapWith (newRenderingOps);
    auto* oldOps = activeRenderingOps.exchange (published, std::memory_order_acq_rel);

    // Delete old ops on this (message) thread
    if (oldOps != nullptr)
    {
        deleteRenderOpArray (*oldOps);
        delete oldOps;
    }
```

Remove the `ScopedLock sl (seqLock)` that previously wrapped the swap.

- [ ] **Step 4: Update the render path in graphnode.cpp**

Replace the `seqLock` version (around line 574). The audio thread now reads via acquire load:

```cpp
    {
        auto* ops = activeRenderingOps.load (std::memory_order_acquire);
        if (ops != nullptr)
        {
            for (auto ptr : *ops)
            {
                GraphOp* const op = static_cast<GraphOp*> (ptr);
                op->perform (renderingBuffers, midiBuffers, numSamples);
            }
        }
    }
```

No lock. No allocation. Just an atomic load and iteration.

- [ ] **Step 5: Clean up the destructor**

Ensure `~GraphNode()` (or the class teardown) deletes any remaining active ops:

```cpp
auto* remaining = activeRenderingOps.exchange (nullptr, std::memory_order_acq_rel);
if (remaining != nullptr)
{
    deleteRenderOpArray (*remaining);
    delete remaining;
}
```

- [ ] **Step 6: Build and run all tests**

Run: `cmake --build build-merged --target test_element -j8 && cd build-merged && ./test/test_element_artefacts/test_element 2>&1 | tail -3`
Expected: `*** No errors detected`

- [ ] **Step 7: Commit**

```bash
git add src/engine/graphnode.hpp src/engine/graphnode.cpp
git commit -m "fix(rt): replace CriticalSection with atomic pointer swap in GraphNode render path"
```

---

### Task 5: Remove midiOutputLock from Audio Callback (Optional — Lower Risk)

**Files:**
- Modify: `src/engine/audioengine.cpp:433`
- Modify: `src/engine/midiengine.hpp:104,140`

This is **optional** because the MIDI output lock contention is lower than the render sequence lock. The MIDI output is only swapped when the user changes devices (rare). But it's still a CriticalSection on the audio thread.

- [ ] **Step 1: Replace midiOutputLock with atomic pointer**

In `src/engine/midiengine.hpp`, replace:

```cpp
CriticalSection audioCallbackLock, midiCallbackLock, midiOutputLock;
```

With:

```cpp
CriticalSection audioCallbackLock, midiCallbackLock;
std::atomic<MidiOutput*> atomicMidiOutput { nullptr };
```

Remove `getMidiOutputLock()`.

- [ ] **Step 2: Update MIDI output swap in midiengine.cpp**

In `midiengine.cpp` where the output device is changed (around line 363), replace:

```cpp
{
    ScopedLock sl (midiOutputLock);
    defaultMidiOutput.swap (newMidiOut);
}
```

With:

```cpp
auto* oldOutput = atomicMidiOutput.exchange (newMidiOut.release(), std::memory_order_acq_rel);
// Delete old output on this (message) thread
delete oldOutput;
```

- [ ] **Step 3: Update audio callback in audioengine.cpp**

In `audioengine.cpp` around line 433, replace:

```cpp
{
    ScopedLock lockMidiOut (engine.world.midi().getMidiOutputLock());
    if (auto* const midiOut = engine.world.midi().getDefaultMidiOutput())
    {
```

With:

```cpp
{
    if (auto* const midiOut = engine.world.midi().getAtomicMidiOutput())
    {
```

Add a new method to MidiEngine:

```cpp
MidiOutput* getAtomicMidiOutput() const { return atomicMidiOutput.load (std::memory_order_acquire); }
```

- [ ] **Step 4: Build and run all tests**

Run: `cmake --build build-merged --target test_element -j8 && cd build-merged && ./test/test_element_artefacts/test_element 2>&1 | tail -3`
Expected: `*** No errors detected`

- [ ] **Step 5: Commit**

```bash
git add src/engine/midiengine.hpp src/engine/midiengine.cpp src/engine/audioengine.cpp
git commit -m "fix(rt): replace midiOutputLock with atomic pointer in audio callback"
```

---

## Summary

| Task | Track | Severity | Est. Effort |
|------|-------|----------|-------------|
| 1. Credential obfuscation tests | A | Medium | 5 min |
| 2. Implement obfuscation + wire into Settings | A | Medium | 15 min |
| 3. Atomic swap pattern tests | B | High | 5 min |
| 4. Replace seqLock with atomic swap | B | High | 20 min |
| 5. Replace midiOutputLock (optional) | B | Medium | 15 min |

**Total estimated effort:** ~1 hour

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Credential protection | XOR + base64, not keychain | Update keys are license slugs, not passwords. Obfuscation prevents casual exposure in XML prefs. Keychain integration adds platform complexity for minimal gain. |
| `deobfuscate` fallback | Return raw string if not base64 | Backward-compatible: existing plaintext keys still work. On next save, they get obfuscated. |
| Render sequence swap | `std::atomic<Array<void*>*>` | Audio thread does a single atomic load (no lock). Message thread builds new ops, then does `exchange()`. Old ops deleted on message thread. |
| MIDI output swap | `std::atomic<MidiOutput*>` | Same pattern as render ops. Device swaps are rare, so contention was already low — this is belt-and-suspenders. |
| Ownership of old ops | Delete on message thread after swap | Audio thread never allocates or frees. Only the message thread (which called `exchange()`) deletes the old pointer. |
