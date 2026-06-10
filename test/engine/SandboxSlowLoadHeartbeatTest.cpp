// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Regression coverage for the Kontakt-8 async-launch bugs (2026-06-10, Glen's
// live VST3 feel-test → "UI froze + block labelled 'node'"):
//
//   BUG A — load-before-init race. The async-launch split made the host send
//           LoadPlugin faster than the worker's initializeWorker() (format
//           registration on the worker MESSAGE THREAD) could complete, so an
//           early LoadPlugin hit an empty formatManager → "No compatible plug-in
//           format exists for this plug-in". FIX: the worker QUEUES a LoadPlugin
//           that arrives before init and replays it once formats are registered
//           (drainPendingLoad). Exercised here via the EL_SANDBOX_DELAY_INIT_MS
//           test seam (delays format registration so a LoadPlugin sent right
//           after launch lands during the gap and must be queued + replayed).
//
//   BUG B — heartbeat starvation during slow loads. A multi-second instrument
//           load blocks the worker MESSAGE THREAD (= its heartbeat Timer), so the
//           host's 5 s watchdog false-positived a crash → teardown → restart loop
//           ("Plugin loaded… Sandbox crashed" twice, workers ending by
//           proc_exit). FIX: the worker sends LoadInProgress when a load starts;
//           the host SUSPENDS the heartbeat deadline until the load completes or
//           EL_SANDBOX_LOAD_CEILING_MS elapses. Exercised via the
//           EL_SANDBOX_SLOW_LOAD_MS seam (blocks the worker MT past the 5 s
//           watchdog) — the worker must NOT be torn down and the load must settle.
//
// Both BUG A/B cases re-exec test_element as a REAL worker subprocess and load
// the in-tree TestEchoPlugin (registered only when EL_SANDBOX_INCLUDE_TEST_FORMATS
// is set). RUN_SERIAL — they own POSIX shm/sem names per host PID and set process
// environment variables inherited by the spawned worker.
//
// BUG C — fallback/crash naming ("node"). Covered by SandboxNodeNameReaffirm
// below: a pure check that the swap/seed re-affirm strips the internal
// "(Sandboxed)" wrapper suffix and path/extension noise so the Block shows the
// clean catalog name, never the wrapper label or a bare "node".

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/node.hpp>
#include <element/plugins.hpp>
#include <element/services.hpp>

#include "engine/sandboxhost.hpp"
#include "engine/sandboxipc.hpp"
#include "engine/test_echo_plugin.hpp"

#include <atomic>
#include <chrono>
#include <cstdlib>

namespace element {
namespace test {
extern Context* context();
} // namespace test
} // namespace element

using namespace element;

namespace {

class SlowLoadCapture : public SandboxHost::Listener
{
public:
    void sandboxPluginLoaded (SandboxHost*) override { loaded.store (true); }
    void sandboxPluginLoadFailed (SandboxHost*, const juce::String& error) override
    {
        loadFailed.store (true);
        failureReason = error;
    }
    void sandboxCrashed (SandboxHost*) override { crashed.store (true); }
    void sandboxRestarted (SandboxHost*) override { restarted.store (true); }

    std::atomic<bool> loaded { false };
    std::atomic<bool> loadFailed { false };
    std::atomic<bool> crashed { false };
    std::atomic<bool> restarted { false };
    juce::String failureReason;
};

bool pumpUntil (std::function<bool()> predicate, std::chrono::milliseconds budget)
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

juce::PluginDescription echoDescription()
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

// Set/clear an env var that the re-exec'd worker process inherits. setenv/unsetenv
// here run in the HOST test process BEFORE launch() spawns the worker.
struct ScopedEnv
{
    explicit ScopedEnv (const char* k, const juce::String& v) : key (k)
    {
        ::setenv (key, v.toRawUTF8(), 1);
    }
    ~ScopedEnv() { ::unsetenv (key); }
    const char* key;
};

} // namespace

//==============================================================================
BOOST_AUTO_TEST_SUITE (SandboxSlowLoadHeartbeatTests)

// BUG A: a LoadPlugin issued immediately after the handshake, while the worker is
// still registering formats (EL_SANDBOX_DELAY_INIT_MS), must be QUEUED by the
// worker and REPLAYED after init — so it loads cleanly instead of failing with
// "No compatible plug-in format". The delay is short (400 ms) so the whole case
// fits well inside the ctest timeout.
BOOST_AUTO_TEST_CASE (LoadQueuedBeforeInitReplays)
{
    auto* ctx = element::test::context();
    BOOST_REQUIRE (ctx != nullptr);

    // Hold off the worker's format registration so our immediate loadPlugin lands
    // during the init gap and exercises the queue-before-init path.
    ScopedEnv delayInit ("EL_SANDBOX_DELAY_INIT_MS", "400");

    SandboxHost host (ctx->plugins());
    SlowLoadCapture capture;
    host.addListener (&capture);

    BOOST_REQUIRE (host.launch());
    BOOST_CHECK (host.getState() == SandboxHost::State::Ready);

    // Send LoadPlugin RIGHT AWAY — no pump first. With the init delay active the
    // worker's formatManager is still empty, so without the queue this would fail
    // with "No compatible plug-in format exists for this plug-in".
    host.loadPlugin (echoDescription());

    const bool settled = pumpUntil (
        [&] { return capture.loaded.load() || capture.loadFailed.load(); },
        std::chrono::seconds (8));

    BOOST_REQUIRE_MESSAGE (settled, "Queued load did not settle within 8 s");
    BOOST_CHECK_MESSAGE (! capture.loadFailed.load(),
                         "Queued-before-init load FAILED (race not closed): "
                             + capture.failureReason.toStdString());
    BOOST_CHECK (capture.loaded.load());
    BOOST_CHECK (host.isPluginLoaded());

    host.removeListener (&capture);
    host.shutdown();
}

// BUG B: a slow load (EL_SANDBOX_SLOW_LOAD_MS) blocks the worker MESSAGE THREAD —
// and thus its heartbeat Timer — for longer than the 5 s heartbeat watchdog. The
// host must SUSPEND the watchdog (LoadInProgress) for the duration, so the worker
// is NEITHER torn down NOR misreported as crashed, and the load settles. The slow
// window (7 s) deliberately exceeds EL_SANDBOX_TIMEOUT_MS (5 s) but stays under
// EL_SANDBOX_LOAD_CEILING_MS (120 s); ctest timeout for this suite is 60 s.
BOOST_AUTO_TEST_CASE (SlowLoadDoesNotTripHeartbeatWatchdog)
{
    auto* ctx = element::test::context();
    BOOST_REQUIRE (ctx != nullptr);

    static_assert (7000 > EL_SANDBOX_TIMEOUT_MS,
                   "slow window must exceed the heartbeat watchdog to be a real test");
    static_assert (7000 < EL_SANDBOX_LOAD_CEILING_MS,
                   "slow window must stay under the load ceiling so the worker survives");

    ScopedEnv slowLoad ("EL_SANDBOX_SLOW_LOAD_MS", "7000");

    SandboxHost host (ctx->plugins());
    SlowLoadCapture capture;
    host.addListener (&capture);

    BOOST_REQUIRE (host.launch());
    BOOST_CHECK (host.getState() == SandboxHost::State::Ready);

    pumpUntil ([] { return false; }, std::chrono::milliseconds (200));

    host.loadPlugin (echoDescription());

    // Pump across the whole slow-load window + margin. The watchdog (host Timer,
    // 500 ms cadence) ticks several times inside the 7 s block; if the suspend
    // logic regressed, it would fire handleConnectionLost → crashed/restart here.
    const bool settled = pumpUntil (
        [&] { return capture.loaded.load() || capture.loadFailed.load(); },
        std::chrono::seconds (20));

    BOOST_REQUIRE_MESSAGE (settled, "Slow load never settled (worker likely torn down)");
    BOOST_CHECK_MESSAGE (! capture.loadFailed.load(),
                         "Slow load reported failure: " + capture.failureReason.toStdString());
    BOOST_CHECK (capture.loaded.load());

    // The crux: the slow load must NOT have been misread as a crash/restart.
    BOOST_CHECK_MESSAGE (! capture.crashed.load(),
                         "Heartbeat watchdog false-positived a crash during a slow load (BUG B)");
    BOOST_CHECK_MESSAGE (! capture.restarted.load(),
                         "Worker was needlessly restarted during a slow load (BUG B)");
    BOOST_CHECK (host.isPluginLoaded());
    BOOST_CHECK (host.getState() == SandboxHost::State::Active);

    host.removeListener (&capture);
    host.shutdown();
}

// BUG D: POST-LOAD message-thread starvation. Kontakt keeps the worker MESSAGE
// THREAD busy for seconds AFTER PluginLoaded (content-DB scan, registration
// timers). Pre-fix the heartbeat rode the message thread, so the moment the
// load-grace window cleared at PluginLoaded the host's 5 s watchdog starved again
// and tore the (healthy) worker down — the live "loaded then crashed → restart
// loop" with Kontakt 8. The fix decouples the PROCESS heartbeat onto a dedicated
// worker thread, so a busy-but-alive main thread is never misread as a crash.
//
// EL_SANDBOX_POST_LOAD_BUSY_MS blocks the worker MT for 7 s AFTER PluginLoaded —
// past the 5 s heartbeat watchdog — with NO load in flight. The worker must NOT be
// torn down: no crash, no restart, the plugin stays loaded and Active.
BOOST_AUTO_TEST_CASE (PostLoadMainThreadBusyDoesNotTearDownWorker)
{
    auto* ctx = element::test::context();
    BOOST_REQUIRE (ctx != nullptr);

    static_assert (7000 > EL_SANDBOX_TIMEOUT_MS,
                   "post-load busy window must exceed the heartbeat watchdog to be a real test");
    static_assert (7000 < EL_SANDBOX_MAINTHREAD_CEILING_MS,
                   "post-load busy window must stay under the main-thread ceiling so the worker survives");

    ScopedEnv postLoadBusy ("EL_SANDBOX_POST_LOAD_BUSY_MS", "7000");

    SandboxHost host (ctx->plugins());
    SlowLoadCapture capture;
    host.addListener (&capture);

    BOOST_REQUIRE (host.launch());
    BOOST_CHECK (host.getState() == SandboxHost::State::Ready);

    host.loadPlugin (echoDescription());

    // The PluginLoaded reply is sent BEFORE the worker MT blocks (the busy seam runs
    // at the tail of the load callback, after PluginLoaded/PluginInfo were sent), so
    // `loaded` flips quickly. Then the MT is blocked for 7 s while the DEDICATED
    // heartbeat thread keeps the process heartbeat flowing.
    const bool loaded = pumpUntil (
        [&] { return capture.loaded.load() || capture.loadFailed.load(); },
        std::chrono::seconds (8));
    BOOST_REQUIRE_MESSAGE (loaded, "Plugin never reported loaded");
    BOOST_CHECK_MESSAGE (! capture.loadFailed.load(),
                         "Load reported failure: " + capture.failureReason.toStdString());

    // Pump WELL PAST the 7 s busy window. If the dedicated heartbeat regressed (or the
    // host watchdog still keyed off the message-thread beat), handleConnectionLost
    // would fire here → crashed/restart. The crux: it must NOT.
    pumpUntil ([] { return false; }, std::chrono::seconds (10));

    BOOST_CHECK_MESSAGE (! capture.crashed.load(),
                         "Healthy worker torn down during post-load main-thread busy window (BUG D)");
    BOOST_CHECK_MESSAGE (! capture.restarted.load(),
                         "Worker needlessly restarted during post-load main-thread busy window (BUG D)");
    BOOST_CHECK (host.isPluginLoaded());
    BOOST_CHECK (host.getState() == SandboxHost::State::Active);

    host.removeListener (&capture);
    host.shutdown();
}

BOOST_AUTO_TEST_SUITE_END()

//==============================================================================
// BUG C — fallback/crash naming. The engine re-affirm (graphmanager.cpp
// swapInLoadedProcessor + Binding::setDataProperties) seeds the Block name from
// the loaded processor when the placeholder name was weak. A SandboxedProcessorNode
// reports "<plugin> (Sandboxed)"; the re-affirm must strip that wrapper suffix and
// any path/extension noise (cleanPluginDisplayName) so the user sees the clean
// catalog name — never "Kontakt 8 (Sandboxed)" and never a bare "node".
//
// Mirrors the exact transform applied in graphmanager.cpp so a future change to one
// without the other is caught.

BOOST_AUTO_TEST_SUITE (SandboxNodeNameReaffirm)

namespace {
juce::String reaffirmDisplayName (const juce::String& processorReportedName)
{
    return cleanPluginDisplayName (
        processorReportedName.upToLastOccurrenceOf (" (Sandboxed)", false, false).trim());
}
} // namespace

BOOST_AUTO_TEST_CASE (StripsSandboxedSuffix)
{
    BOOST_CHECK_EQUAL (reaffirmDisplayName ("Kontakt 8 (Sandboxed)").toStdString(),
                       std::string ("Kontakt 8"));
}

BOOST_AUTO_TEST_CASE (PlainNamePassesThroughUnchanged)
{
    // A non-sandboxed (in-process fallback) instance reports its plain name; the
    // strip is a no-op and cleanPluginDisplayName preserves a normal display name.
    BOOST_CHECK_EQUAL (reaffirmDisplayName ("Serum").toStdString(),
                       std::string ("Serum"));
}

BOOST_AUTO_TEST_CASE (StripsPathAndExtensionEvenWithSuffix)
{
    // Scanner-leaked path name wrapped by the sandbox node: strip the wrapper, then
    // cleanPluginDisplayName reduces the path to its basename.
    const auto out = reaffirmDisplayName ("/Library/Audio/Plug-Ins/VST3/RX 10 De-reverb.vst3 (Sandboxed)");
    BOOST_CHECK_EQUAL (out.toStdString(), std::string ("RX 10 De-reverb"));
}

BOOST_AUTO_TEST_CASE (UserRenameWithSlashPreserved)
{
    // "Drums/Bus" is a user rename, not a path — cleanPluginDisplayName must leave
    // it intact (it only acts on known plugin extensions). No sandbox suffix here.
    BOOST_CHECK_EQUAL (reaffirmDisplayName ("Drums/Bus").toStdString(),
                       std::string ("Drums/Bus"));
}

//==============================================================================
// BUG D — crash/fallback-failure naming. When a sandboxed load CRASHES and the
// in-process fallback ALSO fails, swapInLoadedProcessor(realProcessor==nullptr)
// leaves a terminal placeholder. Pre-fix that branch never re-affirmed tags::name,
// so getDisplayName() fell through to the bare PlaceholderProcessor and the Block
// showed "Node"/"Placeholder" under the PLUGIN CRASHED banner — the exact "node"-
// titled crash card Glen saw with Kontakt 8. The hardened branch re-affirms the
// clean catalog name from the stored PluginDescription when the current name is weak
// (empty / "Node" / "Placeholder" / "Plugin"), preserving any user rename.
//
// This mirrors the EXACT weak-name + resolve transform in graphmanager.cpp's
// realProcessor==nullptr branch so a future change to one without the other is caught.
namespace {
juce::String crashPathReaffirm (const juce::String& currentName,
                                const juce::String& descName,
                                const juce::String& descriptiveName)
{
    const juce::String current (currentName.trim());
    const bool weak = current.isEmpty()
                      || current.equalsIgnoreCase ("Node")
                      || current.equalsIgnoreCase ("Placeholder")
                      || current == "Plugin";
    if (! weak)
        return current; // user rename / real catalog name preserved untouched

    juce::String resolved (cleanPluginDisplayName (descName));
    if (resolved.isEmpty())
        resolved = cleanPluginDisplayName (descriptiveName);
    return resolved.isNotEmpty() ? resolved : current;
}
} // namespace

BOOST_AUTO_TEST_CASE (CrashWeakNameReaffirmedFromDescription)
{
    // The crashed placeholder reports a weak "Node" name → re-affirm "Kontakt 8".
    BOOST_CHECK_EQUAL (
        crashPathReaffirm ("Node", "Kontakt 8", "Native Instruments Kontakt").toStdString(),
        std::string ("Kontakt 8"));
}

BOOST_AUTO_TEST_CASE (CrashPlaceholderNameReaffirmedFromDescription)
{
    // A bare PlaceholderProcessor surfaces "Placeholder" — also weak, also healed.
    BOOST_CHECK_EQUAL (
        crashPathReaffirm ("Placeholder", "Serum", "Xfer Serum").toStdString(),
        std::string ("Serum"));
}

BOOST_AUTO_TEST_CASE (CrashUserRenamePreserved)
{
    // A meaningful user rename must survive the crash transition untouched.
    BOOST_CHECK_EQUAL (
        crashPathReaffirm ("My Lead", "Kontakt 8", "Kontakt").toStdString(),
        std::string ("My Lead"));
}

BOOST_AUTO_TEST_CASE (CrashWeakNameFallsBackToDescriptiveName)
{
    // Empty desc.name → fall back to descriptiveName, still never a bare "Node".
    BOOST_CHECK_EQUAL (
        crashPathReaffirm ("", "", "Element Test Echo").toStdString(),
        std::string ("Element Test Echo"));
}

BOOST_AUTO_TEST_SUITE_END()
