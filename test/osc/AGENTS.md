<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/osc/ — OSC tests

Tests for the OSC protocol surface. The `node-client/` subdirectory holds a
Node.js reference client used for manual/interactive OSC testing against a
running Element instance — it is not executed by `ctest`.

## Key Files

| Path | Purpose |
|------|---------|
| `node-client/` | Node.js OSC client (`npm install` then run manually); requires Node.js. See `node-client/README.md` for usage. Not a Boost.Test suite — excluded from `ctest`. |

Note: OSC service unit tests (lifecycle, input validation, sender) live in
`test/services/OSCServiceTest.cpp` (`OSCServiceTests`,
`OSCServiceSenderLifecycleTests`, `OSCServiceInputValidationTests`).

## For AI Agents

```bash
# OSC service suites (in services/, not here):
cd build-merged && ctest -R "OSCService" --output-on-failure

# Manual OSC client (requires Element running with OSC enabled):
cd test/osc/node-client && npm install && node index.js
```

- Do not add Boost.Test `.cpp` files directly into `osc/` without also
  updating `test/CMakeLists.txt` and reconfiguring cmake.
- The `node-client/` directory is intentionally not a C++ test target.
