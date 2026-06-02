// SPDX-License-Identifier: GPL-3.0-or-later
//
// Sandbox crash-ISOLATION proof for the failure class the other sandbox tests
// MISS: a worker that CRASHES DURING LOAD, repeatedly.
//
// SandboxStressTest SIGKILLs a HEALTHY, already-loaded worker and asserts audio
// resumes. What that cannot reproduce — and what took the real host down with
// pluginSandboxMode=1 + ValhallaPlate — is a worker that dies BEFORE it can send
// PluginLoaded, on every relaunch. The old restart path then, per attempt:
//   * blocked the IPC connection's OWN background thread on a 5 s
//     pluginReadyEvent.wait(5000), and
//   * called killWorkerProcess()->stopThread() on that same IPC thread (a
//     SELF-JOIN),
// so two crashing loads in a row hung the host (the "attemptRestart re-entered"
// guard proved two IPC threads entered concurrently).
//
// This test loads CrashOnLoadPluginFormat (test_crash_plugin.hpp), whose
// instance factory ::abort()s the worker the instant the host asks it to
// instantiate the plugin. It asserts:
//   (a) the HOST process stays alive,
//   (b) restart attempts reach the cap, then state == Error,
//   (c) sandboxCrashed fired (badge / in-process-fallback path), and
//   (d) the whole thing completes in BOUNDED wall-time — no 5 s × N stall, no
//       hang. (d) is what proves the async/off-IPC-thread restart fix
//       independently of the macOS-only bundle-id / activation-policy concerns
//       (which a headless test cannot exercise).
//
// RUN_SERIAL: spawns subprocess workers and owns per-PID shm/sem names.

#include <boost/test/unit_test.hpp>

#include <atomic>
#include <chrono>
#include <functional>
#include <signal.h>
#include <unistd.h>

#include <element/context.hpp>
#include <element/plugins.hpp>
#include <element/services.hpp>

#include "engine/sandboxhost.hpp"
#include "engine/sandboxipc.hpp"
#include "engine/test_crash_plugin.hpp"

namespace element {
namespace test {
extern Context* context();
} // namespace test
} // namespace element

using namespace element;

namespace {

class CrashOnLoadObserver : public SandboxHost::Listener
{
public:
    void sandboxPluginLoaded (SandboxHost*) override { ++loadCount; loaded.store (true); }
    void sandboxPluginLoadFailed (SandboxHost*, const juce::String&) override { ++loadFailedCount; }
    void sandboxCrashed (SandboxHost*) override { ++crashCount; crashed.store (true); }
    void sandboxRestarted (SandboxHost*) override { ++restartCount; }

    std::atomic<int> loadCount { 0 };
    std::atomic<int> loadFailedCount { 0 };
    std::atomic<int> crashCount { 0 };
    std::atomic<int> restartCount { 0 };
    std::atomic<bool> loaded { false };
    std::atomic<bool> crashed { false };
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

juce::PluginDescription makeCrashOnLoadDescription()
{
    juce::PluginDescription desc;
    desc.name              = kCrashOnLoadIdentifier;
    desc.descriptiveName   = "Element Test Crash-On-Load";
    desc.pluginFormatName  = kCrashOnLoadFormatName;
    desc.fileOrIdentifier  = kCrashOnLoadIdentifier;
    desc.category          = "Effect";
    desc.manufacturerName  = "Element";
    desc.version           = "1.0";
    desc.uniqueId          = kCrashOnLoadUniqueId;
    desc.deprecatedUid     = kCrashOnLoadUniqueId;
    desc.numInputChannels  = 0;
    desc.numOutputChannels = 2;
    desc.isInstrument      = false;
    return desc;
}

} // namespace

//==============================================================================
BOOST_AUTO_TEST_SUITE (SandboxCrashOnLoadTests)

// A worker that crashes DURING load, every relaunch, must NOT hang or kill the
// host. The host must give up after the restart budget (state==Error) in bounded
// time.
BOOST_AUTO_TEST_CASE (RepeatedLoadCrashGivesUpBoundedWithoutHangingHost)
{
    auto* ctx = element::test::context();
    BOOST_REQUIRE (ctx != nullptr);

    const pid_t hostPid = ::getpid();

    SandboxHost host (ctx->plugins());
    CrashOnLoadObserver observer;
    host.addListener (&observer);

    BOOST_REQUIRE_MESSAGE (host.launch(), "SandboxHost::launch failed");
    BOOST_REQUIRE (host.getState() == SandboxHost::State::Ready);

    // Let the first worker connect + send its first heartbeat.
    pumpUntil ([] { return false; }, std::chrono::milliseconds (300));

    // ---- start the clock: the whole crash→retry→give-up cycle must be bounded.
    const auto t0 = std::chrono::steady_clock::now();

    // This load makes the worker ::abort() during createPluginInstance. Every
    // relaunched worker will do the same, so the host must exhaust its restart
    // budget and settle on Error.
    host.loadPlugin (makeCrashOnLoadDescription());

    // BOUND: the OLD blocking path did 3 × pluginReadyEvent.wait(5000) = 15 s of
    // pure blocking PLUS an IPC-thread self-join deadlock (i.e. it would never
    // settle at all). The async path settles after a few timer-driven relaunch
    // attempts (~heartbeat interval each). 14 s is comfortably above the real
    // cost (~2-5 s) yet below the old 5 s × 3 accumulation — so reaching Error
    // within it genuinely distinguishes fixed-from-broken.
    const bool settledError = pumpUntil (
        [&] { return host.getState() == SandboxHost::State::Error; },
        std::chrono::milliseconds (14000));

    const auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds> (
                             std::chrono::steady_clock::now() - t0);

    // (a) host alive — this process is the host; if we are executing, the worker
    //     SIGABRTs did not take us down (and setsid()/own-session decoupled the
    //     process groups so a group-directed signal can't either).
    const bool hostAlive = (::kill (hostPid, 0) == 0);
    BOOST_CHECK_MESSAGE (hostAlive, "host process died — load-crash was NOT isolated");

    // (b) restart budget exhausted → permanent Error.
    BOOST_CHECK_MESSAGE (settledError,
                         "host did not reach Error after repeated load-crashes "
                         "(state=" << (int) host.getState()
                         << ", elapsed=" << elapsed.count() << " ms) — "
                         "restart path likely hung or stalled");

    // (c) crash surfaced (badge / in-process fallback).
    BOOST_CHECK_MESSAGE (observer.crashed.load(), "sandboxCrashed never fired");
    BOOST_CHECK_GE (observer.crashCount.load(), 1);

    // (d) bounded wall-time — no 5 s × N blocking stall, no hang.
    BOOST_CHECK_MESSAGE (elapsed.count() < 14000,
                         "crash→give-up took " << elapsed.count()
                         << " ms (>= 14 s) — restart path is blocking/stalling");

    // The crash plugin can NEVER load, so no successful (re)load should ever be
    // reported.
    BOOST_CHECK_EQUAL (observer.loadCount.load(), 0);

    BOOST_TEST_MESSAGE ("crash-on-load: state=" << (int) host.getState()
                        << " elapsed_ms=" << elapsed.count()
                        << " crashes=" << observer.crashCount.load()
                        << " restarts=" << observer.restartCount.load()
                        << " loadFailed=" << observer.loadFailedCount.load());

    host.removeListener (&observer);
    host.shutdown();

    // Host still responsive after shutdown.
    BOOST_CHECK (::kill (hostPid, 0) == 0);
}

BOOST_AUTO_TEST_SUITE_END()
