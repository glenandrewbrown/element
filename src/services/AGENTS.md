<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# src/services/ — Application services

Seven singleton `Service` subclasses that mediate between the engine, the session model, the UI, and external I/O. All services live inside `Context` and are activated/deactivated as a group via `Services::activate()` / `deactivate()`. Every method is **message-thread-only** unless explicitly noted.

## Key Files

| File | Class | Description |
|---|---|---|
| `engineservice.cpp` / (no separate .hpp) | `EngineService` | Owns `RootGraphHolder` instances; translates session model changes into `AudioEngine` graph operations; loads/unloads root graphs on session open/close |
| `sessionservice.cpp` / `sessionservice.hpp` | `SessionService` | File I/O for `.els` projects: open, save, save-as, new, autosave timer, `SessionDocument` lifecycle; emits `sessionChanged` signal |
| `guiservice.cpp` / (no separate .hpp) | `GuiService` | Creates/destroys `MainWindow`, manages `PluginWindow` instances, owns the `ApplicationCommandManager`, drives `Content` switching; **all methods main-thread-only** |
| `deviceservice.cpp` / `deviceservice.hpp` | `DeviceService` | Listens to `AudioDeviceManager` changes; debounces device-list rebuilds with a 250ms one-shot timer; syncs MIDI engine routing after device change |
| `mappingservice.cpp` / `mappingservice.hpp` | `MappingService` | MIDI learn: arms/disarms capture, matches incoming CC to `ControllerMap`, delegates to `MappingEngine`; PIMPL (`class Impl`) |
| `presetservice.cpp` / `presetservice.hpp` | `PresetService` | Saves/loads node presets to the user data directory; `refresh()` rescans the preset folder; PIMPL (`struct Impl`) |
| `oscservice.cpp` / `oscservice.hpp` | `OSCService` | Bidirectional OSC on configurable port (default 8000); see OSC surface below |

## OSC command + query surface (`oscservice.cpp`)

Three listener addresses are registered:

| Address | Listener | Behaviour |
|---|---|---|
| `/element/command/<name>` | `CommandOSCListener` | Maps address suffix or first string arg to a `CommandID`; invokes via `ApplicationCommandManager` on the message thread. Two forms: `/element/command/transportPlay` OR `/element/command "transportPlay"` |
| `/element/command` | `CommandOSCListener` | Same listener, bare address — name must come as first string argument |
| `/element/query` | `QueryOSCListener` | QA/debug query surface; currently supports `dumpcv [path]` — walks the active graph, writes per-cable CV values to a JSON file at `path` (default: `~/Desktop/element_cv_dump.json`) |

The `/element/engine` address prefix (`EL_OSC_ADDRESS_ENGINE`) is defined but currently reserved.

Commands are delivered on the message thread (JUCE `MessageLoopCallback`) — invoking `ApplicationCommandManager::invokeDirectly` from the OSC callback is safe.

## Service lifecycle pattern

```cpp
// All services follow this shape
class FooService : public Service {
public:
    void activate() override;   // called once; grab Context refs, start timers
    void deactivate() override; // called once; stop timers, release refs
};
```

`Context::services()` returns the `Services` aggregate. Use `services.find<FooService>()` to locate a specific service from anywhere that holds a `Context&`.

## For AI Agents

- **Thread rule:** all service methods are message-thread-only. Never call them from the audio callback or a background thread without posting via `juce::MessageManager::callAsync`.
- **Adding a command:** define the ID in `include/element/ui/commands.hpp`, handle it in `GuiService`'s `ApplicationCommandTarget`, then it becomes reachable over OSC automatically.
- **Testing OSC:** use `cli-anything-element` (`agent-harness/`) — `cli-anything-element --json control transport play` maps to `/element/command/transportPlay`.
- **Verify:** `test/services/` contains service-level tests; `ctest -R` from `build-merged`.

## Dependencies

- Internal: `engine/` (GraphManager, AudioEngine), `session.cpp`, `include/element/context.hpp`, `include/element/services.hpp`
- External: `juce::OSCReceiver` / `juce::OSCSender`, `juce::AudioDeviceManager`, `juce::ApplicationCommandManager`
