<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# src/el/ — Lua C++ binding implementations

~47 files that expose the Element C++ object model to Lua scripts via **sol2**. Each `.cpp` (and a handful of `.c`) file implements one `luaopen_el_<Name>` entry point that registers a sol2 usertype or a plain Lua module. The Lua-side names are in the `el.*` namespace (e.g. `el.Context`, `el.Node`, `el.AudioBuffer`).

These are NOT the Lua scripts themselves (those live in `scripts/` and `src/scripting/`). This directory is the C++ glue layer that makes C++ objects available inside the Lua VM.

## Important files by theme

### Core model bindings
| File | Lua module | Exposes |
|---|---|---|
| `Context.cpp` | `el.Context` | Main app context: devices, plugins, settings, MIDI engine; `el.context` global userdata |
| `Session.cpp` | `el.Session` | Session (Project) model — open/save/graph access |
| `Node.cpp` | `el.Node` | Block model — name, bypass, ports, parameters |
| `Graph.cpp` | `el.Graph` | Board model — extends `el.Node`, adds child node enumeration |
| `Parameter.cpp` | `el.Parameter` | Parameter read/write, ranges |

### Audio / MIDI bindings
| File | Lua module | Exposes |
|---|---|---|
| `AudioBuffer32.cpp` | `el.AudioBuffer32` | 32-bit float audio buffer (maps to `juce::AudioBuffer<float>`) |
| `AudioBuffer64.cpp` | `el.AudioBuffer64` | 64-bit double audio buffer |
| `AudioBufferImpl.ipp` | (shared impl) | Template implementation shared by both buffer types |
| `MidiBuffer.cpp` | `el.MidiBuffer` | `juce::MidiBuffer` wrapper |
| `MidiMessage.cpp` | `el.MidiMessage` | `juce::MidiMessage` construction + inspection |
| `audio.c` | `el.audio` | Plain C helpers: sample-rate query, format info |
| `midi.c` | `el.midi` | Plain C MIDI utilities (channel/status byte helpers) |
| `midi_buffer.hpp` | — | Internal C++ helper shared by MidiBuffer.cpp |

### Graphics / UI bindings
| File | Lua module | Exposes |
|---|---|---|
| `Graphics.cpp` | `el.Graphics` | `juce::Graphics` drawing API for script-driven components |
| `View.cpp` | `el.View` | Base UI component |
| `Widget.cpp` | `el.Widget` | Generic scriptable widget |
| `Slider.cpp` | `el.Slider` | Slider control |
| `TextButton.cpp` | `el.TextButton` | Button control |
| `Desktop.cpp` | `el.Desktop` | Screen bounds, display info |
| `MouseEvent.cpp` | `el.MouseEvent` | Mouse event wrapper |
| `Content.cpp` | `el.Content` | Top-level content component binding |
| `GraphEditor.cpp` | `el.GraphEditor` | Graph editor component binding |

### Geometry / utility bindings
| File | Lua module | Exposes |
|---|---|---|
| `Bounds.cpp` | `el.Bounds` | `juce::Rectangle<int>` |
| `Point.cpp` | `el.Point` | `juce::Point<int>` |
| `Range.cpp` | `el.Range` | `juce::Range<double>` |
| `Rectangle.cpp` | `el.Rectangle` | `juce::Rectangle<float>` |
| `Commands.cpp` | `el.Commands` | Application command IDs |

### Pure Lua modules (`.lua` files, compiled into the binary)
| File | Purpose |
|---|---|
| `AudioBuffer.lua` | High-level AudioBuffer convenience API |
| `color.lua` | Colour utilities (hex parse, mix) |
| `command.lua` | Command dispatch helpers |
| `object.lua` | Base object/class system used by other Lua modules |
| `script.lua` | Script info / metadata helpers |
| `session.lua` | Session helpers (complements `Session.cpp`) |
| `strings.lua` | String utilities |

## Patterns used throughout

- **Entry point:** every `.cpp` exports `EL_PLUGIN_EXPORT int luaopen_el_<Name>(lua_State* L)` — the standard Lua module open function. sol2 handles the usertype registration inside.
- **Shared helpers:** `sol_helpers.hpp` — `lua::to_string()`, `lua::new_nodetype<T>()` for ValueTree-backed model types.
- **Node/Graph types:** `nodetype.hpp` provides `lua::new_nodetype<T>()` which registers common ValueTree model methods (name, uuid, bypass, ports) then lets the caller add type-specific methods.
- **No RT code here:** nothing in `el/` runs on the audio thread. All bindings are called from the Lua VM on the message thread (or a script thread managed by `ScriptManager`).
- **C files (`audio.c`, `midi.c`, `bytes.c`, `round.c`, `vector.c`):** plain C for portability; compiled as C not C++.

## For AI Agents

- Adding a new binding: create `MyClass.cpp` with `luaopen_el_MyClass`, register it in `src/el/CMakeLists.txt`, then call `lua.require("el.MyClass")` from the scripting engine.
- Never use `using namespace juce;` in headers under `el/` (or anywhere in `src/`) — qualify with `juce::`.
- Test coverage: `test/scripting/` (e.g. `scriptloadertest.cpp`, `dspscripttest.cpp`); run `ctest -R` from `build-merged`.

## Dependencies

- Internal: `include/element/` public headers (context, node, graph, session, processor, parameter), `src/scripting/` (ScriptInstance)
- External: `sol2` (vendored in `src/lua/`), Lua 5.4 C API
