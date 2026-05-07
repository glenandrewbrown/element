// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Regression coverage for forensic-audit F-1 (audit P1.B-1):
// GraphNode::connectChannels() must reject calls referencing a non-existent
// source or destination node and never crash. The original bug was a `&&`
// where `||` was needed in the null-check. The fix landed prior to Wave 1;
// this test pins the contract so a regression cannot reappear silently.

#include <boost/test/unit_test.hpp>

#include "fixture/PreparedGraph.h"
#include "fixture/TestNode.h"
#include "engine/graphnode.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (RootGraphMissingNodeTests)

BOOST_AUTO_TEST_CASE (ConnectChannelsRejectsMissingSource)
{
    // Two real nodes are present, but the call references a phantom source id.
    PreparedGraph fix;
    GraphNode& graph = fix.graph;

    auto* src = new TestNode();
    auto* dst = new TestNode();
    graph.addNode (src);
    graph.addNode (dst);

    constexpr juce::uint32 phantomSourceId = 0xDEADBEEF;
    BOOST_REQUIRE (graph.getNodeForId (phantomSourceId) == nullptr);
    BOOST_REQUIRE (graph.getNodeForId (dst->nodeId) != nullptr);

    // Must return false (not crash) when the source is missing.
    BOOST_REQUIRE (! graph.connectChannels (PortType::Audio, phantomSourceId, 0, dst->nodeId, 0));
    BOOST_REQUIRE_EQUAL (graph.getNumConnections(), 0);
}

BOOST_AUTO_TEST_CASE (ConnectChannelsRejectsMissingDest)
{
    PreparedGraph fix;
    GraphNode& graph = fix.graph;

    auto* src = new TestNode();
    auto* dst = new TestNode();
    graph.addNode (src);
    graph.addNode (dst);

    constexpr juce::uint32 phantomDestId = 0xCAFEF00D;
    BOOST_REQUIRE (graph.getNodeForId (src->nodeId) != nullptr);
    BOOST_REQUIRE (graph.getNodeForId (phantomDestId) == nullptr);

    BOOST_REQUIRE (! graph.connectChannels (PortType::Audio, src->nodeId, 0, phantomDestId, 0));
    BOOST_REQUIRE_EQUAL (graph.getNumConnections(), 0);
}

BOOST_AUTO_TEST_CASE (ConnectChannelsRejectsBothMissing)
{
    PreparedGraph fix;
    GraphNode& graph = fix.graph;

    constexpr juce::uint32 phantomSrc = 0x11111111;
    constexpr juce::uint32 phantomDst = 0x22222222;

    BOOST_REQUIRE (! graph.connectChannels (PortType::Audio, phantomSrc, 0, phantomDst, 0));
    BOOST_REQUIRE (! graph.connectChannels (PortType::Midi, phantomSrc, 0, phantomDst, 0));
    BOOST_REQUIRE_EQUAL (graph.getNumConnections(), 0);
}

BOOST_AUTO_TEST_CASE (ConnectChannelsAfterRemoveDoesNotCrash)
{
    // Reproduce the original failure mode: build a connection, remove the
    // source node, then re-issue connectChannels using its (now phantom) id.
    PreparedGraph fix;
    GraphNode& graph = fix.graph;

    auto* src = new TestNode();
    auto* dst = new TestNode();
    graph.addNode (src);
    graph.addNode (dst);

    BOOST_REQUIRE (graph.connectChannels (PortType::Audio, src->nodeId, 0, dst->nodeId, 0));
    BOOST_REQUIRE_EQUAL (graph.getNumConnections(), 1);

    const auto staleSourceId = src->nodeId;
    BOOST_REQUIRE (graph.removeNode (staleSourceId));
    BOOST_REQUIRE (graph.getNodeForId (staleSourceId) == nullptr);

    // The stale id should be rejected cleanly — original bug crashed here.
    BOOST_REQUIRE (! graph.connectChannels (PortType::Audio, staleSourceId, 0, dst->nodeId, 0));
}

BOOST_AUTO_TEST_SUITE_END()
