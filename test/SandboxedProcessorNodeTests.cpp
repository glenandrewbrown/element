// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for SandboxedProcessorNode without spawning a real subprocess.
// Covers: construction, port layout, listener callbacks, render safety,
// state caching, and parameter boundary handling.
//
// Note: SandboxedProcessorNode constructor calls sandbox->launch() which will
// fail silently in CI (binary absent), setting hasError=true. All tests are
// designed to be safe whether or not the sandbox process actually starts.

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/plugins.hpp>
#include "nodes/sandboxedprocessor.hpp"

using namespace element;
using namespace juce;

// ── Fixture ───────────────────────────────────────────────────────────────────

struct SandboxNodeFixture
{
    PluginManager manager; // standalone — no Context needed

    PluginDescription makeDesc (const String& name       = "TestPlugin",
                                const String& identifier = "el.TestPlugin")
    {
        PluginDescription d;
        d.name              = name;
        d.fileOrIdentifier  = identifier;
        d.pluginFormatName  = "Internal";
        d.numInputChannels  = 2;
        d.numOutputChannels = 2;
        return d;
    }
};

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_SUITE (SandboxedProcessorNodeTests)

BOOST_FIXTURE_TEST_CASE (ConstructWithDescriptionNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    BOOST_CHECK_NO_THROW ({
        SandboxedProcessorNode node (desc, manager);
        ignoreUnused (node);
    });
}

BOOST_FIXTURE_TEST_CASE (NameContainsPluginName, SandboxNodeFixture)
{
    auto desc = makeDesc ("MyPlugin");
    SandboxedProcessorNode node (desc, manager);
    BOOST_CHECK (node.getName().contains ("MyPlugin"));
}

BOOST_FIXTURE_TEST_CASE (GetPluginDescriptionMatchesInput, SandboxNodeFixture)
{
    auto desc = makeDesc ("TestFX", "el.TestFX");
    SandboxedProcessorNode node (desc, manager);
    PluginDescription out;
    node.getPluginDescription (out);
    BOOST_CHECK_EQUAL (out.name.toStdString(), "TestFX");
    BOOST_CHECK_EQUAL (out.fileOrIdentifier.toStdString(), "el.TestFX");
}

// ── Default state (sandbox not yet loaded) ────────────────────────────────────

BOOST_FIXTURE_TEST_CASE (IsPluginLoadedReturnsBoolWithoutCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    // Just verify no crash; result depends on sandbox launch success in environment
    const bool loaded = node.isPluginLoaded();
    ignoreUnused (loaded);
    BOOST_CHECK (true);
}

BOOST_FIXTURE_TEST_CASE (GetSandboxStateNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    const auto state = node.getSandboxState();
    ignoreUnused (state);
    BOOST_CHECK (true);
}

BOOST_FIXTURE_TEST_CASE (WantsContextReturnsTrue, SandboxNodeFixture)
{
    // wantsContext() MUST return true: GraphNode caches the context pointer at
    // construction and derefs it on the audio thread for wantsContext()==false
    // nodes — false here caused a SIGSEGV on first render (fixed 2026-06-10,
    // commit 36e87345; see also AsyncPluginLoadTest's regression coverage).
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    BOOST_CHECK (node.wantsContext());
}

// ── Render with no plugin loaded outputs silence ──────────────────────────────

BOOST_FIXTURE_TEST_CASE (RenderWithNoPluginNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    node.prepareToRender (44100.0, 64);

    AudioSampleBuffer audio (2, 64);
    AudioSampleBuffer cv    (0, 64);
    MidiBuffer        midi;
    RenderContext rc (audio, cv, midi, 64);

    BOOST_CHECK_NO_THROW (node.render (rc));
    node.releaseResources();
}

BOOST_FIXTURE_TEST_CASE (RenderBypassedNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    node.prepareToRender (44100.0, 64);

    AudioSampleBuffer audio (2, 64);
    AudioSampleBuffer cv    (0, 64);
    MidiBuffer        midi;
    RenderContext rc (audio, cv, midi, 64);

    BOOST_CHECK_NO_THROW (node.renderBypassed (rc));
    node.releaseResources();
}

// ── State ─────────────────────────────────────────────────────────────────────

BOOST_FIXTURE_TEST_CASE (GetStateNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    MemoryBlock block;
    BOOST_CHECK_NO_THROW (node.getState (block));
}

BOOST_FIXTURE_TEST_CASE (SetStateNullNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    BOOST_CHECK_NO_THROW (node.setState (nullptr, 0));
}

BOOST_FIXTURE_TEST_CASE (SetStateValidDataNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    const uint8_t fakeState[] = { 0x01, 0x02, 0x03, 0x04 };
    BOOST_CHECK_NO_THROW (node.setState (fakeState, (int) sizeof (fakeState)));
}

// ── Listener callbacks (invoked directly, no real sandbox) ────────────────────

BOOST_FIXTURE_TEST_CASE (SandboxPluginLoadFailedSetsNotLoaded, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    node.sandboxPluginLoadFailed (nullptr, "test-induced failure");
    BOOST_CHECK (! node.isPluginLoaded());
}

BOOST_FIXTURE_TEST_CASE (SandboxCrashedSetsNotLoaded, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    node.sandboxCrashed (nullptr);
    BOOST_CHECK (! node.isPluginLoaded());
}

BOOST_FIXTURE_TEST_CASE (SandboxParameterChangedOutOfRangeNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    // Out-of-range parameter index — must not crash or assert
    BOOST_CHECK_NO_THROW (node.sandboxParameterChanged (nullptr, 9999,  0.5f));
    BOOST_CHECK_NO_THROW (node.sandboxParameterChanged (nullptr, -1,    0.5f));
    BOOST_CHECK_NO_THROW (node.sandboxParameterChanged (nullptr, 0,     0.5f));
}

BOOST_FIXTURE_TEST_CASE (SandboxLatencyChangedNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    node.prepareToRender (44100.0, 256);
    BOOST_CHECK_NO_THROW (node.sandboxLatencyChanged (nullptr, 128));
    node.releaseResources();
}

BOOST_FIXTURE_TEST_CASE (SandboxRestartedCallbackNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    BOOST_CHECK_NO_THROW (node.sandboxRestarted (nullptr));
}

// ── Port layout ───────────────────────────────────────────────────────────────

BOOST_FIXTURE_TEST_CASE (RefreshPortsNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    BOOST_CHECK_NO_THROW (node.refreshPorts());
}

BOOST_FIXTURE_TEST_CASE (RefreshPortsIdempotent, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    node.refreshPorts();
    const int n = (int) node.getNumPorts();
    node.refreshPorts();
    BOOST_CHECK_EQUAL ((int) node.getNumPorts(), n);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

BOOST_FIXTURE_TEST_CASE (DoublePrepareNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    node.prepareToRender (44100.0, 512);
    BOOST_CHECK_NO_THROW (node.prepareToRender (48000.0, 256));
    node.releaseResources();
}

BOOST_FIXTURE_TEST_CASE (ReleaseWithoutPrepareNoCrash, SandboxNodeFixture)
{
    auto desc = makeDesc();
    SandboxedProcessorNode node (desc, manager);
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

BOOST_AUTO_TEST_SUITE_END()
