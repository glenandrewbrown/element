// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for ConstantNode: construction, port layout (CV/Value outputs),
// value setting, lifecycle, and state round-trip.

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include "nodes/constantnode.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (ConstantNodeTests)

// ── Construction ──────────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (construct_destruct)
{
    auto* node = new ConstantNode();
    BOOST_CHECK (node != nullptr);
    delete node;
}

BOOST_AUTO_TEST_CASE (name_not_empty)
{
    ConstantNode node;
    BOOST_CHECK (node.getName().isNotEmpty());
}

// ── Port layout ───────────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (has_value_output_ports)
{
    ConstantNode node;
    node.refreshPorts();
    // ConstantNode produces CV/Value outputs, not audio
    int cvOuts = node.getNumPorts (PortType::CV, false);
    int valOuts = node.getNumPorts (PortType::Atom, false);
    BOOST_CHECK (cvOuts > 0 || valOuts > 0);
}

BOOST_AUTO_TEST_CASE (no_audio_outputs)
{
    ConstantNode node;
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, false), 0);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (prepare_release_no_crash)
{
    ConstantNode node;
    BOOST_CHECK_NO_THROW (node.prepareToRender (44100.0, 512));
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

BOOST_AUTO_TEST_CASE (release_without_prepare_no_crash)
{
    ConstantNode node;
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

// ── State round-trip ──────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (get_set_state_round_trip)
{
    ConstantNode a;
    juce::MemoryBlock block;
    a.getState (block);

    ConstantNode b;
    BOOST_CHECK_NO_THROW (b.setState (block.getData(), (int) block.getSize()));
}

BOOST_AUTO_TEST_CASE (set_state_empty_no_crash)
{
    ConstantNode node;
    BOOST_CHECK_NO_THROW (node.setState (nullptr, 0));
}

// ── setValue / getValue (public thread-safe API) ──────────────────────────
BOOST_AUTO_TEST_CASE (default_value_is_zero)
{
    ConstantNode node;
    BOOST_CHECK_CLOSE (node.getValue(), 0.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (set_value_round_trips)
{
    ConstantNode node;
    node.setValue (0.5f);
    BOOST_CHECK_CLOSE (node.getValue(), 0.5f, 0.001f);
}

BOOST_AUTO_TEST_CASE (set_value_clamped_above_one)
{
    ConstantNode node;
    node.setValue (2.0f); // must clamp to 1.0
    BOOST_CHECK_CLOSE (node.getValue(), 1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (set_value_clamped_below_minus_one)
{
    ConstantNode node;
    node.setValue (-2.0f); // must clamp to -1.0
    BOOST_CHECK_CLOSE (node.getValue(), -1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (set_value_boundary_exact_one)
{
    ConstantNode node;
    node.setValue (1.0f);
    BOOST_CHECK_CLOSE (node.getValue(), 1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (set_value_boundary_minus_one)
{
    ConstantNode node;
    node.setValue (-1.0f);
    BOOST_CHECK_CLOSE (node.getValue(), -1.0f, 0.001f);
}

// ── Plugin description ────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (plugin_description_populated)
{
    ConstantNode node;
    juce::PluginDescription desc;
    node.getPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.isNotEmpty());
}

BOOST_AUTO_TEST_SUITE_END()
