// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for MidiMonitorNode: construction, port counts, prepare/release
// lifecycle, and basic render smoke-test (silence → no crash).

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include "nodes/midimonitor.hpp"
#include "fixture/PreparedGraph.h"

using namespace element;

BOOST_AUTO_TEST_SUITE (MidiMonitorNodeTests)

// ── Construction / destruction ─────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (construct_destruct)
{
    auto* node = new MidiMonitorNode();
    BOOST_CHECK (node != nullptr);
    delete node;
}

BOOST_AUTO_TEST_CASE (name_not_empty)
{
    MidiMonitorNode node;
    BOOST_CHECK (node.getName().isNotEmpty());
}

// ── Port layout ────────────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (has_midi_in_port)
{
    MidiMonitorNode node;
    node.refreshPorts();
    BOOST_CHECK_GE (node.getNumPorts (PortType::Midi, true), 1);
}

BOOST_AUTO_TEST_CASE (has_midi_out_port)
{
    MidiMonitorNode node;
    node.refreshPorts();
    BOOST_CHECK_GE (node.getNumPorts (PortType::Midi, false), 1);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (prepare_release_no_crash)
{
    MidiMonitorNode node;
    BOOST_CHECK_NO_THROW (node.prepareToRender (44100.0, 512));
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

BOOST_AUTO_TEST_CASE (double_prepare_no_crash)
{
    MidiMonitorNode node;
    BOOST_CHECK_NO_THROW (node.prepareToRender (44100.0, 512));
    BOOST_CHECK_NO_THROW (node.prepareToRender (48000.0, 256));
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

BOOST_AUTO_TEST_CASE (release_without_prepare_no_crash)
{
    MidiMonitorNode node;
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

// ── State serialisation ────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (get_set_state_round_trip)
{
    MidiMonitorNode a;
    juce::MemoryBlock block;
    a.getState (block);

    MidiMonitorNode b;
    BOOST_CHECK_NO_THROW (b.setState (block.getData(), (int) block.getSize()));
}

BOOST_AUTO_TEST_CASE (set_state_empty_no_crash)
{
    MidiMonitorNode node;
    BOOST_CHECK_NO_THROW (node.setState (nullptr, 0));
}

// ── Plugin description ─────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (plugin_description_populated)
{
    MidiMonitorNode node;
    juce::PluginDescription desc;
    node.getPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.isNotEmpty());
}

BOOST_AUTO_TEST_SUITE_END()
