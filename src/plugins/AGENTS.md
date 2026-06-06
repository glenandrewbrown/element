<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# src/plugins/ — Plugin-format entry points

Four tiny `.cc` files that are the only format-specific code for building Element as a DAW plugin (VST3/AU/CLAP). Each file calls `createPluginFilter()` which returns a `PluginProcessor` configured for a different role. All heavy logic lives in `src/pluginprocessor.cpp` and `src/plugineditor.cpp`; nothing substantial belongs here.

## Key Files

| File | Role |
|---|---|
| `effect.cc` | `createPluginFilter()` → `PluginProcessor(Effect, 16)` — Element as an audio effect plugin (stereo in/out, 16 MIDI channels) |
| `instrument.cc` | `createPluginFilter()` → `PluginProcessor(Instrument, 16)` — Element as a virtual instrument (no audio input, 16 MIDI channels) |
| `midieffect.cc` | `createPluginFilter()` → `PluginProcessor(MidiEffect, 0)` — Element as a MIDI-only effect (0 audio channels) |
| `pluginupdater.cc` | `PluginUpdater : Updater` — plugin-side auto-update stub; included via `#include` from the other three files when `ELEMENT_UPDATER` is defined; implements `Updater::create()` |

Each of `effect.cc`, `instrument.cc`, and `midieffect.cc` conditionally `#include "./pluginupdater.cc"` at the bottom when `ELEMENT_UPDATER` is defined — so `pluginupdater.cc` is not compiled as a standalone translation unit.

## Critical gotchas

### PluginProcessor constructor — do NOT initialize Context
DAW hosts call `createPluginFilter()` during plugin scanning **just to read metadata** (name, channel layout, parameter list). Constructing a full `Context` at this point causes:
- Unnecessary CPU/memory overhead during scans
- Potential crashes if audio devices or JUCE singletons are not yet ready

**Rule:** the `PluginProcessor` constructor must stay lightweight — query-safe. Defer all `Context` construction and heavy init to `prepareToPlay()` or `createEditor()`.

### PluginEditor teardown order — close windows before removing from hierarchy
When the editor is destroyed:
1. Close all plugin windows (call `pluginWindow->close()` or equivalent)
2. Clear content components held by the editor
3. **Then** remove the editor from the JUCE component hierarchy

Reversing steps 1–2 and 3 causes heap corruption in the VST3 wrapper because the VST3 host may destroy the native view handle before JUCE has finished tearing down child components.

## For AI Agents

- These files are intentionally minimal — resist adding logic here. Any new behaviour belongs in `src/pluginprocessor.cpp` or `src/plugineditor.cpp`.
- If adding a new plugin format variant (e.g. a separate "surround" effect target), create a new `.cc` file here following the same 3-line `createPluginFilter()` pattern and add the target in `CMakeLists.txt`.
- No tests directly exercise these entry points (they are integration-level); `test/` covers `PluginProcessor` behaviour via `PluginManagerTests.cpp` and `PluginManagerEdgeCaseTests.cpp`.

## Dependencies

- Internal: `../pluginprocessor.hpp` (the only `#include` in each file)
- External: JUCE plugin wrapper (`juce_audio_plugin_client`) generates the VST3/AU/CLAP boilerplate that calls `createPluginFilter()`
