// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

/** ReadoutNode tests.
    Covers: pass-through CV, atomic latch, port layout, lifecycle, edge cases. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/processor.hpp>
#include <cmath>

#include "nodes/readoutnode.hpp"

using namespace element;

namespace {

/** Run one render block with known CV input values.
    cv buffer: ch0 = input, ch1 = output.
    Returns the output sample at the given index. */
float runReadout (ReadoutNode& node, float inputValue, int n = 64, int outSample = 0)
{
    juce::AudioSampleBuffer audio (0, n);
    juce::AudioSampleBuffer cv    (2, n);
    juce::MidiBuffer        midi;

    for (int i = 0; i < n; ++i)
        cv.setSample (0, i, inputValue);
    cv.clear (1, 0, n);

    RenderContext rc { audio, cv, midi, n };
    node.render (rc);
    return cv.getSample (1, outSample);
}

} // namespace

BOOST_AUTO_TEST_SUITE (ReadoutNodeTests)

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultDisplayValueIsZero)
{
    ReadoutNode node;
    BOOST_CHECK_SMALL (node.getCurrentDisplayValue(), 1e-6f);
}

BOOST_AUTO_TEST_CASE (PrepareResetsDisplayValue)
{
    ReadoutNode node;
    node.prepareToRender (44100.0, 64);
    BOOST_CHECK_SMALL (node.getCurrentDisplayValue(), 1e-6f);
}

BOOST_AUTO_TEST_CASE (PrepareReleaseNoCrash)
{
    ReadoutNode node;
    BOOST_CHECK_NO_THROW (node.prepareToRender (44100.0, 512));
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

// ── Port layout ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PortLayout)
{
    ReadoutNode node;
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::CV, true),  1); // 1 CV in
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::CV, false), 1); // 1 CV out
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, true),  0);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, false), 0);
}

// ── Pass-through ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PassesThroughPositiveValue)
{
    ReadoutNode node;
    node.prepareToRender (44100.0, 64);
    float out = runReadout (node, 0.75f);
    BOOST_CHECK_CLOSE (out, 0.75f, 0.001f);
}

BOOST_AUTO_TEST_CASE (PassesThroughNegativeValue)
{
    ReadoutNode node;
    node.prepareToRender (44100.0, 64);
    float out = runReadout (node, -0.5f);
    BOOST_CHECK_CLOSE (out, -0.5f, 0.001f);
}

BOOST_AUTO_TEST_CASE (PassesThroughZero)
{
    ReadoutNode node;
    node.prepareToRender (44100.0, 64);
    float out = runReadout (node, 0.0f);
    BOOST_CHECK_SMALL (out, 1e-6f);
}

BOOST_AUTO_TEST_CASE (AllSamplesPassThrough)
{
    ReadoutNode node;
    node.prepareToRender (44100.0, 64);

    const int n = 64;
    juce::AudioSampleBuffer audio (0, n);
    juce::AudioSampleBuffer cv    (2, n);
    juce::MidiBuffer        midi;

    for (int i = 0; i < n; ++i)
        cv.setSample (0, i, (float) i * 0.01f);
    cv.clear (1, 0, n);

    RenderContext rc { audio, cv, midi, n };
    node.render (rc);

    for (int i = 0; i < n; ++i)
        BOOST_CHECK_CLOSE (cv.getSample (1, i), (float) i * 0.01f, 0.001f);
}

// ── Atomic latch ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DisplayValueLatches)
{
    ReadoutNode node;
    node.prepareToRender (44100.0, 64);

    const int n = 64;
    juce::AudioSampleBuffer audio (0, n);
    juce::AudioSampleBuffer cv    (2, n);
    juce::MidiBuffer        midi;

    for (int i = 0; i < n; ++i)
        cv.setSample (0, i, (float) i * 0.01f); // ramp 0..0.63

    RenderContext rc { audio, cv, midi, n };
    node.render (rc);

    // Latch stores LAST sample = (n-1)*0.01 = 0.63
    BOOST_CHECK_CLOSE (node.getCurrentDisplayValue(), (n - 1) * 0.01f, 0.001f);
}

BOOST_AUTO_TEST_CASE (DisplayValueUpdatesEachBlock)
{
    ReadoutNode node;
    node.prepareToRender (44100.0, 64);

    runReadout (node, 0.3f);
    BOOST_CHECK_CLOSE (node.getCurrentDisplayValue(), 0.3f, 0.001f);

    runReadout (node, 0.7f);
    BOOST_CHECK_CLOSE (node.getCurrentDisplayValue(), 0.7f, 0.001f);
}

BOOST_AUTO_TEST_CASE (DisplayValueIsFinite)
{
    ReadoutNode node;
    node.prepareToRender (44100.0, 64);
    runReadout (node, 1e6f); // extreme value
    BOOST_CHECK (std::isfinite (node.getCurrentDisplayValue()));
}

// ── Edge: too few channels ─────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (OneCvChannelNoCrash)
{
    ReadoutNode node;
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio (0, 64);
    juce::AudioSampleBuffer cv    (1, 64); // only 1 — render bails at < 2
    juce::MidiBuffer        midi;

    for (int i = 0; i < 64; ++i)
        cv.setSample (0, i, 1.0f);

    RenderContext rc { audio, cv, midi, 64 };
    BOOST_CHECK_NO_THROW (node.render (rc));
    // displayValue not updated when channels < 2 — stays at prepare-reset value
    BOOST_CHECK_SMALL (node.getCurrentDisplayValue(), 1e-6f);
}

BOOST_AUTO_TEST_CASE (ZeroCvChannelsNoCrash)
{
    ReadoutNode node;
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio (0, 64);
    juce::AudioSampleBuffer cv    (0, 64);
    juce::MidiBuffer        midi;
    RenderContext rc { audio, cv, midi, 64 };
    BOOST_CHECK_NO_THROW (node.render (rc));
}

// ── Plugin description ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PluginDescriptionPopulated)
{
    ReadoutNode node;
    juce::PluginDescription desc;
    node.getPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier == juce::String ("element.readout"));
    BOOST_CHECK_EQUAL (desc.uniqueId, 0x656c7264);
}

// ── State (trivial no-op) ─────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (GetStateNoCrash)
{
    ReadoutNode node;
    juce::MemoryBlock block;
    BOOST_CHECK_NO_THROW (node.getState (block));
}

BOOST_AUTO_TEST_CASE (SetStateNullNoCrash)
{
    ReadoutNode node;
    BOOST_CHECK_NO_THROW (node.setState (nullptr, 0));
}

BOOST_AUTO_TEST_SUITE_END()
