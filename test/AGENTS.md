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
├── engine/                   # Engine-specific (lock-free, fade, MIDI clock, sandbox IPC)
├── integration/              # Cross-system flows
├── osc/                      # OSC handling
├── realtime/                 # Realtime-safety assertions
├── scripting/                # Lua DSP/UI script tests
├── services/                 # Service-layer tests (uses ServicesFixture)
├── snippets/                 # Snippet/Preset roundtrip
└── webview/                  # Bridge + native-function contract tests
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

## Anti-patterns

- New `.cpp` and forgetting the `add_test()` line — the test compiles but `ctest -R` won't find it.
- Allocating outside `prepareToRender` in DSP tests — defeats the realtime-safety check.
- Cross-suite shared state via globals — use fixtures.
- Skipping `JuceMessageManagerFixture` reset — leaks JUCE singletons across runs and cross-pollutes tests.
- Hard-coding paths instead of `testutil::sourceRoot() / "..."`.
