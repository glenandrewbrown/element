# Element — Repomix context for AI

This file is injected into Repomix output via `instructionFilePath`. Use it together with the packed repository body.

## What this project is

- **Element**: modular AU / LV2 / VST / VST3 / CLAP plugin host (standalone + plugin).
- **Stack**: JUCE 8, C++20, Boost.Test; optional **webview** (`webview/`) is React + Tailwind; native UI under `src/ui/`.
- **Model**: `juce::ValueTree` session/graph; audio engine in `src/engine/`; nodes in `src/nodes/`.

## Read first (not always fully duplicated in pack)

- `CLAUDE.md` — build commands, architecture, realtime-safety rules, terminology, webview layout.
- `AI_HANDOVER.md` — dated **project status log** (build dirs, risks, what landed); not design authority — see blueprint + inventory if this file disagrees.
- `AGENTS.md` — Cursor entry + `.cursor/rules/` and `.claude/skills/` links.
- `docs/ELEMENT_UNIFIED_BLUEPRINT.md` — product/UI specification when working on the instrument paradigm.

## Build (typical macOS dev)

```bash
cmake -B build-merged -DCMAKE_EXPORT_COMPILE_COMMANDS=ON -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0
cmake --build build-merged -j8
cd build-merged && ctest --output-on-failure
```

If `build-merged` is not writable on a machine, use another build directory and keep `compile_commands.json` in sync (see `AI_HANDOVER.md`).

## Conventions

- No `using namespace juce` in headers (`juce::` qualification).
- New `.cpp` files: CMake uses `GLOB_RECURSE` — reconfigure after adding sources.
- Realtime/audio path: avoid allocations and locks in callbacks; see `.cursor/rules/element-audio-path.mdc` and `CLAUDE.md` “Real-time Safety”.

## Pack exclusions

Large or fetched dependencies and build trees are excluded via `.gitignore` and Repomix `customPatterns`. Regenerate JUCE paths locally with CMake; they are not required inside the pack for reasoning about Element’s own code.
