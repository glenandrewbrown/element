# ADR-009: Verbose Log Convention (`EL_LOG_*` Macro Family)

**Status**: accepted
**Date**: 2026-05-24
**Deciders**: engine, plugin-host
**Tags**: logging, observability, lifecycle, diagnostics

## Context

Plugin-host diagnostics need to capture early ctor/dtor activity, off-message-thread calls (Logic Pro fires `setStateInformation` from a non-message thread), and sandbox-worker startup — all places where the standard Element logger via `Context` is unavailable because `Context` itself does not yet exist or has already been torn down.

`juce::Logger` is process-global but its output sink is not lifecycle-independent — installing a host-owned `Logger` from inside `PluginProcessor` would race the host's own logger replacement and leak across plugin instances. The previous ad-hoc pattern (`PLUGIN_DBG(msg) DBG(msg)`) only fires in debug builds, so production crashes shipped without any usable trace.

## Decision

Adopt a process-wide `VerboseLog` singleton plus the `EL_LOG_*` macro family for **all** lifecycle, AU host-callback, and crash-adjacent diagnostics.

### Sink

A dedicated file at:

- macOS: `~/Library/Application Support/Element/log/element-verbose.log`
- Linux / Windows: the equivalent `applicationDataDir` location

Implemented as a singleton `juce::FileLogger` guarded by a `juce::CriticalSection`. The file is independent of `Context` and survives plugin ctor/dtor lifecycles.

### Macro family

| Macro | Severity | Emitted when |
|---|---|---|
| `EL_LOG(category, msg)` | INFO | Always |
| `EL_LOG_WARN(category, msg)` | WARN | Always |
| `EL_LOG_ERR(category, msg)` | ERR  | Always |
| `EL_LOG_V(category, msg)`    | VERB | Only when `ELEMENT_VERBOSE=1` env var **or** `VerboseLog::instance().setVerbose(true)` |
| `EL_LOG_THREAD(category, msg)` | INFO | Always; appends `thread=MSG` or `thread=OTHER` |

`msg` is a JUCE stream expression — `<< x << "=" << y`. Each call writes one timestamped line.

### Category tags

Short uppercase tags that identify subsystem:

| Tag | Subsystem |
|---|---|
| `"AU"` | AU / VST3 plugin entry points (`PluginProcessor`, `PluginEditor`) |
| `"GFX"` | UI / graph editor lifecycle |
| `"SANDBOX"` | Out-of-process plugin worker (see ADR-005) |
| `"NET"` | Network, OSC, IPC outside the sandbox path |
| _add new tags as new subsystems start logging_ |

### `PLUGIN_DBG` policy

`#define PLUGIN_DBG(msg)` remains as a **compile-time no-op** for legacy call sites and high-volume per-block prints that must never ship. New diagnostics go through `EL_LOG_*`. Do **not** re-enable `PLUGIN_DBG` to mean anything else.

## Consequences

### Positive

- Crash reports include actionable host-thread + ctor/dtor context regardless of build configuration.
- Logic Pro / Cubase off-thread call detection ships with the host log (paired with `EL_LOG_THREAD`).
- No reliance on `Context`, so the log survives the very lifecycle phases where `Context` does not exist (relevant to ADR-008 — PluginEditor teardown — and to host plugin scans).
- One sink, one file — easy for users to attach to bug reports.

### Negative

- A `juce::CriticalSection` lock per log call. Logging from the audio thread is **forbidden** (see ADR-004). `EL_LOG_V` is gated by a relaxed-atomic load, so the common-case cost when verbose mode is off is one atomic read plus the macro's variadic argument formatting being skipped — but the underlying mutex is still in the call path if the gate flips, so audio-path calls are still banned.
- One more singleton to teach contributors about.

### Neutral

- `ELEMENT_VERBOSE=1` is a process-launch flag. There is no in-app toggle UI yet.
- Log file rotation is delegated to `juce::FileLogger` defaults.

## Hard rules

- **Never** call any `EL_LOG_*` macro from the audio thread (ADR-004).
- **Never** put `EL_LOG_V` behind a hot loop without also confirming the verbose gate's atomic load is acceptable in that context.
- **Always** pass a stable category tag — do not invent a new tag per file.

## Links

- `src/verbose_log.hpp`
- `src/verbose_log.cpp`
- ADR-004 (Real-time safety on the audio thread)
- ADR-005 (Sandboxed plugin processing)
- ADR-008 (PluginEditor teardown order)

**Related**: ADR-004, ADR-008, ADR-010
