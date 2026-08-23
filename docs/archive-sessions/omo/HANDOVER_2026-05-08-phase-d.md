# HANDOFF CONTEXT — Phase D mid-flight, 2026-05-08

**For the next session.** Phase D Sandbox IPC Redesign — 4 of 9 sub-tasks landed cleanly. Both architectural keystones are green. Remaining work is incremental hardening + one stubborn JUCE friction point (D-8).

**Predecessors:**
- [`.sisyphus/HANDOVER_2026-05-08.md`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/HANDOVER_2026-05-08.md) — prior session record
- [`.sisyphus/plans/master-fix-plan.md`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/plans/master-fix-plan.md) — v3 plan (still authoritative for scope)
- [`.sisyphus/plans/phase-d-architect-memo.md`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/plans/phase-d-architect-memo.md) — architect's design memo (gitignored, on disk; READ §1, §2, §3 for D-8/D-4/D-5/D-6/D-9 specs)

---

## 1 · Repo state at handoff

| Field | Value |
|---|---|
| Branch | `local-enhancements` |
| HEAD | `b51d3b6c fix(sandbox): D-2 cross-process named POSIX semaphores (sem_open Option A)` |
| Commits this session | **4** (since `0e67448b`) |
| Remote | `origin/local-enhancements` is **3 commits behind** (need to push before handover-merge) |
| Upstream | `kushview/element` untouched |
| ctest | **67/67** filtered (`-E "DeviceServiceController|SessionServiceFileOps"`) |
| AudioThreadAllocationTest | **0 audio-thread allocations** preserved across all 4 commits (Phase C invariant) |
| vitest | 46/46 (untouched this session) |
| tsc | clean (untouched) |
| Webview | 213.26 kB main / 53.93 kB gzip (untouched) |
| Working tree | clean except documented untracked files (same set as 2026-05-08 handover) |

---

## 2 · The 4 commits landed (chronological)

### `55ab2a5d` — D-3: single-side placement-new + magic sentinel

**Bug**: Both host and worker called `SharedAudioBuffer::setupPointers()` which placement-new'd the same `Header`. Whichever ran second zeroed every atomic the first had touched.

**Fix**: Split into `setupPointersAsOwner` (host, placement-new + writes `kMagic = 0x454C5342u` last with `__ATOMIC_RELEASE`) and `setupPointersAsAttacher` (worker, no placement-new, spins up to 100 ms on magic with `__ATOMIC_ACQUIRE`). New `magic` field as first member of Header. New tests `WorkerAttachDoesNotClobberHostInit` + `AttacherTimesOutOnUninitialisedMemory`.

**Surprise**: Used `__atomic_*` builtins because `std::atomic_ref` is **absent on Apple Clang 16 / libc++** (`__cpp_lib_atomic_ref` undefined). This discovery propagated to D-1's design.

### `19af9bfa` — TestMain worker-mode dispatch (D-8 infra subset)

**Why**: D-1's planned `CrossProcessAtomicRefDataIntegrity` test needs the test binary to dispatch into `SandboxWorker::initialise` when re-execed with `EL_PLUGIN_HOST_PROCESS_ID` ("pshelbg") in argv[1]. Switched from Boost.Test auto-main to custom main with `BOOST_TEST_NO_MAIN`.

### `e375454d` — D-1: `__atomic_*` refactor

**Replaced** 11 cross-process atomic types in `Header` (10 × `std::atomic<uint32_t>` + 1 × `std::atomic<BufferState>`) with plain `uint32_t` accessed via `__atomic_*` builtins. `BufferState` enum stored as raw `uint32_t state` with typed accessor helpers `loadBufferState`/`storeBufferState`.

**Added 14 layout/lock-free static_asserts**: `__atomic_always_lock_free`, `is_trivially_copyable_v<Header>`, `sizeof(Header) == 56`, `offsetof` for every field.

**Added** `SandboxAtomicRefDataIntegrityTest`: parent writes `0xDEADBEEF` via `__atomic_store_n`, child re-execs as worker, attaches, reads, echoes back into `workerSequence`. Parent asserts. Proves cross-process atomic visibility on `MAP_SHARED` without semaphore signalling. ctest 65→66.

### `b51d3b6c` — D-2: cross-process named POSIX semaphores

**Bug**: `SandboxSemaphore` used Mach `task_self()`, POSIX `sem_init(pshared=0)`, anonymous Win32 events — all process-local, none signalled across `fork()`.

**Fix**: Replaced with named POSIX `sem_open` (Option A from architect memo §2.4). New `Mode { Owner, Attacher }` API. Naming `/els_<pid>_<counter>_<suffix>` (≤21 chars, under macOS 31-char limit). `SandboxSemaphore::generateName(suffix)` static factory.

**macOS quirk**: `sem_timedwait` does NOT exist for named semaphores on macOS. Falls back to `sem_trywait` + `usleep(50)` poll loop until deadline. Fine because audio thread already burns ~390 µs in `_mm_pause` spin phase.

**`PreparePayload`** extended to carry `trigSemNameLength` + `doneSemNameLength` + trailing UTF-8 names. `parsePrepareMessage` has 4-arg overload + 2-arg backward-compat overload.

**Added** `SandboxSemaphoreCrossProcessTest`: parent posts trig, child wakes from sem_wait, posts done back, exits 0. ctest 66→67.

---

## 3 · D-7 is already done

Plan claimed D-7 needed work because `sandboxedprocessor.hpp:314,333` was supposed to use audio-buffer side-channel for parameters. **The plan was based on outdated code state.** The actual chain is:

1. UI/automation calls `SandboxParameter::setValue(newValue)` → [`sandboxparameter.hpp:49-54`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/src/engine/sandboxparameter.hpp#L49-L54)
2. Calls `sandboxHost.setParameter(index, clamped)`
3. Sends `SandboxMessageType::SetParameter` via control pipe — [`sandboxhost.hpp:528`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/src/engine/sandboxhost.hpp#L528)
4. Worker dispatches to `handleSetParameter` — [`sandboxworker.hpp:277-278`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/src/engine/sandboxworker.hpp#L277-L278)
5. Calls `params[index]->setValue(value)` on the plugin — [`sandboxworker.hpp:695`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/src/engine/sandboxworker.hpp#L695)

`SandboxMessageType::SetParameter` enum value exists at sandboxipc.hpp:49. `ParameterChangePayload` struct at lines 122-126. **NO audio-buffer side-channel exists anywhere.** Existing `SandboxParameterRoundTripTest` (Test #40) verifies serialization in-process. **D-7 = no commit needed.** Document this discovery in any D-8 commit body.

---

## 4 · D-8 blocker analysis (BLOCKED)

I attempted D-8 in this session and reverted. The friction stack:

### 4.1 JUCE 8 `AudioPluginInstance` blocks `addParameter`

```cpp
// In juce_AudioPluginInstance.h:
private:
    using AudioProcessor::addParameter;
```

Subclasses cannot call `addParameter` (privatised inheritance). The intended way to expose parameters on `AudioPluginInstance` is through the `HostedParameter` mechanism (~50 LOC of additional scaffolding per parameter).

### 4.2 Worker stderr is silenced

`juce::ChildProcessCoordinator::launchWorkerProcess` on macOS uses `posix_spawn` with stdio redirected to `/dev/null` (or similar). Adding `std::cerr << ...` in worker code produces no visible output during ctest. Diagnostic-visibility requires either:
- File-based logging (worker writes to `/tmp/sandbox-worker-debug.log`)
- Reading JUCE's `juce_ChildProcessCoordinator.cpp` to find any built-in stderr inheritance flag

### 4.3 `AudioPluginFormatManager` returned "No compatible plug-in format"

Even after registering `TestEchoPluginFormat` unconditionally in `initializeWorker()` (bypassing the env-var gate), the format manager returned the standard "No compatible plug-in format exists for this plug-in" error when the host called `loadPlugin(desc)` with `desc.pluginFormatName = "Test"` and `desc.name = "ElementTestEcho"`. My format's `getName()` returns `"Test"`. Should have matched. Did not.

**Possible causes** (untested):
- Format-name comparison is case-sensitive AND something is changing case
- `juce::AudioPluginFormatManager::createPluginInstance` (sync overload) requires `format->fileMightContainThisPluginType()` to return true (mine returns false — virtual plugin, no file)
- `juce::PluginDescription`'s XML round-trip (host serialize → worker deserialize via `loadFromXml`) drops or mangles `pluginFormatName`
- Format Manager iterates only formats whose `requiresUnblockedMessageThreadDuringCreation` is consistent with sync-creation context

### 4.4 D-8 implementation plan for next session

1. **First**: instrument worker with file-based logging (write to `/tmp/element-sandbox-worker-<pid>.log`) so we can see what the worker actually does. Override `juce::Logger` early in `main()` for worker-mode dispatch.
2. **Then**: check JUCE 8 `AudioPluginFormatManager::createPluginInstance` source (`build-merged/_deps/juce-src/modules/juce_audio_processors_headless/format/juce_AudioPluginFormatManager.cpp`) to see exactly how format dispatch works.
3. **Then**: simplify `TestEchoPluginInstance` to bypass `addParameter` entirely (use `getNumParameters() = 0`, no params). Test only proves cross-process plugin LOAD + processBlock cycle. Parameter forwarding (D-7) retains its in-process serialisation coverage. Add a TODO for full HostedParameter integration as a follow-up.
4. **Then**: re-enable `TestEchoPluginFormat` registration unconditionally in `initializeWorker()` (per architect — env-var gate is unreliable through `posix_spawn`).
5. **Then**: write a minimal `SandboxRealProcessTest` that:
   - `setenv("ELEMENT_SANDBOX_TEST_MODE", "1", 1);` (or just rely on always-registered)
   - Constructs `PluginManager pm; SandboxHost host(pm);`
   - `host.launch();` then waits for connection
   - `host.loadPlugin(desc)` with the test plugin description
   - Spins JUCE message manager via `runDispatchLoopUntil(10)` until `sandboxPluginLoaded` listener fires (5 s timeout)
   - `host.prepareToPlay(48000, 256, 0, 2);`
   - `host.processBlock(buf, midi);` 5 cycles
   - Asserts `buf.getSample(0, 0) == kTestEchoConstant` (0.5 — the hardcoded DC value)

Reverted artefacts to study/reuse:
- `src/engine/test_echo_plugin.hpp` (~140 LOC) — `TestEchoPluginInstance` + `TestEchoPluginFormat`
- `test/engine/SandboxRealProcessTest.cpp` (~140 LOC) — test scaffolding
- `test/CMakeLists.txt` lines 73-74 (entry + RUN_SERIAL TIMEOUT 30)

The reverted code is in `git stash` is NOT preserved (I used `git checkout` + `rm`, not `git stash`). It can be reconstructed from this handover or by reading the cancelled background task `bg_254601d9` session log if accessible.

---

## 5 · Remaining tasks (D-4, D-5, D-6, D-9)

All architect-spec'd; no design ambiguity. Estimated combined effort: ~600-800 LOC across 5-6 commits.

### D-4 — Ordered shutdown (~150 LOC)

**Spec** ([master-fix-plan.md:317-326](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/plans/master-fix-plan.md#L317-L326)): Host sends `Shutdown` message → waits up to 2s for worker ack → kills worker if no ack → unmaps shared memory. Use `waitpid(WNOHANG)` polling or kqueue `EVFILT_PROC`.

**Acceptance**: 1000-cycle restart stress under `LSAN_OPTIONS=detect_leaks=1` reports zero SIGBUS, zero use-after-free.

**Files**: `src/engine/sandboxhost.hpp` (shutdown(), launch() retry path), new test `test/engine/SandboxShutdownTest.cpp`.

### D-5 — `waitForResponse` timeout (~100 LOC)

**Spec** ([master-fix-plan.md:328-336](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/plans/master-fix-plan.md#L328-L336)): All `waitForResponse` calls take a timeout (default 250 ms). On worker disconnect, return `nullopt` instead of blocking host UI forever.

**Acceptance**: `kill -9 <worker-pid>` while host is mid-`waitForResponse` → host returns within 250 ms with `nullopt`, logs disconnect, attempts restart.

**Files**: `src/engine/sandboxhost.hpp` (`waitForResponse` impl + signature change), all callers, new test.

### D-6 — `attemptRestart` blocks on PluginReady ack (~150 LOC)

**Spec** ([master-fix-plan.md:338-346](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/plans/master-fix-plan.md#L338-L346)): After restart, host sends `LoadPlugin` → blocks on `PluginReady` ack → THEN sends `SetState`. New control-pipe message type `PluginReady` (add to `SandboxMessageType` enum at sandboxipc.hpp:40).

**Acceptance**: Restart → load AUSampler → set 5 params → first `processBlock` reflects all 5 params (no zero-state audio glitch).

### D-9 — `SandboxStressTest` (~200 LOC)

**Spec** ([master-fix-plan.md:374-384](file:///Volumes/Projects/Development_Projects/Github_Repos/element/.sisyphus/plans/master-fix-plan.md#L374-L384)): 1000 cycles of: load plugin → play 1s of audio → `kill -9 <worker-pid>` → host detects disconnect → host restarts worker → reloads plugin → re-applies param state → audio resumes within 1 s.

**Depends on**: D-4 (ordered shutdown survives kill -9), D-5 (waitForResponse timeout), D-6 (restart-then-state ordering), D-8 (TestEchoPluginFormat for the "load plugin" step). **D-9 is the LAST D-task.**

**Acceptance**: Zero host crashes across 1000 cycles. `leaks` tool reports zero leaked memory regions.

---

## 6 · Build / test / verification commands

```bash
# Full filtered ctest (must hold at 67 minimum)
ctest --test-dir build-merged -j8 -E "DeviceServiceController|SessionServiceFileOps" --output-on-failure

# Sandbox subset (8 tests after D-2)
ctest --test-dir build-merged -j8 -R "Sandbox|SharedAudio" --output-on-failure

# RT-safety invariant (must remain 0 allocs)
ctest --test-dir build-merged -j8 -R "AudioThreadAllocation" --output-on-failure

# Reconfigure + build (CMake GLOB picks up new .cpp via cmake -B)
cmake -B build-merged
cmake --build build-merged --target test_element -j8
cmake --build build-merged --target element_app -j8

# Webview (untouched but verify before final ship)
cd webview && npm run build && npx tsc -b --noEmit && npx vitest run
```

---

## 7 · Routing constraints (Glen 2026-05-08)

- **Claude-only across all Phase D dispatches.**
- `oh-my-claudecode:architect` (Opus, READ-ONLY) for design passes.
- `oh-my-claudecode:executor` (Sonnet) for impl — **but Sonnet OOM'd on D-1's prompt**, so for substantial tasks use Opus directly (parent-agent).
- **Banned**: `oracle` (GPT-based), `category="ultrabrain"`, `category="*"` (opaque models).

---

## 8 · Phase C-5 latent bug (architect §4.2)

[`src/nodes/sandboxedprocessor.hpp:264`](file:///Volumes/Projects/Development_Projects/Github_Repos/element/src/nodes/sandboxedprocessor.hpp#L264) has `juce::MidiBuffer midiTemp;` as a stack-local in `render()`. `juce::MidiBuffer::getWriteBuffer()` heap-allocates on first MIDI write. The current `AudioThreadAllocationTest` doesn't exercise a `SandboxedProcessorNode` so it doesn't catch this. **Architect flagged for awareness; out of scope for D-1 through D-9. Could be a follow-up commit either before or after Gate 1.5.**

---

## 9 · Architectural patterns established this session

### 9.1 `__atomic_*` builtins for cross-process atomics

- `__atomic_load_n(&x, __ATOMIC_ACQUIRE)` for cross-process reads
- `__atomic_store_n(&x, val, __ATOMIC_RELEASE)` for cross-process writes
- `__atomic_fetch_add/xor(&x, val, __ATOMIC_ACQ_REL)` for RMW
- `__atomic_always_lock_free(sizeof(T), 0)` for compile-time lock-free assertion
- All 4 ordering enums (`__ATOMIC_ACQUIRE`, `__ATOMIC_RELEASE`, `__ATOMIC_RELAXED`, `__ATOMIC_ACQ_REL`) are GCC/Clang built-ins; semantics match `std::memory_order_*` exactly

### 9.2 Cross-process IPC primitives — Owner/Attacher idiom

- Host (Owner) creates resource with kernel-namespace name + `O_CREAT|O_EXCL`
- Worker (Attacher) opens same name, no creation flags
- Host destructor unlinks filesystem entry; kernel object lives until last FD closes (refcount semantics give us anonymous-via-name pattern)
- macOS quirk: `sem_timedwait` missing for named semaphores → poll-loop fallback

### 9.3 Single-side init with magic sentinel

- Host placement-news, writes `kMagic` LAST with release ordering
- Worker spins on magic with acquire ordering, bounded timeout
- Without the magic, worker can detect uninitialised shared memory and bail out

### 9.4 TestMain custom-main dispatch

- `BOOST_TEST_NO_MAIN` + `BOOST_TEST_ALTERNATIVE_INIT_API` macros
- Custom `main()` checks argv[1] for sandbox-worker tag → dispatches to `SandboxWorker::initialise` → runs JUCE message loop
- Else delegates to `boost::unit_test::unit_test_main`
- Same TestMain.cpp can have MULTIPLE dispatch tags (`--d1-readback-test`, `--d2-sem-test`, future `--d8-test-mode`)

---

## 10 · Recommended next-session opening

1. Push 4 commits to `origin/local-enhancements` (`git push origin local-enhancements`).
2. Read this handover doc in full + architect memo `.sisyphus/plans/phase-d-architect-memo.md` §3.2-§3.5 (D-8) and §4 (cross-cutting invariants).
3. Verify HEAD baseline still green: ctest 67/67, AudioThreadAllocationTest 0 allocs.
4. Decide D-8 strategy: file-based worker logging first, then JUCE source dive, then re-attempt — OR — defer D-8 and implement D-4/D-5/D-6 first.
5. **Architect memo amendment** — append a "2026-05-08 D-8 attempt findings" section documenting the JUCE plugin format friction so future sessions don't re-discover.

The boulder doesn't stop. Phase D's catastrophic root causes are CLOSED. The remaining work is incremental.
