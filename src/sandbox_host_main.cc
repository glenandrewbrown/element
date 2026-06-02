// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// element_sandbox_host — dedicated out-of-process plugin-host worker binary.
//
// WHY THIS EXISTS (Reliability Layer-3, see .omo/RELIABILITY-LAYER3-DESIGN-2026-06-02.md):
// Element's sandbox previously re-exec'd Element.app itself as the worker. Because the
// worker shared Element's CFBundleIdentifier (net.kushview.Element), macOS duplicate-
// instance enforcement SIGKILLed the HOST ~4s after the worker booted — defeating the
// whole point of crash-isolation. The cure (what Bitwig/REAPER/JUCE's own scanner do) is
// a SEPARATE worker binary with a DISTINCT bundle id (net.kushview.Element.sandbox). macOS
// then sees a different identity and never dedupes the host away.
//
// All the actual worker logic lives in element::SandboxWorker (kv::element static lib),
// reused verbatim. This entry point only needs to: be a minimal JUCE GUI app (so a
// MessageManager + run-loop exist for the worker's Timer/pipe), build a SandboxWorker, and
// initialise it from the command line. If the command line is NOT a worker invocation
// (no EL_PLUGIN_HOST_PROCESS_ID), there is nothing for this binary to do, so it quits.

#include <element/juce.hpp>
#include <element/version.h> // ELEMENT_VERSION_STRING

#include "engine/sandboxipc.hpp"
#include "engine/sandboxworker.hpp"

namespace element {

class SandboxHostApplication : public juce::JUCEApplication
{
public:
    SandboxHostApplication() = default;
    ~SandboxHostApplication() override = default;

    const juce::String getApplicationName() override { return "Element Sandbox Host"; }
    const juce::String getApplicationVersion() override { return ELEMENT_VERSION_STRING; }

    // This binary is a relaunch-target for SandboxHost::launchWorkerProcess(). Every
    // legitimate invocation carries the worker UID on the command line, so allowing
    // multiple instances is correct (one helper per sandboxed plugin) and avoids any
    // single-instance forward-and-quit before initialise() runs.
    bool moreThanOneInstanceAllowed() override { return true; }

    void initialise (const juce::String& commandLine) override
    {
        worker = std::make_unique<SandboxWorker>();

        // SandboxWorker::initialise() wraps initialiseFromCommandLine (matching the
        // EL_PLUGIN_HOST_PROCESS_ID UID), registers plugin formats, applies the
        // macOS Accessory/Prohibited activation policy + setsid() defence-in-depth, and
        // returns true only when this process is genuinely a sandbox worker.
        if (worker->initialise (commandLine))
        {
            juce::Logger::writeToLog ("[element-sandbox-host] running as sandbox worker process");
            return;
        }

        // Not a worker command line — this helper has no standalone purpose.
        worker.reset();
        juce::Logger::writeToLog (
            "[element-sandbox-host] not a worker command line — quitting");
        quit();
    }

    void shutdown() override
    {
        worker.reset();
    }

    void anotherInstanceStarted (const juce::String&) override {}

private:
    std::unique_ptr<SandboxWorker> worker;
};

} // namespace element

START_JUCE_APPLICATION (element::SandboxHostApplication)
