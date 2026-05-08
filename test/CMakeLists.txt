# SPDX-FileCopyrightText: 2026 Kushview, LLC
# SPDX-License-Identifier: GPL-3.0-or-later

file(GLOB_RECURSE TEST_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/*.cpp")

juce_add_console_app(test_element)
target_sources(test_element PRIVATE ${TEST_SOURCES})
target_link_libraries(test_element PRIVATE kv::element)
target_include_directories(test_element 
    PRIVATE 
        "${CMAKE_CURRENT_SOURCE_DIR}"
        ${GENERATED_INCLUDE_DIR}
        ${Boost_INCLUDE_DIRS})
target_compile_definitions(test_element
    PRIVATE
        EL_TEST_SOURCE_ROOT="${CMAKE_SOURCE_DIR}"
        EL_SANDBOX_INCLUDE_TEST_FORMATS=1)

# Register all test suites with CTest
add_test(NAME "AtomicValueTests" COMMAND test_element --run_test=AtomicValueTests)
add_test(NAME "AtomicLockTests" COMMAND test_element --run_test=AtomicLockTests)
add_test(NAME "AudioRoutingTests" COMMAND test_element --run_test=AudioRoutingTests)
add_test(NAME "BytesTest" COMMAND test_element --run_test=BytesTest)
add_test(NAME "JuceIntegrationTests" COMMAND test_element --run_test=JuceIntegrationTests)
add_test(NAME "DataPathTests" COMMAND test_element --run_test=DataPathTests)
add_test(NAME "DSPScriptTest" COMMAND test_element --run_test=DSPScriptTest)
add_test(NAME "Element" COMMAND test_element --run_test=Element)
add_test(NAME "GraphNodeTests" COMMAND test_element --run_test=GraphNodeTests)
add_test(NAME "GzipTests" COMMAND test_element --run_test=GzipTests)
add_test(NAME "IONodeTests" COMMAND test_element --run_test=IONodeTests)
add_test(NAME "LinearFadeTest" COMMAND test_element --run_test=LinearFadeTest)
add_test(NAME "MidiChannelMapTest" COMMAND test_element --run_test=MidiChannelMapTest)
add_test(NAME "MidiClockTest" COMMAND test_element --run_test=MidiClockTest)
add_test(NAME "MidiProgramMapTests" COMMAND test_element --run_test=MidiProgramMapTests)
add_test(NAME "MidiScriptTests" COMMAND test_element --run_test=MidiScriptTests)
add_test(NAME "NodeFactoryTests" COMMAND test_element --run_test=NodeFactoryTests)
add_test(NAME "NodeObjectTests" COMMAND test_element --run_test=NodeObjectTests)
add_test(NAME "NodeTests" COMMAND test_element --run_test=NodeTests)
add_test(NAME "OversamplerTests" COMMAND test_element --run_test=OversamplerTests)
add_test(NAME "PluginManagerTests" COMMAND test_element --run_test=PluginManagerTests)
add_test(NAME "PortListTests" COMMAND test_element --run_test=PortListTests)
add_test(NAME "PortTypeTests" COMMAND test_element --run_test=PortTypeTests)
add_test(NAME "RootGraphTests" COMMAND test_element --run_test=RootGraphTests)
add_test(NAME "ScriptInfoTest" COMMAND test_element --run_test=ScriptInfoTest)
add_test(NAME "ScriptLoaderTest" COMMAND test_element --run_test=ScriptLoaderTest)
add_test(NAME "ScriptManagerTest" COMMAND test_element --run_test=ScriptManagerTest)
add_test(NAME "ScriptPlayground" COMMAND test_element --run_test=ScriptPlayground)
add_test(NAME "SessionChangedTest" COMMAND test_element --run_test=SessionChangedTest)
add_test(NAME "ShuttleTests" COMMAND test_element --run_test=ShuttleTests)
add_test(NAME "ToggleGridTest" COMMAND test_element --run_test=ToggleGridTest)
add_test(NAME "UpdateTests" COMMAND test_element --run_test=UpdateTests)
add_test(NAME "VelocityCurveTest" COMMAND test_element --run_test=VelocityCurveTest)
add_test(NAME "SandboxSemaphoreTests" COMMAND test_element --run_test=SandboxSemaphoreTests)
add_test(NAME "SharedAudioBufferTests" COMMAND test_element --run_test=SharedAudioBufferTests)
add_test(NAME "SandboxProtocolTests" COMMAND test_element --run_test=SandboxProtocolTests)
add_test(NAME "SettingsCredentialTests" COMMAND test_element --run_test=SettingsCredentialTests)
add_test(NAME "AtomicRenderSwapTests" COMMAND test_element --run_test=AtomicRenderSwapTests)
add_test(NAME "LuaSandboxTests" COMMAND test_element --run_test=LuaSandboxTests)
add_test(NAME "SandboxParameterRoundTripTests" COMMAND test_element --run_test=SandboxParameterRoundTripTests)
add_test(NAME "PresetServiceTests" COMMAND test_element --run_test=PresetServiceTests)
add_test(NAME "DeviceServiceTests" COMMAND test_element --run_test=DeviceServiceTests)
add_test(NAME "EngineServiceTests" COMMAND test_element --run_test=EngineServiceTests)
add_test(NAME "GuiServiceTests" COMMAND test_element --run_test=GuiServiceTests)
add_test(NAME "MappingServiceTests" COMMAND test_element --run_test=MappingServiceTests)
add_test(NAME "OSCServiceTests" COMMAND test_element --run_test=OSCServiceTests)
add_test(NAME "SessionServiceTests" COMMAND test_element --run_test=SessionServiceTests)
add_test(NAME "BridgeContractTests" COMMAND test_element --run_test=BridgeContractTests)
add_test(NAME "RootGraphMissingNodeTests" COMMAND test_element --run_test=RootGraphMissingNodeTests)
add_test(NAME "SandboxIsolationTests" COMMAND test_element --run_test=SandboxIsolationTests)
add_test(NAME "LuaBoundsTests" COMMAND test_element --run_test=LuaBoundsTests)
add_test(NAME "NodeWriteFileTests" COMMAND test_element --run_test=NodeWriteFileTests)
add_test(NAME "AudioThreadAllocationTests" COMMAND test_element --run_test=AudioThreadAllocationTests)
add_test(NAME "SandboxAtomicRefDataIntegrityTests" COMMAND test_element --run_test=SandboxAtomicRefDataIntegrityTests)
set_tests_properties(SandboxAtomicRefDataIntegrityTests PROPERTIES RUN_SERIAL TRUE)
add_test(NAME "SandboxSemaphoreCrossProcessTests" COMMAND test_element --run_test=SandboxSemaphoreCrossProcessTests)
set_tests_properties(SandboxSemaphoreCrossProcessTests PROPERTIES RUN_SERIAL TRUE)
add_test(NAME "SandboxRealProcessTests" COMMAND test_element --run_test=SandboxRealProcessTests)
set_tests_properties(SandboxRealProcessTests PROPERTIES RUN_SERIAL TRUE TIMEOUT 30)
add_test(NAME "SandboxOrderedShutdownTests" COMMAND test_element --run_test=SandboxOrderedShutdownTests)
set_tests_properties(SandboxOrderedShutdownTests PROPERTIES RUN_SERIAL TRUE TIMEOUT 60)
add_test(NAME "SandboxWaitForResponseTests" COMMAND test_element --run_test=SandboxWaitForResponseTests)
set_tests_properties(SandboxWaitForResponseTests PROPERTIES RUN_SERIAL TRUE TIMEOUT 30)

# Phase H — service-layer test coverage extension (Team H batch 3).
# Each <Service>Service<...>Tests sub-suite is registered as its own ctest
# entry so coverage shows up at the suite-count level.
add_test(NAME "DeviceServiceObserverTests" COMMAND test_element --run_test=DeviceServiceObserverTests)
add_test(NAME "DeviceServiceControllerTests" COMMAND test_element --run_test=DeviceServiceControllerTests)
add_test(NAME "EngineServiceObserverTests" COMMAND test_element --run_test=EngineServiceObserverTests)
add_test(NAME "EngineServiceErrorTests" COMMAND test_element --run_test=EngineServiceErrorTests)
add_test(NAME "GuiServiceObserverTests" COMMAND test_element --run_test=GuiServiceObserverTests)
add_test(NAME "GuiServiceAccessorTests" COMMAND test_element --run_test=GuiServiceAccessorTests)
add_test(NAME "MappingServiceLearnModeTests" COMMAND test_element --run_test=MappingServiceLearnModeTests)
add_test(NAME "MappingServiceRemovalTests" COMMAND test_element --run_test=MappingServiceRemovalTests)
add_test(NAME "OSCServiceSenderLifecycleTests" COMMAND test_element --run_test=OSCServiceSenderLifecycleTests)
add_test(NAME "OSCServiceInputValidationTests" COMMAND test_element --run_test=OSCServiceInputValidationTests)
add_test(NAME "PresetServiceRefreshTests" COMMAND test_element --run_test=PresetServiceRefreshTests)
add_test(NAME "PresetServiceAddTests" COMMAND test_element --run_test=PresetServiceAddTests)
add_test(NAME "SessionServiceObserverTests" COMMAND test_element --run_test=SessionServiceObserverTests)
add_test(NAME "SessionServiceFileOpsTests" COMMAND test_element --run_test=SessionServiceFileOpsTests)

# Phase C opt-in stress harness: 100 nodes, 60 s wall-clock — not in default
# ctest because it is wall-clock-bound and adds no extra coverage. Enable
# manually with:  cmake -B build-merged -DELEMENT_RT_STRESS_TEST=ON
option(ELEMENT_RT_STRESS_TEST "Build and register the audio-thread stress test" OFF)
if (ELEMENT_RT_STRESS_TEST)
    target_compile_definitions(test_element PRIVATE ELEMENT_RT_STRESS_TEST=1)
    add_test(NAME "AudioThreadAllocationStressTests" COMMAND test_element --run_test=AudioThreadAllocationStressTests)
endif()
