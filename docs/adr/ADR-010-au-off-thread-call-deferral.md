# ADR-010: AU / VST3 Off-Thread Host Call Deferral

**Status**: accepted
**Date**: 2026-05-24
**Deciders**: engine, plugin-host
**Tags**: au, vst3, lifecycle, message-thread, plugin-host, crash-fix

## Context

AU and VST3 hosts may invoke `AudioProcessor` entry points from threads other than JUCE's message thread:

- Logic Pro's `MAAudioEngine` invokes `setStateInformation` from an internal idle / timer thread when restoring `kAudioUnitProperty_ClassInfo`.
- Some hosts invoke `prepareToPlay` from a host thread before the JUCE message manager has stabilised.
- A few hosts call `createEditor` from worker threads during plugin enumeration.

Element's `Context`, `Session`, and `GuiService` are constructed and torn down on the JUCE **message thread**. Any host invocation that synchronously builds or mutates `Context` from a non-message thread crashes — historically with `KERN_INVALID_ADDRESS` at small offsets from a freshly written field, or with `malloc_report` aborts during teardown.

The existing solution for `prepareToPlay` (`AsyncPrepare`, a `juce::AsyncUpdater`) was point-in-time and not generalised. As host quirks were discovered (most recently Logic Pro's off-thread `setStateInformation`) the same pattern was being reinvented locally per call site, with inconsistent error handling.

## Decision

For every `AudioProcessor` entry point that touches `Context`, `Session`, or any UI / GuiService:

1. **Assert and check the message thread** on entry:
   ```cpp
   jassert (juce::MessageManager::getInstance()->isThisTheMessageThread());
   if (! juce::MessageManager::getInstance()->isThisTheMessageThread())
   {
       /* defer to message thread via AsyncUpdater, OR refuse with EL_LOG_ERR */
   }
   ```

2. **Defer mutators** that the host can usefully retry asynchronously (e.g. `setStateInformation`, `prepareToPlay`) via a per-call `juce::AsyncUpdater` subclass that:
   - Stores the call arguments by value into a `juce::MemoryBlock` (or equivalent owning copy).
   - Calls `cancelPendingUpdate()` in its destructor to avoid use-after-free during plugin teardown.
   - Replays the call on the message thread via `handleAsyncUpdate()`.

3. **Refuse query / construction calls** that have no useful async semantics (e.g. `createEditor` — the host expects a return value). Log via `EL_LOG_ERR` and return `nullptr`. Do **not** build editors or Contexts off-thread.

4. **Bail safely on null `Context`** after every `initialize()`, because `initialize()` itself early-returns when called off-thread, leaving `context == nullptr`. Every subsequent dereference of `context` must be preceded by a null check:
   ```cpp
   if (! controllerActive)
       initialize();
   if (! context)
   {
       EL_LOG_ERR ("AU", "<entry>: context still null after initialize - aborting");
       jassertfalse;
       return /* safe value */;
   }
   ```

### Canonical pattern

```cpp
class AsyncStateRestore : public juce::AsyncUpdater
{
    PluginProcessor& processor;
    juce::MemoryBlock state;
public:
    AsyncStateRestore (PluginProcessor& p) : processor (p) {}
    ~AsyncStateRestore() override { cancelPendingUpdate(); }

    void restore (const void* data, int sizeInBytes)
    {
        cancelPendingUpdate();
        state.reset();
        if (data != nullptr && sizeInBytes > 0)
            state.append (data, (size_t) sizeInBytes);
        triggerAsyncUpdate();
    }

    void handleAsyncUpdate() override
    {
        processor.setStateInformation (state.getData(), (int) state.getSize());
    }
};
```

`AsyncPrepare` and `AsyncStateRestore` in `src/pluginprocessor.hpp` are reference implementations.

## Consequences

### Positive

- Logic Pro session restore no longer crashes on plugin load.
- Hosts that violate threading expectations are diagnosed via `EL_LOG_THREAD` + `EL_LOG_ERR` lines rather than a KERN-trap.
- The `AsyncUpdater`-based pattern composes with existing JUCE infrastructure — no new threading primitives needed.
- The bail-on-null-Context guard is mechanical and easy to code-review.

### Negative

- Every new `AudioProcessor` entry point now requires either a new `Async<Foo>` subclass or an explicit `EL_LOG_ERR` refusal. There is no auto-applied wrapper.
- The deferred replay is fire-and-forget — the host's caller has already returned by the time the message-thread replay actually executes. State restore is therefore eventually consistent, not synchronously consistent. Hosts that immediately query state after setting it may observe stale values for one message-loop tick.

### Neutral

- `getStateInformation` is intentionally **not** deferred — hosts expect a synchronous return value and we cannot safely block the host thread. The current implementation returns an empty `MemoryBlock` when `controllerActive` is false, with a `WARN` log.

## Hard rules

- **Never** build `Context`, `Session`, `GuiService`, or any JUCE `Component` off the message thread.
- **Always** re-check `context != nullptr` after `initialize()` — `initialize()` is a no-op when called off-thread.
- **Always** call `cancelPendingUpdate()` from the `AsyncUpdater` subclass destructor.
- **Never** add new `AudioProcessor` entry points without first deciding: defer or refuse?

## Links

- `src/pluginprocessor.hpp` — `AsyncPrepare`, `AsyncStateRestore`
- `src/pluginprocessor.cpp` — `prepareToPlay`, `setStateInformation`, `createEditor`, `initialize`
- ADR-004 (Real-time audio-thread safety)
- ADR-008 (PluginEditor teardown order)
- ADR-009 (Verbose log convention — `EL_LOG_THREAD`, `EL_LOG_ERR`)

**Related**: ADR-008, ADR-009
