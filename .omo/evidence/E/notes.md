# Phase E (Lua Security / RCE Hardening) — evidence log

Wave 1 start SHA: 4105eb23
Branch: local-enhancements

## Commits (in order, newest last)

- E-7 + scaffold       | 34378ca0 | feat(scripting): E-7 lua_sethook instruction-count timeout + sandbox boundary tests
- E-3                  | 463a7ef9 | fix(scripting): E-3 restrict Node:writeFile to Element data path
- E-5                  | 9ceff6ed | fix(scripting): E-5 bounds-check AudioBuffer and MidiBuffer Lua bindings
- E-6                  | b9309894 | fix(scripting): E-6 re-enable a safe DSPScript::validate
- E-3/E-7 hardening    | dbee9a4d | fix(scripting): harden E-3 path containment and E-7 instruction budget

## Test counts (vs 4105eb23)

- ctest baseline (before Phase E): 48 / 51 passing (3 of the 4 new test suites added by prior team-e were red, plus they hung on E-7's infinite-loop case)
- ctest after Phase E:             51 / 51 passing
- Suites added by Phase E:         SandboxIsolationTests, LuaBoundsTests, NodeWriteFileTests
- Suites extended by Phase E:      DSPScriptTest (3 new validate cases)

## Task status vs master-fix-plan.md §Phase E

| Task | Status | Notes |
|------|--------|-------|
| E-1 strip os/io/debug/load/loadfile/dofile/package.loadlib/cpath | already-applied (commits 46c9ae01 + fe576d9b before Wave 1) | Verified by 13 LuaSandboxTests passing at HEAD = 4105eb23. No further work needed. |
| E-2 allow-list of safe modules | documented in 34378ca0 | Comment block in src/scripting/bindings.cpp above initializeState lists allowed (math, string, table, coroutine, utf8, package-with-filtering) and banned (io, os, debug, ffi). |
| E-3 restrict Node:writeFile to data path | applied (463a7ef9) | nodetype.hpp: rejects relative paths, paths outside DataPath::applicationDataDir(). |
| E-4 read-only Context facade for Lua | NOT ATTEMPTED | Lower priority per task prompt; structural change. Logged as Q-E-4 in coordination.md for Glen. |
| E-5 AudioBuffer / MidiBuffer bounds | applied (9ceff6ed) | luaL_argcheck on audio_get / audio_set / audio_clear / midibuffer_clear. |
| E-6 re-enable DSPScript::validate | applied (b9309894) | Lighter validate: ScriptLoader compile check inside sandboxed sol::state. Heavier render-side dry run still gated behind #if 0 (logged as Q-E-6 — engine harness rebuild needed). |
| E-7 lua_sethook instruction-count timeout | applied (34378ca0) | LUA_MASKCOUNT, budget = 100k VM ops, raises luaL_error caught by sol's protected_function. |
| E-8 SandboxIsolationTest expansion | applied (34378ca0) | Three new test files = 3 suites covering E-7 (infinite loop), E-5 (buffer bounds), E-3 (filesystem write). Existing LuaSandboxTests covers E-1/E-2. |

## Open questions for Glen at Gate 1

- Q-E-4: read-only Context facade not attempted. Requires structural decision: do we expose Context to Lua at all in the sandboxed path, and if yes, with what reduced surface? Suggest deferring until Phase F UI work pins down which Context calls user scripts legitimately need.
- Q-E-6: full DSPScript::validate render-side dry run remains disabled (#if 0). The original block requires a working engine + node_render harness at validation time, which is structurally fraught when the host hasn't allocated audio resources yet. Re-enabling requires a separate refactor; not a security regression because the lightweight compile check is now in place.

## Acceptance check vs master-fix-plan.md §Phase E gate

> "Test proves every banned API throws or returns nil; allowed APIs succeed; CI fails if a banned API gets re-introduced."

- Banned APIs throw / return nil: verified by LuaSandboxTests (13 cases) + SandboxIsolationTests (E-7 hook fires) + LuaBoundsTests (out-of-range raises) + NodeWriteFileTests (path-clamp returns false).
- Allowed APIs succeed: verified by LuaSandboxTests (math, string, table, coroutine, utf8) + DSPScriptTest::Basics (real DSP script loads + runs) + LuaBoundsTests/audiobuffer_in_range_get_set_succeeds + DSPScriptTest::ValidateAcceptsTrivialReturnTable.
- CI gate: ctest 51 / 51 green; any banned API re-exposure breaks LuaSandboxTests.

Acceptance gate: PASS.
