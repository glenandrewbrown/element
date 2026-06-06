<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/webview/ — Webview bridge contract tests

C++ side of the JS→native bridge contract. Tests exercise real
`SessionService` and `Context` through the bridge's registered lambda map
without requiring a live `WebBrowserComponent` or running React frontend.
All tests run on the message thread (guaranteed by `JuceMessageManagerFixture`
in `TestMain.cpp`).

## Key Files

| File | Suite | Guards |
|------|-------|--------|
| `BridgeContractTest.cpp` | `BridgeContractTests` | 5 representative native-bridge functions exercised via `invokeForTest`; asserts JSON response shapes. Host constructed with `skipBrowser=true` — no WebView window created. |
| `ContainerDiveTest.cpp` | `ContainerDiveTests` | End-to-end `elementEnterContainer`/`elementExitContainer` through the real C++ resolver against a real `Session` with a real nested-`Graph` (Container) child. Closes the coverage gap where `useGraphStore` dive unit tests mocked `nativeEnterContainer` and never exercised the C++ side. |

## For AI Agents

```bash
cd build-merged && ctest -R "BridgeContract|ContainerDive" --output-on-failure
./test_element --run_test=BridgeContractTests
./test_element --run_test=ContainerDiveTests
```

- These tests are the C++ regression gate for the webview bridge — run them
  after any change to `src/ui/element_webview_host.cpp` or the native
  function registry.
- New `.cpp` requires cmake reconfigure + `add_test()` in `test/CMakeLists.txt`.
- Do not create a `WebBrowserComponent` in these tests — use `skipBrowser=true`
  or `invokeForTest` to stay headless.
