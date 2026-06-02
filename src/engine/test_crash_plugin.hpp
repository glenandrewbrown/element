// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Deterministic "crash-on-load" test plugin format — sandbox crash-ISOLATION
// proof for the failure class the TestEcho format CANNOT exercise.
//
// TestEchoPluginFormat (test_echo_plugin.hpp) loads successfully and lets the
// stress test SIGKILL a HEALTHY, already-loaded worker. What that misses — and
// what brought the real host down (pluginSandboxMode=1 + ValhallaPlate) — is a
// worker that DIES DURING LOAD, repeatedly: each relaunched worker crashes again
// before it can send PluginLoaded. The old fully-synchronous restart path then
// blocked the IPC thread on a 5 s pluginReadyEvent.wait() PER attempt and
// self-joined the IPC thread, hanging the host.
//
// This format's createPluginInstance() calls ::abort() — the worker process dies
// (SIGABRT) the instant the host asks it to instantiate the plugin, exactly like
// a plugin that segfaults in its constructor/factory. Registered ONLY when
// EL_SANDBOX_INCLUDE_TEST_FORMATS is defined (test_element), never in
// element_app.
//
// The companion host-side test (SandboxCrashOnLoadTest.cpp) asserts the host:
//   (a) stays alive,
//   (b) reaches state==Error after the restart budget is exhausted,
//   (c) fired sandboxCrashed, and
//   (d) completes in BOUNDED wall-time (no 5 s × N stall) — which proves the
//       async/non-blocking restart fix regardless of bundle-id / activation
//       policy (those are macOS-GUI concerns the headless harness can't hit).

#pragma once

#include <element/juce.hpp>

#include <cstdlib>  // ::abort

namespace element {

//==============================================================================
/** Sentinel identifier the host-side test sets on desc.fileOrIdentifier and the
    crash format matches in fileMightContainThisPluginType. */
inline constexpr const char* kCrashOnLoadIdentifier = "ElementTestCrashOnLoad";

/** Sentinel format-name string (desc.pluginFormatName). Distinct from the echo
    format so the two never collide in the worker's format manager. */
inline constexpr const char* kCrashOnLoadFormatName = "TestCrash";

/** Unique-id for the crash test plugin. "C7A5" ~ "crash". */
inline constexpr int kCrashOnLoadUniqueId = 0xC7A50000;

//==============================================================================
/** AudioPluginFormat whose instance factory hard-crashes the process. There is
    no instance type — createPluginInstance never returns. Registered in
    SandboxWorker::initializeWorker() only under EL_SANDBOX_INCLUDE_TEST_FORMATS. */
class CrashOnLoadPluginFormat : public juce::AudioPluginFormat
{
public:
    CrashOnLoadPluginFormat() = default;
    ~CrashOnLoadPluginFormat() override = default;

    //==========================================================================
    juce::String getName() const override { return kCrashOnLoadFormatName; }

    bool fileMightContainThisPluginType (const juce::String& fileOrIdentifier) override
    {
        return fileOrIdentifier == kCrashOnLoadIdentifier;
    }

    void findAllTypesForFile (juce::OwnedArray<juce::PluginDescription>& results,
                               const juce::String& fileOrIdentifier) override
    {
        if (fileOrIdentifier != kCrashOnLoadIdentifier)
            return;

        auto desc = std::make_unique<juce::PluginDescription>();
        desc->name              = kCrashOnLoadIdentifier;
        desc->descriptiveName   = "Element Test Crash-On-Load";
        desc->pluginFormatName  = kCrashOnLoadFormatName;
        desc->fileOrIdentifier  = kCrashOnLoadIdentifier;
        desc->category          = "Effect";
        desc->manufacturerName  = "Element";
        desc->version           = "1.0";
        desc->uniqueId          = kCrashOnLoadUniqueId;
        desc->deprecatedUid     = kCrashOnLoadUniqueId;
        desc->numInputChannels  = 0;
        desc->numOutputChannels = 2;
        desc->isInstrument      = false;
        results.add (desc.release());
    }

    juce::String getNameOfPluginFromIdentifier (const juce::String& fileOrIdentifier) override
    {
        return fileOrIdentifier == kCrashOnLoadIdentifier ? juce::String (kCrashOnLoadIdentifier)
                                                          : juce::String();
    }

    bool pluginNeedsRescanning (const juce::PluginDescription&) override { return false; }
    bool doesPluginStillExist (const juce::PluginDescription&) override { return true; }
    bool canScanForPlugins() const override { return false; }
    bool isTrivialToScan() const override { return true; }

    juce::StringArray searchPathsForPlugins (const juce::FileSearchPath&,
                                              bool, bool) override { return {}; }

    juce::FileSearchPath getDefaultLocationsToSearch() override { return {}; }

    bool requiresUnblockedMessageThreadDuringCreation (const juce::PluginDescription&) const override
    {
        return false;
    }

protected:
    //==========================================================================
    /** Hard-crash the worker process the instant the host asks for an instance —
        models a plugin that segfaults in its constructor/factory. The worker
        dies with SIGABRT before it can send PluginLoaded, so the host sees a
        load-crash (connection lost) and runs its crash-recovery path. */
    void createPluginInstance (const juce::PluginDescription& desc,
                                double, int,
                                PluginCreationCallback callback) override
    {
        if (desc.fileOrIdentifier != kCrashOnLoadIdentifier)
        {
            callback (nullptr,
                      "CrashOnLoadPluginFormat: identifier '"
                          + desc.fileOrIdentifier + "' is not '"
                          + kCrashOnLoadIdentifier + "'");
            return;
        }

        // Die. Never returns. (SIGABRT — same isolation contract as a plugin
        // segfault in its factory.)
        std::fflush (nullptr);
        ::abort();
    }

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (CrashOnLoadPluginFormat)
};

} // namespace element
