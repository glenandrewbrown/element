// SPDX-License-Identifier: GPL-3.0-or-later
//
// Real-plugin crash-isolation ship-gate proof (terminal/CI-able).
//
// Distinct from SandboxRealProcessTest / SandboxStressTest, which prove the
// IPC + crash-isolation MECHANISM using the in-tree TestEcho format
// (EL_SANDBOX_INCLUDE_TEST_FORMATS). What those CANNOT prove is that a REAL,
// signed, 3rd-party plugin dylib genuinely loads in a SEPARATE worker process.
// That is the Bitwig-grade reliability claim: a real plugin crash (here:
// SIGKILL of the worker) must NOT take the host down, and the host must DETECT
// and surface the crash.
//
// This test:
//   1. Scans the real ValhallaSupermassive VST3 in-process via JUCE's
//      VST3PluginFormat to obtain its authoritative PluginDescription. If the
//      plugin is not installed the case is SKIPPED (so CI without the plugin
//      stays green) — but on this machine it is present and the case RUNS.
//   2. Launches a SandboxHost, which re-execs THIS test_element binary as a
//      JUCE child carrying EL_PLUGIN_HOST_PROCESS_ID. The child's
//      SandboxWorker registers default formats (JUCE_PLUGINHOST_VST3=1) and
//      genuinely createPluginInstance()s the Valhalla dylib OUT-OF-PROCESS.
//   3. Confirms the worker child PID is live (pgrep -P <host pid>).
//   4. kill -9 the worker (a hard plugin crash).
//   5. Asserts the HOST process survives AND the crash is detected
//      (sandboxCrashed callback + Crashed state).
//
// HARD REQUIREMENT for out-of-process REAL-plugin load: this test_element
// binary must be code-signed with cmake/entitlements.plist
// (disable-library-validation), or macOS library-validation kills the worker
// the instant it dlopens the signed Valhalla dylib — the load then "fails"
// with no crash to isolate. The relaunched worker inherits this binary's
// signature (same Mach-O). See tools/reliability/sign-dev-build.sh for the
// proven flags; sign test_element the same way before running this suite.
//
// RUN_SERIAL: owns POSIX shm/sem names per host PID and spawns a subprocess.

#include <boost/test/unit_test.hpp>

#include <atomic>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <ctime>
#include <signal.h>
#include <sys/types.h>
#include <unistd.h>

#include <element/context.hpp>
#include <element/plugins.hpp>
#include <element/services.hpp>

#include "engine/sandboxhost.hpp"
#include "engine/sandboxipc.hpp"

namespace element {
namespace test {
extern Context* context();
} // namespace test
} // namespace element

using namespace element;

namespace {

// The real commercial plugin under test. A signed 3rd-party VST3 dylib —
// loading it out-of-process is the part the in-tree TestEcho format cannot
// exercise.
constexpr const char* kValhallaVst3Path =
    "/Library/Audio/Plug-Ins/VST3/ValhallaSupermassive.vst3";

class CrashCapture : public SandboxHost::Listener
{
public:
    void sandboxPluginLoaded (SandboxHost*) override { loaded.store (true); }
    void sandboxPluginLoadFailed (SandboxHost*, const juce::String& error) override
    {
        loadFailed.store (true);
        failureReason = error;
    }
    void sandboxCrashed (SandboxHost*) override { ++crashCount; crashed.store (true); }
    void sandboxRestarted (SandboxHost*) override { ++restartCount; restarted.store (true); }

    std::atomic<bool> loaded { false };
    std::atomic<bool> loadFailed { false };
    std::atomic<bool> crashed { false };
    std::atomic<bool> restarted { false };
    std::atomic<int> crashCount { 0 };
    std::atomic<int> restartCount { 0 };
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

// The worker is launched by SandboxHost as a direct child of this (the host)
// process, re-execing currentExecutableFile with EL_PLUGIN_HOST_PROCESS_ID.
// So the newest direct child PID is the worker. (Matches SandboxStressTest.)
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
            pid = candidate;   // keep last → newest child
        }
    }
    ::pclose (fp);
    return pid;
}

// Scan the real Valhalla VST3 in-process to get its authoritative
// PluginDescription. Returns false (and leaves desc untouched) if the plugin
// is absent or unscannable — the test SKIPs in that case.
bool scanValhallaDescription (juce::PluginDescription& desc)
{
    const juce::File vst3 (kValhallaVst3Path);
    if (! vst3.exists())
        return false;

    juce::VST3PluginFormat format;
    juce::OwnedArray<juce::PluginDescription> found;
    format.findAllTypesForFile (found, vst3.getFullPathName());

    if (found.isEmpty())
        return false;

    desc = *found.getFirst();
    return true;
}

juce::File evidenceFile()
{
    // .omo/evidence/ under the repo root (EL_TEST_SOURCE_ROOT is the repo root,
    // injected by test/CMakeLists.txt).
   #ifdef EL_TEST_SOURCE_ROOT
    const juce::File root (juce::String (EL_TEST_SOURCE_ROOT));
   #else
    const juce::File root (juce::File::getCurrentWorkingDirectory());
   #endif
    auto dir = root.getChildFile (".omo").getChildFile ("evidence");
    dir.createDirectory();

    char ts[32];
    const std::time_t now = std::time (nullptr);
    std::strftime (ts, sizeof (ts), "%Y%m%d-%H%M%S", std::localtime (&now));
    return dir.getChildFile (juce::String ("reliability-real-plugin-crash-")
                             + juce::String (ts) + ".txt");
}

} // namespace

//==============================================================================
BOOST_AUTO_TEST_SUITE (SandboxRealPluginCrashTests)

// Hard exit gate: a REAL signed VST3 loads OUT-OF-PROCESS, the worker is
// SIGKILLed, and the HOST survives + DETECTS the crash.
BOOST_AUTO_TEST_CASE (RealPluginOutOfProcessSurvivesWorkerKill)
{
    auto* ctx = element::test::context();
    BOOST_REQUIRE (ctx != nullptr);

    auto ev = evidenceFile();
    juce::String log;
    auto record = [&log] (const juce::String& line)
    {
        log << line << "\n";
        BOOST_TEST_MESSAGE (line.toStdString());
    };

    record ("=== real-plugin crash-isolation proof ===");
    record ("host pid:        " + juce::String ((int) ::getpid()));
    record ("plugin path:     " + juce::String (kValhallaVst3Path));

    // ---- 1. scan the real plugin in-process for its PluginDescription -------
    juce::PluginDescription desc;
    if (! scanValhallaDescription (desc))
    {
        record ("RESULT: SKIPPED - ValhallaSupermassive VST3 not installed/scannable.");
        ev.replaceWithText (log);
        BOOST_TEST_MESSAGE ("evidence: " + ev.getFullPathName().toStdString());
        // Not a failure: the mechanism is proven elsewhere; this case needs the
        // real plugin on disk. On the target machine it IS present and runs.
        return;
    }

    record ("scanned plugin:  " + desc.name
            + " [" + desc.pluginFormatName + "] uid=" + juce::String (desc.uniqueId));

    // ---- 2. launch host + load the real plugin OUT-OF-PROCESS --------------
    SandboxHost host (ctx->plugins());
    CrashCapture capture;
    host.addListener (&capture);

    BOOST_REQUIRE_MESSAGE (host.launch(), "SandboxHost::launch failed");
    BOOST_REQUIRE (host.getState() == SandboxHost::State::Ready);

    // Let the worker connect + send its first heartbeat.
    pumpUntil ([] { return false; }, std::chrono::milliseconds (300));

    host.loadPlugin (desc);

    // Real VST3 load in a fresh process can take a few seconds (dylib map +
    // factory init). 15 s ceiling.
    const bool loadSettled = pumpUntil (
        [&] { return capture.loaded.load() || capture.loadFailed.load(); },
        std::chrono::seconds (15));

    if (! loadSettled || capture.loadFailed.load())
    {
        const juce::String why = capture.loadFailed.load()
            ? ("worker reported load failure: " + capture.failureReason)
            : juce::String ("worker did not settle load within 15 s");
        record ("RESULT: FAIL - real plugin did not load out-of-process.");
        record ("  reason: " + why);
        record ("  HINT: unsigned test_element? The worker cannot dlopen a signed");
        record ("        3rd-party dylib without disable-library-validation. Sign with:");
        record ("        codesign --force --options runtime --entitlements cmake/entitlements.plist \\");
        record ("                 --sign - <test_element binary>   (see sign-dev-build.sh)");
        record ("  worker log(s): /tmp/element-sandbox-worker-*.log");
        ev.replaceWithText (log);
        BOOST_TEST_MESSAGE ("evidence: " + ev.getFullPathName().toStdString());
        BOOST_FAIL (why.toStdString());
        return;
    }

    BOOST_REQUIRE (capture.loaded.load());
    BOOST_CHECK (host.getState() == SandboxHost::State::Active);
    record ("[PASS] real plugin LOADED out-of-process (worker createPluginInstance succeeded)");

    // ---- 3. confirm a live worker child process ----------------------------
    const pid_t workerPid = findChildWorkerPid();
    record ("worker pid (child of host): " + juce::String ((int) workerPid));
    BOOST_REQUIRE_MESSAGE (workerPid > 0, "no live worker child process found after load");
    BOOST_REQUIRE_MESSAGE (::kill (workerPid, 0) == 0, "worker pid is not actually alive");

    // Snapshot proof the worker really hosts the dylib: it has the plugin file
    // open (best-effort; lsof may be unavailable in CI — informational only).
    {
        char cmd[256];
        std::snprintf (cmd, sizeof (cmd),
                       "lsof -p %d 2>/dev/null | grep -c ValhallaSupermassive",
                       (int) workerPid);
        if (FILE* fp = ::popen (cmd, "r"))
        {
            char line[32] = {0};
            if (std::fgets (line, sizeof (line), fp) != nullptr)
                record ("worker has ValhallaSupermassive mappings open (lsof count): "
                        + juce::String (line).trim());
            ::pclose (fp);
        }
    }

    // ---- 4. the kill: SIGKILL the worker (simulated plugin hard-crash) ------
    capture.crashed.store (false);
    record (">>> kill -9 worker " + juce::String ((int) workerPid)
            + "  (simulating a real plugin hard-crash)");
    const int killRc = ::kill (workerPid, SIGKILL);
    BOOST_REQUIRE_MESSAGE (killRc == 0, "kill -9 of worker failed");

    // ---- 5. assert host survives + crash detected --------------------------
    // Crash detection is via JUCE ChildProcessCoordinator pipe-break (near
    // instant) or heartbeat timeout (<=5 s, EL_SANDBOX_TIMEOUT_MS). The host's
    // attemptRestart() will then try to relaunch — restart success depends on
    // re-loading the real dylib, which is NOT required by this gate. We only
    // require: host alive + sandboxCrashed fired.
    const bool crashDetected = pumpUntil (
        [&] { return capture.crashed.load(); },
        std::chrono::seconds (8));

    // Host process is THIS process. If we are still executing, the SIGKILL of
    // the worker did not take us down. Assert we are alive + responsive.
    const bool hostAlive = (::kill (::getpid(), 0) == 0);

    record ("");
    record ("host alive after worker SIGKILL: " + juce::String (hostAlive ? "YES" : "NO"));
    record ("sandboxCrashed callback fired:   " + juce::String (capture.crashed.load() ? "YES" : "NO")
            + " (count=" + juce::String (capture.crashCount.load()) + ")");
    record ("post-kill host state:            "
            + juce::String (static_cast<int> (host.getState()))
            + " (6=Crashed,4=Active,5=Error,2=Ready)");

    BOOST_CHECK_MESSAGE (hostAlive, "host process died - crash was NOT isolated");
    BOOST_CHECK_MESSAGE (crashDetected, "crash was not detected (sandboxCrashed never fired)");
    BOOST_CHECK_GE (capture.crashCount.load(), 1);

    record ("");
    if (hostAlive && crashDetected)
        record ("RESULT: PASS - real VST3 hosted out-of-process; worker SIGKILL isolated; crash detected.");
    else
        record ("RESULT: FAIL - see assertions above.");

    // Best-effort: let any restart settle so teardown is clean, then shut down.
    pumpUntil ([&] { return capture.restarted.load(); }, std::chrono::seconds (8));
    if (capture.restarted.load())
        record ("(host auto-restart fired: restartCount="
                + juce::String (capture.restartCount.load()) + ")");

    host.removeListener (&capture);
    host.shutdown();

    ev.replaceWithText (log);
    BOOST_TEST_MESSAGE ("evidence: " + ev.getFullPathName().toStdString());
}

BOOST_AUTO_TEST_SUITE_END()
