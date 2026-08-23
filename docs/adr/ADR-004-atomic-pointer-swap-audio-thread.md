# ADR-004: Atomic Pointer Swap for Audio-Thread Render Ops

**Status**: accepted
**Date**: 2026-05-24
**Deciders**: engine
**Tags**: real-time, audio-thread, concurrency, lock-free

## Context

Element rebuilds its render-op sequence on any graph mutation: adding a node, changing a connection, swapping an output device. The audio callback runs at hard-real-time priority and must not allocate, lock, or wait. The classic JUCE pattern (mutex around the op list) would either block the audio thread or force the message thread to wait — both unacceptable for live performance use.

## Decision

Use **atomic pointer swap** for any data structure read by the audio thread and mutated by the message thread.

- `GraphNode` render ops: `std::atomic<juce::Array<void*>*>`. Message thread builds a new ops array, publishes via `exchange(std::memory_order_acq_rel)`, and frees the old pointer once no audio block can still be reading it. Audio thread reads via `load(std::memory_order_acquire)` — no lock, no allocation.
- MIDI output: `std::atomic<juce::MidiOutput*>`. Audio thread reads lock-free; the message thread swaps on device change.
- Sandbox IPC: lock-free shared memory plus a platform semaphore (Mach on macOS, POSIX on Linux, `WaitForSingleObject` on Windows), with a brief spin-wait before `sem_timedwait` to keep the common case wait-free.

Hard rules:
- No `mutex`, `condition_variable`, or `juce::ScopedLock` on the audio thread.
- No allocations in `render()` — pre-allocate in `prepareToRender()`.
- No exceptions on the audio thread.

## Consequences

### Positive
- Audio thread is wait-free under graph edits.
- Topology changes apply without xruns at sensible buffer sizes.
- Pattern composes — the same `atomic<T*>` swap recurs for MIDI outputs, sandbox channels, and meter buffers.

### Negative
- Reclaiming old payloads safely requires either RCU-style epoch tracking or deferring deletion to a later message-thread tick. Authors must remember this every time they introduce a new swap site.
- Easy to regress: a single `juce::CriticalSection` slipped into the render path silently re-introduces priority inversion.

### Neutral
- Test fixtures under `test/engine/GraphNodeLockFree*` exist to lock this in.

## Links
- `src/engine/graphnode.cpp`
- `test/engine/`
- CLAUDE.md → Real-time Safety

**Related**: ADR-005
