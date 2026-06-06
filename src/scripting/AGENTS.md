<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# src/scripting/ — Scripting engine internals

Manages the Lua VM lifecycle, loads and executes DSP and UI scripts, and owns the sol2 state. Sits between the raw Lua bindings in `src/el/` (which register individual usertypes) and the application services that trigger script execution.

## Key Files

| File | Class / Role |
|---|---|
| `scriptmanager.hpp` / `scriptmanager.cpp` | `ScriptManager` — discovers `.lua` scripts from app, system, home, and user script directories; maintains a `ScriptArray` of `ScriptInfo` metadata; does NOT execute scripts |
| `scriptloader.hpp` / `scriptloader.cpp` | `ScriptLoader` — `ReferenceCountedObject` wrapper around a `sol::function`; loads a script from a `juce::String` buffer or `juce::File`, holds the compiled chunk, calls it with a `sol::environment` |
| `scriptinstance.hpp` | `ScriptInstance` — base class for live script execution contexts; holds the `sol::environment` and the sol2 state view |
| `dspscript.hpp` / `dspscript.cpp` | `DSPScript` — `ScriptInstance` for audio-processing scripts; exposes `prepare(rate, block)`, `process(audio, midi)`, `release()`, `init()` to Lua; owns the `DSP` table and `playhead` |
| `dspuiscript.hpp` / `dspuiscript.cpp` | `DSPUIScript` — `ScriptInstance` for scripts that combine DSP + a custom UI component (Lua-driven `juce::Component`) |
| `scriptsource.hpp` | `ScriptSource` — thin value type describing a script source (file path or embedded string) |
| `bindings.hpp` / `bindings.cpp` | Top-level sol2 binding registration: calls all `luaopen_el_*` entry points from `src/el/` to populate the Lua state with the `el.*` namespace |

## Architecture

```
ScriptManager          — finds scripts on disk (ScriptInfo metadata only)
    |
    v
ScriptLoader           — compiles a Lua chunk into a sol::function
    |
    v
ScriptInstance         — base: owns sol::environment, state view
    ├── DSPScript      — audio path: prepare/process/release cycle
    └── DSPUIScript    — audio + custom Lua UI component
```

`bindings.cpp` is called once at startup to register all `el.*` modules into the shared `sol::state`. After that, each `ScriptInstance` gets its own `sol::environment` (sandboxed globals) so scripts cannot clobber each other.

## DSPScript render contract

`DSPScript::process()` is called from a `ScriptNode` on the **audio thread**. The Lua function it invokes must obey all realtime rules — no allocations, no I/O, no locks. This is enforced by convention (not by the VM); script authors are responsible.

The `DSP` Lua table must expose:
```lua
DSP.init()            -- optional; called once after load
DSP.prepare(rate, n)  -- called before first process block
DSP.process(audio, midi)
DSP.release()         -- called on teardown
```

## For AI Agents

- `ScriptManager::scanDefaultLocation()` calls all four directory helpers (`getApplicationScriptsDir`, `getSystemScriptsDir`, `getHomeScriptsDir`, `getUserScriptsDir`) — add new search paths there, not ad-hoc in callers.
- `DSPScript::validate(const juce::String&)` runs a dry-load without executing; use this to surface syntax errors before instantiating a `ScriptNode`.
- Never hold a raw `sol::function` or `sol::table` across a thread boundary — sol2 objects are not thread-safe. `DSPScript` keeps its sol objects on the audio thread; message-thread code uses `ScriptManager` metadata only.
- Test coverage: `test/scripting/` — `dspscripttest.cpp`, `scriptloadertest.cpp`, `scriptmanagertest.cpp`, `luaboundstest.cpp`; run `ctest -R scripting` from `build-merged`.

## Dependencies

- Internal: `src/el/` (all `luaopen_el_*` binding entry points), `include/element/script.hpp` (`ScriptInfo`), `include/element/processor.hpp`
- External: `sol2` (vendored `src/lua/`), Lua 5.4 C API
