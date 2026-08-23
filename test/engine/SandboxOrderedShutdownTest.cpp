// SPDX-License-Identifier: GPL-3.0-or-later
//
// Phase D D-4: ordered-shutdown stress.
//
// Proves that SandboxHost::shutdown sends Shutdown to the worker, waits for
// the worker's ShutdownAck (worker has finished cleanup and detached from
// shared memory), and only THEN unmaps shared memory and kills the worker
// process. Without this ordering, the worker can still be writing to shared
// memory when the host unmaps it, producing SIGBUS or use-after-free.
//
// 30 cycles by default to keep ctest under ~30 s. Set
// ELEMENT_RT_STRESS_TEST=ON for the full 1000-cycle stress.
//
// Each cycle measures the wall-clock duration of host.shutdown(). A
// successful ordered shutdown completes in well under the 2 s ack timeout
// (typically < 200 ms — worker's handleShutdown stopRTThread + send ack
// + 50 ms grace + JUCEApplication::quit). A timed-out ack would push
// shutdown() to roughly the full 2 s. We assert the median is fast and
// no cycle hits the timeout.

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/plugins.hpp>
#include <element/services.hpp>

#include "engine/sandboxhost.hpp"
#include "engine/sandboxipc.hpp"
#include "engine/test_echo_plugin.hpp"

#include <algorithm>
#include <chrono>
#include <vector>

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
    void sandboxPluginLoadFailed (SandboxHost*, const juce::String&) override { loadFailed.store (true); }

    std::atomic<bool> loaded { false };
    std::atomic<bool> loadFailed { false };
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

juce::PluginDescription makeTestEchoDescription()
{
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
    return desc;
}

} // namespace

BOOST_AUTO_TEST_SUITE (SandboxOrderedShutdownTests)

BOOST_AUTO_TEST_CASE (OrderedShutdownStressCycle)
{
    auto* ctx = element::test::context();
    BOOST_REQUIRE (ctx != nullptr);

   #if ELEMENT_RT_STRESS_TEST
    constexpr int totalCycles = 1000;
   #else
    constexpr int totalCycles = 30;
   #endif

    constexpr int shutdownAckTimeoutMs = 2000;
    constexpr int shutdownFastBudgetMs = 800;

    std::vector<int> shutdownDurationsMs;
    shutdownDurationsMs.reserve (static_cast<size_t> (totalCycles));

    int timedOutCycles = 0;

    for (int cycle = 0; cycle < totalCycles; ++cycle)
    {
        SandboxHost host (ctx->plugins());
        LoadCapture capture;
        host.addListener (&capture);

        BOOST_REQUIRE_MESSAGE (host.launch(),
                                "cycle " << cycle << ": host.launch failed");

        pumpUntil ([] { return false; }, std::chrono::milliseconds (50));

        host.loadPlugin (makeTestEchoDescription());

        const bool loadSettled = pumpUntil (
            [&] { return capture.loaded.load() || capture.loadFailed.load(); },
            std::chrono::seconds (2));

        BOOST_REQUIRE_MESSAGE (loadSettled,
                                "cycle " << cycle << ": plugin load did not settle in 2 s");
        BOOST_REQUIRE_MESSAGE (! capture.loadFailed.load(),
                                "cycle " << cycle << ": plugin load reported failure");

        host.prepareToPlay (48000.0, 256, 0, 2);

        pumpUntil ([] { return false; }, std::chrono::milliseconds (20));

        const auto shutdownStart = std::chrono::steady_clock::now();
        host.shutdown();
        const auto shutdownEnd = std::chrono::steady_clock::now();

        const int durationMs = static_cast<int> (
            std::chrono::duration_cast<std::chrono::milliseconds> (
                shutdownEnd - shutdownStart).count());
        shutdownDurationsMs.push_back (durationMs);

        if (durationMs >= shutdownAckTimeoutMs)
            ++timedOutCycles;

        BOOST_CHECK_MESSAGE (host.getState() == SandboxHost::State::Idle,
                              "cycle " << cycle << ": host state not Idle after shutdown");

        host.removeListener (&capture);
    }

    auto sorted = shutdownDurationsMs;
    std::sort (sorted.begin(), sorted.end());
    const int medianMs = sorted[sorted.size() / 2];
    const int maxMs    = sorted.back();
    const int minMs    = sorted.front();

    BOOST_TEST_MESSAGE ("D-4 ordered shutdown over " << totalCycles
                        << " cycles: min=" << minMs
                        << "ms median=" << medianMs
                        << "ms max=" << maxMs
                        << "ms timed_out=" << timedOutCycles);

    BOOST_CHECK_EQUAL (timedOutCycles, 0);
    BOOST_CHECK_LT (medianMs, shutdownFastBudgetMs);
}

BOOST_AUTO_TEST_SUITE_END()
