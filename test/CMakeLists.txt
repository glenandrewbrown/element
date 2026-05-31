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
add_test(NAME "SandboxStressTests" COMMAND test_element --run_test=SandboxStressTests)
set_tests_properties(SandboxStressTests PROPERTIES RUN_SERIAL TRUE TIMEOUT 180)

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
add_test(NAME "MatrixStateTests" COMMAND test_element --run_test=MatrixStateTests)
add_test(NAME "RingBufferTests" COMMAND test_element --run_test=RingBufferTests)
add_test(NAME "MidiChannelsTests" COMMAND test_element --run_test=MidiChannelsTests)
add_test(NAME "RerouteNodeTests" COMMAND test_element --run_test=RerouteNodeTests)
add_test(NAME "BinaryMathNodeTests" COMMAND test_element --run_test=BinaryMathNodeTests)
add_test(NAME "LinearFadeFadeInTest" COMMAND test_element --run_test=LinearFadeFadeInTest)
add_test(NAME "NodeEdgeCaseTests" COMMAND test_element --run_test=NodeEdgeCaseTests)

# Phase I — DSP node, parameter, and engine coverage extension.
add_test(NAME "EQFilterTests"          COMMAND test_element --run_test=EQFilterTests)
add_test(NAME "CompressorTests"        COMMAND test_element --run_test=CompressorTests)
add_test(NAME "MidiRouterNodeTests"    COMMAND test_element --run_test=MidiRouterNodeTests)
add_test(NAME "MidiSetListTests"       COMMAND test_element --run_test=MidiSetListTests)
add_test(NAME "ParameterTests"         COMMAND test_element --run_test=ParameterTests)
add_test(NAME "MidiEngineTests"        COMMAND test_element --run_test=MidiEngineTests)
add_test(NAME "AudioFilePlayerTests"   COMMAND test_element --run_test=AudioFilePlayerTests)

# Phase J — GraphManager, untested nodes, integration gaps
add_test(NAME "GraphManagerTests"          COMMAND test_element --run_test=GraphManagerTests)
add_test(NAME "GraphManagerConnectionTests" COMMAND test_element --run_test=GraphManagerConnectionTests)
add_test(NAME "GraphManagerChangeTests"    COMMAND test_element --run_test=GraphManagerChangeTests)
add_test(NAME "AudioMixerProcessorTests"   COMMAND test_element --run_test=AudioMixerProcessorTests)
add_test(NAME "MidiMonitorNodeTests"       COMMAND test_element --run_test=MidiMonitorNodeTests)
add_test(NAME "ConstantNodeTests"          COMMAND test_element --run_test=ConstantNodeTests)
add_test(NAME "HasChanged_not_flagged_after_reset" COMMAND test_element --run_test=SessionChangedTest/HasChanged_not_flagged_after_reset)
add_test(NAME "VolumeProcessorTests"       COMMAND test_element --run_test=VolumeProcessorTests)
add_test(NAME "SpinLockTests"              COMMAND test_element --run_test=SpinLockTests)
add_test(NAME "PlaceholderProcessorTests"  COMMAND test_element --run_test=PlaceholderProcessorTests)

# Phase K — infrastructure gaps: Arc/ArcTable, WebMeteringFifo, LinkedList,
#           MidiPipe, PortCount, MidiIOMonitor, Transport::Monitor
add_test(NAME "ArcTests"               COMMAND test_element --run_test=ArcTests)
add_test(NAME "WebMeteringFifoTests"   COMMAND test_element --run_test=WebMeteringFifoTests)
add_test(NAME "LinkedListTests"        COMMAND test_element --run_test=LinkedListTests)
add_test(NAME "MidiPipeTests"          COMMAND test_element --run_test=MidiPipeTests)
add_test(NAME "PortCountTests"         COMMAND test_element --run_test=PortCountTests)
add_test(NAME "MidiIOMonitorTests"     COMMAND test_element --run_test=MidiIOMonitorTests)
add_test(NAME "TransportMonitorTests"  COMMAND test_element --run_test=TransportMonitorTests)

# Phase L — previously compiled but unregistered suites (ctest-invisible until now)
add_test(NAME "AudioEngineTests"             COMMAND test_element --run_test=AudioEngineTests)
add_test(NAME "GraphBuilderTests"            COMMAND test_element --run_test=GraphBuilderTests)
add_test(NAME "GraphNodeMidiChannelTests"    COMMAND test_element --run_test=GraphNodeMidiChannelTests)
add_test(NAME "MidiPanicTests"              COMMAND test_element --run_test=MidiPanicTests)
add_test(NAME "MidiTransposeTests"          COMMAND test_element --run_test=MidiTransposeTests)
add_test(NAME "MappingEngineTests"          COMMAND test_element --run_test=MappingEngineTests)
add_test(NAME "MidiChannelFilterNodeTests"  COMMAND test_element --run_test=MidiChannelFilterNodeTests)
add_test(NAME "MidiChannelSplitterTests"    COMMAND test_element --run_test=MidiChannelSplitterTests)
add_test(NAME "SandboxedProcessorNodeTests" COMMAND test_element --run_test=SandboxedProcessorNodeTests)
add_test(NAME "PortBufferTests"             COMMAND test_element --run_test=PortBufferTests)
add_test(NAME "NodeFactoryExtendedTests"    COMMAND test_element --run_test=NodeFactoryExtendedTests)

# Block category mapping (4-category V3 taxonomy)
add_test(NAME "BlockCategoryMapTests" COMMAND test_element --run_test=BlockCategoryMapTests)

# Phase M — new node coverage: TriggerNode, MidiVelocityAmpNode,
#           PackMidiNode, UnpackMidiNode, WetDryProcessor
add_test(NAME "TriggerNodeTests"        COMMAND test_element --run_test=TriggerNodeTests)
add_test(NAME "MidiVelocityAmpTests"    COMMAND test_element --run_test=MidiVelocityAmpTests)
add_test(NAME "PackMidiNodeTests"       COMMAND test_element --run_test=PackMidiNodeTests)
add_test(NAME "UnpackMidiNodeTests"     COMMAND test_element --run_test=UnpackMidiNodeTests)
add_test(NAME "WetDryProcessorTests"    COMMAND test_element --run_test=WetDryProcessorTests)

# Phase N — coverage-gap skeletons: graph edge-cases, MIDI error handling,
#            Lua stress/sandbox, DSP robustness
add_test(NAME "GraphConnectionValidationTests" COMMAND test_element --run_test=GraphConnectionValidationTests)
add_test(NAME "GraphTopologyRobustnessTests"   COMMAND test_element --run_test=GraphTopologyRobustnessTests)
add_test(NAME "GraphBuilderEdgeCaseTests"      COMMAND test_element --run_test=GraphBuilderEdgeCaseTests)
add_test(NAME "MidiErrorHandlingTests"         COMMAND test_element --run_test=MidiErrorHandlingTests)
add_test(NAME "MidiEdgeCaseMessageTests"       COMMAND test_element --run_test=MidiEdgeCaseMessageTests)
add_test(NAME "LuaStressTests"                 COMMAND test_element --run_test=LuaStressTests)
add_test(NAME "LuaSandboxBoundaryTests"        COMMAND test_element --run_test=LuaSandboxBoundaryTests)
add_test(NAME "DspRobustnessTests"             COMMAND test_element --run_test=DspRobustnessTests)
add_test(NAME "DspStateRoundTripTests"         COMMAND test_element --run_test=DspStateRoundTripTests)

option(ELEMENT_RT_STRESS_TEST "Build and register the audio-thread stress test" OFF)
if (ELEMENT_RT_STRESS_TEST)
    target_compile_definitions(test_element PRIVATE ELEMENT_RT_STRESS_TEST=1)
    add_test(NAME "AudioThreadAllocationStressTests" COMMAND test_element --run_test=AudioThreadAllocationStressTests)
endif()
