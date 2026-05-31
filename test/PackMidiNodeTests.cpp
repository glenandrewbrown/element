// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/processor.hpp>
#include "nodes/packmidi.hpp"

using namespace element;

namespace {

static constexpr int kBufLen = 64;

struct PackHarness
{
    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 3, kBufLen };
    juce::MidiBuffer        midi;

    /** gate[i] = 1 or 0, value[i] ∈ 0..1 */
    void setGate  (int sample, float v) { cv.setSample (0, sample, v); }
    void setValue (int sample, float v) { cv.setSample (1, sample, v); }

    void render (PackMidiNode& node)
    {
        RenderContext rc { audio, cv, midi, kBufLen };
        node.render (rc);
    }
};

} // namespace

BOOST_AUTO_TEST_SUITE (PackMidiNodeTests)

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultParams)
{
    PackMidiNode node;
    BOOST_CHECK_EQUAL (node.getCcNumber(),   0);
    BOOST_CHECK_EQUAL (node.getMidiChannel(), 1);
}

BOOST_AUTO_TEST_CASE (NameNotEmpty)
{
    PackMidiNode node;
    BOOST_CHECK (node.getName().isNotEmpty());
}

// ── Parameter clamping ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SetCcNumberClamps)
{
    PackMidiNode node;
    node.setCcNumber (-1);
    BOOST_CHECK_EQUAL (node.getCcNumber(), 0);
    node.setCcNumber (200);
    BOOST_CHECK_EQUAL (node.getCcNumber(), 127);
}

BOOST_AUTO_TEST_CASE (SetMidiChannelClamps)
{
    PackMidiNode node;
    node.setMidiChannel (0);
    BOOST_CHECK_EQUAL (node.getMidiChannel(), 1);
    node.setMidiChannel (99);
    BOOST_CHECK_EQUAL (node.getMidiChannel(), 16);
}

// ── Port layout ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PortLayout)
{
    PackMidiNode node;
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::CV,   true),  3);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi, false), 1);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, true), 0);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PrepareReleaseNoCrash)
{
    PackMidiNode node;
    BOOST_CHECK_NO_THROW (node.prepareToRender (44100.0, 512));
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

// ── State round-trip ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (StateRoundTrip)
{
    PackMidiNode src;
    src.setCcNumber (74);
    src.setMidiChannel (3);

    juce::MemoryBlock block;
    src.getState (block);

    PackMidiNode dst;
    dst.setState (block.getData(), (int) block.getSize());
    BOOST_CHECK_EQUAL (dst.getCcNumber(),    74);
    BOOST_CHECK_EQUAL (dst.getMidiChannel(), 3);
}

BOOST_AUTO_TEST_CASE (SetStateTooSmallIgnored)
{
    PackMidiNode node;
    const char tiny = 0;
    BOOST_CHECK_NO_THROW (node.setState (&tiny, 1));
    BOOST_CHECK_EQUAL (node.getCcNumber(), 0); // defaults preserved
}

// ── Render: rising edge emits CC ──────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (RisingEdgeEmitsCc)
{
    PackMidiNode node;
    node.setCcNumber (7);
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    PackHarness h;
    // gate low for samples 0-3, rises at sample 4
    for (int i = 4; i < kBufLen; ++i) h.setGate (i, 1.0f);
    h.setValue (4, 0.5f); // CC value ≈ 64

    h.render (node);

    bool ccFound = false;
    for (const auto m : h.midi)
    {
        const auto msg = m.getMessage();
        if (msg.isController() && msg.getControllerNumber() == 7)
        {
            BOOST_CHECK_EQUAL (msg.getChannel(), 1);
            BOOST_CHECK (msg.getControllerValue() >= 60 && msg.getControllerValue() <= 68);
            ccFound = true;
        }
    }
    BOOST_CHECK (ccFound);
}

BOOST_AUTO_TEST_CASE (SteadyHighNoRepeat)
{
    // gate stays high → only fires on the initial rising edge, not every sample
    PackMidiNode node;
    node.setCcNumber (1);
    node.prepareToRender (44100.0, kBufLen);

    PackHarness h;
    for (int i = 1; i < kBufLen; ++i) h.setGate (i, 1.0f); // low at 0, high at 1
    h.render (node);

    int ccCount = 0;
    for (const auto m : h.midi)
        if (m.getMessage().isController()) ++ccCount;
    BOOST_CHECK_EQUAL (ccCount, 1); // exactly one CC emitted
}

BOOST_AUTO_TEST_CASE (GateAlwaysLowNoMidi)
{
    PackMidiNode node;
    node.prepareToRender (44100.0, kBufLen);

    PackHarness h; // all zeros in cv
    h.render (node);

    int ccCount = 0;
    for (const auto m : h.midi)
        if (m.getMessage().isController()) ++ccCount;
    BOOST_CHECK_EQUAL (ccCount, 0);
}

BOOST_AUTO_TEST_CASE (FallingEdgeNoEmit)
{
    // gate high then low — no extra CC on falling edge
    PackMidiNode node;
    node.prepareToRender (44100.0, kBufLen);

    PackHarness h;
    for (int i = 0; i < 32; ++i) h.setGate (i, 1.0f); // high then drops
    h.render (node);

    int ccCount = 0;
    for (const auto m : h.midi)
        if (m.getMessage().isController()) ++ccCount;
    BOOST_CHECK_EQUAL (ccCount, 1); // only the rising edge at sample 0
}

BOOST_AUTO_TEST_CASE (ValueZeroMapsToCcZero)
{
    PackMidiNode node;
    node.setCcNumber (11);
    node.prepareToRender (44100.0, kBufLen);

    PackHarness h;
    h.setGate (1, 1.0f);
    h.setValue (1, 0.0f);
    h.render (node);

    for (const auto m : h.midi)
        if (m.getMessage().isController())
            BOOST_CHECK_EQUAL (m.getMessage().getControllerValue(), 0);
}

BOOST_AUTO_TEST_CASE (ValueOneMapsToCc127)
{
    PackMidiNode node;
    node.setCcNumber (11);
    node.prepareToRender (44100.0, kBufLen);

    PackHarness h;
    h.setGate (1, 1.0f);
    h.setValue (1, 1.0f);
    h.render (node);

    for (const auto m : h.midi)
        if (m.getMessage().isController())
            BOOST_CHECK_EQUAL (m.getMessage().getControllerValue(), 127);
}

// ── Too-few CV channels: no crash ─────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (TooFewCvChannelsNoCrash)
{
    PackMidiNode node;
    node.prepareToRender (44100.0, kBufLen);

    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer tinyCV { 1, kBufLen };
    juce::MidiBuffer        midi;
    RenderContext rc { audio, tinyCV, midi, kBufLen };
    BOOST_CHECK_NO_THROW (node.render (rc));
}

// ── Plugin description ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PluginDescriptionPopulated)
{
    PackMidiNode node;
    juce::PluginDescription desc;
    node.getPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.isNotEmpty());
}

BOOST_AUTO_TEST_SUITE_END()
