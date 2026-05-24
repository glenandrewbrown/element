# ADR-005: Out-of-Process Plugin Sandboxing via Shared Memory

**Status**: accepted
**Date**: 2026-05-24
**Deciders**: engine, security
**Tags**: sandbox, ipc, crash-isolation, plugins

## Context

Third-party AU/VST3/CLAP plugins crash, leak, or stall — and historically take Element down with them. Loading every plugin in-process makes a single bad plugin a fatal user experience. macOS code-signing rules also make some untrusted plugins difficult to load directly in the host bundle without compromising the host's own entitlements.

## Decision

Run any plugin in an isolated worker process and stream audio between host and worker over **lock-free shared memory + semaphores**.

Components:

| Component | File |
|---|---|
| `SandboxHost` | `src/engine/sandboxhost.hpp` |
| `SandboxWorker` | `src/engine/sandboxworker.hpp` |
| `SharedAudioBuffer`, `SandboxMessageHeader` | `src/engine/sandboxipc.hpp` |
| Cross-platform semaphore (Mach / POSIX / Win) | `src/engine/sandboxsemaphore.hpp` |
| Cross-platform shared memory (`shm_open` / `mmap` / Win mapping) | `src/engine/sandboxsharedmemory.hpp` |
| Graph-node wrapper | `src/nodes/sandboxedprocessor.hpp` (`SandboxedProcessorNode`) |

Audio crosses the process boundary through `SharedAudioBuffer`. Control messages (parameter changes, state requests) use JUCE pipes. Synchronisation uses platform semaphores with bounded `sem_timedwait` to avoid stalls.

The worker binary is signed and given its own `cmake/entitlements.plist`.

## Consequences

### Positive
- Plugin crashes do not take down the host; the failing worker is restarted.
- Plugins requiring incompatible entitlements run isolated from the host process.
- Per-plugin CPU is measurable per worker and easier to surface in the UI.

### Negative
- Extra IPC + semaphore cost per buffer; adds latency proportional to buffer size, not a fixed millisecond cost.
- Two binaries to sign, notarise, and ship.
- State transfer (preset save/load) requires explicit cross-process serialisation.

### Neutral
- Phase D sandbox auto-default was reverted (commit `e7ba5c97`): sandbox mode now defaults to **0** (in-process) and must be opted in per plugin until Phase D matures with real AUs.

## Links
- `src/engine/sandbox*.hpp`
- `cmake/entitlements.plist`
- `scripts/codesign-macos.sh`
- Commit `e7ba5c97`

**Related**: ADR-004
