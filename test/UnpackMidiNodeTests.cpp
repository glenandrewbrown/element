// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/processor.hpp>
#include "nodes/unpackmidi.hpp"

using namespace element;

namespace {

static constexpr int kBufLen = 64;

/** Render one MIDI message through the node, return CV channel 0 value (CC). */
static float renderCC (UnpackMidiNode& node, int ccNum, int ccVal, int ch = 1)
{
    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 3, kBufLen };
    juce::MidiBuffer        midi;
    midi.addEvent (juce::MidiMessage::controllerEvent (ch, ccNum, ccVal), 0);
    RenderContext rc { audio, cv, midi, kBufLen };
    node.render (rc);
    return cv.getSample (0, 0); // CC output
}

} // namespace

BOOST_AUTO_TEST_SUITE (UnpackMidiNodeTests)

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultParams)
{
    UnpackMidiNode node;
    BOOST_CHECK_EQUAL (node.getCcNumber(),   0);
    BOOST_CHECK_EQUAL (node.getMidiChannel(), 1);
}

BOOST_AUTO_TEST_CASE (NameNotEmpty)
{
    UnpackMidiNode node;
    BOOST_CHECK (node.getName().isNotEmpty());
}

// ── Parameter clamping ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SetCcNumberClamps)
{
    UnpackMidiNode node;
    node.setCcNumber (-1);
    BOOST_CHECK_EQUAL (node.getCcNumber(), 0);
    node.setCcNumber (200);
    BOOST_CHECK_EQUAL (node.getCcNumber(), 127);
}

BOOST_AUTO_TEST_CASE (SetMidiChannelClamps)
{
    UnpackMidiNode node;
    node.setMidiChannel (0);
    BOOST_CHECK_EQUAL (node.getMidiChannel(), 1);
    node.setMidiChannel (99);
    BOOST_CHECK_EQUAL (node.getMidiChannel(), 16);
}

// ── Port layout ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PortLayout)
{
    UnpackMidiNode node;
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi, true),  1);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::CV,   false), 3); // CC, PB, AT
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, true), 0);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PrepareReleaseNoCrash)
{
    UnpackMidiNode node;
    BOOST_CHECK_NO_THROW (node.prepareToRender (44100.0, 512));
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

BOOST_AUTO_TEST_CASE (PrepareSetsNeutralValues)
{
    // After prepare, pitch-bend CV output should be 0.5 (centre)
    UnpackMidiNode node;
    node.prepareToRender (44100.0, kBufLen);

    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 3, kBufLen };
    juce::MidiBuffer        midi; // empty — no events
    RenderContext rc { audio, cv, midi, kBufLen };
    node.render (rc);

    BOOST_CHECK_SMALL (cv.getSample (0, 0), 0.001f);     // CC: 0.0
    BOOST_CHECK_CLOSE (cv.getSample (1, 0), 0.5f, 0.01f); // PB: centre
    BOOST_CHECK_SMALL (cv.getSample (2, 0), 0.001f);     // AT: 0.0
}

// ── State round-trip ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (StateRoundTrip)
{
    UnpackMidiNode src;
    src.setCcNumber (74);
    src.setMidiChannel (5);

    juce::MemoryBlock block;
    src.getState (block);

    UnpackMidiNode dst;
    dst.setState (block.getData(), (int) block.getSize());
    BOOST_CHECK_EQUAL (dst.getCcNumber(),    74);
    BOOST_CHECK_EQUAL (dst.getMidiChannel(), 5);
}

BOOST_AUTO_TEST_CASE (SetStateTooSmallIgnored)
{
    UnpackMidiNode node;
    const char tiny = 0;
    BOOST_CHECK_NO_THROW (node.setState (&tiny, 1));
    BOOST_CHECK_EQUAL (node.getCcNumber(),   0);
    BOOST_CHECK_EQUAL (node.getMidiChannel(), 1);
}

// ── CC extraction ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (CcMaxMapsToOne)
{
    UnpackMidiNode node;
    node.setCcNumber (7);
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    BOOST_CHECK_CLOSE (renderCC (node, 7, 127, 1), 1.0f, 0.1f);
}

BOOST_AUTO_TEST_CASE (CcZeroMapsToZero)
{
    UnpackMidiNode node;
    node.setCcNumber (7);
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    BOOST_CHECK_SMALL (renderCC (node, 7, 0, 1), 0.01f);
}

BOOST_AUTO_TEST_CASE (CcMidMapsToHalf)
{
    UnpackMidiNode node;
    node.setCcNumber (7);
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    const float out = renderCC (node, 7, 64, 1);
    BOOST_CHECK (out > 0.45f && out < 0.55f);
}

BOOST_AUTO_TEST_CASE (CcWrongNumberIgnored)
{
    // node listens on CC 7; send CC 10 — output stays at 0
    UnpackMidiNode node;
    node.setCcNumber (7);
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    BOOST_CHECK_SMALL (renderCC (node, 10, 127, 1), 0.01f);
}

BOOST_AUTO_TEST_CASE (CcWrongChannelIgnored)
{
    // node listens on channel 1; send on channel 2 — output stays at 0
    UnpackMidiNode node;
    node.setCcNumber (7);
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    BOOST_CHECK_SMALL (renderCC (node, 7, 127, 2), 0.01f);
}

// ── Pitch-bend extraction ─────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PitchBendCentreIsHalf)
{
    UnpackMidiNode node;
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 3, kBufLen };
    juce::MidiBuffer        midi;
    midi.addEvent (juce::MidiMessage::pitchWheel (1, 8191), 0); // centre
    RenderContext rc { audio, cv, midi, kBufLen };
    node.render (rc);

    const float pb = cv.getSample (1, 0);
    BOOST_CHECK (pb > 0.45f && pb < 0.55f);
}

BOOST_AUTO_TEST_CASE (PitchBendMaxIsOne)
{
    UnpackMidiNode node;
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 3, kBufLen };
    juce::MidiBuffer        midi;
    midi.addEvent (juce::MidiMessage::pitchWheel (1, 16383), 0); // max
    RenderContext rc { audio, cv, midi, kBufLen };
    node.render (rc);

    BOOST_CHECK_CLOSE (cv.getSample (1, 0), 1.0f, 0.01f);
}

// ── Channel-pressure extraction ───────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ChannelPressureMaxIsOne)
{
    UnpackMidiNode node;
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 3, kBufLen };
    juce::MidiBuffer        midi;
    midi.addEvent (juce::MidiMessage::channelPressureChange (1, 127), 0);
    RenderContext rc { audio, cv, midi, kBufLen };
    node.render (rc);

    BOOST_CHECK_CLOSE (cv.getSample (2, 0), 1.0f, 0.01f);
}

// ── Sample-and-hold: last value persists across empty blocks ──────────────────

BOOST_AUTO_TEST_CASE (SampleAndHold)
{
    UnpackMidiNode node;
    node.setCcNumber (1);
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    // Block 1: send CC 64
    const float first = renderCC (node, 1, 64, 1);
    BOOST_CHECK (first > 0.45f && first < 0.55f);

    // Block 2: empty MIDI — value should hold
    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 3, kBufLen };
    juce::MidiBuffer        emptyMidi;
    RenderContext rc { audio, cv, emptyMidi, kBufLen };
    node.render (rc);

    const float held = cv.getSample (0, 0);
    BOOST_CHECK_CLOSE (held, first, 1.0f); // held value within 1%
}

// ── All CV output channels filled ────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AllSamplesFilledInBlock)
{
    UnpackMidiNode node;
    node.setCcNumber (7);
    node.setMidiChannel (1);
    node.prepareToRender (44100.0, kBufLen);

    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 3, kBufLen };
    juce::MidiBuffer        midi;
    midi.addEvent (juce::MidiMessage::controllerEvent (1, 7, 127), 0);
    RenderContext rc { audio, cv, midi, kBufLen };
    node.render (rc);

    // All kBufLen samples of the CC channel should hold the same value
    const float expected = cv.getSample (0, 0);
    for (int i = 1; i < kBufLen; ++i)
        BOOST_CHECK_CLOSE (cv.getSample (0, i), expected, 0.001f);
}

// ── Plugin description ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PluginDescriptionPopulated)
{
    UnpackMidiNode node;
    juce::PluginDescription desc;
    node.getPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.isNotEmpty());
}

BOOST_AUTO_TEST_SUITE_END()
