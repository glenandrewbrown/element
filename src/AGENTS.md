# src/ — C++ source dispatch

Top-level Element C++ implementation. All files compile into `kv::element` library + standalone app + plugin targets via `juce_add_*`.

## Subsystem dispatch

| Subdir | Role | Has own AGENTS.md |
|---|---|---|
| [`engine/`](engine/AGENTS.md) | Audio/MIDI engine, processing graph, sandbox host/worker | yes |
| [`nodes/`](nodes/AGENTS.md) | Built-in processor implementations (compressor, EQ, mixer, router, …) | yes |
| [`ui/`](ui/AGENTS.md) | Hybrid UI (Web shell + classic JUCE fallback) | yes |
| `el/` | Lua-bound Element core: graphics, widgets, AudioBuffer, Context, Session | no |
| `services/` | App services: Device, Engine, GUI, Mapping, OSC, Preset, Session | no |
| `scripting/` | Lua DSP/UI script manager, sol2 bindings | no |
| `lua/` | Vendored Lua interpreter source + Element Lua modules | no — vendored |
| `plugins/` | Plugin format entry points (`instrument.cc`, `effect.cc`, `midi_effect.cc`, `plugin_updater.cc`) | no |
| `juce/` | Internal JUCE module integrations | no |
| `experimental/` | Pre-merge work; not built unless flagged | no |
| `res/` | Embedded resources | no |

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
