# ADR-008: PluginEditor Teardown Order

**Status**: accepted
**Date**: 2026-05-24
**Deciders**: engine, plugin-host
**Tags**: lifecycle, vst3, plugin-host, crash-fix

## Context

Heap corruption was reproducibly triggered in the VST3 wrapper on session shutdown and on rapid plugin close. The defect was order-of-operations: the editor component was being detached from the JUCE component hierarchy before owned plugin windows had closed and content had been cleared. JUCE peer destruction in that sequence races against late callbacks from the wrapped plugin, with the VST3 wrapper dereferencing freed objects.

A symmetrical pitfall applies to `PluginProcessor`: the full `Context` must **not** be initialised in the constructor, because DAW plugin scans call the constructor purely to query metadata. Heavy init must be deferred to `prepareToPlay()` or `createEditor()`.

## Decision

Two ordering invariants for plugin host integration:

1. **PluginEditor teardown order**:
   1. Close all plugin-owned windows.
   2. Clear the editor content (release child components and listener registrations).
   3. **Only then** remove the editor from the JUCE component hierarchy.

2. **PluginProcessor construction**:
   - Constructor performs only the minimum required for DAW metadata scan.
   - Heavy initialisation (engine, plugin manager, scripting, devices) is deferred to `prepareToPlay()` or `createEditor()`.

These invariants are documented in `CLAUDE.md → Gotchas` and enforced by code review.

## Consequences

### Positive
- Fixes the reproducible heap corruption in the VST3 wrapper on shutdown / rapid plugin close.
- Plugin scans complete fast — DAWs no longer block on Element's plugin init while scanning.

### Negative
- New PluginEditor subclasses must explicitly implement the close/clear/remove sequence; getting it wrong silently re-introduces the crash.
- Lazy init in `prepareToPlay()` requires re-entrant safety for any code path that may run before the engine exists.

### Neutral
- No regression test currently asserts the teardown sequence directly — a candidate for ADR-driven test addition (`/ruflo-testgen:test-gaps`).

## Links
- `src/plugineditor.cpp`
- `src/pluginprocessor.cpp`
- `src/pluginprocessor.hpp`
- CLAUDE.md → Gotchas
- ADR-004 (real-time safety on the audio thread)

**Related**: ADR-004
