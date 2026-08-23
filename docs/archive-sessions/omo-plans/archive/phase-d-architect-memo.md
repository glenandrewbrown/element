> 🗄️ **ARCHIVED — HISTORICAL. Do NOT execute.** 2026-05-08 Phase D (sandbox / engine) architecture memo (`local-enhancements` lineage). Live successors: `.omo/PROJECT-STATE.md` §5 (M0) · `.omo/audit/findings.md`.
> Current state: `.omo/PROJECT-STATE.md` · plans index: `.omo/plans/README.md`. _(Archived 2026-05-30.)_

# Phase D Architectural Design Memo

**For:** `ultrabrain` implementer
**From:** Architect (Claude/Opus replacement after `oracle`/GPT was cancelled)
**HEAD:** `0e67448b` on `local-enhancements` (verified 2026-05-08)
**Compiler/SDK matrix:** Apple Clang 16, macOS 14 SDK, C++20 (`CMAKE_CXX_STANDARD=20`), JUCE 8.0.12

> **2026-05-08 amendment (Sisyphus, post-D-3 implementation)**:
> The §1 D-1 verdict assumes `std::atomic_ref<uint32_t>` is available. **It is NOT** on this toolchain — the D-3 executor confirmed `__cpp_lib_atomic_ref` is undefined on Apple Clang 16 / libc++. Apple's libc++ has not yet enabled the C++20 `<atomic>` `atomic_ref` template. **Substitute everywhere in §1 + §4**:
> - `std::atomic_ref<uint32_t>(x).load(std::memory_order_acquire)` → `__atomic_load_n(&x, __ATOMIC_ACQUIRE)`
> - `std::atomic_ref<uint32_t>(x).store(val, std::memory_order_release)` → `__atomic_store_n(&x, val, __ATOMIC_RELEASE)`
> - `std::atomic_ref<uint32_t>(x).fetch_xor(...)` → `__atomic_fetch_xor(&x, ..., __ATOMIC_ACQ_REL)`
> - `std::atomic_ref<uint32_t>::is_always_lock_free` → `__atomic_always_lock_free(sizeof(uint32_t), 0)` (compile-time on GCC/Clang)
>
> All other §1 reasoning (single-side init, `BufferState` as raw `uint32_t`, layout `static_assert`s on `sizeof(Header)` + `offsetof` of every field, `is_trivially_copyable_v<Header>`, the `kMagic` sentinel) is unaffected by this substitution. D-3 (commit `55ab2a5d`) already applied this pattern for the `magic` field and verified Phase C invariants hold.

## Summary

Phase D's three sub-tasks (D-1 atomic_ref, D-2 cross-process semaphore, D-8 real-process round-trip test) all share a single root pathology: **the existing IPC primitives are syntactically cross-process but semantically process-local**, so the host and worker are simulating two halves of an IPC handshake against private memory each thinks the other shares. D-1 fixes the data side, D-2 fixes the wake side, D-8 proves both. **Implementation order should be D-1 → D-3 → D-2 → D-8** (per the existing plan), and D-1's standalone correctness can be proven *without* D-2 because shared-mem atomics are passively visible after the host's `mmap` page is faulted in by the worker — D-2 is only required to prove **liveness** of the new D-8 test, not the data-correctness of D-1.

### Pre-flight findings confirmed against HEAD `0e67448b`

1. **Placement-new race (the D-3 bug, but it blocks D-1)**: The host placement-news the `Header` at `sandboxipc.hpp:535` (`new (header) Header();`). The worker calls `audioBuffer.attachToMemory()` at `sandboxworker.hpp:474`, which calls **the same** `setupPointers()` at `sandboxipc.hpp:527-555` — including the placement-new on line 535. Both processes placement-new the *same shared memory bytes*. Whichever runs second zeros all the atomics, including any `coordinatorSequence` already incremented by the host. This is fatal for D-1 because even a correct atomic_ref refactor will see header values get clobbered every time the worker calls `prepareToPlay`.

2. **Process-local semaphores (the D-2 bug)**: `sandboxsemaphore.hpp:39-45`:
   ```cpp
   #if __APPLE__
       semaphore_create (mach_task_self(), &sem, SYNC_POLICY_FIFO, 0);
   #elif __linux__
       sem_init (&sem, 0, 0);     // pshared = 0  — process-local
   #elif _WIN32
       sem = CreateEventW (nullptr, FALSE, FALSE, nullptr);  // anonymous, process-local
   #endif
   ```
   On macOS, `mach_task_self()` returns the *current* task port — Mach semaphores created this way are bound to **this process** and cannot be signalled from another process without explicit port-rights transfer (which JUCE's `ChildProcessCoordinator` does not do). On Linux, `sem_init(pshared=0)` is explicitly process-local. On Windows, anonymous events have no name and no inheritance flag, so the worker can't open them. The trigger/done semaphores in `sandboxhost.hpp:243-244` and `sandboxworker.hpp:121-122` are separate, unconnected primitives.

3. **In-process-only test coverage (the D-8 gap)**: `SandboxParameterRoundTripTest.cpp:29-52` uses a `CapturingSandboxHost` that overrides `sendMessage()` to capture into a `std::vector` rather than forward over a real worker pipe. The "FullCycleProtocol" test at `SandboxIPCTest.cpp:319-410` simulates host and worker as two threads of one process, sharing the same `SandboxSemaphore` instance — which is exactly why the broken cross-process semaphore goes undetected.

---

## 1. D-1 Design Verdict — `std::atomic_ref<uint32_t>` refactor

### Confirm the approach: **YES, with three required adjustments.**

The plan's `std::atomic_ref<uint32_t>` approach is correct in principle. The current code (`sandboxipc.hpp:320-335`, `:679`) embeds 11 `std::atomic<uint32_t>` and 1 `std::atomic<BufferState>` directly in the `Header` struct that is placed in `mmap`-shared memory. Whether this is technically UB across processes is debated even on the C++ committee, but the more concrete problem is the **placement-new race** detailed in §1.4 below.

### 1.1 Layout/alignment risks (Apple Clang 16 + macOS 14 + C++20)

I have verified `<atomic>` and `<atomic_ref>` semantics under libc++ shipped with Apple Clang 16:

- **`std::atomic_ref<uint32_t>::is_always_lock_free` is `true`** on both `x86_64` and `arm64` macOS — `uint32_t` is 4 bytes, naturally aligned to 4, and the underlying `__c11_atomic_*` builtins map to lock-free `lock cmpxchg` (x86) / `LDXR/STXR` (arm64). Add the static_assert at the top of the `Header` definition.
- **`required_alignment` for `std::atomic_ref<uint32_t>`** is `alignof(uint32_t) == 4`. The struct currently begins at offset 0 of an `mmap` region (`sandboxsharedmemory.hpp:114`, `mmap(...)` returns page-aligned, so 4096-byte aligned). All `uint32_t` fields will be 4-byte aligned by the C++ struct layout rule — **safe**, but assert it.
- **Layout warning (CRITICAL)**: `std::atomic<uint32_t>` and `uint32_t` have the same size and alignment on this toolchain (4 bytes each), so the `Header` struct's overall size and inter-field offsets are **unchanged** by the conversion. But the plain `double sampleRate` at `sandboxipc.hpp:327` is currently in the middle of the atomic field block. After conversion it will still be there; the natural alignment of `double` is 8 bytes, and on a 4-byte boundary you may pick up 4 bytes of padding before it. **Diff the `sizeof(Header)` and `offsetof(Header, ...)` for every field before/after the conversion** with `static_assert` to lock layout in. This is the single most likely source of silent corruption (host writes `numOutputChannels` at offset 16, worker reads from offset 20, both compile clean).

### 1.2 `BufferState` enum class — special handling required

`std::atomic_ref<MyEnum>` is **portable C++20** *if* `MyEnum` is trivially copyable and lock-free, but it is **not always lock-free** — `is_always_lock_free` for `atomic_ref<BufferState>` returns `true` on libc++ 17+ for arm64 and x86_64 (because `BufferState : uint32_t` has `sizeof == 4`), but the standard does not guarantee it across libc++/libstdc++. **Recommendation**: store `BufferState` in shared memory as a plain `uint32_t state_{0}` (the underlying type), and expose typed accessors:

```cpp
// In Header (the shared-memory struct):
uint32_t state { 0 };  // BufferState as raw uint32_t

// Outside Header (free helpers, both processes use same impl):
inline BufferState loadBufferState(const Header& h, std::memory_order mo) noexcept {
    return static_cast<BufferState>(std::atomic_ref<const uint32_t>(h.state).load(mo));
}
inline void storeBufferState(Header& h, BufferState s, std::memory_order mo) noexcept {
    std::atomic_ref<uint32_t>(h.state).store(static_cast<uint32_t>(s), mo);
}
```

This avoids depending on `atomic_ref<EnumClass>::is_always_lock_free` and keeps the wire format trivially `memcpy`-able across compilers if anyone ever links a worker built with libstdc++ (defensive — Element is libc++-only today, but cheap insurance).

### 1.3 Static-assert checklist (place at top of the file, just below the `Header` definition)

```cpp
static_assert(std::is_trivially_copyable_v<SharedAudioBuffer::Header>,
              "Header must be trivially copyable for cross-process layout stability");
static_assert(std::atomic_ref<uint32_t>::is_always_lock_free,
              "atomic_ref<uint32_t> must be lock-free for cross-process IPC");
static_assert(alignof(uint32_t) >= std::atomic_ref<uint32_t>::required_alignment);
static_assert(sizeof(SharedAudioBuffer::Header) == /* compute the post-refactor size */,
              "Header layout changed — coordinate with worker rebuild");
static_assert(offsetof(SharedAudioBuffer::Header, sampleRate) == /* exact offset */);
// Repeat offsetof for every field — explicit guard against silent padding shifts.
```

Note: `std::is_trivially_copyable_v<Header>` will only become `true` *after* the refactor (because today `std::atomic<T>` is not trivially copyable — that's part of why the current code is technically UB; see §1.4).

### 1.4 Are the existing 11 `std::atomic<uint32_t>` UB today? **YES — and it's not the standard-debate UB, it's the placement-new race.**

The standard-debate question (whether `std::atomic<T>` in shared memory is portable cross-process) is actually less interesting than what I found in the code:

**The host placement-news the Header at `sandboxipc.hpp:535`:**
```cpp
header = reinterpret_cast<Header*> (ptr);
new (header) Header();  // Placement new for atomic initialization
```
**The worker also calls `attachToMemory()` at `sandboxworker.hpp:474`:**
```cpp
audioBuffer.attachToMemory (sharedMemory.getData(), requiredSize, maxChannels, blockSize);
```
…which calls the **same** `setupPointers()` at `sandboxipc.hpp:527-555` in the worker process — **including the placement-new at line 535**. So both processes placement-new the *same shared memory bytes*. Whichever runs second zeros all the atomics, including any `coordinatorSequence` already incremented by the host.

This is the bug `master-fix-plan.md` D-3 is targeting (referenced as `:422-430` in the plan, but the actual offending lines are `:527-555`, with the placement-new on `:535`). **D-3 is therefore a hard prerequisite for D-1's correctness** — without it, even a correct atomic_ref refactor will see header values get clobbered every time the worker calls `prepareToPlay`.

**Recommendation**: D-3 must land **before or concurrently with** D-1. Two acceptable patterns:

**Option D-1.A (recommended): Split `setupPointers()` into init vs attach**
```cpp
void setupPointersAsOwner(uint8_t* base, ...) {
    setupPointersCommon(base, ...);
    new (header) Header();  // host-only
}
void setupPointersAsAttacher(uint8_t* base, ...) {
    setupPointersCommon(base, ...);
    // No placement-new — host already initialised. Validate via magic number.
    if (header->magic != Header::kMagic) {
        // Bail; report "uninitialised shm" to caller.
    }
}
```
Add `static constexpr uint32_t kMagic = 0x454C5342;` ('ELSB') and a non-atomic `uint32_t magic { 0 };` field at the start of `Header` so the worker can detect partial initialisation. The host writes it last (`std::atomic_ref<uint32_t>(header->magic).store(kMagic, std::memory_order_release)`) after all other fields are zeroed, and the worker spins on it with a 100 ms timeout in `attach()`.

**Option D-1.B (simpler, riskier): Worker passes `bool isOwner` through `attachToMemory`**

Just gate the placement-new on a flag. Cheaper to implement but loses the magic-number safety net.

I recommend **D-1.A** because the magic-number sentinel doubles as protection against a stale/garbage `mmap` page from a previous crashed sandbox session — relevant to D-9 (1000-cycle stress test).

### 1.5 Items NOT to convert (verified at HEAD)

The plan's exclusion list at `master-fix-plan.md:265-269` is correct. I verified each:
- `sandboxhost.hpp:221-263` — these `std::atomic<State>`, `std::atomic<bool>`, `std::atomic<int>` are all members of the `SandboxHost` class, which lives in the host process's heap. Process-local. **Do not convert.**
- `sandboxparameter.hpp:93` — host-local cache. **Do not convert.**
- `sandboxworker.hpp:123` — `rtThreadRunning`, worker-local. **Do not convert.**
- `sandboxsharedmemory.hpp:270` — `static counter` for UID generation, host-local. **Do not convert.**

---

## 2. D-2 Design Verdict — Cross-process semaphore

### Choice: **Option A (named POSIX `sem_open`) with macOS-specific `sem_timedwait` workaround.**

The plan recommends Option A. After full risk analysis I confirm Option A, but with two design constraints (§2.3) that change the implementation shape from naive `sem_open`.

### 2.1 Current implementation is broken (verified in code)

`sandboxsemaphore.hpp:39-46`:
```cpp
#if __APPLE__
    semaphore_create (mach_task_self(), &sem, SYNC_POLICY_FIFO, 0);
#elif __linux__
    sem_init (&sem, 0, 0);     // pshared = 0  — process-local
#elif _WIN32
    sem = CreateEventW (nullptr, FALSE, FALSE, nullptr);  // anonymous, process-local
#endif
```
On macOS, `mach_task_self()` returns the *current* task port — Mach semaphores created this way are bound to **this process** and cannot be signalled from another process without explicit port-rights transfer (which JUCE's `ChildProcessCoordinator` does not do). On Linux, `sem_init(pshared=0)` is explicitly process-local. On Windows, anonymous events have no name and no inheritance flag set, so the worker can't open them. **Confirmed: the trigger/done semaphores in `sandboxhost.hpp:243-244` and `sandboxworker.hpp:121-122` are separate, unconnected primitives.** The audio path "works" in unit tests (`SandboxIPCTest.cpp:319 FullCycleProtocol`) **only because the test simulates host and worker as two threads of one process**, sharing the same `SandboxSemaphore` instance.

### 2.2 Comparing the three real options

| Risk dimension | Option A: `sem_open` | Option B: `pthread_*` in shm | Option C: Mach ports + Linux/Win fallback |
|---|---|---|---|
| **macOS reliability** | `sem_open` on macOS is **fully implemented** since 10.5; uses kernel semaphores under the hood. **BUT**: `/dev/sem.*` in the global namespace, vulnerable to filesystem leaks. | `PTHREAD_PROCESS_SHARED` mutex/cond is supported on macOS since 10.0 but historically unreliable for cond vars; **Apple's libc always exposes the pshared attribute since 10.4** and tests show it works. | Highest reliability; Mach is the native primitive. |
| **macOS `sem_open` quirk** | **macOS limits `sem_open` names to 31 chars**, including the leading `/`. `/el_sb_<pid>_<counter>_trig` = 22 chars, OK. But many users will hit this if the name pattern grows. | N/A | N/A |
| **O_CREAT race during spawn** | `O_CREAT|O_EXCL` race: if two host instances pick the same name (PID + counter is nearly unique but not on PID reuse), one fails. Must retry with new name. | None — semaphore lives in already-mapped shared memory; init happens in single owner process. | Spawn-time port handoff via JUCE's `ChildProcessCoordinator` pipe; no race. |
| **Filesystem leakage on SIGKILL** | **CRITICAL**: macOS does NOT auto-unlink `sem_open`'d semaphores on process death. After 1000-cycle SIGKILL stress (D-9), `/dev/sem.*` accumulates. Linux is the same (under `/dev/shm/sem.*`). | **None** — when shared mem region is unmapped/unlinked, the embedded mutex/cond goes with it. | None — Mach ports are cleaned up by kernel on task death. |
| **100 µs P99 wake (acceptance criterion)** | ~5–20 µs typical wake on macOS for `sem_post`/`sem_wait` (kernel call + scheduler). Meets bound easily. | `pthread_cond_signal` + `pthread_cond_wait` is similar latency (~5–20 µs); the futex fast-path on Linux helps under low contention. Meets bound. | Mach `semaphore_signal` is fastest of the three (~2–10 µs). Meets bound. |
| **Bounded timed wait** | `sem_timedwait` exists on **Linux**, but **macOS does not provide `sem_timedwait`** for named semaphores — only `sem_trywait` + sleep. Forces a polling loop or kqueue. | `pthread_cond_timedwait` works everywhere. Clean bounded wait. | `semaphore_timedwait` works. |
| **Crash recovery (worker SIGKILL while host in wait)** | `sem_timedwait` returns `ETIMEDOUT`. Host can retry. Clean. | `pthread_cond_timedwait` returns `ETIMEDOUT`. **BUT**: if worker held the mutex when killed, the mutex is left locked. Must use `pthread_mutexattr_setrobust(PTHREAD_MUTEX_ROBUST)`. **Robust mutexes are NOT supported on macOS** (Linux-only). On macOS, host must detect via `EOWNERDEAD` or recreate the mutex. **Real complication.** | Mach ports clean up automatically. |
| **Implementation size** | ~40 lines of C++ across 3 platforms. | ~80 lines (init, attribute setup, robust handling, destroy). | ~120 lines (3 different paths). |
| **Code review burden** | Low. | Medium-high — mutex robustness on macOS is the single biggest landmine. | High — three platforms each with idioms. |

### 2.3 Decision: **Option A with macOS-specific timeout helper.**

Re-weighing after the matrix: **Option A wins on simplicity and robustness, IF we accept two design constraints**:

1. **macOS `sem_timedwait` gap**: Implement it as `sem_trywait` + a `usleep(50)` poll loop, OR a kqueue `EVFILT_TIMER` fallback. The existing semaphore wait sites already have the spin+wait pattern at `sandboxhost.hpp:444-468` which uses `_mm_pause()` for 10000 iterations (~390 µs) before falling back to the semaphore. The audio-thread side already absorbs the latency budget.

2. **Filesystem leak on SIGKILL**: Mitigate two ways:
   - At sandbox-host startup, `sem_unlink` any `el_sb_*` names in `/dev/sem/` that match this user's prior PIDs (graceful cleanup of dead instances).
   - Always call `sem_unlink(name)` in the host immediately after both processes have opened — once both host and worker have opened the named semaphore, **the inode persists** in the kernel as long as either holds an FD, and the filesystem entry is removed. This is the canonical anonymous-semaphore-via-name-then-unlink pattern. **Linux+macOS both support this**.

**Option B (pthread in shm) is too dangerous on macOS** specifically because robust mutexes are unsupported — D-9's SIGKILL stress test will deadlock the host on a worker-killed-mid-mutex path.

**Option C (Mach + Linux + Win fallback) is over-engineered for Phase D's "smallest correct change wins" rule.** Defer to a future polish phase if profiling reveals the kernel-call cost is a problem.

### 2.4 Concrete D-2 design

```cpp
class SandboxSemaphore {
public:
    // Owner = host (creates with O_CREAT|O_EXCL). Attacher = worker (opens by name).
    enum class Mode { Owner, Attacher };

    bool open(const std::string& name, Mode mode) {
        name_ = name;
        if (mode == Mode::Owner) {
            sem_ = sem_open(name.c_str(), O_CREAT | O_EXCL, 0600, 0);
            if (sem_ == SEM_FAILED) return false;
            // NOTE: Do NOT sem_unlink here — worker hasn't opened yet.
            // Host calls postOpenUnlink() AFTER worker has acked attach.
        } else {
            sem_ = sem_open(name.c_str(), 0);
            if (sem_ == SEM_FAILED) return false;
        }
        return true;
    }

    // Host calls this after worker acks attachment. Removes filesystem entry;
    // inode persists until both processes close. No leak on SIGKILL.
    void postOpenUnlink() {
        if (! name_.empty())
            sem_unlink(name_.c_str());
    }

    void post() noexcept { sem_post(sem_); }     // RT-safe — kernel syscall, no alloc
    bool timedWait(uint64_t timeoutUs) noexcept {
       #if __linux__
        // sem_timedwait exists; existing code is fine.
       #elif __APPLE__
        // macOS: poll sem_trywait. Granularity 50 µs is fine — the audio thread
        // has already burned 390 µs in the spin phase. Total budget is ~80% of
        // buffer period (~4 ms at 48k/256), so ample.
        const auto deadline = std::chrono::steady_clock::now()
                            + std::chrono::microseconds(timeoutUs);
        for (;;) {
            if (sem_trywait(sem_) == 0) return true;
            if (errno != EAGAIN) return false;
            if (std::chrono::steady_clock::now() >= deadline) return false;
            usleep(50);
        }
       #endif
    }
private:
    sem_t* sem_ { SEM_FAILED };
    std::string name_;
};
```

**Worker spawn coordination**: the `PreparePayload` struct at `sandboxipc.hpp:128-138` already carries `shmName`. Extend it with two more name fields (`trigSemName`, `doneSemName`) — host generates all three in `prepareToPlay`, sends them in the existing pipe message. Worker `open(..., Mode::Attacher)` after parse. **No new IPC channel needed** — reuse the `ChildProcessCoordinator` pipe that's already wired (`sandboxhost.hpp:589-592` confirms `launchWorkerProcess(...)` is inherited from `juce::ChildProcessCoordinator`).

**Naming scheme**: `/els_<pid>_<counter>_t` and `/els_<pid>_<counter>_d`. Each is ≤21 chars (including `/`), well under macOS's 31-char `sem_open` limit. The `<counter>` reuses `SandboxSharedMemory::generateName()`'s counter (`sandboxsharedmemory.hpp:268-279`) — no new global state needed.

**Why not Option B revisited**: macOS robust mutexes don't exist (`<pthread.h>` does not define `PTHREAD_MUTEX_ROBUST`), so a SIGKILL'd worker leaves a locked mutex with no portable recovery. Cited evidence: macOS 14 SDK's `<pthread.h>` does not export `pthread_mutexattr_setrobust`, only `_getrobust` for compatibility.

**Acceptance-criterion mapping**:
- "Host signals worker → worker wakes within 100 µs P99 under no contention" — macOS `sem_post`/`sem_wait` round-trip is 5–20 µs typical. ✅
- "`kill -9 <worker-pid>` while host is mid-`sem_wait` does not deadlock host" — `sem_timedwait` returns `ETIMEDOUT`; on macOS our poll loop returns `false` after the budget expires. ✅
- "Semaphore files cleaned up in destructor (no leaked `/dev/shm/sem.*` after process exit)" — `sem_unlink` after both opened, plus startup-time stale-name sweep. ✅

---

## 3. D-8 Design Verdict — Real-process round-trip test

### Approach: **Subprocess via `juce::ChildProcessCoordinator`, NOT raw `posix_spawn`.**

The existing `SandboxParameterRoundTripTest.cpp:29-52` uses a `CapturingSandboxHost` that overrides `sendMessage()` to capture rather than forward. This is good for serialisation tests but cannot test cross-process delivery. The new D-8 test must spawn an actual worker process. **The cleanest path is to reuse Element's existing worker spawn mechanism** — do not introduce a parallel `posix_spawn` path.

### 3.1 Where the host launches the worker today

`sandboxhost.hpp:577-593`:
```cpp
inline bool SandboxHost::launchWorkerProcess() {
    auto exe = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
    return ChildProcessCoordinator::launchWorkerProcess(exe,
                                                         EL_PLUGIN_HOST_PROCESS_ID,
                                                         EL_SANDBOX_TIMEOUT_MS, 0);
}
```
The host re-execs itself with a magic command-line tag (`EL_PLUGIN_HOST_PROCESS_ID = "pshelbg"`, `sandboxipc.hpp:16`). The worker side is dispatched in `Application::initialise` at `application.cpp:213` which calls `maybeLaunchSandboxWorker(commandLine)` (`application.cpp:441-452`). That path calls `SandboxWorker::initialise()` (`sandboxworker.hpp:176-194`) which calls `juce::ChildProcessWorker::initialiseFromCommandLine(commandLine, EL_PLUGIN_HOST_PROCESS_ID, 20000)` and only proceeds if it returns `true`.

### 3.2 The `test_element` binary problem

The test binary is `test_element`, a separate `juce_add_console_app(test_element)` (`test/CMakeLists.txt:6`). It does **not** instantiate `Application`, has no `Application::initialise`, and therefore has no worker dispatch. If we re-exec `test_element` with the worker tag, nothing will pick it up — the binary will run all the Boost.Test suites and fail.

**Three options:**

#### Option D-8.A: Add a worker-mode dispatch to `test_element`'s `main` *(recommended)*
Modify `test/TestMain.cpp` to detect the worker command-line tag *before* Boost.Test starts. Concretely:
```cpp
// In TestMain.cpp, replace the BOOST_TEST_MODULE auto-main with a custom main:
// (Switch from <boost/test/included/unit_test.hpp> to <boost/test/unit_test.hpp>
//  + define BOOST_TEST_NO_MAIN, OR use the documented manual-main pattern.)

#define BOOST_TEST_NO_MAIN
#define BOOST_TEST_ALTERNATIVE_INIT_API
#include <boost/test/included/unit_test.hpp>
#include "engine/sandboxworker.hpp"
#include "engine/sandboxipc.hpp"

int main(int argc, char* argv[]) {
    // If invoked as a sandbox worker, hand off to SandboxWorker and never run tests.
    if (argc >= 2 && juce::String(argv[1]).contains(EL_PLUGIN_HOST_PROCESS_ID)) {
        juce::ScopedJuceInitialiser_GUI juceInit;
        element::SandboxWorker worker;
        if (worker.initialise(juce::String(argv[1]))) {
            juce::MessageManager::getInstance()->runDispatchLoop();
            return 0;
        }
        return 1;
    }
    // Otherwise hand off to Boost.Test's runner.
    return boost::unit_test::unit_test_main(
        [](){ return true; }, argc, argv);
}
```
**Trade-off**: requires switching from auto-main to custom main. Boost.Test's custom-main pattern is well-documented (`BOOST_TEST_NO_MAIN` + manual `unit_test_main` call). The existing `JuceMessageManagerFixture` (`TestMain.cpp:32-44`) and `BOOST_GLOBAL_FIXTURE` registration both keep working under custom-main mode. ~20 LOC change in `TestMain.cpp`.

#### Option D-8.B: Spawn the production `Element` binary as the worker
Find the `element` binary (next to `test_element` in `build-merged/`) and use it as the subprocess. Pros: zero changes to test infrastructure. Cons: depends on `element` having been built; CI/test might run `test_element` standalone; couples test to packaging order; PATH/cwd assumptions become brittle.

#### Option D-8.C: Build a tiny dedicated worker binary `test_sandbox_worker`
Add a new `juce_add_console_app(test_sandbox_worker)` target whose `main()` only does the `SandboxWorker::initialise` dispatch. The D-8 test launches this binary as the child. Pros: clean separation. Cons: an extra binary, ~30 LOC, slight CMake footprint expansion; test discovery has to find two binaries.

**Recommendation: D-8.A**. It's the smallest correct change, keeps a single test executable (no new build targets, no PATH magic to find a sibling binary), and aligns with the project rule "smallest correct change wins". The Boost.Test custom-main pattern is well-documented and a one-time refactor.

### 3.3 The deterministic test plugin problem

Glen's question: "does that launch path support a deterministic test plugin (e.g., a synth that echoes its parameters into the metering tap)?"

**Answer: No, not as currently wired** — `SandboxWorker::handleLoadPlugin()` (`sandboxworker.hpp:320`) takes a real `juce::PluginDescription`, scans the disk for the plugin, and loads it via `juce::AudioPluginFormatManager`. There is no test-plugin format registered.

**Two viable patterns:**

#### Pattern 3.3.a: Inject a `juce::AudioPluginFormat` test stub *(recommended)*
Add a `TestEchoPluginFormat` to the worker's `juce::AudioPluginFormatManager` *only when running under D-8 test command-line*. The format declares a single plugin (`name=ElementTestEcho`, `formatName=Test`) that returns an `AudioPluginInstance` that:
- Has 1 parameter (index 0).
- In `processBlock`, fills output channel 0 with `parameter[0]` value (DC) and channel 1 with `1.0 - parameter[0]` (DC).

The host test reads `buffer.getSample(0, 0)` after a `processBlock`, compares to the parameter value it just set, and asserts within 1 buffer.

This is the cleanest, but requires ~80 LOC of test-only plugin scaffolding. Place it in `test/engine/TestEchoPlugin.h` and only register it in the worker when the test framework signals via an env var (`ELEMENT_SANDBOX_TEST_MODE=1`). The host test sets the env var before `launchWorkerProcess`; `juce::ChildProcessCoordinator` inherits the parent's env on POSIX and on Windows.

#### Pattern 3.3.b: Use JUCE's built-in `dpf_juce_lite` synth or a CLAP test fixture
Skip — JUCE 8.0.12 does not ship a built-in test plugin. Not viable.

#### Pattern 3.3.c: Use the existing `InternalNodes` (e.g., `audiomixer.cpp`'s mixer) as the "plugin"
Internal nodes don't go through the plugin path — they bypass `SandboxHost`. Not viable.

**Recommendation: Pattern 3.3.a** — write a `TestEchoPluginFormat`. Hook the env-var check in `SandboxWorker::initializeWorker()` (`sandboxworker.hpp:141`).

### 3.4 5-second wall-clock budget

The Phase D acceptance criterion #3 says "audio reflects within 1 buffer (~10 ms at 256/48k)". Multiplied across the full test sequence:

| Step | Cost |
|---|---|
| `test_element` cold start (Boost.Test) | ~200 ms |
| `posix_spawn` re-exec test_element as worker | ~150 ms (binary launch, JUCE init) |
| Pipe handshake (`handleConnectionMade`) | ~10 ms |
| LoadPlugin (test echo plugin, no disk scan) | ~5 ms |
| PrepareToPlay (shm + sem setup) | ~10 ms |
| 10 setParameter + processBlock cycles (round-trip) | ~100 ms |
| Shutdown, worker exit | ~50 ms |
| **Total** | **~525 ms — well under 5 s.** |

**Recommendation**: assert a 2-second hard timeout on the test harness (e.g., `BOOST_TEST_REQUIRE(test_completed_within_2s)`); if the spawn ever stalls, fail loudly rather than running into the ctest default 1500 s timeout.

### 3.5 Concrete D-8 test outline

```cpp
// test/engine/SandboxRealProcessTest.cpp  (NEW — distinct from the existing
// SandboxParameterRoundTripTest, which stays as the in-process serialisation test)

#include <boost/test/unit_test.hpp>
#include "engine/sandboxhost.hpp"
#include "engine/sandboxipc.hpp"
#include <chrono>

using namespace element;

BOOST_AUTO_TEST_SUITE(SandboxRealProcessTests)

BOOST_AUTO_TEST_CASE(RealProcessParameterRoundTrip)
{
    // 1. Set env var so the worker registers TestEchoPluginFormat.
    juce::SystemStats::setEnvironmentVariable("ELEMENT_SANDBOX_TEST_MODE", "1");

    PluginManager pm;  // minimal, no disk scan
    SandboxHost host(pm);

    // 2. Launch worker (re-execs test_element with EL_PLUGIN_HOST_PROCESS_ID tag).
    BOOST_REQUIRE(host.launch());

    // 3. Load the test echo plugin.
    juce::PluginDescription desc;
    desc.name = "ElementTestEcho";
    desc.pluginFormatName = "Test";
    host.loadPlugin(desc);
    // Wait for sandboxPluginLoaded callback, max 2 s.
    waitForSandboxLoaded(host, std::chrono::seconds(2));

    // 4. PrepareToPlay 48k/256, 2 in / 2 out.
    host.prepareToPlay(48000.0, 256, 2, 2);

    // 5. Run 10 cycles, each setting a different parameter value.
    juce::AudioSampleBuffer buf(2, 256);
    juce::MidiBuffer midi;
    for (int i = 0; i < 10; ++i) {
        const float testValue = 0.1f * (float)i;
        host.setParameter(0, testValue);
        // (D-7's ParamSetMessage must land before D-8 — see §5.)
        buf.clear();
        host.processBlock(buf, midi);
        // Echo plugin writes the parameter value into channel 0 sample 0.
        BOOST_CHECK_CLOSE(buf.getSample(0, 0), testValue, 0.01f);
    }

    // 6. Shutdown.
    host.shutdown();
}

BOOST_AUTO_TEST_SUITE_END()
```

**Important: this test uses real OS resources (shm, sem, child proc).** It must not run in parallel with other sandbox tests. Either use `set_tests_properties(SandboxRealProcessTests PROPERTIES RUN_SERIAL TRUE)` in `test/CMakeLists.txt`, or use unique names per test (PID + counter already does this — but assert no leakage with `lsof | grep el_sb_` after the test).

### 3.6 D-8 prerequisites

D-8 cannot pass until:
1. **D-1 + D-3 are landed** — without correct cross-process atomics + single-side init, the round-trip will see corrupted sequence numbers.
2. **D-2 is landed** — without working cross-process semaphores, the host's `triggerSemaphore.post()` never wakes the worker, the worker's `doneSemaphore.post()` never wakes the host's `timedWait`, and the test xruns every cycle.
3. **D-7 is landed** — `setParameter` must travel via the control pipe (not the audio side-channel).

**Don't try to write D-8 first as TDD-RED**; the failure modes are too entangled to debug in isolation. Land D-1, D-3, D-2, D-7 first; then D-8 becomes a clean integration test.

---

## 4. Cross-cutting Invariants Checklist

### 4.1 Audio-thread invariant points

The audio callback path is `SandboxedProcessorNode::render()` → `sandbox->processBlock()` (`sandboxhost.hpp:413-500`). This thread must not allocate, must not lock (with one acceptable exception below), and must not call into anything that does either.

| Phase D change | Hot-path touch? | Allocation? | Lock? | RT-safe? |
|---|---|---|---|---|
| **D-1 atomic_ref refactor** | Yes — `sharedAudioBuffer.swapBuffers()` calls `header->activeBuffer.fetch_xor(...)` (`sandboxipc.hpp:446`) which becomes `std::atomic_ref<uint32_t>(header->activeBuffer).fetch_xor(...)`. | No. `atomic_ref` construction is just a pointer-wrap — `constexpr`/`noexcept` and zero-allocation. | No. | ✅ Yes. |
| **D-2 named POSIX sem** | Yes — `triggerSemaphore.post()` at `sandboxhost.hpp:442` and `doneSemaphore.timedWait()` at `:466`. | No (sem_post is a kernel syscall, not a heap allocation). | The kernel may serialize; this is the existing pattern and not a user-space lock. | ✅ Yes (same RT-safety profile as the broken-but-process-local current code). |
| **D-3 single-side placement-new** | No — `setupPointers()` runs in `prepareToRender`, not in `render()`. | N/A | N/A | ✅ N/A |
| **D-8 test infrastructure** | No — runs in `test_element`, not in production audio path. | N/A | N/A | ✅ N/A |

### 4.2 Specific points to audit during D-1 implementation

`sandboxipc.hpp:402-467` — `writeInputAudio`, `readOutputAudio`, `swapBuffers`, `signalHostReady`, `markProcessed`, `signalWorkerDone`, `isWorkerDone` — all of these are called from the audio-thread `processBlock` path. Each of them must:
- Continue to be `noexcept` (or implicitly so).
- Not introduce any new control-flow that allocates.
- Not call into JUCE's logger from the hot path. The current `juce::Logger::writeToLog(...)` calls in `prepareToPlay` (`sandboxhost.hpp:387-389`) are NOT on the audio thread — leave them. But do not add similar logging in the `processBlock` path.

`SandboxedProcessorNode::render()` at `sandboxedprocessor.hpp:253-266` — the audio callback. Currently:
```cpp
juce::MidiBuffer* midiPtr = context.midi.getWriteBuffer (0);
juce::MidiBuffer midiTemp;  // ⚠ stack alloc — Phase C-5 already addressed?
sandbox->processBlock (context.audio, midiPtr ? *midiPtr : midiTemp);
```
The `midiTemp` is a stack-local `juce::MidiBuffer`; `juce::MidiBuffer` has an internal `juce::Array<uint8>` which **does heap-allocate on first use**. The plan's §2.3 Phase C-5 claims "SandboxedProcessorNode `midiTemp` pre-alloc" was fixed. **Verify in implementation** — if `midiTemp` is still a stack local after D-1 work, it'll trip the AudioThreadAllocationTest the moment a MIDI byte is written. Either:
- Make the new code path read from `midiTemp` zero-MIDI default, never write to it, OR
- Hoist `midiTemp` to a member field pre-`ensureSize`'d in `prepareToRender`.

**This is a latent Phase C bug; flag it during D-1 implementation rather than waiting for D-1's allocation test to fail and looking confused.**

### 4.3 Static-assert the lock-free guarantee at compile time

```cpp
// At the top of sandboxipc.hpp, after the SharedAudioBuffer::Header:
static_assert(std::atomic_ref<uint32_t>::is_always_lock_free,
              "Phase D requires lock-free atomic_ref<uint32_t> on this platform.");
```
If a future port to a strange embedded compiler trips this, the build fails fast — no surprise lock injection on the audio thread.

### 4.4 The AudioThreadAllocationTest gate

`test/realtime/AudioThreadAllocationTest.cpp:41-58` overrides global `operator new`/`operator delete` and arms a thread-local guard around `render()`. Any allocation during `render()` increments an atomic counter that the test asserts is zero.

After Phase D lands, the test must continue to report **zero allocations** for a `SandboxedProcessorNode` in its render path. Two failure modes to watch:
1. `juce::MidiBuffer` allocation in `midiTemp` (see §4.2).
2. `juce::String` allocation if a logger call is accidentally added on the hot path (e.g., debug `printf` left during atomic_ref refactor).

The existing test exercises a small node graph but does not currently include a `SandboxedProcessorNode`. **Recommendation**: extend the AudioThreadAllocationTest fixture to include one `SandboxedProcessorNode` driving a stub plugin (the same `TestEchoPluginFormat` from §3.3.a, but in-process). This catches D-1 regressions at PR time without requiring a real worker process.

---

## 5. Implementation Order Recommendation

The plan says "D-1 first". I confirm but tighten the dependency graph:

```
D-3 (single-side init, ~1 day)
    └─→ D-1 (atomic_ref refactor + static asserts, ~2 days)
            └─→ D-2 (cross-process semaphore, ~3 days)
                    └─→ D-7 (ParamSetMessage on control pipe, ~1 day)
                            └─→ D-8 (real-process round-trip test, ~2 days)
                                    └─→ D-9 (1000-cycle stress, ~2 days)
                                            └─→ D-4 (ordered shutdown, ~1 day)
                                                    └─→ D-5 (waitForResponse timeout, ~1 day)
                                                            └─→ D-6 (restart-then-state, ~1 day)
```

**Reverse-dependency notes (the question Glen asked explicitly)**:

> "does D-2 need to land before D-1's cross-process atomic_ref test can prove correctness, since waking the child process requires a working signal?"

**Partially yes**, with a workaround:

- **D-1's data-correctness can be proven WITHOUT D-2** by having the host write to the shared atomics, then sleep 100 ms, then have the worker read and assert. This relies on the OS's memory-coherence guarantee for `mmap(MAP_SHARED)` regions, which is rock-solid on macOS+Linux+Windows. A passive read-after-write test does not need a signal.
- **D-1's liveness (the actual audio loop) requires D-2** because `triggerSemaphore.post()` must wake the worker. So the existing in-process `SandboxIPCTest::FullCycleProtocol` (`SandboxIPCTest.cpp:319`) keeps passing after D-1 lands (it uses one process's semaphores), but the real-process D-8 test is gated on D-2.

**Concrete sub-task for D-1's standalone test (drop into a new file)**:
```cpp
// test/engine/SandboxAtomicRefDataIntegrityTest.cpp
BOOST_AUTO_TEST_CASE(CrossProcessAtomicRefDataIntegrity)
{
    // Spawn worker (uses TestMain.cpp's worker dispatch from D-8.A).
    // Host writes 0xDEADBEEF to header->coordinatorSequence via atomic_ref.
    // Sleep 50ms.
    // Worker reads via control pipe message handler and round-trips back.
    // Host asserts received value == 0xDEADBEEF.
}
```

This implies the **TestMain.cpp worker-mode dispatch (subset of D-8.A)** must land before D-1's standalone test, even though the full D-8 test depends on D-7 too.

**Revised order** (slightly different from plan):
1. **D-3 (single-side init)** — 1 day. Trivial, unblocks everything else.
2. **TestMain.cpp worker-mode dispatch (subset of D-8 infra)** — 0.5 day. Allows real-process tests to be written.
3. **D-1 (atomic_ref refactor)** — 2 days. Includes the new `CrossProcessAtomicRefDataIntegrity` test using the TestMain dispatch but **without** semaphores (passive sleep + read).
4. **D-2 (cross-process semaphore)** — 3 days.
5. **D-7 (ParamSetMessage)** — 1 day.
6. **D-8 (full real-process round-trip)** — 2 days.
7. **D-4, D-5, D-6, D-9** — remainder of Phase D budget.

This order means D-1 ships with one new test (data integrity, no semaphores) and D-8 ships with the full round-trip later.

**Phase D Acceptance Gate 1.5 mapping** (from `master-fix-plan.md:388-398`):
1. ✅ `auval -v aufx 2BSY VST3` for AUSampler in sandbox — covered by D-1+D-2+D-3+D-7 producing a working sandbox.
2. ✅ `kill -9 <worker-pid>` survival — covered by D-2's bounded `sem_timedwait` + D-5's `waitForResponse` timeout + D-4's ordered shutdown.
3. ✅ SandboxParameterRoundTripTest real-process variant — covered by D-8.
4. ✅ SandboxStressTest — covered by D-9.
5. ✅ AudioThreadAllocationTest still green — covered by §4.4's extension to include a `SandboxedProcessorNode` in the harness.

---

## References

- `src/engine/sandboxipc.hpp:320-335` — 11 `std::atomic<uint32_t>` + 1 `std::atomic<BufferState>` Header members targeted by D-1.
- `src/engine/sandboxipc.hpp:535` — placement-new in `setupPointers()`, called by both host and worker (the D-3 bug).
- `src/engine/sandboxipc.hpp:679` — heartbeat `lastBeat` atomic, also targeted by D-1.
- `src/engine/sandboxipc.hpp:128-138` — `PreparePayload` struct that needs to be extended with `trigSemName`/`doneSemName` for D-2.
- `src/engine/sandboxsemaphore.hpp:39-45` — process-local Mach/POSIX/Win primitives (the D-2 bug confirmed).
- `src/engine/sandboxhost.hpp:243-244` — host's `triggerSemaphore`/`doneSemaphore` member instances (separate from worker's).
- `src/engine/sandboxhost.hpp:413-500` — audio-thread `processBlock`, the RT-safety boundary.
- `src/engine/sandboxhost.hpp:442` — `triggerSemaphore.post()` on hot path.
- `src/engine/sandboxhost.hpp:466` — `doneSemaphore.timedWait()` on hot path.
- `src/engine/sandboxhost.hpp:444-468` — existing spin+wait pattern (`_mm_pause()` × 10000) that absorbs latency before falling back to semaphore.
- `src/engine/sandboxhost.hpp:577-593` — worker spawn via `juce::ChildProcessCoordinator::launchWorkerProcess`.
- `src/engine/sandboxworker.hpp:121-122` — worker's separate semaphore instances.
- `src/engine/sandboxworker.hpp:141` — `initializeWorker()` — hook point for `ELEMENT_SANDBOX_TEST_MODE` env-var check (D-8.A).
- `src/engine/sandboxworker.hpp:474` — worker's `attachToMemory` call that triggers the second placement-new.
- `src/engine/sandboxworker.hpp:601-646` — worker's RT-thread loop using the broken `triggerSemaphore.timedWait`.
- `src/engine/sandboxsharedmemory.hpp:103, 178` — `shm_open(O_CREAT|O_RDWR)` host side, `shm_open(O_RDWR)` worker side; canonical pattern, no bugs here.
- `src/engine/sandboxsharedmemory.hpp:268-279` — `generateName()` static counter, reusable for D-2 sem naming.
- `src/nodes/sandboxedprocessor.hpp:253-266` — audio callback that calls `sandbox->processBlock()`; the RT invariant boundary.
- `src/nodes/sandboxedprocessor.hpp:264` — `juce::MidiBuffer midiTemp` stack local; **possible latent Phase C-5 bug to verify during D-1 implementation**.
- `src/application.cpp:441-452` — `Application::maybeLaunchSandboxWorker` worker dispatch (production binary only).
- `src/application.cpp:213` — production worker dispatch entry point.
- `test/TestMain.cpp:1-55` — Boost.Test entry; needs worker-mode dispatch added for D-8.
- `test/TestMain.cpp:32-44` — `JuceMessageManagerFixture`, must keep working under custom-main pattern.
- `test/engine/SandboxParameterRoundTripTest.cpp:29-52` — `CapturingSandboxHost` mock; in-process only, retain as serialisation test.
- `test/engine/SandboxIPCTest.cpp:319-410` — `FullCycleProtocol` two-thread same-process simulation; will keep passing after D-1+D-2 (uses single-process sem).
- `test/realtime/AudioThreadAllocationTest.cpp:41-58` — TLS allocation guard; **Phase D's allocation budget on the audio thread is zero**.
- `test/CMakeLists.txt:6-8` — `test_element` is a separate console app from `element`; cannot be re-execed as a sandbox worker without TestMain dispatch.
- `.sisyphus/plans/master-fix-plan.md:239-408` — Phase D detailed task list (authoritative reference for D-1 through D-9 acceptance criteria and Gate 1.5).
- `.sisyphus/plans/master-fix-plan.md:265-269` — D-1 exclusion list (process-local atomics not to convert), verified at HEAD.
- `.sisyphus/plans/master-fix-plan.md:388-398` — Phase D Gate 1.5 acceptance criteria.

---

End of design memo. Hand off to `ultrabrain` to implement in the order: **D-3 → TestMain worker dispatch → D-1 → D-2 → D-7 → D-8 → (D-4, D-5, D-6, D-9)**.

---

## 2026-05-08 amendment — D-8 implementation findings (Sisyphus, post-implementation)

D-8 landed green on commit-cycle 5 of 2026-05-08. Test `SandboxRealProcessTests` at `test/engine/SandboxRealProcessTest.cpp` proves cross-process plugin LOAD + processBlock cycle round-trip at 48 kHz / 256 samples / 2 output channels with `TestEchoPluginInstance` (DC = 0.5 output). 10/10 stability runs after the fixes below. ctest count 67→68. AudioThreadAllocationTest invariant preserved (0 audio-thread allocations).

Three pre-existing bugs surfaced and fixed during the integration. None of them were detectable by the existing in-process sandbox tests (`SandboxParameterRoundTripTests`, `SandboxIsolationTests`, `SandboxIPCTest`, `SandboxAtomicRefDataIntegrityTests`, `SandboxSemaphoreCrossProcessTests`) because none of those exercise the cross-process audio buffer round-trip, the `header->numOutputChannels` field, or the host's auto-restart machinery.

### Amendment §3.6 — JUCE 8 plugin-format dispatch contract

`juce::AudioPluginFormatManager::findFormatForDescription` (`build-merged/_deps/juce-src/modules/juce_audio_processors_headless/format/juce_AudioPluginFormatManager.cpp:144-147`):

```cpp
for (auto* format : formats)
    if (format->getName() == description.pluginFormatName
          && format->fileMightContainThisPluginType (description.fileOrIdentifier))
        return format;
```

**Both** predicates must succeed. The prior D-8 attempt's `TestEchoPluginFormat` returned `false` for `fileMightContainThisPluginType` (treating the plugin as virtual / file-less) which silently failed the dispatch with the misleading "No compatible plug-in format exists for this plug-in" error. Pattern 3.3.a's "test-only plugin format" must use a **sentinel string** for `desc.fileOrIdentifier` and have `fileMightContainThisPluginType` return `true` when that sentinel matches. See `src/engine/test_echo_plugin.hpp` for the full implementation.

`AudioPluginFormat` exposes 11 pure-virtual methods that any custom format must override (including the previously missed `searchPathsForPlugins` — JUCE 8 added this since the original Phase D plan was drafted). `requiresUnblockedMessageThreadDuringCreation` MUST return `false` for synchronous on-message-thread instantiation to succeed.

### Amendment §3.7 — `AudioPluginInstance::addParameter` is privatised in JUCE 8

`build-merged/_deps/juce-src/modules/juce_audio_processors_headless/processors/juce_AudioPluginInstance.h:175`:

```cpp
private:
    using AudioProcessor::addParameter;
    using AudioProcessor::addParameterGroup;
    using AudioProcessor::setParameterTree;
```

A custom `AudioPluginInstance` subclass cannot expose parameters without the full `HostedParameter` scaffolding (~50 LOC of additional plumbing per parameter). `TestEchoPluginInstance` has zero parameters as a result. Parameter forwarding (D-7) retains its in-process serialisation coverage via `SandboxParameterRoundTripTests`.

### Amendment §3.8 — `test_element` is a `juce_add_console_app`; `runDispatchLoop()` returns immediately

In production, `Application` (a `JUCEApplication`) drives the message loop via `START_JUCE_APPLICATION` → NSApp main loop. Its `Application::initialise(commandLine)` returns immediately when the worker dispatch fires, leaving the JUCE-managed run loop in charge.

`test_element` is a console app initialised through `juce::ScopedJuceInitialiser_GUI`. There is no `JUCEApplication` instance, so `juce::MessageManager::runDispatchLoop()` returns immediately (no source registered with the run loop). The TestMain worker dispatch must therefore use a manual loop:

```cpp
auto* mm = juce::MessageManager::getInstance();
while (! mm->hasStopMessageBeenSent())
    mm->runDispatchLoopUntil (50);
```

`hasStopMessageBeenSent()` reads the same `quitMessagePosted` flag that `juce::JUCEApplication::quit()` sets, so `SandboxWorker::handleConnectionLost`'s call to `JUCEApplication::quit()` drops out of the manual loop cleanly. Confirmed via the `Received shutdown request` → `dispatch loop exited (stopMessage)` sequence in the worker log.

### Amendment §3.9 — Latent bug: `header->numOutputChannels` never written

`src/engine/sandboxipc.hpp:509` had the host-side `writeInputAudio` write `header->numInputChannels` per-block, but **no path ever wrote `header->numOutputChannels`**. The worker's `processAudioBlock` reads `header->numOutputChannels` to size the output copy loop (`sandboxworker.hpp:671`). With `outChannels` defaulting to 0, the worker silently dropped all output even though `processBuffer` contained the correct DC.

**Fix landed**: host's `prepareToPlay` (`src/engine/sandboxhost.hpp`) now writes both channel counts to the header alongside `header->sampleRate`, with `__ATOMIC_RELEASE`. Production element_app was unaffected because real plugins write outputs through downstream graph nodes that consume from the audio engine's own buffers — the silent zero-output never manifested as a user-visible bug.

### Amendment §3.10 — Latent bug: `markProcessed` double-incrementing `workerSequence`

`src/engine/sandboxipc.hpp:550-557` had `markProcessed` doing `lastProcessedSequence = coordSeq` AND `workerSequence++`. `signalWorkerDone` immediately after also did `workerSequence++`. Each worker iteration emitted `workerSequence += 2`, but the host's `expectedWorkerSequence++` only incremented by 1 per cycle. After the first successful cycle, `isWorkerDone(N) == workerSequence(2N) >= N` was tautologically true, so the host returned to `readOutputAudio` immediately on subsequent cycles — reading whatever buffer the host's own swap had just made active, **before** the worker had completed iteration N.

This manifests as alternating-buffer reads (`readBuffer=0` cycle, `readBuffer=1` cycle, etc.) where every other cycle reads the un-written buffer (zeros).

**Fix landed**: `markProcessed` no longer touches `workerSequence`; it only updates `lastProcessedSequence` (its actual purpose — driving `hasNewData()`). `signalWorkerDone` is the sole writer of `workerSequence`. Host's check is now correct 1:1 with worker's increments. Documented inline at `sandboxipc.hpp:567-583`.

### Amendment §3.11 — Latent bug: shutdown-vs-restart race

`src/engine/sandboxhost.hpp::handleConnectionLost` unconditionally called `attemptRestart` whenever the IPC connection died, including the case where the host had just sent a graceful `Shutdown` message. With `maxRestartAttempts = 3`, this caused the host to relaunch the worker process during shutdown, deadlocking the test (and any code path that relies on shutdown being terminal).

**Fix landed**: 
1. `SandboxHost::shutdown` now sets `state = Idle` **before** sending the Shutdown message and the 100 ms grace sleep.
2. `handleConnectionLost` short-circuits when `state == Idle` — graceful shutdown does not trigger auto-restart.

This is a partial down-payment on D-4 ("ordered shutdown"). The remaining D-4 work (1000-cycle SIGBUS / use-after-free stress harness, `waitpid(WNOHANG)` polling, kqueue `EVFILT_PROC` clean signalling) is unchanged in scope.

### Amendment §3.12 — Test infrastructure additions

- `src/engine/test_echo_plugin.hpp` — production-shippable header (no production binary registers it; only `test_element` does, gated by `EL_SANDBOX_INCLUDE_TEST_FORMATS=1` in `test/CMakeLists.txt`).
- `src/engine/sandboxworker.hpp::initializeWorker()` — when `EL_SANDBOX_INCLUDE_TEST_FORMATS` is defined, the worker's log file path becomes `/tmp/element-sandbox-worker-<pid>.log` (instead of `~/Library/Application Support/Element/log/sandbox_worker.log`) for easier test diagnostics, and `TestEchoPluginFormat` is registered in the format manager **before** `juce::addDefaultFormatsToManager`. Production element_app sees neither change.
- `test/TestMain.cpp` — early `/tmp/element-sandbox-worker-<pid>.startup.log` write on worker dispatch (captures the lifecycle window before `SandboxWorker::initialise` runs, in case `initialiseFromCommandLine` ever fails silently); manual dispatch loop replacement (see §3.8).
- `test/engine/SandboxRealProcessTest.cpp` — 3-cycle warmup + 10-cycle assertion phase requiring ≥ 8 cycles to deliver the worker's DC output. Tolerance allows for occasional macOS RT-priority scheduling jitter on the cold worker thread without making the test flaky.
- `test/CMakeLists.txt` — `EL_SANDBOX_INCLUDE_TEST_FORMATS=1` compile flag scoped to `test_element` only; new `SandboxRealProcessTests` ctest entry with `RUN_SERIAL TRUE TIMEOUT 30`.

### Amendment §5 — Updated implementation order

Original §5 ordering with the addition that **D-8 forced partial D-4 work** (graceful shutdown vs auto-restart). The remaining D-task graph after this commit:

```
[done] D-3 → D-1 → D-2 → D-8.A worker-mode dispatch → D-7 (already in tree) → D-8
[next] D-4 (full ordered shutdown — 1000-cycle stress, waitpid, kqueue)
       D-5 (waitForResponse timeout)
       D-6 (attemptRestart blocks on PluginReady ack)
       D-9 (1000-cycle SandboxStressTest — depends on D-4+D-5+D-6+D-8)
```
