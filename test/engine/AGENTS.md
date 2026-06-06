<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/engine/ — Engine unit tests

Direct tests for the audio/MIDI engine layer: graph building, lock-free ops,
MIDI utilities, sandbox IPC, CV signal flow, and logic nodes. These are the
deepest-coverage suites in the codebase.

## Key Files

| File | Suite(s) | Guards |
|------|----------|--------|
| `CVFlowTests.cpp` | `CVFlowTests` | **Built-graph CV proof gate.** Wires real nodes through real `GraphManager`/`GraphBuilder` — NOT hand-built `RenderContext`. Proves: source samples reach consumer, multi-source sum, unconnected reads silence, multi-hop chain, `Processor::getOutputCV` lock-free readback. THE pattern for any graph-level signal claim. |
| `LogicNodesTest.cpp` | `LogicNodesTest` | Comparator, logic gates, envelope-follower, MIDI-gate nodes; direct-render unit tests. Complements CVFlowTests — both must pass together. Includes MIDI-gate panic sample-accuracy. |
| `InternalNodeNamingTests.cpp` | `InternalNodeNamingTests` | Naming QA guard: every browsable node has a human, unique, non-ID display name; MIDI device input/output directions are distinct strings; `Placeholder` is not browsable. Enumerates both `NodeFactory::knownIDs()` + `ElementAudioPluginFormat` scan paths. |
| `BlockCategoryMapTest.cpp` | `BlockCategoryMapTests` | `ui/blockcategory.hpp` keyword matcher: maps plugin name+category strings to the 4-category taxonomy (instrument/audiofx/midieffect/modulator). Header-only, no host infrastructure needed. |
| `AudioEngineTests.cpp` | `AudioEngineTests` | `AudioEngine` public graph-management API: `addGraph`/`removeGraph` invariants, `getActiveGraph`/`setActiveGraph` round-trip, `activate`/`deactivate` idempotency, null-arg guards. Each test uses a fresh local `Context`. |
| `GraphBuilderTests.cpp` | `GraphBuilderTests` | `GraphBuilder` public surface directly: `buffersNeeded(PortType)`, `getTotalLatencySamples()`, construction invariants. |
| `GraphEdgeCaseTests.cpp` | `GraphConnectionValidationTests` `GraphTopologyRobustnessTests` `GraphBuilderEdgeCaseTests` | Invalid connections, type-mismatch ports, topology corner-cases not covered by audio-routing suite. |
| `GraphManagerTests.cpp` | `GraphManagerTests` `GraphManagerConnectionTests` `GraphManagerChangeTests` | `GraphManager`/`RootGraphManager` lifecycle, connection add/remove, change notification. |
| `GraphNodeLockFreeTest.cpp` | `AtomicRenderSwapTests` | Atomic pointer swap pattern in isolation: `is_lock_free()`, multi-thread swap correctness. Does not depend on `GraphNode` internals. |
| `LinearFadeTest.cpp` | `LinearFadeTest` | `LinearFade` fade-out envelope shape and timing. |
| `LinearFadeFadeInTest.cpp` | `LinearFadeFadeInTest` | Fade-in counterpart: starts at 0, ends at 1, duration accuracy. |
| `MidiChannelMapTest.cpp` | `MidiChannelMapTest` | `MidiChannelMap` channel remapping correctness. |
| `MidiClockTest.cpp` | `MidiClockTest` | `MidiClock` BPM↔period conversion, DLL smoothing. |
| `MidiPanicTests.cpp` | `MidiPanicTests` | `MidiPanic` — safety-critical all-notes-off path: `write(ch)`, `write(all)`, `messages()`, `processCC`. |
| `MidiTransposeTests.cpp` | `MidiTransposeTests` | `MidiTranspose`: offset get/set, static/instance process, buffer process, boundary clamp, zero-offset passthrough, non-note passthrough. |
| `RenderNanosTest.cpp` | `RenderNanosTests` | Per-`Processor` lock-free CPU timing tap: atomic round-trips, starts at 0, updated after render. |
| `RootGraphMissingNodeTest.cpp` | `RootGraphMissingNodeTests` | Regression F-1: `GraphNode::connectChannels()` rejects missing source/destination nodes without crashing. |
| `SpectrumAnalyserTest.cpp` | `SpectrumAnalyserTests` | Lock-free per-node FFT analyser: dominant bin at known sine frequency, no fabricated frames when idle, honest near-zero for silence. |
| `VelocityCurveTest.cpp` | `VelocityCurveTest` | `VelocityCurve` modes (Linear, Soft_1, …) and boundary values. |
| `togglegridtest.cpp` | `ToggleGridTest` | `ToggleGrid` state management. |
| `SandboxIPCTest.cpp` | `SandboxSemaphoreTests` `SharedAudioBufferTests` `SandboxProtocolTests` | In-process IPC primitives: semaphore timed-wait, `SharedAudioBuffer` header layout, message serialization/parse round-trips. |
| `SandboxParameterRoundTripTest.cpp` | `SandboxParameterRoundTripTests` | In-process parameter IPC wire protocol: `createSandboxMessage`/`parseSandboxMessage`, `SandboxParameter` proxy, no subprocess. |
| `SandboxAtomicRefDataIntegrityTest.cpp` | `SandboxAtomicRefDataIntegrityTests` | Cross-process atomic readback: `__atomic_store_n`/`__atomic_load_n` on `SharedAudioBuffer::Header` over `MAP_SHARED` mmap is visible across processes. |
| `SandboxSemaphoreCrossProcessTest.cpp` | `SandboxSemaphoreCrossProcessTests` | Named POSIX semaphore (`sem_open`) signals a real child process; proves kernel object is shared across process boundary. |
| `SandboxWaitForResponseTest.cpp` | `SandboxWaitForResponseTests` | `waitForResponse` unblocks immediately on connection loss (not after full timeout), enabling fast restart. |
| `SandboxCrashOnLoadTest.cpp` | `SandboxCrashOnLoadTests` | Worker that crashes during load repeatedly; host stays alive, no self-join hang, restart logic re-arms. |
| `SandboxRealProcessTest.cpp` | `SandboxRealProcessTests` | End-to-end subprocess: re-execs `test_element` as real worker, loads in-tree `TestEchoPluginInstance`, runs `processBlock` over real shared-memory + cross-process semaphores, asserts DC output round-trip. |
| `SandboxRealPluginCrashTest.cpp` | `SandboxRealPluginCrashTests` | Real 3rd-party VST3 (ValhallaSupermassive) loads in separate worker process; `SIGKILL` of worker does not take host down. Skipped if plugin not installed. |
| `SandboxStressTest.cpp` | `SandboxStressTests` | 1000-cycle worker-kill stress: kill-9, auto-restart, audio round-trip assertion per cycle. **ENV-FLAKY — exclude from CI** via `-E SandboxStress`. |
| `SandboxOrderedShutdownTest.cpp` | `SandboxOrderedShutdownTests` | Ordered shutdown: host waits for `ShutdownAck` before unmapping shm. 30 cycles default. **ENV-FLAKY — exclude from CI** via `-E SandboxOrderedShutdown`. |

## For AI Agents

```bash
# Run all engine suites
cd build-merged && ctest -R ".*" --output-on-failure

# Run excluding env-flaky sandbox stress suites
cd build-merged && ctest --output-on-failure -E "SandboxStress|SandboxOrderedShutdown"

# Run a single suite directly (verbose)
./test_element --run_test=CVFlowTests
```

- New `.cpp` here requires both: (1) `cmake -B build-merged` reconfigure (GLOB), and (2) a manual `add_test()` line in `test/CMakeLists.txt`.
- `CVFlowTests` is the mandatory gate for any CV graph-signal claim. Hand-built `RenderContext` unit tests passing is **not sufficient** — the builder skipped CV ports for years while unit tests were green.
- `SandboxRealPluginCrashTest` is skipped automatically on machines without ValhallaSupermassive; safe for CI.
