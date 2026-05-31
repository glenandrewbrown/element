// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for Arc, ArcSorter, and ArcTable.
// Gap: Arc construction was tested indirectly; ArcTable and ArcSorter had
// zero dedicated coverage.

#include <boost/test/unit_test.hpp>
#include <element/arc.hpp>

using namespace element;

// ── Arc ──────────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_SUITE (ArcTests)

BOOST_AUTO_TEST_CASE (ConstructionSetsFields)
{
    Arc arc (1u, 2u, 3u, 4u);
    BOOST_CHECK_EQUAL (arc.sourceNode, 1u);
    BOOST_CHECK_EQUAL (arc.sourcePort, 2u);
    BOOST_CHECK_EQUAL (arc.destNode,   3u);
    BOOST_CHECK_EQUAL (arc.destPort,   4u);
}

BOOST_AUTO_TEST_CASE (AssignmentCopiesFields)
{
    Arc a (10u, 20u, 30u, 40u);
    Arc b (0u, 0u, 0u, 0u);
    b = a;
    BOOST_CHECK_EQUAL (b.sourceNode, 10u);
    BOOST_CHECK_EQUAL (b.sourcePort, 20u);
    BOOST_CHECK_EQUAL (b.destNode,   30u);
    BOOST_CHECK_EQUAL (b.destPort,   40u);
}

BOOST_AUTO_TEST_CASE (ZeroIdsAreValid)
{
    Arc arc (0u, 0u, 0u, 0u);
    BOOST_CHECK_EQUAL (arc.sourceNode, 0u);
    BOOST_CHECK_EQUAL (arc.destNode,   0u);
}

// ── ArcSorter ────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SorterLessBySourceNode)
{
    Arc a (1u, 0u, 5u, 0u);
    Arc b (2u, 0u, 5u, 0u);
    BOOST_CHECK_LT (ArcSorter::compareElements (&a, &b), 0);
    BOOST_CHECK_GT (ArcSorter::compareElements (&b, &a), 0);
}

BOOST_AUTO_TEST_CASE (SorterEqualWhenAllFieldsMatch)
{
    Arc a (1u, 2u, 3u, 4u);
    Arc b (1u, 2u, 3u, 4u);
    BOOST_CHECK_EQUAL (ArcSorter::compareElements (&a, &b), 0);
}

BOOST_AUTO_TEST_CASE (SorterTiebreaksByDestNode)
{
    Arc a (1u, 0u, 2u, 0u);
    Arc b (1u, 0u, 3u, 0u);
    BOOST_CHECK_LT (ArcSorter::compareElements (&a, &b), 0);
}

BOOST_AUTO_TEST_CASE (SorterTiebreaksBySourcePort)
{
    Arc a (1u, 0u, 2u, 0u);
    Arc b (1u, 1u, 2u, 0u);
    BOOST_CHECK_LT (ArcSorter::compareElements (&a, &b), 0);
}

BOOST_AUTO_TEST_CASE (SorterTiebreaksByDestPort)
{
    Arc a (1u, 0u, 2u, 0u);
    Arc b (1u, 0u, 2u, 1u);
    BOOST_CHECK_LT (ArcSorter::compareElements (&a, &b), 0);
}

// ── ArcTable ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ArcTableEmptyHasNoInputs)
{
    juce::OwnedArray<Arc> arcs;
    ArcTable<Arc> table (arcs);
    BOOST_CHECK (! table.isAnInputTo (1u, 2u));
}

BOOST_AUTO_TEST_CASE (ArcTableDirectConnection)
{
    juce::OwnedArray<Arc> arcs;
    arcs.add (new Arc (1u, 0u, 2u, 0u)); // 1 -> 2
    ArcTable<Arc> table (arcs);
    BOOST_CHECK (table.isAnInputTo (1u, 2u));
    BOOST_CHECK (! table.isAnInputTo (2u, 1u)); // reverse not connected
}

BOOST_AUTO_TEST_CASE (ArcTableTransitiveConnection)
{
    // 1 -> 2 -> 3  : node 1 is transitive input to 3
    juce::OwnedArray<Arc> arcs;
    arcs.add (new Arc (1u, 0u, 2u, 0u));
    arcs.add (new Arc (2u, 0u, 3u, 0u));
    ArcTable<Arc> table (arcs);
    BOOST_CHECK (table.isAnInputTo (1u, 3u));
    BOOST_CHECK (! table.isAnInputTo (3u, 1u));
}

BOOST_AUTO_TEST_CASE (ArcTableMultipleSourcesToSameDest)
{
    juce::OwnedArray<Arc> arcs;
    arcs.add (new Arc (1u, 0u, 3u, 0u));
    arcs.add (new Arc (2u, 0u, 3u, 0u));
    ArcTable<Arc> table (arcs);
    BOOST_CHECK (table.isAnInputTo (1u, 3u));
    BOOST_CHECK (table.isAnInputTo (2u, 3u));
}

BOOST_AUTO_TEST_CASE (ArcTableUnrelatedNodesNotInputs)
{
    juce::OwnedArray<Arc> arcs;
    arcs.add (new Arc (1u, 0u, 2u, 0u));
    ArcTable<Arc> table (arcs);
    BOOST_CHECK (! table.isAnInputTo (3u, 4u)); // nodes not in graph
    BOOST_CHECK (! table.isAnInputTo (1u, 4u)); // node 4 has no inputs
}

BOOST_AUTO_TEST_SUITE_END()
