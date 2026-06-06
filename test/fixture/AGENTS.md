<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/fixture/ — Shared test fixtures

Header-only helpers included by test suites across the tree. No `.cpp` files
here — everything is inlined. The `JuceMessageManagerFixture` in
`TestMain.cpp` initialises and tears down the JUCE message loop around every
run; these fixtures build on top of that.

## Key Files

| File | Purpose |
|------|---------|
| `context.hpp` | `element::test::Context` — thin `Context` subclass used as the singleton test context; constructed once via `element::test::context()` (declared in `testutil.hpp`) |
| `ServicesFixture.hpp` | `element::test::ServicesFixture` — convenience accessors for service tests: `getService<T>()` template, `services()` helper; wraps `test::context()` which provides a fully-initialised `RunMode::Standalone` Context with all services registered and activated |
| `PreparedGraph.h` | `element::PreparedGraph` — owns a `GraphNode` prepared at a given sample rate + block size; the standard setup for DSP tests that need a running audio graph without a full `Context` |
| `TestNode.h` | `element::TestNode` — configurable-port `Processor` subclass; specify audio/MIDI in/out counts at construction; does no processing by default (passthrough zeros) |
| `AtomTestNode.h` | `element::AtomTestNode` — `Processor` subclass with atom (LV2-style) port support for testing MIDI/atom routing paths |
| `MidiCaptureNode.h` | `element::MidiCaptureNode` — captures MIDI events into a buffer during `render()`; assert on `captured` after graph runs |
| `MidiGeneratorNode.h` | `element::MidiGeneratorNode` — emits configurable MIDI events during `render()`; pair with `MidiCaptureNode` to test MIDI routing |

## Patterns

- **Service tests:** inherit or compose `ServicesFixture`; call `getService<EngineService>()` etc.
- **DSP tests:** construct a `PreparedGraph` and add `TestNode` instances via `graph.graph.addNode(...)`.
- **MIDI routing tests:** add a `MidiGeneratorNode` as source and `MidiCaptureNode` as sink; run the graph; assert `captureNode.captured`.
- **MessageManager:** already handled by `JuceMessageManagerFixture` in `TestMain.cpp` — do not create a second `MessageManager` in fixtures.

## For AI Agents

- All files are `#pragma once` headers — include directly, no link step.
- `testutil.hpp` (in `test/`) provides `element::test::context()`, `resetContext()`, and `sourceRoot()` — use `sourceRoot() / "path"` for any file paths in tests, never hardcode absolute paths.
- `PreparedGraph` calls `graph.prepareToRender(sampleRate, blockSize)` in its constructor; call `graph.releaseResources()` in teardown or let RAII handle it.
