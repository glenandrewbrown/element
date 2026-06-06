<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/realtime/ — Realtime-safety tests

Guards the invariant that audio-thread `render()` paths never allocate
heap memory during steady-state processing. A single global `new`/`delete`
interposer is defined here — do NOT define another in any other test file
(ODR violation).

## Key Files

| File | Suite(s) | Guards |
|------|----------|--------|
| `AudioThreadAllocationTest.cpp` | `AudioThreadAllocationTests` `AudioThreadAllocationStressTests` | Global `operator new`/`delete` interposer armed around `render()` calls; fails if any allocation occurs on the audio thread. Smoke variant: small graph, ~100 renders at 48 kHz. Stress variant: sustained load. |

## For AI Agents

```bash
cd build-merged && ctest -R "AudioThreadAllocation" --output-on-failure
./test_element --run_test=AudioThreadAllocationTests
```

- The global allocator interposer is **binary-wide** in `test_element` — the
  `SpectrumAnalyserTest` in `engine/` explicitly notes it does not add a
  second interposer for this reason.
- If a new audio-path allocation is introduced (even indirectly via JUCE),
  this suite will catch it. Fix by pre-allocating in `prepareToRender()`.
- New `.cpp` requires cmake reconfigure + `add_test()` in `test/CMakeLists.txt`.
