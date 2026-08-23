# Phase 0: Production Readiness — Stop-Ship Blockers

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the 4 critical issues that block Element from being safe for any real user: Lua security, RT thread priority, cross-process shared memory, and code signing.

**Architecture:** Each task is independent and can be implemented in any order. The Lua fix is simplest (1 line change + testing). RT priority uses JUCE's built-in `Thread::RealtimeOptions`. Shared memory requires replacing `HeapBlock` with `shm_open`/`mmap`. Code signing is a build-system task.

**Tech Stack:** C++20, JUCE 8.0.12, sol2 4.0, CMake, macOS codesign/notarytool

---

## Task 1: Harden Lua Sandbox Security

**CRITICAL: User scripts can currently execute arbitrary system commands.**

**Files:**
- Modify: `src/scripting/bindings.cpp:415`

**Context:** Two Lua environments exist in Element:
- `ScriptingEngine::State` (src/scripting.cpp:24) — correctly opens ONLY `sol::lib::base` + `sol::lib::string`
- `initializeState()` (src/scripting/bindings.cpp:415) — **calls `view.open_libraries()` which opens ALL libraries including `os` and `io`**

The `initializeState()` function is called for DSP script views and node script editors. This means user-authored Lua scripts have full access to `os.execute()`, `io.open()`, `dofile()`, etc.

**Step 1: Replace open_libraries() with explicit whitelist**

In `src/scripting/bindings.cpp`, line 415, replace:
```cpp
view.open_libraries();
```
with:
```cpp
view.open_libraries (
    sol::lib::base,
    sol::lib::string,
    sol::lib::table,
    sol::lib::math,
    sol::lib::coroutine,
    sol::lib::utf8,
    sol::lib::package
);
```

This provides everything DSP and UI scripts need (math for DSP, string/table for data manipulation, coroutine for async, package for module loading) while blocking `os`, `io`, and `debug`.

**Step 2: Remove dangerous functions from base library**

After the `open_libraries` call, add:
```cpp
// Remove dangerous functions that exist in base library
view["dofile"] = sol::nil;
view["loadfile"] = sol::nil;
view["load"] = sol::nil;      // Can load arbitrary bytecode
view["collectgarbage"] = sol::nil;  // Can cause DoS
```

**Step 3: Verify existing scripts still work**

Run: `cd build-merged && ctest -R Script --output-on-failure`
Expected: All script tests pass (scripts use math, string, table, el.* modules — not os/io)

**Step 4: Build full suite**

Run: `cmake --build build-merged -j8 && cd build-merged && ctest --output-on-failure 2>&1 | tail -5`
Expected: All 33 tests pass

**Step 5: Commit**

```bash
git add src/scripting/bindings.cpp
git commit -m "security: restrict Lua sandbox to safe libraries only (remove os, io, debug access)"
```

---

## Task 2: Set Real-Time Thread Priority for Sandbox Worker

**CRITICAL: Audio processing thread runs at normal priority, causing dropouts under system load.**

**Files:**
- Modify: `src/engine/sandboxworker.hpp` (rtProcessingLoop, rtThread creation)

**Context:** JUCE provides `juce::Thread::RealtimeOptions` which handles platform-specific RT priority:
- macOS: `THREAD_TIME_CONSTRAINT_POLICY` via Mach thread policy
- Linux: `SCHED_FIFO` with appropriate priority
- Windows: `THREAD_PRIORITY_TIME_CRITICAL`

The static function `juce::Thread::tryToUpgradeCurrentThreadToRealtime()` can be called from within any thread (including `std::thread`) to promote it.

**Step 1: Add RT priority promotion to rtProcessingLoop()**

In `src/engine/sandboxworker.hpp`, find `rtProcessingLoop()`. At the very start of the method, before the while loop, add:

```cpp
void rtProcessingLoop()
{
    // Promote this thread to real-time priority
    juce::Thread::RealtimeOptions rtOptions;
    rtOptions = rtOptions.withApproximateAudioProcessingTime (blockSize > 0 ? blockSize : 512,
                                                              sampleRate > 0 ? sampleRate : 44100.0);
    if (! juce::Thread::tryToUpgradeCurrentThreadToRealtime (rtOptions))
        juce::Logger::writeToLog ("[sandbox] Warning: failed to set RT thread priority");

    while (rtThreadRunning.load (std::memory_order_acquire))
    {
        // ... existing loop ...
```

Note: `tryToUpgradeCurrentThreadToRealtime` is a static method that works on the calling thread. It's safe to call from `std::thread`.

**Step 2: Update RT options when prepare changes**

In `handlePrepareToPlay()`, if the RT thread is already running, we should update its priority with the new sample rate and block size. However, `tryToUpgradeCurrentThreadToRealtime` can only be called from the thread itself. Instead, store the values so the next iteration picks them up (they're already stored as `sampleRate` and `blockSize` members).

Add a re-promotion call at the top of the while loop after waking from semaphore, but only once:
```cpp
// In rtProcessingLoop(), add a flag:
bool rtPrioritySet = false;

// At top of while loop, after waking:
if (! rtPrioritySet && sampleRate > 0 && blockSize > 0)
{
    auto opts = juce::Thread::RealtimeOptions{}
        .withApproximateAudioProcessingTime (blockSize, sampleRate);
    rtPrioritySet = juce::Thread::tryToUpgradeCurrentThreadToRealtime (opts);
}
```

**Step 3: Build and run tests**

Run: `cmake --build build-merged -j8 && cd build-merged && ctest --output-on-failure 2>&1 | tail -5`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/engine/sandboxworker.hpp
git commit -m "perf: set real-time thread priority for sandbox worker audio processing"
```

---

## Task 3: Replace Process-Local Memory with True Shared Memory

**CRITICAL: SharedAudioBuffer uses `HeapBlock` (process-local heap). Audio data is NOT actually shared between host and worker processes.**

This is the most complex task. The current `SharedAudioBuffer` allocates memory with `juce::HeapBlock<uint8_t>` which is process-local. For the sandbox to work cross-process, the buffer must be backed by OS shared memory.

**Files:**
- Create: `src/engine/sandboxsharedmemory.hpp`
- Modify: `src/engine/sandboxipc.hpp` (SharedAudioBuffer)
- Modify: `src/engine/sandboxhost.hpp` (create shm, pass name to worker)
- Modify: `src/engine/sandboxworker.hpp` (attach to shm by name)
- Modify: `src/engine/sandboxsemaphore.hpp` (named semaphores)

### Step 1: Create shared memory wrapper

Create `src/engine/sandboxsharedmemory.hpp`:

```cpp
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include <cstdint>
#include <cstring>
#include <string>

#if __APPLE__ || __linux__
  #include <fcntl.h>
  #include <sys/mman.h>
  #include <sys/stat.h>
  #include <unistd.h>
#elif _WIN32
  #include <windows.h>
#endif

namespace element {

/** Cross-platform shared memory region for inter-process audio buffer exchange.
    The creator (host) calls create(). The attacher (worker) calls attach().
    Both get a pointer to the same physical memory region.
*/
class SandboxSharedMemory
{
public:
    SandboxSharedMemory() = default;

    ~SandboxSharedMemory()
    {
        close();
    }

    /** Create a new shared memory region (host side). */
    bool create (const std::string& name, size_t sizeBytes)
    {
        shmName = name;
        totalSize = sizeBytes;
        isOwner = true;

#if __APPLE__ || __linux__
        // Remove any stale segment with the same name
        shm_unlink (shmName.c_str());
        fd = shm_open (shmName.c_str(), O_CREAT | O_RDWR, 0600);
        if (fd < 0) return false;
        if (ftruncate (fd, static_cast<off_t> (totalSize)) != 0) { ::close (fd); fd = -1; return false; }
        data = static_cast<uint8_t*> (mmap (nullptr, totalSize, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0));
        if (data == MAP_FAILED) { data = nullptr; ::close (fd); fd = -1; return false; }
#elif _WIN32
        std::wstring wname (shmName.begin(), shmName.end());
        hMapping = CreateFileMappingW (INVALID_HANDLE_VALUE, nullptr, PAGE_READWRITE,
                                       0, static_cast<DWORD> (totalSize), wname.c_str());
        if (hMapping == nullptr) return false;
        data = static_cast<uint8_t*> (MapViewOfFile (hMapping, FILE_MAP_ALL_ACCESS, 0, 0, totalSize));
        if (data == nullptr) { CloseHandle (hMapping); hMapping = nullptr; return false; }
#endif
        std::memset (data, 0, totalSize);
        return true;
    }

    /** Attach to an existing shared memory region (worker side). */
    bool attach (const std::string& name, size_t sizeBytes)
    {
        shmName = name;
        totalSize = sizeBytes;
        isOwner = false;

#if __APPLE__ || __linux__
        fd = shm_open (shmName.c_str(), O_RDWR, 0600);
        if (fd < 0) return false;
        data = static_cast<uint8_t*> (mmap (nullptr, totalSize, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0));
        if (data == MAP_FAILED) { data = nullptr; ::close (fd); fd = -1; return false; }
#elif _WIN32
        std::wstring wname (shmName.begin(), shmName.end());
        hMapping = OpenFileMappingW (FILE_MAP_ALL_ACCESS, FALSE, wname.c_str());
        if (hMapping == nullptr) return false;
        data = static_cast<uint8_t*> (MapViewOfFile (hMapping, FILE_MAP_ALL_ACCESS, 0, 0, totalSize));
        if (data == nullptr) { CloseHandle (hMapping); hMapping = nullptr; return false; }
#endif
        return true;
    }

    void close()
    {
        if (data != nullptr)
        {
#if __APPLE__ || __linux__
            munmap (data, totalSize);
            if (fd >= 0) ::close (fd);
            if (isOwner) shm_unlink (shmName.c_str());
            fd = -1;
#elif _WIN32
            UnmapViewOfFile (data);
            if (hMapping != nullptr) CloseHandle (hMapping);
            hMapping = nullptr;
#endif
            data = nullptr;
        }
    }

    uint8_t* getData() { return data; }
    size_t getSize() const { return totalSize; }
    const std::string& getName() const { return shmName; }

    SandboxSharedMemory (const SandboxSharedMemory&) = delete;
    SandboxSharedMemory& operator= (const SandboxSharedMemory&) = delete;

private:
    uint8_t* data = nullptr;
    size_t totalSize = 0;
    std::string shmName;
    bool isOwner = false;
#if __APPLE__ || __linux__
    int fd = -1;
#elif _WIN32
    HANDLE hMapping = nullptr;
#endif
};

} // namespace element
```

### Step 2: Update SharedAudioBuffer to use shared memory backend

In `src/engine/sandboxipc.hpp`, modify `SharedAudioBuffer`:

Replace the `HeapBlock<uint8_t> memory` member with a pointer that can point to either local or shared memory:
```cpp
uint8_t* data = nullptr;        // Points into shared memory (or local fallback)
bool ownsMemory = false;         // True if we allocated locally
juce::HeapBlock<uint8_t> localMemory;  // Fallback for in-process use
```

Add methods:
```cpp
/** Attach to externally-provided shared memory region. */
void attachToSharedMemory (uint8_t* sharedData, size_t size)
{
    data = sharedData;
    ownsMemory = false;
    setupPointers();
}

/** Calculate required shared memory size for given channel/sample config. */
static size_t calculateRequiredSize (int maxChannels, int maxSamples)
{
    size_t channelBytes = static_cast<size_t> (maxChannels) * maxSamples * sizeof (float);
    return sizeof (Header) + (4 * channelBytes) + (2 * midiBufferSize);
}
```

Modify `allocate()` to use local memory as fallback (in-process testing):
```cpp
void allocate (int maxChannels, int maxSamples)
{
    if (data != nullptr && ! ownsMemory)
        return;  // Already attached to shared memory

    size_t totalSize = calculateRequiredSize (maxChannels, maxSamples);
    localMemory.allocate (totalSize, true);
    data = localMemory.getData();
    ownsMemory = true;
    setupPointers();
}
```

### Step 3: Update SandboxHost to create shared memory

In `src/engine/sandboxhost.hpp`, add:
```cpp
#include "sandboxsharedmemory.hpp"

// Member:
SandboxSharedMemory sharedMemory;
std::string sharedMemoryName;
```

In `prepareToPlay()`, after calculating buffer size:
```cpp
// Generate unique shared memory name
sharedMemoryName = "/element_sandbox_" + std::to_string (getpid()) + "_" + std::to_string (reinterpret_cast<uintptr_t> (this));

size_t shmSize = SharedAudioBuffer::calculateRequiredSize (numInputChannels, maxBlockSize);
if (sharedMemory.create (sharedMemoryName, shmSize))
{
    audioBuffer.attachToSharedMemory (sharedMemory.getData(), shmSize);
}
else
{
    juce::Logger::writeToLog ("[sandbox] Failed to create shared memory, falling back to pipe IPC");
    audioBuffer.allocate (numInputChannels, maxBlockSize);
}
```

Pass the shared memory name to the worker via a `PrepareToPlay` message payload (include the name string alongside sample rate and block size).

### Step 4: Update SandboxWorker to attach to shared memory

In `src/engine/sandboxworker.hpp`, add:
```cpp
#include "sandboxsharedmemory.hpp"

// Member:
SandboxSharedMemory sharedMemory;
```

In `handlePrepareToPlay()`, extract the shared memory name from the payload and attach:
```cpp
// After parsing sampleRate, blockSize, channels from payload:
if (! shmName.empty())
{
    size_t shmSize = SharedAudioBuffer::calculateRequiredSize (numInputChannels, blockSize);
    if (sharedMemory.attach (shmName, shmSize))
    {
        audioBuffer.attachToSharedMemory (sharedMemory.getData(), shmSize);
    }
    else
    {
        juce::Logger::writeToLog ("[sandbox-worker] Failed to attach shared memory");
        audioBuffer.allocate (numInputChannels, blockSize);
    }
}
```

### Step 5: Update SandboxSemaphore to support named semaphores

In `src/engine/sandboxsemaphore.hpp`, add a named variant:
```cpp
/** Create a named semaphore for cross-process signaling. */
bool createNamed (const std::string& name)
{
#if __APPLE__ || __linux__
    namedSem = sem_open (name.c_str(), O_CREAT, 0600, 0);
    return namedSem != SEM_FAILED;
#elif _WIN32
    std::wstring wname (name.begin(), name.end());
    namedHandle = CreateSemaphoreW (nullptr, 0, LONG_MAX, wname.c_str());
    return namedHandle != nullptr;
#endif
}

/** Open an existing named semaphore. */
bool openNamed (const std::string& name)
{
#if __APPLE__ || __linux__
    namedSem = sem_open (name.c_str(), 0);
    return namedSem != SEM_FAILED;
#elif _WIN32
    std::wstring wname (name.begin(), name.end());
    namedHandle = OpenSemaphoreW (SEMAPHORE_ALL_ACCESS, FALSE, wname.c_str());
    return namedHandle != nullptr;
#endif
}
```

Update `post()`, `timedWait()`, `wait()` to use the named semaphore if present, falling back to the unnamed one.

### Step 6: Build and run tests

Run: `cmake --build build-merged -j8 && cd build-merged && ctest --output-on-failure 2>&1 | tail -10`
Expected: All tests pass (in-process tests use local memory fallback)

### Step 7: Commit

```bash
git add src/engine/sandboxsharedmemory.hpp src/engine/sandboxipc.hpp src/engine/sandboxhost.hpp src/engine/sandboxworker.hpp src/engine/sandboxsemaphore.hpp
git commit -m "feat: implement true cross-process shared memory and named semaphores for sandbox IPC"
```

---

## Task 4: Add macOS Code Signing and Notarization

**CRITICAL: macOS Gatekeeper blocks unsigned apps. Users can't run Element without disabling security.**

**Files:**
- Modify: `installer/build_pkg.sh`
- Create: `scripts/codesign.sh`
- Modify: `cmake/Element.cmake` (optional: signing in CMake)

**Prerequisites:**
- Apple Developer ID certificate installed in Keychain
- `DEVELOPER_ID` environment variable set (e.g., `"Developer ID Application: Kushview LLC (TEAMID)"`)
- `NOTARIZE_APPLE_ID` and `NOTARIZE_PASSWORD` (app-specific password) set

### Step 1: Create code signing script

Create `scripts/codesign.sh`:
```bash
#!/bin/bash
set -euo pipefail

# Usage: ./scripts/codesign.sh <path-to-app-or-plugin>
# Requires: DEVELOPER_ID env var

IDENTITY="${DEVELOPER_ID:?Set DEVELOPER_ID env var}"
TARGET="${1:?Usage: codesign.sh <path>}"

echo "Signing: $TARGET"
codesign --force --deep --timestamp \
    --options runtime \
    --entitlements "$(dirname "$0")/../cmake/entitlements.plist" \
    --sign "$IDENTITY" \
    "$TARGET"

echo "Verifying..."
codesign --verify --verbose=2 "$TARGET"
spctl --assess --type execute --verbose=2 "$TARGET" 2>&1 || true
echo "Done: $TARGET"
```

### Step 2: Create entitlements file (if not exists)

Check if `cmake/entitlements.plist` exists. If not, create it:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.device.audio-input</key>
    <true/>
</dict>
</plist>
```

### Step 3: Update build_pkg.sh to sign before packaging

In `installer/build_pkg.sh`, add signing steps BEFORE `pkgbuild`:
```bash
# Sign all binaries
SIGN_IDENTITY="${DEVELOPER_ID:-}"
if [ -n "$SIGN_IDENTITY" ]; then
    echo "=== Signing binaries ==="
    ../scripts/codesign.sh "$APP_PATH"
    for plugin in "$AU_PATH" "$VST3_PATH" "$LV2_PATH" "$CLAP_PATH"; do
        [ -e "$plugin" ] && ../scripts/codesign.sh "$plugin"
    done
fi
```

After `productbuild`, add notarization:
```bash
if [ -n "$SIGN_IDENTITY" ] && [ -n "${NOTARIZE_APPLE_ID:-}" ]; then
    echo "=== Notarizing ==="
    xcrun notarytool submit "$PKG_OUTPUT" \
        --apple-id "$NOTARIZE_APPLE_ID" \
        --password "$NOTARIZE_PASSWORD" \
        --team-id "$TEAM_ID" \
        --wait
    xcrun stapler staple "$PKG_OUTPUT"
fi
```

### Step 4: Make scripts executable

```bash
chmod +x scripts/codesign.sh
```

### Step 5: Commit

```bash
git add scripts/codesign.sh installer/build_pkg.sh
git commit -m "build: add macOS code signing and notarization to installer pipeline"
```

**Note:** Windows Authenticode signing follows a similar pattern but uses `signtool.exe`. This can be added as a follow-up task once a Windows signing certificate is obtained.

---

## Summary

| Task | What | Risk | Effort |
|------|------|------|--------|
| 1 | Lua sandbox lockdown | Low | 30 min |
| 2 | RT thread priority | Low | 30 min |
| 3 | **Cross-process shared memory** | **High** | 1-2 days |
| 4 | macOS code signing | Medium | 2-3 hours |

**Critical discovery:** The current `SharedAudioBuffer` uses `HeapBlock` (process-local heap), NOT shared memory. The lock-free redesign from the previous plan works correctly for in-process testing but will NOT work across process boundaries until Task 3 is complete. Task 3 is the highest-priority item.

## Dependencies

```
Task 1 (Lua) ─────────→ Independent
Task 2 (RT priority) ──→ Independent
Task 3 (Shared memory) → Enables true cross-process sandbox
Task 4 (Code signing) ─→ Requires Developer ID certificate
```
