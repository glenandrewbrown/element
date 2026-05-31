// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/processor.hpp>
#include "nodes/midivelocityamp.hpp"

using namespace element;

namespace {

static constexpr int kBufLen = 64;

/** Run a single note-on through the node and return output velocity (-1 = not found). */
static int renderNoteOn (MidiVelocityAmpNode& node, int vel, int ch = 1, int note = 60)
{
    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 0, kBufLen };
    juce::MidiBuffer        midi;
    midi.addEvent (juce::MidiMessage::noteOn (ch, note, (uint8_t) vel), 0);
    RenderContext rc { audio, cv, midi, kBufLen };
    node.render (rc);
    for (const auto m : midi)
        if (m.getMessage().isNoteOn())
            return m.getMessage().getVelocity();
    return -1;
}

} // namespace

BOOST_AUTO_TEST_SUITE (MidiVelocityAmpTests)

// ── Construction / defaults ───────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultScaleAndPower)
{
    MidiVelocityAmpNode node;
    BOOST_CHECK_CLOSE (node.getScale(), 1.0f, 0.001f);
    BOOST_CHECK_CLOSE (node.getPower(), 1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (NameNotEmpty)
{
    MidiVelocityAmpNode node;
    BOOST_CHECK (node.getName().isNotEmpty());
}

// ── Scale clamping ────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ScaleClampHigh)
{
    MidiVelocityAmpNode node;
    node.setScale (5.0f);
    BOOST_CHECK_CLOSE (node.getScale(), 2.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (ScaleClampLow)
{
    MidiVelocityAmpNode node;
    node.setScale (-1.0f);
    BOOST_CHECK_SMALL (node.getScale(), 0.001f);
}

// ── Power clamping ────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PowerClampHigh)
{
    MidiVelocityAmpNode node;
    node.setPower (10.0f);
    BOOST_CHECK_CLOSE (node.getPower(), 4.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (PowerClampLow)
{
    MidiVelocityAmpNode node;
    node.setPower (0.0f);
    BOOST_CHECK_CLOSE (node.getPower(), 0.25f, 0.001f);
}

// ── Port layout ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PortLayout)
{
    MidiVelocityAmpNode node;
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi, true),  1);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi, false), 1);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, true),  0);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PrepareReleaseNoCrash)
{
    MidiVelocityAmpNode node;
    BOOST_CHECK_NO_THROW (node.prepareToRender (44100.0, 512));
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

// ── State round-trip ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (StateRoundTrip)
{
    MidiVelocityAmpNode src;
    src.setScale (1.5f);
    src.setPower (2.0f);

    juce::MemoryBlock block;
    src.getState (block);

    MidiVelocityAmpNode dst;
    dst.setState (block.getData(), (int) block.getSize());
    BOOST_CHECK_CLOSE (dst.getScale(), 1.5f, 0.001f);
    BOOST_CHECK_CLOSE (dst.getPower(), 2.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (SetStateTooSmallIgnored)
{
    MidiVelocityAmpNode node;
    const char tiny = 0;
    BOOST_CHECK_NO_THROW (node.setState (&tiny, 1));
    BOOST_CHECK_CLOSE (node.getScale(), 1.0f, 0.001f);
    BOOST_CHECK_CLOSE (node.getPower(), 1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (SetStateNullptrIgnored)
{
    MidiVelocityAmpNode node;
    BOOST_CHECK_NO_THROW (node.setState (nullptr, 0));
}

BOOST_AUTO_TEST_CASE (SetStateClampsOutOfRange)
{
    MidiVelocityAmpNode node;
    // store scale=5 (out of range) and power=0 (out of range)
    float vals[2] = { 5.0f, 0.0f };
    node.setState (vals, (int) sizeof (vals));
    BOOST_CHECK_CLOSE (node.getScale(), 2.0f, 0.001f);   // clamped to max
    BOOST_CHECK_CLOSE (node.getPower(), 0.25f, 0.001f);  // clamped to min
}

// ── Unity pass-through (early-exit path) ─────────────────────────────────────

BOOST_AUTO_TEST_CASE (UnityScaleAndPowerPassThrough)
{
    // scale=1 power=1 → node exits early, buffer untouched
    MidiVelocityAmpNode node;
    node.prepareToRender (44100.0, kBufLen);
    BOOST_CHECK_EQUAL (renderNoteOn (node, 100), 100);
}

// ── Scale factor ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ScaleZeroSilencesVelocity)
{
    MidiVelocityAmpNode node;
    node.setScale (0.0f);
    node.prepareToRender (44100.0, kBufLen);
    BOOST_CHECK_EQUAL (renderNoteOn (node, 127), 0);
}

BOOST_AUTO_TEST_CASE (ScaleHalfReducesVelocity)
{
    MidiVelocityAmpNode node;
    node.setScale (0.5f);
    node.prepareToRender (44100.0, kBufLen);
    const int out = renderNoteOn (node, 100);
    // 100 * 0.5 ≈ 50 (±2 for float rounding)
    BOOST_CHECK (out >= 48 && out <= 52);
}

BOOST_AUTO_TEST_CASE (ScaleDoubleClampedAt127)
{
    // scale=2 with vel=127 must not exceed 127
    MidiVelocityAmpNode node;
    node.setScale (2.0f);
    node.prepareToRender (44100.0, kBufLen);
    BOOST_CHECK_LE (renderNoteOn (node, 127), 127);
}

// ── Power curve ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PowerExpand_MidVelocityDrops)
{
    // power=2 (expand): normalised mid velocity squared → lower value
    MidiVelocityAmpNode node;
    node.setScale (1.0f);
    node.setPower (2.0f);
    node.prepareToRender (44100.0, kBufLen);
    BOOST_CHECK_LT (renderNoteOn (node, 64), 64);
}

BOOST_AUTO_TEST_CASE (PowerCompress_MidVelocityRises)
{
    // power=0.5 (compress): sqrt of normalised mid velocity → higher value
    MidiVelocityAmpNode node;
    node.setScale (1.0f);
    node.setPower (0.5f);
    node.prepareToRender (44100.0, kBufLen);
    BOOST_CHECK_GT (renderNoteOn (node, 64), 64);
}

BOOST_AUTO_TEST_CASE (MaxVelocityPreservedAtAnyPower)
{
    // vel=127 normalised=1.0, any power keeps it at 1.0
    MidiVelocityAmpNode node;
    node.setScale (1.0f);
    node.setPower (3.0f);
    node.prepareToRender (44100.0, kBufLen);
    BOOST_CHECK_EQUAL (renderNoteOn (node, 127), 127);
}

// ── Non-NoteOn messages pass through unchanged ────────────────────────────────

BOOST_AUTO_TEST_CASE (NoteOffPassThrough)
{
    MidiVelocityAmpNode node;
    node.setScale (0.0f); // would kill velocity if it processed note-offs
    node.prepareToRender (44100.0, kBufLen);

    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 0, kBufLen };
    juce::MidiBuffer        midi;
    midi.addEvent (juce::MidiMessage::noteOff (1, 60, (uint8_t) 64), 0);
    RenderContext rc { audio, cv, midi, kBufLen };
    node.render (rc);

    bool found = false;
    for (const auto m : midi)
        if (m.getMessage().isNoteOff()) found = true;
    BOOST_CHECK (found);
}

BOOST_AUTO_TEST_CASE (CcPassThrough)
{
    MidiVelocityAmpNode node;
    node.setScale (2.0f);
    node.prepareToRender (44100.0, kBufLen);

    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 0, kBufLen };
    juce::MidiBuffer        midi;
    midi.addEvent (juce::MidiMessage::controllerEvent (1, 7, 100), 0);
    RenderContext rc { audio, cv, midi, kBufLen };
    node.render (rc);

    bool found = false;
    for (const auto m : midi)
        if (m.getMessage().isController() && m.getMessage().getControllerValue() == 100)
            found = true;
    BOOST_CHECK (found);
}

BOOST_AUTO_TEST_CASE (PitchBendPassThrough)
{
    MidiVelocityAmpNode node;
    node.setScale (0.0f);
    node.prepareToRender (44100.0, kBufLen);

    juce::AudioSampleBuffer audio { 0, kBufLen };
    juce::AudioSampleBuffer cv    { 0, kBufLen };
    juce::MidiBuffer        midi;
    midi.addEvent (juce::MidiMessage::pitchWheel (1, 8000), 0);
    RenderContext rc { audio, cv, midi, kBufLen };
    node.render (rc);

    bool found = false;
    for (const auto m : midi)
        if (m.getMessage().isPitchWheel()) found = true;
    BOOST_CHECK (found);
}

// ── Plugin description ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PluginDescriptionPopulated)
{
    MidiVelocityAmpNode node;
    juce::PluginDescription desc;
    node.getPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.isNotEmpty());
}

BOOST_AUTO_TEST_SUITE_END()
