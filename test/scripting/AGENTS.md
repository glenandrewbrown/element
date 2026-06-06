<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/scripting/ — Lua scripting tests

Tests for the Lua scripting engine (`sol2` bindings, `ScriptManager`,
`ScriptLoader`, DSP script lifecycle, sandbox isolation). Lua snippets
consumed by these tests live in `test/snippets/`.

## Key Files

| File | Suite | Guards |
|------|-------|--------|
| `bytestest.cpp` | `BytesTest` | `Bytes` Lua type: construction, indexing, slice |
| `dspscripttest.cpp` | `DSPScriptTest` | DSP script `prepare`/`render`/`release` lifecycle via `ScriptLoader` |
| `luaboundstest.cpp` | `LuaBoundsTests` | Lua API boundary conditions: nil args, out-of-range indices, type mismatches |
| `luasandboxtest.cpp` | `LuaSandboxTests` | Script sandbox: restricted globals, forbidden modules, safe execution |
| `LuaStressTests.cpp` | `LuaStressTests` `LuaSandboxBoundaryTests` | Repeated load/unload cycles under stress; sandbox boundary conditions at scale |
| `midiscripttest.cpp` | `MidiScriptTests` | MIDI processing in Lua scripts: note on/off passthrough, channel filter, transform |
| `nodewritefiletest.cpp` | `NodeWriteFileTests` | Lua `node:writeFile()` binding: writes data, respects sandbox path restrictions |
| `sandboxisolationtest.cpp` | `SandboxIsolationTests` | Script sandbox isolation: one script's globals do not leak to another |
| `scriptinfotest.cpp` | `ScriptInfoTest` | `ScriptInfo` metadata parsing from script headers |
| `scriptloadertest.cpp` | `ScriptLoaderTest` | `ScriptLoader` load/reload/error-path correctness |
| `scriptmanagertest.cpp` | `ScriptManagerTest` | `ScriptManager` add/remove/lookup scripts |
| `scriptplayground.cpp` | `ScriptPlayground` | Ad-hoc manual verification cases; not a regression suite |
| `luatest.hpp` | — | Shared Lua test helpers (header-only) |

## For AI Agents

```bash
cd build-merged && ctest -R "DSPScriptTest|LuaSandbox|ScriptLoader" --output-on-failure
./test_element --run_test=DSPScriptTest
```

- Lua snippet files (`.lua`) used by these tests live in `test/snippets/` —
  loaded via `testutil::sourceRoot() / "test/snippets/<name>.lua"`.
- New `.cpp` requires cmake reconfigure + `add_test()` in `test/CMakeLists.txt`.
