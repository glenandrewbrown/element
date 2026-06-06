<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/snippets/ — Lua test snippets

Lua source files loaded at runtime by the scripting test suites in
`test/scripting/`. Not compiled — loaded via `testutil::sourceRoot()`.

## Key Files

| File | Used by |
|------|---------|
| `sol3_parent.lua` | `LuaStressTests` / `LuaSandboxBoundaryTests` — parent-scope binding tests |
| `stream_from_c.lua` | `DSPScriptTest` — exercises the C→Lua streaming API |
| `test_bytes.lua` | `BytesTest` — Lua-side `Bytes` type operations |
| `test_dsp_script_01.lua` | `DSPScriptTest` — basic DSP script lifecycle (prepare/render/release) |

## For AI Agents

- Loaded via `testutil::sourceRoot() / "test/snippets/<name>.lua"` — never
  hardcode absolute paths in tests.
- Adding a new snippet does **not** require cmake reconfigure (not globbed
  into the binary), but the test that loads it does.
- Keep snippets minimal and focused on one contract each — they are test
  fixtures, not example scripts.
