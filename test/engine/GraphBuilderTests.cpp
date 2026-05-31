// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// GraphBuilder unit tests.
// GraphBuilder is constructed with (GraphNode&, orderedNodes, renderingOps).
// It populates renderingOps during construction and exposes:
//   int buffersNeeded (PortType)
//   int getTotalLatencySamples() const
//
// GraphBuilder is exercised indirectly by every audio-routing test via
// GraphNode::rebuild(). These tests hit its PUBLIC surface directly to
// document invariants that the routing tests do not make explicit.

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>

#include "engine/graphbuilder.hpp"
#include "engine/graphnode.hpp"
#include "fixture/PreparedGraph.h"
#include "fixture/TestNode.h"
#include "testutil.hpp"

using namespace element;

// ---------------------------------------------------------------------------
// Helpers

/** Add a stereo in/out, mono-MIDI TestNode. Returns its nodeId. */
static uint32 addTestNode (GraphNode& g)
{
    static uint32 nextId = 1;
    auto* node = new TestNode (2, 2, 1, 1);
    auto* added = g.addNode (node, nextId++);
    BOOST_REQUIRE (added != nullptr);
    return added->nodeId;
}

/** Collect rendering order from a GraphNode into a raw-pointer Array. */
static void collectOrdered (GraphNode& g, Array<void*>& out)
{
    ReferenceCountedArray<Processor> procs;
    g.getOrderedNodes (procs);
    for (auto* p : procs)
        out.add (p);
}

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (GraphBuilderTests)

// An empty graph constructs without crash.
BOOST_AUTO_TEST_CASE (empty_graph_constructs_without_crash)
{
    PreparedGraph pg;
    Array<void*> ordered, ops;
    collectOrdered (pg.graph, ordered);

    BOOST_CHECK_NO_THROW ({
        GraphBuilder builder (pg.graph, ordered, ops);
        BOOST_CHECK_GE (builder.getTotalLatencySamples(), 0);
    });
}

// getTotalLatencySamples() == 0 for zero-latency TestNodes.
BOOST_AUTO_TEST_CASE (zero_latency_nodes_report_no_latency)
{
    PreparedGraph pg;
    addTestNode (pg.graph);
    addTestNode (pg.graph);

    Array<void*> ordered, ops;
    collectOrdered (pg.graph, ordered);

    GraphBuilder builder (pg.graph, ordered, ops);
    BOOST_CHECK_EQUAL (builder.getTotalLatencySamples(), 0);
}

// buffersNeeded(Audio) is non-negative for any graph.
BOOST_AUTO_TEST_CASE (buffers_needed_audio_nonnegative)
{
    PreparedGraph pg;
    addTestNode (pg.graph);

    Array<void*> ordered, ops;
    collectOrdered (pg.graph, ordered);

    GraphBuilder builder (pg.graph, ordered, ops);
    BOOST_CHECK_GE (builder.buffersNeeded (PortType::Audio), 0);
}

// buffersNeeded(Midi) is non-negative.
BOOST_AUTO_TEST_CASE (buffers_needed_midi_nonnegative)
{
    PreparedGraph pg;
    addTestNode (pg.graph);

    Array<void*> ordered, ops;
    collectOrdered (pg.graph, ordered);

    GraphBuilder builder (pg.graph, ordered, ops);
    BOOST_CHECK_GE (builder.buffersNeeded (PortType::Midi), 0);
}

// buffersNeeded(Control) is non-negative.
BOOST_AUTO_TEST_CASE (buffers_needed_cv_nonnegative)
{
    PreparedGraph pg;
    Array<void*> ordered, ops;
    collectOrdered (pg.graph, ordered);

    GraphBuilder builder (pg.graph, ordered, ops);
    BOOST_CHECK_GE (builder.buffersNeeded (PortType::Control), 0);
}

// renderingOps array is populated when graph has at least one node.
BOOST_AUTO_TEST_CASE (ops_array_populated_for_nonempty_graph)
{
    PreparedGraph pg;
    addTestNode (pg.graph);

    Array<void*> ordered, ops;
    collectOrdered (pg.graph, ordered);

    GraphBuilder builder (pg.graph, ordered, ops);
    BOOST_CHECK_GT (ops.size(), 0);
}

// Two builds on the same graph produce consistent results.
BOOST_AUTO_TEST_CASE (repeated_build_is_deterministic)
{
    PreparedGraph pg;
    addTestNode (pg.graph);
    addTestNode (pg.graph);

    Array<void*> ordered;
    collectOrdered (pg.graph, ordered);

    Array<void*> ops1, ops2;
    GraphBuilder b1 (pg.graph, ordered, ops1);
    GraphBuilder b2 (pg.graph, ordered, ops2);

    BOOST_CHECK_EQUAL (b1.getTotalLatencySamples(), b2.getTotalLatencySamples());
    BOOST_CHECK_EQUAL (ops1.size(), ops2.size());
}

// A graph with 5 nodes has more ops than a graph with 1 node.
BOOST_AUTO_TEST_CASE (more_nodes_produce_more_ops)
{
    PreparedGraph pg1, pg2;
    addTestNode (pg1.graph);

    for (int i = 0; i < 5; ++i)
        addTestNode (pg2.graph);

    Array<void*> ord1, ops1, ord2, ops2;
    collectOrdered (pg1.graph, ord1);
    collectOrdered (pg2.graph, ord2);

    GraphBuilder b1 (pg1.graph, ord1, ops1);
    GraphBuilder b2 (pg2.graph, ord2, ops2);

    BOOST_CHECK_GT (ops2.size(), ops1.size());
}

BOOST_AUTO_TEST_SUITE_END()
