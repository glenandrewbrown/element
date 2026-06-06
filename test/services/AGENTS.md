<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-06 | Updated: 2026-06-06 -->

# test/services/ — Service-layer tests

Unit tests for each application service. All use `ServicesFixture`
(`fixture/ServicesFixture.hpp`) which provides a fully-initialised
`RunMode::Standalone` `Context` via `test::context()`.

## Key Files

| File | Suite(s) | Guards |
|------|----------|--------|
| `DeviceServiceTest.cpp` | `DeviceServiceTests` `DeviceServiceObserverTests` `DeviceServiceControllerTests` | `DeviceService` device enumeration, observer notifications, controller mapping lifecycle |
| `EngineServiceTest.cpp` | `EngineServiceTests` `EngineServiceObserverTests` `EngineServiceErrorTests` | `EngineService` graph activate/deactivate, observer callbacks, error handling |
| `GuiServiceTest.cpp` | `GuiServiceTests` `GuiServiceObserverTests` `GuiServiceAccessorTests` | `GuiService` content accessors, observer lifecycle |
| `MappingServiceTest.cpp` | `MappingServiceTests` `MappingServiceLearnModeTests` `MappingServiceRemovalTests` | `MappingService` MIDI learn mode, mapping add/remove |
| `OSCServiceTest.cpp` | `OSCServiceTests` `OSCServiceSenderLifecycleTests` `OSCServiceInputValidationTests` | `OSCService` sender open/close lifecycle, input validation, port conflict handling |
| `PresetServiceTest.cpp` | `PresetServiceTests` `PresetServiceRefreshTests` `PresetServiceAddTests` | `PresetService` preset enumeration, refresh, add |
| `SessionServiceTest.cpp` | `SessionServiceTests` `SessionServiceObserverTests` `SessionServiceFileOpsTests` | `SessionServiceTests` load/save/new, observer notifications, file operation error paths |

## For AI Agents

```bash
cd build-merged && ctest -R "ServiceTests|ServiceObserver|ServiceError|ServiceFile|ServiceLearn|ServiceRemoval|ServiceRefresh|ServiceAdd|ServiceLifecycle|ServiceController|ServiceInput|ServiceSender|ServiceAccessor" --output-on-failure
# Or run the whole services group:
./test_element --run_test=DeviceServiceTests
```

- Each service has its own file matching `<ServiceName>Test.cpp`.
- New `.cpp` requires cmake reconfigure + `add_test()` in `test/CMakeLists.txt`.
- `test::context()` is reset between test suites by `JuceMessageManagerFixture` — do not share state across suites.
