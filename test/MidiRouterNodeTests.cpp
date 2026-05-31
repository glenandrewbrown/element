// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** MidiRouterNode tests.
    Covers: construction, MatrixState get/set, serialization round-trip,
    program management, lock access, and render safety. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>

#include "nodes/midirouter.hpp"
#include "matrixstate.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (MidiRouterNodeTests)

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultConstruct4x4)
{
    MidiRouterNode node (4, 4);
    // Should not crash; basic sanity
    auto state = node.getMatrixState();
    BOOST_CHECK_EQUAL (state.getNumRows(),    4);
    BOOST_CHECK_EQUAL (state.getNumColumns(), 4);
}

BOOST_AUTO_TEST_CASE (CustomSize)
{
    MidiRouterNode node (8, 2);
    auto state = node.getMatrixState();
    BOOST_CHECK_EQUAL (state.getNumRows(),    8);
    BOOST_CHECK_EQUAL (state.getNumColumns(), 2);
}

// ── MatrixState get/set ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (MatrixStateRoundTrip)
{
    MidiRouterNode node (4, 4);

    MatrixState ms (4, 4);
    ms.set (0, 0, true);
    ms.set (1, 2, true);
    ms.set (3, 3, true);

    node.setMatrixState (ms);
    auto back = node.getMatrixState();

    BOOST_CHECK (back.connected (0, 0));
    BOOST_CHECK (back.connected (1, 2));
    BOOST_CHECK (back.connected (3, 3));
    BOOST_CHECK (! back.connected (0, 1));
    BOOST_CHECK (! back.connected (2, 0));
}

BOOST_AUTO_TEST_CASE (SetWithoutLocking)
{
    MidiRouterNode node (4, 4);

    {
        juce::ScopedLock sl (node.getLock());
        node.setWithoutLocking (0, 3, true);
        node.setWithoutLocking (2, 1, true);
    }

    auto ms = node.getMatrixState();
    BOOST_CHECK (ms.connected (0, 3));
    BOOST_CHECK (ms.connected (2, 1));
    BOOST_CHECK (! ms.connected (0, 0));
}

BOOST_AUTO_TEST_CASE (ClearMatrixViaEmptyState)
{
    MidiRouterNode node (4, 4);

    MatrixState full (4, 4);
    for (int i = 0; i < 4; ++i)
        for (int j = 0; j < 4; ++j)
            full.set (i, j, true);
    node.setMatrixState (full);

    MatrixState empty (4, 4); // all false
    node.setMatrixState (empty);

    auto back = node.getMatrixState();
    for (int i = 0; i < 4; ++i)
        for (int j = 0; j < 4; ++j)
            BOOST_CHECK (! back.connected (i, j));
}

// ── State serialization ───────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (StateRoundTrip)
{
    MidiRouterNode node (4, 4);

    MatrixState ms (4, 4);
    ms.set (0, 0, true);
    ms.set (2, 3, true);
    node.setMatrixState (ms);

    juce::MemoryBlock block;
    node.getState (block);
    BOOST_CHECK_GT (block.getSize(), 0u);

    MidiRouterNode node2 (4, 4);
    node2.setState (block.getData(), (int) block.getSize());

    auto restored = node2.getMatrixState();
    BOOST_CHECK (restored.connected (0, 0));
    BOOST_CHECK (restored.connected (2, 3));
    BOOST_CHECK (! restored.connected (1, 1));
}

BOOST_AUTO_TEST_CASE (StateRestoreWithWrongSize)
{
    // Must not crash or corrupt when size mismatches
    MidiRouterNode node (4, 4);
    juce::MemoryBlock junk (32, true);
    node.setState (junk.getData(), (int) junk.getSize()); // may be invalid but no crash
}

// ── Program management ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultProgram)
{
    MidiRouterNode node (4, 4);
    BOOST_CHECK_GE (node.getNumPrograms(), 1);
    BOOST_CHECK_GE (node.getCurrentProgram(), 0);
}

BOOST_AUTO_TEST_CASE (SetCurrentProgram)
{
    MidiRouterNode node (4, 4);
    int total = node.getNumPrograms();
    if (total > 1)
    {
        node.setCurrentProgram (1);
        BOOST_CHECK_EQUAL (node.getCurrentProgram(), 1);
    }
}

BOOST_AUTO_TEST_CASE (ProgramNameNotEmpty)
{
    MidiRouterNode node (4, 4);
    String name = node.getProgramName (node.getCurrentProgram());
    BOOST_CHECK (name.isNotEmpty());
}

// ── PluginDescription ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PluginDescriptionFilled)
{
    MidiRouterNode node (4, 4);
    juce::PluginDescription desc;
    node.getPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
}

// ── prepareToRender / releaseResources ────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PrepareAndRelease)
{
    MidiRouterNode node (4, 4);
    node.prepareToRender (44100.0, 512);
    node.releaseResources();
    // Safe to call again
    node.prepareToRender (48000.0, 256);
    node.releaseResources();
}

BOOST_AUTO_TEST_SUITE_END()
