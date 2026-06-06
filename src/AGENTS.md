<!-- Parent: ../AGENTS.md -->
<!-- Updated: 2026-06-06 -->

# src/ — C++ source dispatch

Top-level Element C++ implementation. All files compile into `kv::element` library + standalone app + plugin targets via `juce_add_*`.

## Subdirectories

| Subdir | Role | AGENTS.md |
|---|---|---|
| [`engine/`](engine/AGENTS.md) | Audio/MIDI engine, processing graph, CV pool, sandbox host/worker | [yes](engine/AGENTS.md) |
| [`nodes/`](nodes/AGENTS.md) | Built-in processor implementations (compressor, EQ, mixer, router, gate, logic, …) | [yes](nodes/AGENTS.md) |
| [`ui/`](ui/AGENTS.md) | Hybrid UI: WebContent (canonical V3) + StandardContent (classic JUCE fallback) | [yes](ui/AGENTS.md) |
| [`services/`](services/AGENTS.md) | App services: Device, Engine, GUI, Mapping, OSC, Preset, Session | [yes](services/AGENTS.md) |
| [`el/`](el/AGENTS.md) | Lua C++ binding impls (sol2): Context, Session, Node, Graph, AudioBuffer, widgets | [yes](el/AGENTS.md) |
| [`scripting/`](scripting/AGENTS.md) | Script manager, DSP/UI script instances, sol2 state, script loader | [yes](scripting/AGENTS.md) |
| [`plugins/`](plugins/AGENTS.md) | Plugin-format entry points (`effect.cc`, `instrument.cc`, `midieffect.cc`, `pluginupdater.cc`) | [yes](plugins/AGENTS.md) |
| `lua/` | **Vendored** Lua 5.4 interpreter + sol2 headers — do not edit; tracked via FetchContent | no |
| `juce/` | Single internal JUCE integration header (`juce.cpp`) — do not fork; track upstream | no |
| `experimental/` | Pre-merge work; not compiled unless explicitly flagged in CMake | no |
| `res/` | Embedded binary resources (fonts, icons) baked in at link time | no |

## Top-level files

| File | Role |
|---|---|
| `main.cc` | Standalone bootstrap (`START_JUCE_APPLICATION`) |
| `application.cpp` | `Application` lifecycle, command-line parse, `launchApplication()` |
| `pluginprocessor.cpp` / `plugineditor.cpp` | Element-as-plugin host integration |
| `pluginmanager.cpp` / `pluginmanager_au.mm` | Discovers + scans VST3/AU/LV2/CLAP formats |
| `devicemanager.cpp` | Audio device I/O (wraps `juce::AudioDeviceManager`) |
| `session.cpp` / `node.cpp` / `graph.cpp` | Model layer: project/board/block ValueTree state |
| `bindings.cpp` | sol2 Lua bindings entry |
| `commands.cpp` / `messages.cpp` | App-level command IDs + async message structs |
| `sparkle.mm` (macOS) / `winsparkle.cc` (Win) | Auto-update hooks |
| `ringbuffer.cpp` / `semaphore.cpp` / `spinlock.cpp` / `matrixstate.cpp` | Lock-free / sync primitives |
| `filesystemwatcher.cpp` / `presetmanager.hpp` / `script.cpp` | Asset & script lifecycle |

## Conventions specific to src/

- **Stricter clang-format**: `src/.clang-format` overrides root with `AfterClass/Struct/Enum: true`. Files in this tree wrap braces for class/struct/enum definitions.
- **GLOB_RECURSE**: `CMakeLists.txt` collects sources via glob. Adding a `.cpp` requires `cmake -B build-merged` reconfigure (not just `--build`).
- File extensions: `.cc` for plugin-format / app entry points, `.cpp` everywhere else, `.mm` for macOS-specific Objective-C++.

## Anti-patterns specific to src/

- Touching `engine/` or `nodes/` audio paths without reading [`engine/AGENTS.md`](engine/AGENTS.md) realtime invariants.
- Adding a feature only as a classic-only panel under `ui/` — must have a Web port plan ([`docs/WEBVIEW_HYBRID_POLICY.md`](../docs/WEBVIEW_HYBRID_POLICY.md)).
- Forking `juce/` — escalate; we track upstream via FetchContent.
- New public class living under `src/` — promote to `include/element/` (see [`include/element/AGENTS.md`](../include/element/AGENTS.md)).
