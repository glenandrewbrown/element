# include/element/ — Public API surface

What `kv::element` exports. Plugins, scripts, and downstream code link against these headers only. `src/` is implementation; if it isn't here, it isn't part of the API.

## Layout

```
include/element/
├── *.hpp          # Public C++ classes (Application, Context, Node, Graph, ...)
├── *.h            # C-compatible identifier + type defs (e.g. node.h has EL_NODE_ID_*)
├── ui/            # Public UI surface (Content, WebContent, StandardContent, ...)
└── juce/          # JUCE wrapper / forward-decl helpers
```

## Key headers

| Header | Role |
|---|---|
| `application.hpp` | `Application` (JUCE app subclass), command-line, lifecycle |
| `context.hpp` | `Context` — root DI/services container |
| `engine.hpp` / `audioengine.hpp` | Engine façade for plugins/scripts |
| `graph.hpp` / `node.hpp` / `node.h` | Graph + node model + ID macros |
| `nodefactory.hpp` | Factory façade for built-in + format-loaded nodes |
| `processor.hpp` / `parameter.hpp` | Audio processor base contract |
| `services.hpp` | Service locator (DeviceService, EngineService, GuiService, …) |
| `session.hpp` | Top-level project model |
| `controller.hpp` / `devices.hpp` / `midichannels.hpp` | Hardware/MIDI surface contracts |
| `datapath.hpp` / `datapipe.hpp` / `filesystem.hpp` | Asset paths + I/O |
| `ui/content.hpp` | Base UI shell |
| `ui/web_content.hpp` / `ui/standard.hpp` | UI shell variants |
| `ui/element_webview_host.hpp` | Native bridge component |
| `juce.hpp` | Curated JUCE include (no `using namespace juce;` here) |
| `atomic.hpp` / `linkedlist.hpp` / `ringbuffer.hpp` | Lock-free / RT-safe primitives surfaced for nodes |

## Conventions

- **`.h` vs `.hpp`**: `.h` for C-compatible defs (`node.h`, `element.h`); `.hpp` for C++ types. Mixing is intentional — keep `.h` headers `extern "C"`-safe and free of C++ types.
- **No `using namespace juce;` in any header** — even `.cpp` should keep usage local.
- Public types live here; `src/*.hpp` headers are implementation-private even though they share the layout.
- ABI: do not break public signatures without a parallel migration shim. CLAP/AU/LV2/VST3 wrappers depend on stability.

## Anti-patterns

- Putting a new public class in `src/` — promote to `include/element/`.
- Including a `src/*.hpp` from public code — public must be self-sufficient.
- Treating `element/juce/` as a JUCE fork — it's a thin wrapper layer, not a place to add upstream changes.
- Adding C++ types to a `.h` header — breaks C-compatibility consumers.
