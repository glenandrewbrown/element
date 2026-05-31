// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include "nodes/reroutenode.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (RerouteNodeTests)

// ── AudioAndMidi (default) ────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultModeIsAudioAndMidi)
{
    RerouteNode node;
    BOOST_CHECK_EQUAL ((int) node.getMode(), (int) RerouteNode::AudioAndMidi);
}

BOOST_AUTO_TEST_CASE (DefaultPortCounts)
{
    RerouteNode node;
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, true),  2);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, false), 2);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi,  true),  1);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi,  false), 1);
}

// ── Audio-only mode ───────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AudioModeNoMidiPorts)
{
    RerouteNode node (RerouteNode::Audio);
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, true),  2);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, false), 2);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi,  true),  0);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi,  false), 0);
}

BOOST_AUTO_TEST_CASE (AudioRerouteNodeHasCorrectMode)
{
    AudioRerouteNode node;
    BOOST_CHECK_EQUAL ((int) node.getMode(), (int) RerouteNode::Audio);
}

// ── MIDI-only mode ────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (MidiModeNoAudioPorts)
{
    RerouteNode node (RerouteNode::Midi);
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, true),  0);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, false), 0);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi,  true),  1);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Midi,  false), 1);
}

BOOST_AUTO_TEST_CASE (MidiRerouteNodeHasCorrectMode)
{
    MidiRerouteNode node;
    BOOST_CHECK_EQUAL ((int) node.getMode(), (int) RerouteNode::Midi);
}

// ── Mode switching ────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SetModeRefreshesPortCounts)
{
    RerouteNode node (RerouteNode::AudioAndMidi);
    node.refreshPorts();
    int before = (int) node.getNumPorts();

    node.setMode (RerouteNode::Audio);
    int after = (int) node.getNumPorts();

    // Audio mode drops 2 MIDI ports
    BOOST_CHECK (after < before);
    BOOST_CHECK_EQUAL ((int) node.getMode(), (int) RerouteNode::Audio);
}

BOOST_AUTO_TEST_CASE (SetModeSameValueIsNoop)
{
    RerouteNode node (RerouteNode::Audio);
    node.refreshPorts();
    int before = (int) node.getNumPorts();
    node.setMode (RerouteNode::Audio);
    BOOST_CHECK_EQUAL ((int) node.getNumPorts(), before);
}

// ── State serialisation ───────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (GetSetStateRoundTrip)
{
    RerouteNode a (RerouteNode::Midi);
    juce::MemoryBlock block;
    a.getState (block);
    BOOST_REQUIRE (block.getSize() >= sizeof (RerouteNode::Mode));

    RerouteNode b; // AudioAndMidi
    b.setState (block.getData(), (int) block.getSize());
    b.refreshPorts();
    BOOST_CHECK_EQUAL ((int) b.getMode(), (int) RerouteNode::Midi);
}

BOOST_AUTO_TEST_CASE (SetStateTooShortIgnored)
{
    RerouteNode node; // AudioAndMidi
    char tiny = 0;
    node.setState (&tiny, 0); // should not crash or change mode
    BOOST_CHECK_EQUAL ((int) node.getMode(), (int) RerouteNode::AudioAndMidi);
}

// ── Plugin description ────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PluginDescriptionPopulated)
{
    RerouteNode node;
    juce::PluginDescription desc;
    node.getPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.isNotEmpty());
}

BOOST_AUTO_TEST_CASE (AudioRerouteDescriptionDiffersFromBase)
{
    RerouteNode      base;
    AudioRerouteNode audio;
    juce::PluginDescription bd, ad;
    base.getPluginDescription (bd);
    audio.getPluginDescription (ad);
    BOOST_CHECK (bd.fileOrIdentifier != ad.fileOrIdentifier);
    BOOST_CHECK (bd.uniqueId != ad.uniqueId);
}

BOOST_AUTO_TEST_SUITE_END()
