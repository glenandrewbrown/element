# Agent / IDE quick start

## Read first (order matters)

1. **[AI_HANDOVER.md](AI_HANDOVER.md)** — opens with the **canonical agent preamble** and a **dated status log** (multi-agent context only; **not** spec).
2. **[docs/ELEMENT_UNIFIED_BLUEPRINT.md](docs/ELEMENT_UNIFIED_BLUEPRINT.md)** — **single source of truth** for product + UI (V3.0 Instrument paradigm). Read before visual/webview implementation work.
3. **[CLAUDE.md](CLAUDE.md)** — build commands, architecture, terminology, realtime and UI conventions.

## Specs and maps

- **[docs/ELEMENT_FEATURE_INVENTORY.md](docs/ELEMENT_FEATURE_INVENTORY.md)** — feature coverage vs implementation.
- **[docs/ELEMENT_LLM_AGENT_BRIEFING.md](docs/ELEMENT_LLM_AGENT_BRIEFING.md)** — agent-oriented project + UI map.
- **`docs/stitch-reference/`** — static layout references (`DESIGN.md`, `edit-mode.html`, `perform-mode.html`) alongside the blueprint.
- **[docs/WEBVIEW_HYBRID_POLICY.md](docs/WEBVIEW_HYBRID_POLICY.md)** — **full Web port mandate**: no feature may remain native-only as the final design; classic UI is a stopgap until bridged.

## Cursor

Project rules live in [`.cursor/rules/`](.cursor/rules/). They mirror the same read order as above.

**Classic UI escape hatch:** set environment variable `ELEMENT_STANDARD_CONTENT=1` to force `StandardContent` instead of the Web shell (debug/support).

## Packaged workflows (Markdown)

- [`.claude/skills/element-build-and-package/SKILL.md`](.claude/skills/element-build-and-package/SKILL.md)
- [`.claude/skills/add-node/SKILL.md`](.claude/skills/add-node/SKILL.md)
- [`.claude/skills/verify-element-ui/SKILL.md`](.claude/skills/verify-element-ui/SKILL.md)
- [`.claude/skills/inspect-ax-tree/SKILL.md`](.claude/skills/inspect-ax-tree/SKILL.md)
- [`.claude/skills/release-sign-notarize/SKILL.md`](.claude/skills/release-sign-notarize/SKILL.md)

## VS Code / Cursor tasks

CMake configure, build, and CTest targets for `build-merged` are in [`.vscode/tasks.json`](.vscode/tasks.json). If you use another build directory (see [AI_HANDOVER.md](AI_HANDOVER.md) operational notes), run the equivalent commands manually or duplicate tasks locally.

## Full-repo LLM pack (Repomix)

See [`docs/REPOMIX.md`](docs/REPOMIX.md) and [`repomix.config.json`](repomix.config.json). Run `npx repomix@latest` at repo root; analysis snapshot: [`docs/REPOMIX_CONTEXT_SUMMARY.md`](docs/REPOMIX_CONTEXT_SUMMARY.md).

---

## Hierarchical AGENTS.md (children)

Drill into a subsystem; each child is intentionally narrower than this index.

| Path | Domain |
|---|---|
| [`src/AGENTS.md`](src/AGENTS.md) | C++ source map, dispatch table for src/* subsystems |
| [`src/engine/AGENTS.md`](src/engine/AGENTS.md) | Audio engine, processing graph, realtime invariants |
| [`src/nodes/AGENTS.md`](src/nodes/AGENTS.md) | Built-in processor nodes, NodeFactory registration |
| [`src/ui/AGENTS.md`](src/ui/AGENTS.md) | Hybrid UI (Web shell canonical, StandardContent fallback) |
| [`include/element/AGENTS.md`](include/element/AGENTS.md) | Public API surface (`element/*.hpp`) |
| [`webview/AGENTS.md`](webview/AGENTS.md) | React 19 + Vite 8 + Tailwind 4 frontend |
| [`test/AGENTS.md`](test/AGENTS.md) | Boost.Test suite, fixtures, CTest registration |

## Code map (entry points)

| Concern | File |
|---|---|
| Standalone app entry | `src/main.cc` (`START_JUCE_APPLICATION`) → `include/element/application.hpp` |
| Plugin entries | `src/plugins/{instrument,effect,midi_effect,plugin_updater}.cc` (`createPluginFilter`) |
| Audio engine | `src/engine/audioengine.cpp` (`AudioEngine`, `RootGraphRender`) |
| Processing graph | `src/engine/graphnode.cpp`, `src/engine/graphbuilder.cpp` |
| Node factory | `src/engine/nodefactory.cpp` + `include/element/nodefactory.hpp` |
| Web UI shell (V3 canonical) | `src/ui/web_content.cpp` + `include/element/ui/web_content.hpp` |
| Classic UI fallback | `src/ui/standard.cpp` + `include/element/ui/standard.hpp` |
| C++ ↔ JS bridge | `src/ui/element_webview_host.cpp` (registers `element*` natives on `window.__JUCE__.backend`) |
| Test entry | `test/TestMain.cpp` (`BOOST_TEST_MODULE Element`, `JuceMessageManagerFixture`) |
| Webview entry | `webview/src/main.tsx` (`createRoot`) → `webview/index.html` |

## Project-specific anti-patterns

Realtime / audio-thread (`src/engine/**`, `src/nodes/**` — see [`.cursor/rules/element-audio-path.mdc`](.cursor/rules/element-audio-path.mdc)):
- **No** `new`/`delete`/`malloc`/`free`/allocating containers on the callback path.
- **No** `std::mutex`, `juce::CriticalSection`, `juce::SpinLock`, lock guards on audio thread.
- **No** blocking I/O or unbounded waits. Use `juce::AbstractFifo`, atomics, lock-free handoff.
- Escape hatch: explicit `// no-rt-check` comment with justification.

Style / code (see [`docs/cppstyle.md`](docs/cppstyle.md), [`.cursor/rules/element-project.mdc`](.cursor/rules/element-project.mdc)):
- **No** `using namespace juce;` in headers — `.cpp` only.
- **No** redundant `virtual` keyword with `override`.
- `src/.clang-format` is stricter than root (`AfterClass/Struct/Enum: true`); files under `src/` follow it.

UX / hybrid policy (see [`docs/WEBVIEW_HYBRID_POLICY.md`](docs/WEBVIEW_HYBRID_POLICY.md)):
- Classic JUCE-only panel as **final** UX = forbidden. All user-facing features must port to the Web shell + bridge.
- `ELEMENT_STANDARD_CONTENT=1` is a **debug** escape hatch, not a supported runtime toggle.

Build / packaging:
- **Don't hand-edit** `webview/dist/` or `cmake/element_webview_dist.h.in` — produced by `cd webview && npm run build` then CMake reconfigure.
- **`file(GLOB_RECURSE)`** in `src/CMakeLists.txt` and `test/CMakeLists.txt` means new `.cpp` files require `cmake -B build-merged` reconfigure (not just `--build`).
- macOS plugins live in `~/Library/Audio/Plug-Ins/{Components,VST3,LV2}` after install — clean before re-signing if testing notarization.

## Generated facts (snapshot)

- **Generated:** 2026-05-08T04:10:19Z · **Branch:** `local-enhancements` · **Commit:** `0e67448b`
- **C++ standard:** C++20 · **JUCE:** 8.0.12 · **CMake min:** 3.26.0 · **Boost:** ≥1.74.0
- **Test framework:** Boost.Test (header-only), single binary `test_element`, per-suite CTest entries.
- **Webview stack:** React 19.2.4, Vite 8.0.1, Tailwind 4.2.2, `@xyflow/react` 12.10.2, Zustand 5, framer-motion 12, Vitest 4 + Playwright.
- **Native bridge:** JUCE `WebBrowserComponent` + `juce::WebBackend` → `window.__JUCE__.backend.invokeNativeFunction("element*", ...)`.
- **Default dev build dir:** `build-merged/` (see VS Code tasks). Release: `build-release/`. Installer artefacts: `installer/build_pkg.sh` + `installer/build_dmg.sh`.
