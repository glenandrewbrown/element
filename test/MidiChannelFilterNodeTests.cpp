// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include "nodes/midichannelfilter.hpp"

using namespace element;
using namespace juce;

// ── RenderContext factory ─────────────────────────────────────────────────────

static RenderContext makeContext (MidiBuffer& midiRef, int numSamples = 64)
{
    static AudioSampleBuffer audio (0, 64);
    static AudioSampleBuffer cv    (0, 64);
    return RenderContext (audio, cv, midiRef, numSamples);
}

// ── Construction / name ───────────────────────────────────────────────────────

BOOST_AUTO_TEST_SUITE (MidiChannelFilterNodeTests)

BOOST_AUTO_TEST_CASE (DefaultMaskAllChannelsEnabled)
{
    MidiChannelFilterNode node;
    BOOST_CHECK_EQUAL (node.getChannelMask(), static_cast<uint16_t> (0xFFFF));
}

BOOST_AUTO_TEST_CASE (NameNotEmpty)
{
    MidiChannelFilterNode node;
    BOOST_CHECK (node.getName().isNotEmpty());
}

// ── Port layout ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (HasOneMidiInputOneOutput)
{
    MidiChannelFilterNode node;
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi, true),  1);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi, false), 1);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, true), 0);
}

BOOST_AUTO_TEST_CASE (RefreshPortsIdempotent)
{
    MidiChannelFilterNode node;
    node.refreshPorts();
    const int n = (int) node.getNumPorts();
    node.refreshPorts();
    BOOST_CHECK_EQUAL ((int) node.getNumPorts(), n);
}

// ── setChannelMask / getChannelMask ───────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SetMaskBlocksAll)
{
    MidiChannelFilterNode node;
    node.setChannelMask (0x0000);
    BOOST_CHECK_EQUAL (node.getChannelMask(), static_cast<uint16_t> (0x0000));
}

BOOST_AUTO_TEST_CASE (SetMaskSingleChannel)
{
    MidiChannelFilterNode node;
    node.setChannelMask (0x0001);
    BOOST_CHECK_EQUAL (node.getChannelMask(), static_cast<uint16_t> (0x0001));
}

BOOST_AUTO_TEST_CASE (SetMaskUpperByte)
{
    MidiChannelFilterNode node;
    node.setChannelMask (0xFF00); // channels 9–16
    BOOST_CHECK_EQUAL (node.getChannelMask(), static_cast<uint16_t> (0xFF00));
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PrepareReleaseNoCrash)
{
    MidiChannelFilterNode node;
    BOOST_CHECK_NO_THROW (node.prepareToRender (44100.0, 64));
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

BOOST_AUTO_TEST_CASE (DoublePrepareNoCrash)
{
    MidiChannelFilterNode node;
    node.prepareToRender (44100.0, 64);
    BOOST_CHECK_NO_THROW (node.prepareToRender (48000.0, 512));
    node.releaseResources();
}

BOOST_AUTO_TEST_CASE (ReleaseWithoutPrepareNoCrash)
{
    MidiChannelFilterNode node;
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

// ── render: pass-through (mask = 0xFFFF) ─────────────────────────────────────

BOOST_AUTO_TEST_CASE (AllChannelsPassedWhenMaskFull)
{
    MidiChannelFilterNode node;
    node.prepareToRender (44100.0, 64);

    MidiBuffer midi;
    for (int ch = 1; ch <= 16; ++ch)
        midi.addEvent (MidiMessage::noteOn (ch, 60, (uint8_t) 100), ch - 1);

    auto rc = makeContext (midi);
    node.render (rc);

    BOOST_CHECK_EQUAL (midi.getNumEvents(), 16); // unchanged
    node.releaseResources();
}

// ── render: block all channels ────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ZeroMaskBlocksAllChannelMessages)
{
    MidiChannelFilterNode node;
    node.setChannelMask (0x0000);
    node.prepareToRender (44100.0, 64);

    MidiBuffer midi;
    for (int ch = 1; ch <= 4; ++ch)
        midi.addEvent (MidiMessage::noteOn (ch, 60, (uint8_t) 100), ch - 1);

    auto rc = makeContext (midi);
    node.render (rc);

    BOOST_CHECK_EQUAL (midi.getNumEvents(), 0);
    node.releaseResources();
}

// ── render: single channel filter ────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (OnlyChannel1Passes)
{
    MidiChannelFilterNode node;
    node.setChannelMask (0x0001); // bit 0 = channel 1
    node.prepareToRender (44100.0, 64);

    MidiBuffer midi;
    midi.addEvent (MidiMessage::noteOn (1, 60, (uint8_t) 100), 0); // passes
    midi.addEvent (MidiMessage::noteOn (2, 62, (uint8_t) 100), 1); // blocked
    midi.addEvent (MidiMessage::noteOn (3, 64, (uint8_t) 100), 2); // blocked

    auto rc = makeContext (midi);
    node.render (rc);

    BOOST_CHECK_EQUAL (midi.getNumEvents(), 1);
    node.releaseResources();
}

// ── render: non-channel messages always pass ─────────────────────────────────

BOOST_AUTO_TEST_CASE (SysExPassesThroughWithZeroMask)
{
    MidiChannelFilterNode node;
    node.setChannelMask (0x0000);
    node.prepareToRender (44100.0, 64);

    MidiBuffer midi;
    const uint8_t bytes[] = { 0xF0, 0x7E, 0x7F, 0xF7 };
    midi.addEvent (MidiMessage (bytes, 4), 0);
    midi.addEvent (MidiMessage::noteOn (1, 60, (uint8_t) 100), 1); // blocked

    auto rc = makeContext (midi);
    node.render (rc);

    BOOST_CHECK_EQUAL (midi.getNumEvents(), 1); // only SysEx survives
    node.releaseResources();
}

// ── render: empty buffer is safe ─────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (EmptyBufferRenderNoCrash)
{
    MidiChannelFilterNode node;
    node.prepareToRender (44100.0, 64);
    MidiBuffer midi;
    auto rc = makeContext (midi);
    BOOST_CHECK_NO_THROW (node.render (rc));
    BOOST_CHECK_EQUAL (midi.getNumEvents(), 0);
    node.releaseResources();
}

// ── getState / setState ───────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (StateRoundTripPreservesMask)
{
    MidiChannelFilterNode a;
    a.setChannelMask (0x00FF);
    MemoryBlock block;
    a.getState (block);
    BOOST_REQUIRE_GE (block.getSize(), sizeof (uint16_t));

    MidiChannelFilterNode b;
    b.setState (block.getData(), (int) block.getSize());
    BOOST_CHECK_EQUAL (b.getChannelMask(), static_cast<uint16_t> (0x00FF));
}

BOOST_AUTO_TEST_CASE (SetStateTooShortIgnored)
{
    MidiChannelFilterNode node;
    node.setChannelMask (0x0F0F);
    const char tiny = 0;
    node.setState (&tiny, 0);
    BOOST_CHECK_EQUAL (node.getChannelMask(), static_cast<uint16_t> (0x0F0F));
}

BOOST_AUTO_TEST_CASE (SetStateNullptrNoCrash)
{
    MidiChannelFilterNode node;
    node.setChannelMask (0xAAAA);
    BOOST_CHECK_NO_THROW (node.setState (nullptr, 0));
    BOOST_CHECK_EQUAL (node.getChannelMask(), static_cast<uint16_t> (0xAAAA));
}

// ── getPluginDescription ──────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PluginDescriptionPopulated)
{
    MidiChannelFilterNode node;
    PluginDescription desc;
    node.getPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.isNotEmpty());
    BOOST_CHECK_NE (desc.uniqueId, 0);
}

BOOST_AUTO_TEST_SUITE_END()
