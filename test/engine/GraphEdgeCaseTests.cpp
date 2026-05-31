// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// GraphManager / GraphBuilder edge-case tests: invalid connections,
// type-mismatch ports, and topology corner-cases not covered by the
// normal audio-routing suite. Coverage audit gaps P0-5 / F-5.

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/node.hpp>
#include <element/plugins.hpp>

#include "engine/graphbuilder.hpp"
#include "engine/graphmanager.hpp"
#include "engine/graphnode.hpp"
#include "fixture/PreparedGraph.h"
#include "fixture/TestNode.h"
#include "testutil.hpp"

using namespace element;
using namespace juce;

// ---------------------------------------------------------------------------
// Helpers — add raw TestNode processors directly to a GraphNode (same pattern
// as GraphBuilderTests.cpp). GraphManager connection queries use engine-level
// node IDs, so tests that exercise canConnect use invalidNodeId sentinels
// until a proper manager-level addNode(Node) workflow is available in tests.

static uint32 addStereoTestNode (GraphNode& g)
{
    static uint32 nextId = 400;
    auto* node = new TestNode (2, 2, 0, 0);
    auto* added = g.addNode (node, nextId++);
    BOOST_REQUIRE (added != nullptr);
    return added->nodeId;
}

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (GraphConnectionValidationTests)

// canConnect with both IDs invalid returns false (not a crash).
BOOST_AUTO_TEST_CASE (both_invalid_ids_returns_false)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);
    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK (! mgr.canConnect (GraphManager::invalidNodeId, 0,
                                   GraphManager::invalidNodeId, 0));
}

// canConnect source==dest (self-loop) with same invalid sentinel returns false.
BOOST_AUTO_TEST_CASE (self_loop_invalid_sentinel_returns_false)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);
    Node model (types::Graph);
    mgr.setNodeModel (model);

    const uint32 sentinel = 9999;
    BOOST_CHECK (! mgr.canConnect (sentinel, 0, sentinel, 0));
}

// canConnect with out-of-range port indices must not crash.
BOOST_AUTO_TEST_CASE (out_of_range_port_index_no_crash)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);
    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK_NO_THROW (mgr.canConnect (1u, 99999, 2u, 99999));
    BOOST_CHECK (! mgr.canConnect (1u, 99999, 2u, 99999));
}

// getConnectionBetween with unknown node IDs returns nullptr.
BOOST_AUTO_TEST_CASE (get_connection_between_unknown_ids_null)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);
    Node model (types::Graph);
    mgr.setNodeModel (model);

    auto* conn = mgr.getConnectionBetween (GraphManager::invalidNodeId, 0,
                                           GraphManager::invalidNodeId, 0);
    BOOST_CHECK (conn == nullptr);
}

// removeConnection with negative index does not crash.
BOOST_AUTO_TEST_CASE (remove_connection_negative_index_no_crash)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);
    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK_NO_THROW (mgr.removeConnection (-1));
}

// addConnection with both invalid IDs must not crash (may return false).
BOOST_AUTO_TEST_CASE (add_connection_invalid_ids_no_crash)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);
    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK_NO_THROW (
        mgr.addConnection (GraphManager::invalidNodeId, 0,
                           GraphManager::invalidNodeId, 0));
}

BOOST_AUTO_TEST_SUITE_END()

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (GraphTopologyRobustnessTests)

// 50 raw nodes added to a GraphNode; removeIllegalConnections + clear no crash.
BOOST_AUTO_TEST_CASE (large_graph_build_and_clear)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);
    Node model (types::Graph);
    mgr.setNodeModel (model);

    for (int i = 0; i < 50; ++i)
        addStereoTestNode (pg.graph);

    BOOST_CHECK_NO_THROW (mgr.removeIllegalConnections());
    BOOST_CHECK_NO_THROW (mgr.clear());
    BOOST_CHECK_EQUAL (mgr.getNumConnections(), 0);
}

// getNode returns nullptr for any index after clear().
BOOST_AUTO_TEST_CASE (get_node_null_after_clear)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);
    Node model (types::Graph);
    mgr.setNodeModel (model);

    addStereoTestNode (pg.graph);
    mgr.clear();
    BOOST_CHECK (mgr.getNode (0) == nullptr);
}

// Multiple clear() calls are idempotent.
BOOST_AUTO_TEST_CASE (repeated_clear_idempotent)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);
    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK_NO_THROW (mgr.clear());
    BOOST_CHECK_NO_THROW (mgr.clear());
    BOOST_CHECK_NO_THROW (mgr.clear());
}

// syncArcsModel survives repeated add/clear cycles.
BOOST_AUTO_TEST_CASE (sync_arcs_add_clear_cycles)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);
    Node model (types::Graph);
    mgr.setNodeModel (model);

    for (int i = 0; i < 5; ++i)
    {
        addStereoTestNode (pg.graph);
        BOOST_CHECK_NO_THROW (mgr.syncArcsModel());
        mgr.clear();
    }
}

BOOST_AUTO_TEST_SUITE_END()

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (GraphBuilderEdgeCaseTests)

// GraphBuilder on a disconnected multi-node graph: non-negative latency.
BOOST_AUTO_TEST_CASE (disconnected_graph_nonneg_latency)
{
    PreparedGraph pg;

    static uint32 nextId = 500;
    for (int i = 0; i < 4; ++i)
    {
        auto* n = new TestNode (2, 2, 0, 0);
        auto* added = pg.graph.addNode (n, nextId++);
        BOOST_REQUIRE (added != nullptr);
    }

    Array<void*> ordered, ops;
    ReferenceCountedArray<Processor> procs;
    pg.graph.getOrderedNodes (procs);
    for (auto* p : procs)
        ordered.add (p);

    GraphBuilder builder (pg.graph, ordered, ops);
    BOOST_CHECK_GE (builder.getTotalLatencySamples(), 0);
}

// Two GraphBuilder runs on same graph produce identical latency.
BOOST_AUTO_TEST_CASE (deterministic_build_same_latency)
{
    PreparedGraph pg;

    static uint32 nextId = 600;
    for (int i = 0; i < 3; ++i)
    {
        auto* n = new TestNode (2, 2, 1, 1);
        pg.graph.addNode (n, nextId++);
    }

    Array<void*> ordered;
    ReferenceCountedArray<Processor> procs;
    pg.graph.getOrderedNodes (procs);
    for (auto* p : procs)
        ordered.add (p);

    Array<void*> ops1, ops2;
    GraphBuilder b1 (pg.graph, ordered, ops1);
    GraphBuilder b2 (pg.graph, ordered, ops2);

    BOOST_CHECK_EQUAL (b1.getTotalLatencySamples(), b2.getTotalLatencySamples());
}

// buffersNeeded(Audio/Midi/Control) all non-negative on non-empty graph.
BOOST_AUTO_TEST_CASE (all_port_types_buffers_nonneg)
{
    PreparedGraph pg;

    static uint32 nextId = 700;
    auto* n = new TestNode (2, 2, 1, 1);
    pg.graph.addNode (n, nextId++);

    Array<void*> ordered, ops;
    ReferenceCountedArray<Processor> procs;
    pg.graph.getOrderedNodes (procs);
    for (auto* p : procs)
        ordered.add (p);

    GraphBuilder builder (pg.graph, ordered, ops);
    BOOST_CHECK_GE (builder.buffersNeeded (PortType::Audio), 0);
    BOOST_CHECK_GE (builder.buffersNeeded (PortType::Midi), 0);
    BOOST_CHECK_GE (builder.buffersNeeded (PortType::Control), 0);
}

BOOST_AUTO_TEST_SUITE_END()
