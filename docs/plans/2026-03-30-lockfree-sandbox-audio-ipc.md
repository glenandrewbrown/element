# Lock-Free Sandbox Audio IPC Redesign

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the blocking mutex/condvar audio processing path in the sandbox IPC with a lock-free shared-memory design using platform semaphores, eliminating all real-time violations on the audio thread.

**Architecture:** Yabridge-hybrid pattern with JACK-style semaphore signaling. Shared memory holds audio/MIDI data (already exists). Platform semaphores (Mach on macOS, POSIX on Linux, Windows Events on Windows) replace the pipe-based ProcessBlock/ProcessComplete request-response. The audio thread never blocks on a mutex — it spin-waits briefly then falls back to a bounded semaphore wait. Control messages (load, state, bypass) remain on the existing JUCE pipe. One buffer of added latency in synchronous mode.

**Tech Stack:** C++20, JUCE 8.0.12, POSIX semaphores (Linux), Mach semaphores (macOS), platform abstractions

**References:** JACK2 activation protocol, yabridge hybrid shm+socket, Ardour's analysis of context switch costs, Ross Bencina's RT audio rules

---

## Background: Current Problems

The current `SandboxHost::processBlock()` has three real-time violations:
1. **Mutex lock** via `std::condition_variable::wait_until` (priority inversion risk)
2. **IPC pipe write** via `sendMessageToWorker()` (can block if pipe buffer full)
3. **50ms hardcoded timeout** (unrelated to actual buffer period)

The fix separates the audio data path (shared memory + semaphores, lock-free) from the control path (JUCE pipes, can block).

## Architecture Overview

```
HOST PROCESS                              WORKER PROCESS
============                              ==============

Audio Thread:                             RT Processing Thread:
  1. Write input → shm audio_in[]           [blocked on trigger_sem]
  2. Write MIDI → shm midi_in ring          ← sem_post(trigger_sem)
  3. host_sequence++ (release)              Wake up
  4. sem_post(trigger_sem) ─────────→       Read shm audio_in[]
  5. Spin-wait on worker_sequence           Read MIDI from ring
     then sem_timedwait(done_sem)           plugin->processBlock()
  6. Read shm audio_out[] ←─────────       Write shm audio_out[]
  7. Read MIDI from midi_out ring           Write MIDI to ring
                                            worker_sequence++ (release)
                                            sem_post(done_sem) ──→ wake host

Control Thread (MessageThread):           Control Thread:
  loadPlugin() → pipe ──────────────→     handleLoadPlugin()
  setPluginState() → pipe ──────────→     handleSetState()
  getPluginState() ← pipe ←────────←     handleGetState()
  [CAN BLOCK - not audio thread]          [CAN BLOCK - not RT thread]
```

---

## Task List

### Task 1: Create Platform Semaphore Abstraction

**Files:**
- Create: `src/engine/sandboxsemaphore.hpp`
- Test: Build verification only (semaphore is platform primitive)

**Step 1: Write the semaphore wrapper**

Create `src/engine/sandboxsemaphore.hpp`:

```cpp
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include <cstdint>

#if __APPLE__
  #include <mach/mach.h>
  #include <mach/semaphore.h>
  #include <mach/task.h>
#elif __linux__
  #include <semaphore.h>
  #include <time.h>
  #include <errno.h>
#elif _WIN32
  #include <windows.h>
#endif

namespace element {

/** Cross-platform semaphore for real-time audio IPC signaling.
    Uses Mach semaphores on macOS, POSIX semaphores on Linux,
    Windows Events on Windows. All operations are RT-safe
    (no allocation, bounded wait times).
*/
class SandboxSemaphore
{
public:
    SandboxSemaphore()
    {
#if __APPLE__
        semaphore_create (mach_task_self(), &sem, SYNC_POLICY_FIFO, 0);
#elif __linux__
        sem_init (&sem, 0, 0);  // 0 = not shared between processes (use named for IPC)
#elif _WIN32
        sem = CreateEventW (nullptr, FALSE, FALSE, nullptr);
#endif
    }

    ~SandboxSemaphore()
    {
#if __APPLE__
        semaphore_destroy (mach_task_self(), sem);
#elif __linux__
        sem_destroy (&sem);
#elif _WIN32
        if (sem != nullptr)
            CloseHandle (sem);
#endif
    }

    /** Post (signal) the semaphore. RT-safe, never blocks. */
    void post()
    {
#if __APPLE__
        semaphore_signal (sem);
#elif __linux__
        sem_post (&sem);
#elif _WIN32
        SetEvent (sem);
#endif
    }

    /** Wait with timeout in microseconds. Returns true if signaled, false on timeout.
        RT-safe when used with bounded timeout.
    */
    bool timedWait (uint64_t timeoutMicroseconds)
    {
#if __APPLE__
        mach_timespec_t ts;
        ts.tv_sec = static_cast<unsigned int> (timeoutMicroseconds / 1000000);
        ts.tv_nsec = static_cast<clock_res_t> ((timeoutMicroseconds % 1000000) * 1000);
        return semaphore_timedwait (sem, ts) == KERN_SUCCESS;
#elif __linux__
        struct timespec deadline;
        clock_gettime (CLOCK_REALTIME, &deadline);
        deadline.tv_nsec += static_cast<long> ((timeoutMicroseconds % 1000000) * 1000);
        deadline.tv_sec += static_cast<time_t> (timeoutMicroseconds / 1000000);
        if (deadline.tv_nsec >= 1000000000L)
        {
            deadline.tv_sec++;
            deadline.tv_nsec -= 1000000000L;
        }
        return sem_timedwait (&sem, &deadline) == 0;
#elif _WIN32
        DWORD ms = static_cast<DWORD> (timeoutMicroseconds / 1000);
        return WaitForSingleObject (sem, ms) == WAIT_OBJECT_0;
#endif
    }

    /** Blocking wait (no timeout). Use only on non-RT threads. */
    void wait()
    {
#if __APPLE__
        semaphore_wait (sem);
#elif __linux__
        while (sem_wait (&sem) == -1 && errno == EINTR)
            ;  // retry on signal interruption
#elif _WIN32
        WaitForSingleObject (sem, INFINITE);
#endif
    }

    SandboxSemaphore (const SandboxSemaphore&) = delete;
    SandboxSemaphore& operator= (const SandboxSemaphore&) = delete;

private:
#if __APPLE__
    semaphore_t sem {};
#elif __linux__
    sem_t sem {};
#elif _WIN32
    HANDLE sem = nullptr;
#endif
};

} // namespace element
```

**Step 2: Build to verify**

Run: `cmake --build build-merged -j8 2>&1 | tail -5`
Expected: Build succeeds (header-only, included by later tasks)

**Step 3: Commit**

```bash
git add src/engine/sandboxsemaphore.hpp
git commit -m "feat: add cross-platform SandboxSemaphore for RT-safe audio IPC signaling"
```

---

### Task 2: Add Lock-Free Audio Bridge to SharedAudioBuffer

**Files:**
- Modify: `src/engine/sandboxipc.hpp`

**Goal:** Add spin-wait + semaphore signaling infrastructure to SharedAudioBuffer so the audio path doesn't need pipe messages.

**Step 1: Add semaphore members and spin-wait method**

Add to SharedAudioBuffer's Header struct:
```cpp
std::atomic<uint32_t> hostSequence { 0 };    // incremented by host each cycle
std::atomic<uint32_t> workerSequence { 0 };  // incremented by worker on completion
std::atomic<uint32_t> xrunCount { 0 };       // total xruns
std::atomic<uint32_t> consecutiveXruns { 0 }; // consecutive missed deadlines
```

Note: The existing `coordinatorSequence` and `workerSequence` may already exist in the header. If so, reuse them and just ensure correct memory ordering. Add `xrunCount` and `consecutiveXruns` as new fields.

**Step 2: Add signaling helper methods to SharedAudioBuffer**

```cpp
/** Signal that host has written new input data. Called from audio thread. */
void signalHostReady()
{
    if (header)
        header->hostSequence.fetch_add (1, std::memory_order_release);
}

/** Check if worker has completed processing for the expected sequence.
    Returns true if worker's sequence matches expected. Lock-free. */
bool isWorkerDone (uint32_t expectedSeq) const
{
    if (! header) return false;
    return header->workerSequence.load (std::memory_order_acquire) >= expectedSeq;
}

/** Signal that worker has finished processing. Called from worker RT thread. */
void signalWorkerDone()
{
    if (header)
        header->workerSequence.fetch_add (1, std::memory_order_release);
}

/** Record an xrun (worker missed deadline). */
void recordXrun()
{
    if (! header) return;
    header->xrunCount.fetch_add (1, std::memory_order_relaxed);
    header->consecutiveXruns.fetch_add (1, std::memory_order_relaxed);
}

/** Clear consecutive xrun counter (worker completed on time). */
void clearConsecutiveXruns()
{
    if (header)
        header->consecutiveXruns.store (0, std::memory_order_relaxed);
}

uint32_t getConsecutiveXruns() const
{
    return header ? header->consecutiveXruns.load (std::memory_order_relaxed) : 0;
}

uint32_t getHostSequence() const
{
    return header ? header->hostSequence.load (std::memory_order_acquire) : 0;
}
```

**Step 3: Build and verify**

Run: `cmake --build build-merged -j8 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/engine/sandboxipc.hpp
git commit -m "feat: add lock-free sequence counters and xrun tracking to SharedAudioBuffer"
```

---

### Task 3: Add Semaphores to SandboxHost

**Files:**
- Modify: `src/engine/sandboxhost.hpp`

**Goal:** Add trigger and done semaphores as members. These will be used by the new processBlock in Task 5.

**Step 1: Include the semaphore header and add members**

Add to SandboxHost's private section:
```cpp
#include "sandboxsemaphore.hpp"

// Lock-free audio signaling (replaces mutex/condvar for audio path)
SandboxSemaphore triggerSemaphore;  // host signals worker to process
SandboxSemaphore doneSemaphore;     // worker signals host that processing is complete
uint32_t expectedWorkerSequence { 0 }; // tracks expected response sequence

// Spin-wait configuration
static constexpr int spinIterations = 10000;  // ~390us on x86 with _mm_pause

// Xrun management
static constexpr uint32_t maxConsecutiveXruns = 10;
```

**Step 2: Build and verify**

Run: `cmake --build build-merged -j8 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/engine/sandboxhost.hpp
git commit -m "feat: add semaphore members and spin-wait config to SandboxHost"
```

---

### Task 4: Add Semaphores to SandboxWorker

**Files:**
- Modify: `src/engine/sandboxworker.hpp`

**Goal:** Add a dedicated RT processing thread that waits on the trigger semaphore instead of pipe messages.

**Step 1: Add semaphore and RT thread members**

Add to SandboxWorker's private section:
```cpp
#include "sandboxsemaphore.hpp"

SandboxSemaphore triggerSemaphore;  // host signals new data available
SandboxSemaphore doneSemaphore;     // worker signals processing complete
std::atomic<bool> rtThreadRunning { false };
std::unique_ptr<std::thread> rtThread;
```

**Step 2: Create the RT processing loop**

Add a method that runs on the dedicated RT thread:
```cpp
void rtProcessingLoop()
{
    rtThreadRunning.store (true);
    while (rtThreadRunning.load (std::memory_order_acquire))
    {
        // Wait for host to signal new data (blocking wait is OK - this is not the host audio thread)
        if (! triggerSemaphore.timedWait (500000))  // 500ms timeout for shutdown check
            continue;

        if (! rtThreadRunning.load (std::memory_order_acquire))
            break;

        // Process the audio block (same logic as current handleProcessBlock)
        processAudioBlock();

        // Signal host that processing is complete
        doneSemaphore.post();
    }
}
```

**Step 3: Extract audio processing from handleProcessBlock into processAudioBlock()**

Create `processAudioBlock()` containing the core audio processing logic from `handleProcessBlock()`:
- Read input from shared buffer
- Deserialize MIDI
- Call plugin->processBlock()
- Write output to shared buffer
- Serialize MIDI output
- Increment worker sequence counter via `audioBuffer.signalWorkerDone()`

The existing `handleProcessBlock()` (called from pipe messages) should now just post the trigger semaphore as a fallback/compatibility path:
```cpp
void handleProcessBlock()
{
    // Legacy path: pipe-based trigger falls through to semaphore
    triggerSemaphore.post();
}
```

**Step 4: Start/stop the RT thread**

In `handleConnectionMade()` or after `handlePrepareToPlay()`, start the RT thread:
```cpp
if (! rtThread)
{
    rtThread = std::make_unique<std::thread> ([this] { rtProcessingLoop(); });
    // TODO: Set RT thread priority (platform-specific)
}
```

In `handleShutdown()` and destructor, stop it:
```cpp
rtThreadRunning.store (false, std::memory_order_release);
triggerSemaphore.post();  // wake thread so it can exit
if (rtThread && rtThread->joinable())
    rtThread->join();
rtThread.reset();
```

**Step 5: Build and verify**

Run: `cmake --build build-merged -j8 2>&1 | tail -5`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add src/engine/sandboxworker.hpp
git commit -m "feat: add RT processing thread with semaphore-based trigger in SandboxWorker"
```

---

### Task 5: Rewrite SandboxHost::processBlock() to Be Lock-Free

**Files:**
- Modify: `src/engine/sandboxhost.hpp`

**This is the critical task.** Replace the blocking processBlock with the lock-free version.

**Step 1: Rewrite processBlock()**

Replace the entire `processBlock()` method:

```cpp
void processBlock (juce::AudioSampleBuffer& buffer, juce::MidiBuffer& midi)
{
    if (! isHealthy() || ! pluginLoaded.load() || bypassed.load())
    {
        if (state.load() == State::Crashed)
        {
            buffer.clear();
            midi.clear();
        }
        return;
    }

    // 1. Write input audio to shared buffer
    audioBuffer.writeInputAudio (buffer, buffer.getNumSamples());

    // 2. Write MIDI input
    if (auto* header = audioBuffer.getHeader())
    {
        auto* midiIn = audioBuffer.getMidiInputBuffer();
        uint32_t midiSize = serializeMidiBuffer (midi, midiIn, audioBuffer.getMidiBufferSize());
        header->midiInputSize.store (midiSize, std::memory_order_release);
    }

    // 3. Signal host data is ready (atomic sequence increment + semaphore)
    audioBuffer.swapBuffers();
    audioBuffer.signalHostReady();
    expectedWorkerSequence++;
    triggerSemaphore.post();

    // 4. Spin-wait phase: check if worker already finished (fast path)
    bool workerDone = false;
    for (int i = 0; i < spinIterations; ++i)
    {
        if (audioBuffer.isWorkerDone (expectedWorkerSequence))
        {
            workerDone = true;
            break;
        }
#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
        _mm_pause();
#elif defined(__aarch64__) || defined(__arm__)
        __yield();
#endif
    }

    // 5. Semaphore wait phase: bounded blocking (fallback for slower plugins)
    if (! workerDone)
    {
        // Calculate timeout as 80% of buffer period
        const double bufferPeriodUs = (buffer.getNumSamples() / cachedSampleRate) * 1000000.0;
        const uint64_t timeoutUs = static_cast<uint64_t> (bufferPeriodUs * 0.8);

        workerDone = doneSemaphore.timedWait (std::max (timeoutUs, uint64_t (1000)));

        if (! workerDone)
            workerDone = audioBuffer.isWorkerDone (expectedWorkerSequence);
    }

    // 6. Handle result
    if (workerDone)
    {
        // Success: read output
        audioBuffer.clearConsecutiveXruns();
        audioBuffer.readOutputAudio (buffer, buffer.getNumSamples());

        if (auto* header = audioBuffer.getHeader())
        {
            auto* midiOut = audioBuffer.getMidiOutputBuffer();
            uint32_t midiOutSize = header->midiOutputSize.load (std::memory_order_acquire);
            if (midiOutSize > 0)
            {
                midi.clear();
                deserializeMidiBuffer (midiOut, midiOutSize, midi);
            }
        }
    }
    else
    {
        // Xrun: output silence
        buffer.clear();
        midi.clear();
        audioBuffer.recordXrun();

        if (audioBuffer.getConsecutiveXruns() >= maxConsecutiveXruns)
        {
            juce::Logger::writeToLog ("[sandbox] " + juce::String (maxConsecutiveXruns)
                                      + " consecutive xruns - worker may be hung");
        }
    }
}
```

**Step 2: Add `cachedSampleRate` member if not present**

Ensure there's a `double cachedSampleRate { 44100.0 }` member, set during `prepareToPlay()`.

**Step 3: Remove or deprecate `waitForResponse()` for audio path**

Keep `waitForResponse()` for control messages (loadPlugin, setState, etc.) but add a comment that it must NEVER be called from the audio thread.

```cpp
/** Wait for a response from the worker process.
    WARNING: Uses mutex+condvar. ONLY call from the message thread, NEVER from audio thread.
*/
bool waitForResponse (SandboxMessageType expectedType, uint32_t timeoutMs)
```

**Step 4: Add `_mm_pause` include**

At the top of sandboxhost.hpp:
```cpp
#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
  #include <immintrin.h>
#endif
```

**Step 5: Build and run tests**

Run: `cmake --build build-merged -j8 && cd build-merged && ctest --output-on-failure 2>&1 | tail -10`
Expected: Build succeeds, all tests pass

**Step 6: Commit**

```bash
git add src/engine/sandboxhost.hpp
git commit -m "feat: rewrite processBlock to be lock-free with spin-wait + semaphore fallback"
```

---

### Task 6: Update SandboxedProcessorNode for New IPC

**Files:**
- Modify: `src/nodes/sandboxedprocessor.hpp`

**Step 1: Report latency correctly**

In `prepareToRender()`, after calling `sandbox->prepareToPlay()`, report one buffer of added latency:

```cpp
// Sandbox adds one buffer of inherent latency
int pluginLatency = sandbox->getLatencySamples();
setLatencySamples (pluginLatency + maxBufferSize);
```

**Step 2: Build and run tests**

Run: `cmake --build build-merged -j8 && cd build-merged && ctest --output-on-failure 2>&1 | tail -5`

**Step 3: Commit**

```bash
git add src/nodes/sandboxedprocessor.hpp
git commit -m "fix: report correct latency for sandboxed plugins (plugin latency + 1 buffer)"
```

---

### Task 7: Integration Test and Cleanup

**Files:**
- Modify: `src/engine/sandboxhost.hpp` (remove dead code)
- Modify: `src/engine/sandboxworker.hpp` (cleanup)

**Step 1: Remove the old pipe-based ProcessBlock message handling from host**

In `handleMessageFromWorker()`, the `ProcessComplete` case previously woke the condvar. Now it should be a no-op or just log (the semaphore handles signaling):

```cpp
case SandboxMessageType::ProcessComplete:
    // Handled by semaphore signaling, no action needed here
    break;
```

**Step 2: Remove `responseMutex` and `responseCondition` if only used for audio**

Check if `waitForResponse()` is still used for control messages (loadPlugin, getState). If YES, keep the mutex/condvar for control messages only. If NO, remove them.

Most likely `waitForResponse` is still needed for `loadPlugin()`, `getPluginState()`, etc. Keep it but ensure it's only called from the message thread.

**Step 3: Full build, test, and verification**

Run: `cmake --build build-merged -j8 && cd build-merged && ctest --output-on-failure`
Expected: All 33+ tests pass

**Step 4: Commit**

```bash
git add src/engine/sandboxhost.hpp src/engine/sandboxworker.hpp
git commit -m "refactor: clean up legacy pipe-based audio signaling, keep pipe for control messages"
```

---

## Summary

| Task | Description | Risk | Est. Effort |
|------|-------------|------|-------------|
| 1 | Platform semaphore abstraction | Low | 20 min |
| 2 | Lock-free sequence counters in SharedAudioBuffer | Low | 15 min |
| 3 | Add semaphores to SandboxHost | Low | 10 min |
| 4 | RT processing thread in SandboxWorker | Medium | 30 min |
| 5 | **Rewrite processBlock() lock-free** | **High** | 45 min |
| 6 | Update SandboxedProcessorNode latency | Low | 10 min |
| 7 | Integration test and cleanup | Medium | 20 min |

**Total estimated effort:** ~2.5 hours

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Signaling mechanism | Platform semaphores | RT-safe, bounded wait, ~1-5us latency |
| Spin-wait before sem | 10K iterations (~390us) | Catches fast plugins without kernel transition |
| Timeout calculation | 80% of buffer period | Leaves headroom for host-side work |
| Added latency | 1 buffer (synchronous) | Standard for plugin bridges; PDC compensates |
| MIDI exchange | Existing ring in shared memory | Already works, just needs proper ordering |
| Control messages | Keep on JUCE pipe | Blocking OK for non-RT operations |
| Xrun policy | 10 consecutive = log warning | Don't kill worker for occasional misses |

## Future Improvements (Not in This Plan)

1. **Named/shared semaphores for true cross-process** — Current SandboxSemaphore uses process-local semaphores. For the actual cross-process case, need named semaphores or Mach port-based semaphore sharing. This depends on how JUCE's ChildProcessCoordinator shares resources.
2. **RT thread priority** — Set the worker's RT thread to real-time priority (SCHED_FIFO on Linux, THREAD_TIME_CONSTRAINT_POLICY on macOS)
3. **Triple buffering** — For pipelined (async) mode with 2-buffer latency, allowing the host to never wait
4. **MIDI ring buffer reset per cycle** — Prevent stale events crossing block boundaries
5. **Plugin grouping** — Multiple plugins per sandbox process to reduce context switches (Bitwig model)
