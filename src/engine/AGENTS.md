# src/engine/ — Audio engine + processing graph

Realtime audio core. Thread-sensitive. Read [`.cursor/rules/element-audio-path.mdc`](../../.cursor/rules/element-audio-path.mdc) before editing.

## Class → file map

| Class | File |
|---|---|
| `AudioEngine` | `audioengine.{cpp,hpp}` (façade also in `include/element/audioengine.hpp`) |
| `RootGraphRender` | `audioengine.cpp` (private struct: graph swap & rendering) |
| `GraphNode` | `graphnode.{cpp,hpp}` (graph container holding processor nodes + connections) |
| `GraphBuilder` | `graphbuilder.{cpp,hpp}` (compiles graph topology to render order) |
| `GraphManager` | `graphmanager.{cpp,hpp}` (high-level graph lifecycle) |
| `NodeFactory` | `nodefactory.cpp` (built-in node registrations; see [`../nodes/AGENTS.md`](../nodes/AGENTS.md)) |
| `IONode` | `ionode.{cpp,hpp}` (audio/MIDI in/out endpoints in a graph) |
| `MidiEngine` | `midiengine.{cpp,hpp}` |
| `MidiClock` | `midiclock.{cpp,hpp}` (transport sync) |
| `MappingEngine` | `mappingengine.{cpp,hpp}` (MIDI learn / parameter mapping) |
| `Oversampler` | `oversampler.cpp` |
| `CLAPProvider` | `clapprovider.{cpp,hpp}` |
| `JackClient` | `jack.{cpp,hpp}` (Linux JACK I/O) |
| Sandbox host | `sandboxhost.hpp`, `sandboxworker.hpp`, `sandboxipc.hpp`, `sandboxsemaphore.hpp`, `sandboxsharedmemory.hpp` |

## Realtime invariants (audio callback path)

Hot paths: anything reachable from `Processor::render(...)`, `GraphNode::process(...)`, `AudioEngine::audioDeviceIOCallback...`. Must NOT do:

1. **Heap alloc** — `new`, `delete`, `malloc`, `free`, allocating STL containers, dynamic `std::function`, mutating `std::string`.
2. **Lock acquisition** — `std::mutex`, `juce::CriticalSection`, `juce::SpinLock` (yes — even SpinLock can spin), `unique_lock`, `lock_guard`.
3. **Blocking I/O / unbounded wait** — `std::cout`, file I/O, `WaitableEvent::wait()`.
4. **`SandboxHost::waitForResponse()`** — message-thread-only (mutex + condvar inside).
5. **Stack-construction of allocating objects** — e.g. `togglegrid.hpp` warns: don't construct on stack in RT thread; pre-allocate or swap.

Allowed: pre-allocated buffers (sized in `prepareToRender`), atomics, `juce::AbstractFifo`, lock-free SPSC queues.

## Escape hatch

Add `// no-rt-check` with justification on the offending line so reviewers can grep deliberate exceptions (matches the PostToolUse hook in `.claude/settings.local.json`).

## Where state lives

- **ValueTree** (in parent `src/session.cpp`) is the single source of truth — engine snapshots/syncs at ~60 Hz.
- **`prepareToRender(double sr, int blockSize)`** is the only safe time to allocate; off the audio thread.
- Sandboxed plugins: state crosses process boundary via `sandboxsharedmemory` + `sandboxsemaphore`; `sandboxipc.hpp` defines `SharedAudioBuffer` and `SandboxMessageHeader` framing.

## Anti-patterns

- "Just one mutex" to fix a race on the audio path — use a SPSC queue or atomic.
- Logging from inside `render()` — use a lock-free log queue drained from the message thread (see `../log.hpp`).
- Holding raw pointers across thread boundaries — use `juce::ReferenceCountedObjectPtr`.
- Reusing the same `RootGraphRender` slot mid-render — graph swaps go through atomic exchange.
