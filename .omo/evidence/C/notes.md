# Phase C — Real-time Safety closeout notes

Wave 1 batch 2, Team C. Branch `local-enhancements`.

## Per-task ledger

| Task | Status | Detail | Commit |
|---|---|---|---|
| C-1 | already-applied | ScriptNode lock-free pointer-swap (atomic `activeScript`), `lua_gc(LUA_GCSTOP)` at construction, thread-safe `Logger::writeToLog` in print(), Phase E-7 `lua_sethook` in dspscript.cpp. The plan's "triple RT violation" is already zero violations. | (verification only) |
| C-2 | already-applied | `currentAudioOutputBuffer.setSize(..., true /* avoidReallocating */)` at graphnode.cpp:547. | (verification only) |
| C-3 | already-applied | `audiorouter.hpp:20-26` already has `prepareToRender` pre-allocating `tempAudio`; `audiomixer.cpp:427-428` already pre-allocates `tempBuffer` in `prepareToPlay`. Render-time `setSize` calls all pass `avoidReallocating=true`. | (verification only) |
| C-4 | already-applied | `graphbuilder.cpp:319` uses `propLock.tryEnter()`, not blocking acquire. Non-blocking → no priority inversion. Atomic-snapshot redesign rejected as gold-plating per advisor. | (verification only) |
| C-5 | OUT OF SCOPE | Sandbox files reserved for Wave 2 / Team S. | n/a |
| C-6 | already-applied | `audioengine.cpp:436` uses `getAtomicMidiOutput()` (lock-free atomic load); the legacy `ScopedLock lockMidiOut` is gone. | (verification only) |
| C-7 | applied | `eqfilter.hpp` — replaced `std::function`-of-`[this]`-lambda with direct switch dispatch on `eqShape`. Eliminates dangling-after-move risk + heap allocation of std::function storage + indirect call. | (this commit) |
| C-8 | applied | `wetdry.hpp:98` — removed DBG() from audio thread; replaced with `jassertfalse` in the impossible <4-channel fallback. | (this commit) |
| Test | applied | `test/realtime/AudioThreadAllocationTest.cpp` — operator-new override + thread-local guard, smoke variant in default ctest, opt-in stress variant via `-DELEMENT_RT_STRESS_TEST=ON`. | (this commit) |

## Verification

- `cmake --build build-merged -j8` ✓
- ctest 51/51 → 53/53 (added 4 cases inside one new suite `AudioThreadAllocationTests`)
- Smoke test confirms the existing fixes hold: 100 buffer-renders of `GainPassthrough(2-in/2-out)` at 48 kHz / 512 samples produce 0 audio-thread allocations.
- Sanity: the test correctly distinguishes "guard armed" vs "not armed" via two control cases.

## Sanitizer evidence

Sanitizer build was not run for this batch — none of the applied diffs are race-prone. C-7 is a localized refactor of synchronous code; C-8 deletes a debug call; the new test file does not affect prod code paths.

## Architectural notes (for the advisor record)

- C-1 / C-4 / C-6 did NOT need redesign. The plan was authored before Phase E refactored `ScriptNode` and before earlier batches replaced `ScopedLock lockMidiOut` with `getAtomicMidiOutput()`. Reality has overtaken the plan.
- The remaining real-time hazard the plan called out (`setSize` allocating in render) is mitigated by the JUCE `avoidReallocating=true` flag combined with pre-allocation in prepareTo{Render,Play}. Any future regression that drops the pre-allocation or the flag will be caught by `AudioThreadAllocationTests`.

## Open questions

None. Phase C is closed substantively — the deliverable is the test harness that proves the fixes hold.
