<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/integration/ — Cross-system integration tests

Tests that exercise multiple subsystems together through the full service
stack. Uses `ServicesFixture` (fully-initialised `RunMode::Standalone`
`Context` with all services active).

## Key Files

| File | Suite | Guards |
|------|-------|--------|
| `SessionChangedTest.cpp` | `SessionChangedTest` | `Session` dirty-state tracking across `SessionService` operations: load, save, modify, undo — asserts the `sessionChanged` signal fires at the right moments |

## For AI Agents

```bash
cd build-merged && ctest -R "SessionChangedTest" --output-on-failure
./test_element --run_test=SessionChangedTest
```

- New integration tests belong here when they require two or more services
  to be live simultaneously.
- New `.cpp` requires cmake reconfigure + manual `add_test()` in
  `test/CMakeLists.txt`.
