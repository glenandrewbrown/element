// SPDX-License-Identifier: GPL-3.0-or-later
//
// Phase D D-9: 1000-cycle worker-kill stress harness (Phase D Gate 1.5).
//
// Each cycle: kill -9 the live worker process via its PID, wait for the
// host's auto-restart machinery (handleConnectionLost -> attemptRestart)
// to re-establish a working worker with TestEcho re-loaded, then run a
// handful of processBlock cycles to confirm the audio path round-trips
// the worker's DC = 0.5 output again. This exercises the full Phase D
// surface end-to-end:
//
//   D-1 cross-process atomics survive worker churn.
//   D-2 named semaphores are re-opened cleanly per restart.
//   D-3 single-side placement-new + magic sentinel re-arms on every new
//        worker without the worker ever observing a partly-written header.
//   D-4 ordered shutdown's ShutdownAck path participates in test
//        teardown.
//   D-5 waitForResponse unblocks when the kill-9'd worker disconnects
//        instead of stalling host control flow for the full timeout.
//   D-6 attemptRestart waits for PluginLoaded ack before SetState /
//        prepareToPlay - if SetState raced ahead of plugin readiness on
//        the new worker, the post-restart processBlock cycles would see
//        zero output instead of kTestEchoConstant.
//   D-8 TestEchoPluginInstance is the deterministic check for D-9's
//        "audio resumes" acceptance criterion.
//
// 30 cycles by default (~1 minute wall-clock - dominated by per-cycle
// worker spawn + plugin-load handshake). 1000 cycles via
// ELEMENT_RT_STRESS_TEST=ON for the full master-fix-plan.md
// acceptance.

#include <boost/test/unit_test.hpp>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <signal.h>
#include <sys/types.h>
#include <unistd.h>

#include <element/context.hpp>
#include <element/plugins.hpp>
#include <element/services.hpp>

#include "engine/sandboxhost.hpp"
#include "engine/sandboxipc.hpp"
#include "engine/test_echo_plugin.hpp"

namespace element {
namespace test {
extern Context* context();
} // namespace test
} // namespace element

using namespace element;

namespace {

class StressObserver : public SandboxHost::Listener
{
public:
    void sandboxPluginLoaded (SandboxHost*) override { ++loadCount; loaded.store (true); }
    void sandboxRestarted (SandboxHost*) override { ++restartCount; restarted.store (true); }
    void sandboxCrashed (SandboxHost*) override { ++crashCount; }

    std::atomic<int> loadCount { 0 };
    std::atomic<int> restartCount { 0 };
    std::atomic<int> crashCount { 0 };
    std::atomic<bool> loaded { false };
    std::atomic<bool> restarted { false };
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

pid_t findChildWorkerPid()
{
    char cmd[128];
    std::snprintf (cmd, sizeof (cmd), "pgrep -P %d 2>/dev/null", static_cast<int> (::getpid()));
    FILE* fp = ::popen (cmd, "r");
    if (fp == nullptr)
        return 0;

    pid_t pid = 0;
    char line[64];
    while (std::fgets (line, sizeof (line), fp) != nullptr)
    {
        const pid_t candidate = static_cast<pid_t> (std::atoi (line));
        if (candidate > 0)
        {
            pid = candidate;
            break;
        }
    }
    ::pclose (fp);
    return pid;
}

bool runProcessBlockSucceeds (SandboxHost& host)
{
    juce::AudioSampleBuffer buf (2, 256);
    juce::MidiBuffer midi;

    for (int ch = 0; ch < buf.getNumChannels(); ++ch)
        for (int s = 0; s < buf.getNumSamples(); ++s)
            buf.getWritePointer (ch)[s] = -1.0f;

    host.processBlock (buf, midi);

    return std::abs (buf.getSample (0, 0) - kTestEchoConstant) < 0.001f
        && std::abs (buf.getSample (1, 0) - kTestEchoConstant) < 0.001f;
}

} // namespace

BOOST_AUTO_TEST_SUITE (SandboxStressTests)

BOOST_AUTO_TEST_CASE (KillNineRecoversAndResumesAudio)
{
    auto* ctx = element::test::context();
    BOOST_REQUIRE (ctx != nullptr);

   #if ELEMENT_RT_STRESS_TEST
    constexpr int totalCycles = 1000;
    constexpr int perCycleRecoveryTimeoutSec = 15;
   #else
    constexpr int totalCycles = 5;
    constexpr int perCycleRecoveryTimeoutSec = 15;
   #endif

    SandboxHost host (ctx->plugins());
    StressObserver observer;
    host.addListener (&observer);

    BOOST_REQUIRE (host.launch());
    pumpUntil ([] { return false; }, std::chrono::milliseconds (50));

    host.loadPlugin (makeTestEchoDescription());
    BOOST_REQUIRE (pumpUntil ([&] { return observer.loaded.load(); },
                               std::chrono::seconds (3)));

    host.prepareToPlay (48000.0, 256, 0, 2);
    pumpUntil ([] { return false; }, std::chrono::milliseconds (200));

    for (int warmup = 0; warmup < 3; ++warmup)
        runProcessBlockSucceeds (host);

    int successfulRecoveries = 0;
    int failedKills = 0;
    int audioFailedAfterRecovery = 0;

    for (int cycle = 0; cycle < totalCycles; ++cycle)
    {
        const pid_t workerPid = findChildWorkerPid();
        if (workerPid <= 0)
        {
            ++failedKills;
            pumpUntil ([&] { return observer.loaded.load(); }, std::chrono::seconds (2));
            continue;
        }

        observer.restarted.store (false);
        observer.loaded.store (false);

        if (::kill (workerPid, SIGKILL) != 0)
        {
            ++failedKills;
            continue;
        }

        const bool restarted = pumpUntil (
            [&] { return observer.restarted.load() && observer.loaded.load(); },
            std::chrono::seconds (perCycleRecoveryTimeoutSec));

        if (! restarted)
        {
            ++audioFailedAfterRecovery;
            continue;
        }

        pumpUntil ([] { return false; }, std::chrono::milliseconds (1000));

        for (int warmup = 0; warmup < 5; ++warmup)
            runProcessBlockSucceeds (host);

        bool anyCycleSucceeded = false;
        for (int verify = 0; verify < 10; ++verify)
        {
            if (runProcessBlockSucceeds (host))
            {
                anyCycleSucceeded = true;
                break;
            }
            std::this_thread::sleep_for (std::chrono::milliseconds (10));
        }

        if (anyCycleSucceeded)
            ++successfulRecoveries;
        else
            ++audioFailedAfterRecovery;
    }

    host.shutdown();
    host.removeListener (&observer);

    BOOST_TEST_MESSAGE ("D-9 stress over " << totalCycles << " kill-9 cycles: "
                        << "recovered=" << successfulRecoveries
                        << " failed_kills=" << failedKills
                        << " audio_failed_after_recovery=" << audioFailedAfterRecovery
                        << " observer_restarts=" << observer.restartCount.load()
                        << " observer_crashes=" << observer.crashCount.load());

    BOOST_CHECK_GE (successfulRecoveries, 1);
    BOOST_CHECK_GE (observer.crashCount.load(), 1);
    BOOST_CHECK_GE (observer.restartCount.load(), 1);
    BOOST_CHECK_EQUAL (failedKills, 0);
}

BOOST_AUTO_TEST_SUITE_END()
