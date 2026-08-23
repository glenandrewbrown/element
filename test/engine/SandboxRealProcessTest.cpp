// SPDX-License-Identifier: GPL-3.0-or-later
//
// Phase D D-8: end-to-end SandboxHost ⇄ SandboxWorker test that re-execs
// the test_element binary as a real worker subprocess, loads the in-tree
// `TestEchoPluginInstance` (registered only when test_element is built
// with EL_SANDBOX_INCLUDE_TEST_FORMATS), runs `processBlock` cycles over
// real shared-memory + cross-process semaphores, and asserts the worker's
// hardcoded DC output round-trips back through the audio buffer.
//
// Distinct from `SandboxParameterRoundTripTest` (in-process serialisation
// only, no subprocess). This test is RUN_SERIAL because it owns POSIX
// shm + sem names per host PID.

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/plugins.hpp>
#include <element/services.hpp>

#include "engine/sandboxhost.hpp"
#include "engine/sandboxipc.hpp"
#include "engine/test_echo_plugin.hpp"

#include <atomic>
#include <chrono>

namespace element {
namespace test {
extern Context* context();
} // namespace test
} // namespace element

using namespace element;

namespace {

class LoadCapture : public SandboxHost::Listener
{
public:
    void sandboxPluginLoaded (SandboxHost*) override { loaded.store (true); }
    void sandboxPluginLoadFailed (SandboxHost*, const juce::String& error) override
    {
        loadFailed.store (true);
        failureReason = error;
    }

    std::atomic<bool> loaded { false };
    std::atomic<bool> loadFailed { false };
    juce::String failureReason;
};

bool pumpUntil (std::function<bool()> predicate,
                std::chrono::milliseconds budget)
{
    const auto deadline = std::chrono::steady_clock::now() + budget;
    while (std::chrono::steady_clock::now() < deadline)
    {
        if (predicate())
            return true;
        juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
    }
    return predicate();
}

} // namespace

//==============================================================================
BOOST_AUTO_TEST_SUITE (SandboxRealProcessTests)

BOOST_AUTO_TEST_CASE (RealProcessRoundTrip)
{
    auto* ctx = element::test::context();
    BOOST_REQUIRE (ctx != nullptr);

    SandboxHost host (ctx->plugins());
    LoadCapture capture;
    host.addListener (&capture);

    BOOST_REQUIRE (host.launch());
    BOOST_CHECK (host.getState() == SandboxHost::State::Ready);

    pumpUntil ([] { return false; }, std::chrono::milliseconds (300));

    juce::PluginDescription desc;
    desc.name              = kTestEchoIdentifier;
    desc.descriptiveName   = "Element Test Echo";
    desc.pluginFormatName  = kTestEchoFormatName;
    desc.fileOrIdentifier  = kTestEchoIdentifier;
    desc.category          = "Effect";
    desc.manufacturerName  = "Element";
    desc.version           = "1.0";
    desc.uniqueId          = kTestEchoUniqueId;
    desc.deprecatedUid     = kTestEchoUniqueId;
    desc.numInputChannels  = 0;
    desc.numOutputChannels = 2;
    desc.isInstrument      = false;

    host.loadPlugin (desc);

    const bool loadSettled = pumpUntil (
        [&] { return capture.loaded.load() || capture.loadFailed.load(); },
        std::chrono::seconds (5));

    BOOST_REQUIRE_MESSAGE (loadSettled, "Plugin load did not settle within 5 s");
    BOOST_REQUIRE_MESSAGE (! capture.loadFailed.load(),
                            "Plugin load failed: " + capture.failureReason.toStdString());
    BOOST_REQUIRE (capture.loaded.load());

    host.prepareToPlay (48000.0, 256, 0, 2);

    pumpUntil ([] { return false; }, std::chrono::milliseconds (300));

    juce::AudioSampleBuffer buf (2, 256);
    juce::MidiBuffer midi;

    for (int warmup = 0; warmup < 3; ++warmup)
    {
        host.processBlock (buf, midi);
    }

    int successfulCycles = 0;
    constexpr int totalCycles = 10;
    constexpr int requiredSuccesses = 8;

    for (int cycle = 0; cycle < totalCycles; ++cycle)
    {
        for (int ch = 0; ch < buf.getNumChannels(); ++ch)
            for (int s = 0; s < buf.getNumSamples(); ++s)
                buf.getWritePointer (ch)[s] = -1.0f;

        host.processBlock (buf, midi);

        const bool ch0First = std::abs (buf.getSample (0, 0) - kTestEchoConstant) < 0.001f;
        const bool ch1First = std::abs (buf.getSample (1, 0) - kTestEchoConstant) < 0.001f;
        const bool ch0Last  = std::abs (buf.getSample (0, buf.getNumSamples() - 1) - kTestEchoConstant) < 0.001f;

        if (ch0First && ch1First && ch0Last)
            ++successfulCycles;
    }

    BOOST_CHECK_GE (successfulCycles, requiredSuccesses);
    BOOST_TEST_MESSAGE ("D-8 round-trip: " << successfulCycles << "/" << totalCycles
                        << " cycles delivered worker output (need >= " << requiredSuccesses << ")");

    host.removeListener (&capture);
    host.shutdown();
    BOOST_CHECK (host.getState() == SandboxHost::State::Idle);
}

BOOST_AUTO_TEST_SUITE_END()
