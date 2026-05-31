// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Direct unit tests for GraphManager / RootGraphManager.
// GraphManager needs a GraphNode& and a PluginManager&.
// test::context() owns both — pull them out via the public API.

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/plugins.hpp>
#include <element/node.hpp>

#include "engine/graphmanager.hpp"
#include "engine/graphnode.hpp"
#include "engine/rootgraph.hpp"
#include "fixture/PreparedGraph.h"
#include "fixture/ServicesFixture.hpp"
#include "testutil.hpp"

using namespace element;

// ─────────────────────────────────────────────────────────────────────────────
BOOST_AUTO_TEST_SUITE (GraphManagerTests)

// Construct with a prepared GraphNode — must not crash and must not be loaded.
BOOST_AUTO_TEST_CASE (construct_not_loaded)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    BOOST_CHECK (! mgr.isLoaded());
    BOOST_CHECK_EQUAL (mgr.getNumNodes(), 0);
    BOOST_CHECK_EQUAL (mgr.getNumConnections(), 0);
}

// setNodeModel marks the manager as loaded.
BOOST_AUTO_TEST_CASE (set_node_model_marks_loaded)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    BOOST_CHECK_NO_THROW (mgr.setNodeModel (model));
    BOOST_CHECK (mgr.isLoaded());
}

// getGraphModel round-trips the model set via setNodeModel.
BOOST_AUTO_TEST_CASE (get_graph_model_round_trip)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    Node retrieved = mgr.getGraphModel();
    BOOST_CHECK (retrieved.isValid());
    BOOST_CHECK (retrieved.isGraph());
}

// isManaging returns true for the graph that was set, false for another.
BOOST_AUTO_TEST_CASE (is_managing_check)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK (mgr.isManaging (model));

    Node other (types::Graph);
    BOOST_CHECK (! mgr.isManaging (other));
}

// clear() resets to zero nodes/connections without crashing.
BOOST_AUTO_TEST_CASE (clear_on_empty_graph)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK_NO_THROW (mgr.clear());
    BOOST_CHECK_EQUAL (mgr.getNumNodes(), 0);
    BOOST_CHECK_EQUAL (mgr.getNumConnections(), 0);
}

// contains() returns false for invalid node IDs.
BOOST_AUTO_TEST_CASE (contains_invalid_id)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK (! mgr.contains (GraphManager::invalidNodeId));
    BOOST_CHECK (! mgr.contains (9999));
}

// getNode out-of-range returns nullptr.
BOOST_AUTO_TEST_CASE (get_node_out_of_range)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK (mgr.getNode (0) == nullptr);
    BOOST_CHECK (mgr.getNode (-1) == nullptr);
}

// getNodeForId with invalid ID returns nullptr.
BOOST_AUTO_TEST_CASE (get_node_for_invalid_id)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK (mgr.getNodeForId (GraphManager::invalidNodeId) == nullptr);
}

// getNodeModelForId with invalid ID returns an invalid Node.
BOOST_AUTO_TEST_CASE (get_node_model_for_invalid_id)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    Node result = mgr.getNodeModelForId (GraphManager::invalidNodeId);
    BOOST_CHECK (! result.isValid());
}

// findGraphManagerForGraph for an unrelated node returns nullptr.
BOOST_AUTO_TEST_CASE (find_graph_manager_unrelated_returns_null)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    Node other (types::Graph);
    BOOST_CHECK (mgr.findGraphManagerForGraph (other) == nullptr);
}

// Multiple clear() calls are safe.
BOOST_AUTO_TEST_CASE (double_clear_is_safe)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK_NO_THROW (mgr.clear());
    BOOST_CHECK_NO_THROW (mgr.clear());
}

// removeIllegalConnections on empty graph does not crash.
BOOST_AUTO_TEST_CASE (remove_illegal_connections_on_empty)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK_NO_THROW (mgr.removeIllegalConnections());
}

// syncArcsModel on empty graph does not crash.
BOOST_AUTO_TEST_CASE (sync_arcs_model_empty_graph)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK_NO_THROW (mgr.syncArcsModel());
}

BOOST_AUTO_TEST_SUITE_END()

// ─────────────────────────────────────────────────────────────────────────────
BOOST_AUTO_TEST_SUITE (GraphManagerConnectionTests)

// canConnect between node with invalid IDs returns false.
BOOST_AUTO_TEST_CASE (can_connect_invalid_ids_returns_false)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK (! mgr.canConnect (GraphManager::invalidNodeId, 0,
                                   GraphManager::invalidNodeId, 0));
}

// getConnection on empty graph returns nullptr for any index.
BOOST_AUTO_TEST_CASE (get_connection_empty_graph)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK (mgr.getConnection (0) == nullptr);
    BOOST_CHECK (mgr.getConnection (-1) == nullptr);
}

// getConnectionBetween invalid IDs returns nullptr.
BOOST_AUTO_TEST_CASE (get_connection_between_invalid_ids)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    auto* conn = mgr.getConnectionBetween (
        GraphManager::invalidNodeId, 0,
        GraphManager::invalidNodeId, 0);
    BOOST_CHECK (conn == nullptr);
}

// removeConnection by invalid index does not crash.
BOOST_AUTO_TEST_CASE (remove_connection_invalid_index_no_crash)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    BOOST_CHECK_NO_THROW (mgr.removeConnection (-1));
    BOOST_CHECK_NO_THROW (mgr.removeConnection (0));
}

BOOST_AUTO_TEST_SUITE_END()

// ─────────────────────────────────────────────────────────────────────────────
BOOST_AUTO_TEST_SUITE (GraphManagerChangeTests)

// GraphManager is a ChangeBroadcaster — verify listener connects/disconnects.
BOOST_AUTO_TEST_CASE (change_broadcaster_listener)
{
    PreparedGraph pg;
    auto& pm = test::context()->plugins();
    GraphManager mgr (pg.graph, pm);

    Node model (types::Graph);
    mgr.setNodeModel (model);

    struct Listener : public ChangeListener
    {
        int count = 0;
        void changeListenerCallback (ChangeBroadcaster*) override { ++count; }
    };

    Listener listener;
    mgr.addChangeListener (&listener);
    mgr.sendChangeMessage(); // manual trigger to verify plumbing
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
    BOOST_CHECK (listener.count >= 1);
    mgr.removeChangeListener (&listener);
}

BOOST_AUTO_TEST_SUITE_END()
