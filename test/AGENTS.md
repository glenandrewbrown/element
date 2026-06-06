<!-- Parent: ../AGENTS.md -->
<!-- Updated: 2026-06-06 -->

# test/ — Boost.Test suites

Single binary `test_element` (a `juce_add_console_app`) running all unit + integration tests. Sources collected via `file(GLOB_RECURSE *.cpp)` from this dir; **adding a test file requires `cmake -B build-merged` reconfigure** (not just `--build`).

## Framework

- **Boost.Test** header-only (`#define BOOST_TEST_MODULE Element` in `TestMain.cpp`).
- **Global fixture** `JuceMessageManagerFixture` (`TestMain.cpp`) — initialises the JUCE GUI loop and tears down `Context` between runs.
- **Source root macro**: `EL_TEST_SOURCE_ROOT` defined as `${CMAKE_SOURCE_DIR}` for fixture path resolution (`testutil.hpp::sourceRoot()`).

## Layout

```
test/
├── TestMain.cpp              # BOOST_TEST_MODULE entry + JuceMessageManagerFixture
├── testutil.hpp              # context(), resetContext(), sourceRoot()
├── *.cpp                     # Top-level suites (GraphNodeTests, NodeFactoryTests, ...)
├── fixture/                  # Reusable fixtures
│   ├── ServicesFixture.hpp   #   getService<T>() template, services()
│   ├── PreparedGraph.h       #   audio graph prepared for DSP tests
│   ├── AtomTestNode.h, MidiCaptureNode.h, MidiGeneratorNode.h, TestNode.h
│   └── context.hpp           #   Context helper
├── dsp/                      # DSP robustness (extreme inputs, denormals, zero-len buffers) — see dsp/AGENTS.md
├── engine/                   # Engine-specific (lock-free, fade, MIDI clock, sandbox IPC, CV flow) — see engine/AGENTS.md
├── integration/              # Cross-system flows — see integration/AGENTS.md
├── osc/                      # OSC handling; node-client/ = JS reference client — see osc/AGENTS.md
├── realtime/                 # Realtime-safety assertions (alloc guard) — see realtime/AGENTS.md
├── scripting/                # Lua DSP/UI script tests — see scripting/AGENTS.md
├── services/                 # Service-layer tests (uses ServicesFixture) — see services/AGENTS.md
├── snippets/                 # Lua snippets consumed by scripting tests — see snippets/AGENTS.md
└── webview/                  # Bridge + native-function contract tests — see webview/AGENTS.md
```

## CTest registration pattern

Each suite is added explicitly in `CMakeLists.txt`:

```cmake
add_test(NAME "GraphNodeTests" COMMAND test_element --run_test=GraphNodeTests)
```

Adding a new `BOOST_AUTO_TEST_SUITE(SuiteName)` requires a matching `add_test` line — the GLOB pulls in the source, but the CTest entry is **manual** so individual suites can be invoked independently.

## Running

```bash
cd build-merged
ctest --output-on-failure                  # all suites
ctest -R "GraphNodeTests"                  # one suite by regex
./test_element --run_test=GraphNodeTests   # direct invocation, more verbose
./test_element --list_content              # list all available tests
```

## Conventions

- **One `BOOST_AUTO_TEST_SUITE` per file** — file basename matches suite name (e.g. `GraphNodeTests.cpp` → `BOOST_AUTO_TEST_SUITE(GraphNodeTests)`).
- **Use `ServicesFixture`** (`fixture/ServicesFixture.hpp`) for tests requiring `Context` services — `getService<EngineService>()`, `getService<DeviceService>()`, etc.
- **Use `PreparedGraph`** for DSP tests needing a prepared `GraphNode`.
- **Test MIDI** with `MidiGeneratorNode` + `MidiCaptureNode` — assert on captured buffer.
- **Realtime-safety assertions** live under `realtime/` — they instrument allocator/lock to fail on RT violations.

## Notable suites

| Suite | File | What it guards |
|-------|------|----------------|
| `CVFlowTests` | `engine/CVFlowTests.cpp` | **THE built-graph CV proof gate.** Wires real nodes through real `GraphManager`/`GraphBuilder` render — hand-built `RenderContext` unit tests are NOT sufficient (the live CV path was dead for years while unit tests stayed green). New graph-level CV signal claims must extend this suite, not add isolated unit tests. |
| `LogicNodesTest` | `engine/LogicNodesTest.cpp` | Comparator, logic, envelope-follower, gate nodes; direct-render unit tests. Complements CVFlowTests — both must pass. |
| `InternalNodeNamingTests` | `engine/InternalNodeNamingTests.cpp` | Naming QA guard: every browsable internal node has a human, unique, non-ID name; MIDI device directions are distinct; `Placeholder` is not browsable. |
| `BlockCategoryMapTests` | `engine/BlockCategoryMapTest.cpp` | Keyword-matching helper that maps plugin description strings to the 4-category taxonomy (instrument/audiofx/midieffect/modulator). |
| `AudioThreadAllocationTests` | `realtime/AudioThreadAllocationTest.cpp` | RT allocation guard — global `new`/`delete` interposer fails the test if audio-thread `render()` allocates. |
| `BridgeContractTests` | `webview/BridgeContractTest.cpp` | C++ side of the JS→native bridge: JSON shape contracts for 5 representative native functions, no live WebView needed. |
| `ContainerDiveTests` | `webview/ContainerDiveTest.cpp` | End-to-end `elementEnterContainer`/`elementExitContainer` through real `SessionService` + real nested `Graph` child. |

## Env-flaky suites (excluded from QA runs)

`SandboxStressTests` and `SandboxOrderedShutdownTests` hang or produce 406 errors in constrained CI environments (POSIX shm limits, process-spawn timing). Exclude via:

```bash
ctest --output-on-failure -E "SandboxStress|SandboxOrderedShutdown"
```

These suites are **not broken** — run them locally when working on sandbox IPC.

## Anti-patterns

- New `.cpp` and forgetting the `add_test()` line — the test compiles but `ctest -R` won't find it.
- Allocating outside `prepareToRender` in DSP tests — defeats the realtime-safety check.
- Cross-suite shared state via globals — use fixtures.
- Skipping `JuceMessageManagerFixture` reset — leaks JUCE singletons across runs and cross-pollutes tests.
- Hard-coding paths instead of `testutil::sourceRoot() / "..."`.
