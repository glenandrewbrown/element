<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/dsp/ — DSP robustness tests

Tests for extreme-input and edge-case DSP conditions not covered by the
node-functional suites in `test/engine/`. Uses `PreparedGraph` +
`TestNode` fixtures.

## Key Files

| File | Suite(s) | Guards |
|------|----------|--------|
| `DspRobustnessTests.cpp` | `DspRobustnessTests` `DspStateRoundTripTests` | Extreme input values (NaN, ±Inf, denormals), zero-length buffers, single-sample buffers, sustained-load stability; state serialization round-trips under boundary conditions |

## For AI Agents

```bash
cd build-merged && ctest -R "DspRobustness|DspStateRoundTrip" --output-on-failure
./test_element --run_test=DspRobustnessTests
```

- New `.cpp` requires cmake reconfigure + `add_test()` in `test/CMakeLists.txt`.
- Do not add functional node tests here — those belong in `test/engine/`.
  This suite is specifically for inputs that stress numerical stability.
