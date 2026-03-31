# Element Backend Forensic Audit Report

**Date:** 2026-03-30
**Branch:** `local-enhancements`
**Audited by:** 6 specialized parallel agents (Claude Opus 4.6)
**Scope:** All backend code — engine, sandbox IPC, nodes, services, threading, Lua scripting
**Files analyzed:** ~424 files, ~90K lines of C++20/JUCE 8.0.12

---

## Executive Summary

**VERDICT: BLOCK — Not safe for production use.**

| Agent | CRITICAL | HIGH | MEDIUM | LOW | Total |
|-------|----------|------|--------|-----|-------|
| 1 - Audio Engine Core | 6 | 9 | 6 | — | 21 |
| 2 - Sandbox IPC | 6 | 6 | 7 | — | 19 |
| 3 - Node Implementations | 7 | 8 | 7 | — | 22 |
| 4 - Services Layer | 7 | 5 | 8 | — | 20 |
| 5 - Threading & RT Safety | 7 | 8 | 7 | — | 22 |
| 6 - Lua/Scripting Security | 4 | 9 | 9 | 3 | 25 |
| **TOTAL** | **37** | **45** | **44** | **3** | **129** |

After deduplication (several findings overlap across agents, particularly ScriptNode and threading issues), the unique finding count is approximately **100+ distinct bugs**.

---

## Top 15 Crash-Causing Bugs (Fix Immediately)

These are the bugs most likely causing the reported frequent crashes, ordered by impact:

### 1. ScriptNode: Triple Real-time Violation (CRITICAL x3)
- **Files:** `src/nodes/scriptnode.cpp:72,190`, `src/scripting/dspscript.cpp:520`
- `CriticalSection` (OS mutex) acquired on audio thread in `render()`
- `MessageManagerLock` acquired on audio thread when Lua calls `print()`
- Lua GC runs on audio thread — non-deterministic `malloc`/`free`
- **Impact:** Guaranteed deadlock if any Lua script calls `print()` in its process function. Guaranteed xruns from GC pauses.
- **Fix:** Lock-free pointer swap for script changes, async ring-buffer logger, stop Lua GC during audio processing

### 2. GraphNode::render() Allocates on Audio Thread (CRITICAL)
- **File:** `src/engine/graphnode.cpp:536`
- `currentAudioOutputBuffer.setSize()` called without `avoidReallocating=true`
- Calls `malloc` on every audio callback when channel count changes
- **Fix:** Pre-allocate in `prepareToRender`, use 5-arg `setSize(..., true)` in `render()`

### 3. Sandbox IPC: Semaphores Are Process-Local (CRITICAL)
- **Files:** `src/engine/sandboxhost.hpp:206-207`, `src/engine/sandboxworker.hpp:121-122`
- `triggerSemaphore` and `doneSemaphore` are process-local kernel objects, never shared across the process boundary
- **Impact:** Every sandboxed plugin block times out — sandbox audio has never worked. Every block is an xrun.
- **Fix:** Use named kernel semaphores or embed `PTHREAD_PROCESS_SHARED` semaphores in shared memory

### 4. GraphBuilder connectChannels Wrong Null Guard (CRITICAL)
- **File:** `src/engine/graphbuilder.cpp` (connectChannels)
- `&&` should be `||` — crashes any time one of two nodes is missing
- **Fix:** One-character fix: `&&` → `||`

### 5. PortBuffer::reset() Writes LV2 Atom Header into Audio Buffer (CRITICAL)
- **File:** `src/engine/portbuffer.cpp` (reset)
- Corrupts first 8 bytes of every audio port buffer on reset
- **Fix:** Guard atom header write with `isAtom()` / `isEvent()` check

### 6. lastGraph = -1 After Removing All Graphs (CRITICAL)
- **File:** `src/engine/audioengine.cpp:242`
- `getUnchecked(-1)` on every audio callback after removing the last graph
- **Fix:** Guard with `if (lastGraph >= 0)` before `getUnchecked`

### 7. Sandbox SharedAudioBuffer Uses `std::atomic` in Shared Memory (CRITICAL)
- **File:** `src/engine/sandboxipc.hpp:214-231`
- `std::atomic` may use a per-process lock table — UB in shared memory
- **Fix:** Use `std::atomic_ref<uint32_t>` (C++20) or C11 `_Atomic`

### 8. CombFilter/AllPassFilter Division by Zero (CRITICAL)
- **Files:** `src/nodes/combfilter.hpp:61`, `src/nodes/allpassfilter.hpp:46`
- `bufferIndex % bufferSize` when `bufferSize == 0` after `releaseResources()`
- **Fix:** Guard: `if (bufferSize > 0) bufferIndex = (bufferIndex + 1) % bufferSize;`

### 9. AudioRouter/AudioMixer `setSize()` on Audio Thread (CRITICAL)
- **Files:** `src/nodes/audiorouter.cpp:159`, `src/nodes/audiomixer.cpp:445`
- Heap allocation in `render()`/`processBlock()` on channel count change
- **Fix:** Pre-allocate in `prepareToRender`/`prepareToPlay`

### 10. Services: 4+ Unconditional `sibling<GuiService>()->` Null Derefs (CRITICAL)
- **Files:** `src/services/engineservice.cpp:445,1126`, `src/services/sessionservice.cpp:74`, plus others
- No null check before `->stabilizeContent()` / `->stabilizeViews()` — crash on shutdown or plugin mode
- **Fix:** Wrap each in `if (auto* gui = sibling<GuiService>())`

### 11. changeBusesLayout Infinite Spin Loop (CRITICAL)
- **File:** `src/services/engineservice.cpp:1043-1058`
- Busy-wait on `isSuspended()` — hangs message thread permanently if audio thread doesn't acknowledge
- **Fix:** Use timeout + `runDispatchLoopUntil()` or async suspension

### 12. MidiDeviceProcessor `deviceIsAvailable()` Always Returns True (CRITICAL)
- **File:** `src/nodes/mididevice.cpp:399-415`
- For-loop falls through to `return true` instead of `return false`
- **Fix:** Change fall-through `return true` to `return false`

### 13. Sandbox Double Placement-New Corrupts Header (CRITICAL)
- **File:** `src/engine/sandboxipc.hpp:422-430`
- Both host and worker run `new (header) Header()`, zeroing sequence counters — causes permanent xruns
- **Fix:** Only run placement-new on the creator (host) side

### 14. AudioMixer Hardcoded 2-Channel RMS (CRITICAL)
- **File:** `src/nodes/audiomixer.cpp:493-495`
- Reads channel index 1 from a mono buffer — out-of-bounds
- **Fix:** `jmin(2, output.getNumChannels())`

### 15. ProcessBufferOp Acquires Property Lock on Audio Thread (CRITICAL)
- **File:** `src/engine/graphbuilder.cpp:304`
- `getPropertyLock()` is an OS mutex used in graph builder ops on the audio thread
- **Fix:** Replace with `juce::Atomic<>` member reads

---

## Lua/Scripting Security Vulnerabilities

### CRITICAL (Sandbox is OPEN)
| # | Finding | File |
|---|---------|------|
| 1 | Native library loading via `package.cpath` | `bindings.cpp:429-440` |
| 2 | `load()` function available — arbitrary code compilation | `bindings.cpp:425-427` |
| 3 | `el.script.load` re-exposes `loadfile` | `script.lua:19` |
| 4 | CriticalSection on audio thread (deadlock) | `scriptnode.cpp:190` |

### HIGH
| # | Finding | File |
|---|---------|------|
| 5 | No bounds checking on audio buffer get/set | `AudioBufferImpl.ipp:113-131` |
| 6 | No type validation in MidiBuffer bindings | `MidiBuffer.cpp:134-150` |
| 7 | Buffer overflow in `setParameterData` | `dspscript.cpp:714-719` |
| 8 | Lua GC on audio thread | `dspscript.cpp:520-567` |
| 9 | Full Context/services exposed to Lua | `Context.cpp:50-58` |
| 10 | Arbitrary file write via `Node:writeFile` | `nodetype.hpp:121-125` |
| 11 | `MessageManagerLock` on audio thread in print | `scriptnode.cpp:65-75` |
| 12 | `luaL_unref` called with `LUA_REFNIL` (leak) | `midi_buffer.hpp:32-39` |
| 13 | No bounds check in `setParameter` | `dspscript.cpp:693-697` |

---

## Sandbox IPC: Fundamentally Broken

The out-of-process plugin sandbox has **never functioned correctly**:

1. Semaphores are process-local — no cross-process signaling
2. `std::atomic` in shared memory — UB without `atomic_ref`
3. Double placement-new corrupts sequence counters
4. Host unmaps shared memory before worker stops
5. `waitForResponse` deadlocks on crash recovery
6. `attemptRestart` sends `SetState` before plugin loads

**All 6 issues must be fixed together** — they are co-dependent for the fundamental audio exchange mechanism.

---

## Engine Core: Active Crash Bugs

| Bug | File | One-line Description |
|-----|------|---------------------|
| Wrong null guard (`&&`→`||`) | graphbuilder.cpp | Crashes when either node missing in `connectChannels` |
| `lastGraph = -1` | audioengine.cpp:242 | `getUnchecked(-1)` crash after removing all graphs |
| Atom header in audio buffer | portbuffer.cpp | Corrupts first 8 bytes of every audio buffer on reset |
| `ev->type` wrong field | portbuffer.cpp:142 | LV2 event type corrupted |
| IONode null deref | ionode.cpp | `currentAudioInputBuffer` null when graph bypassed |
| Raw `AudioProcessor*` | graphbuilder.cpp:364 | Unchecked in release builds |
| `renderingBuffers` resize race | graphnode.cpp:430 | Resize races audio thread |
| `disconnectNode` null deref | graphmanager.cpp:540 | Null src/dst dereference |
| `setActiveGraph` spin loop | audioengine.cpp:899 | Can hang UI thread |
| Bus layout race | graphmanager.cpp:806 | Reconfiguration races audio thread |

---

## Services Layer: Lifecycle & Null Deref Cascade

| Bug | File | Description |
|-----|------|-------------|
| 4x unconditional `sibling<>()->` | engineservice.cpp, sessionservice.cpp | Null deref on shutdown |
| `changeBusesLayout` spin loop | engineservice.cpp:1043 | Hangs message thread |
| `SessionService::deactivate` null | sessionservice.cpp:60 | `changeResetter` null deref |
| `GuiService::sessionRef` stale | guiservice.cpp:627 | UI on wrong session after reload |
| `addPlugin` null format | engineservice.cpp:879 | Plugin format null deref in release |
| `saveSession` null gui | sessionservice.cpp:197 | Deref without guard |
| `DeviceService::remove` null session | deviceservice.cpp:120 | Null session in DBG branch |

---

## Node Implementations: Audio Thread Violations

| Bug | File | Description |
|-----|------|-------------|
| ScriptNode CriticalSection | scriptnode.cpp:190 | OS mutex in `render()` |
| ScriptNode MessageManagerLock | scriptnode.cpp:72 | Deadlock in Lua `print()` |
| AudioRouter `setSize()` | audiorouter.cpp:159 | Heap alloc in `render()` |
| AudioMixer `setSize()` | audiomixer.cpp:445 | Heap alloc in `processBlock()` |
| CombFilter div-by-zero | combfilter.hpp:61 | `% 0` crash |
| AllPassFilter div-by-zero | allpassfilter.hpp:46 | `% 0` crash |
| `deviceIsAvailable` always true | mididevice.cpp:399 | Wrong device opened |
| AudioMixer 2-chan hardcode | audiomixer.cpp:493 | OOB on mono |
| Router `set()` assertion bug | audiorouter.cpp:344, midirouter.cpp:142 | Copy-paste: `numDest < 4` not `dst < numDest` |
| MediaPlayer missing `setSource(nullptr)` | mediaplayer.cpp:229 | Use-after-free |
| EQFilter dangling lambda | eqfilter.hpp:311 | `this` capture invalid after move |
| WetDry `DBG()` on audio thread | wetdry.hpp:98 | String alloc in debug |

---

## Fix Roadmap

### Phase 0: Stop the Bleeding (1-2 days)
One-line or few-line fixes for active crashers:

1. `connectChannels` `&&` → `||`
2. Guard `lastGraph >= 0` before `getUnchecked`
3. Guard `PortBuffer::reset()` with type check
4. Fix `portbuffer.cpp:142` `ev->type` → `ev->bodyType`
5. All `sibling<GuiService>()->` → guarded pattern
6. `deviceIsAvailable()` fall-through → `return false`
7. `jmin(2, output.getNumChannels())` in AudioMixer RMS
8. Guard `CombFilter`/`AllPassFilter` modulo with `bufferSize > 0`
9. `changeResetter` null check in `SessionService::deactivate`

### Phase 1: Real-time Safety (1 week)
Remove all locks and allocations from audio thread:

1. ScriptNode: lock-free pointer swap + async logger
2. `GraphNode::render()`: `setSize(..., true)` + pre-allocate
3. AudioRouter/AudioMixer: pre-allocate `tempAudio`/`tempBuffer`
4. `ProcessBufferOp`: atomic reads instead of property lock
5. `SandboxedProcessorNode`: pre-allocate `midiTemp`
6. Disable Lua GC on audio thread

### Phase 2: Sandbox IPC Redesign (2 weeks)
The entire sandbox system needs a coordinated rewrite:

1. Named cross-process semaphores (Mach ports / POSIX named sems)
2. `std::atomic_ref` or C11 atomics in shared memory
3. Single-side placement-new (host only)
4. Ordered shutdown: signal → wait for worker close → unmap
5. `waitForResponse` unblocked on connection loss
6. `attemptRestart` waits for plugin load before sending state

### Phase 3: Lua Security Hardening (1 week)
Close the open sandbox:

1. Strip `package.cpath`, `package.path`, `load()`, `loadfile`
2. Restrict `Node:writeFile` to safe directories
3. Create read-only Context facade for Lua
4. Add bounds checking to AudioBuffer/MidiBuffer bindings
5. Re-enable `DSPScript::validate`
6. Add `lua_sethook` instruction count limit

### Phase 4: Services Stabilization (1 week)
1. Fix stale `GuiService::sessionRef` cache
2. Replace `changeBusesLayout` spin loops with timeout
3. Guard all session pointer access
4. Fix index mismatch in `removeGraph`
5. Handle `saveIfNeededAndUserAgrees` return value

---

## Test Recommendations

Current test coverage: **Unit tests only (33/33 pass), no integration/stress tests.**

Required:
- [ ] Real-time safety test: verify no allocations in `render()` path (use `malloc` override)
- [ ] Lifecycle stress test: rapid session load/unload/switch
- [ ] Plugin load/unload stress test: add/remove nodes during playback
- [ ] Sandbox IPC test: verify cross-process audio exchange
- [ ] Lua security test: attempt `os.execute`, `io.open`, `require`, `load` from scripts
- [ ] Thread sanitizer build: `-fsanitize=thread` across full test suite
- [ ] Address sanitizer build: `-fsanitize=address` for buffer overflows

---

*Report generated by 6 specialized forensic agents running in parallel.*
*Total analysis time: ~7 minutes across 424 files / 90K lines.*
