// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Wave-0 "make CV flow" proof gate (plan: logic-routing-flow-debug-2026-06-05).
//
// These tests wire REAL nodes through a REAL GraphNode/GraphBuilder render
// path — NOT hand-built RenderContexts — because hand-built-context unit tests
// passed green for years while the live CV path was dead (the builder skipped
// CV ports entirely and every node saw a 0-channel rc.cv).
//
// Invariants proven here:
//   1. A CV source's samples arrive at a CV consumer through built graph ops.
//   2. Multiple CV sources into one input port sum.
//   3. An unconnected CV input reads silence (the shared zero buffer).
//   4. CV survives a multi-hop chain (Constant -> Add -> Readout).
//   5. Processor::getOutputCV exposes the rendered value lock-free for the UI.

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>

#include "engine/graphnode.hpp"
#include "nodes/constantnode.hpp"
#include "nodes/logicnodes.hpp"
#include "nodes/mathnodes.hpp"
#include "nodes/readoutnode.hpp"
#include "fixture/PreparedGraph.h"
#include "testutil.hpp"

using namespace element;

namespace {

constexpr int kBlockSize = 512;

/** Set a ConstantNode's value through its state blob (the public surface). */
void setConstantValue (Processor& node, float value)
{
    node.setState (&value, (int) sizeof (float));
}

/** Flush async graph rebuilds (addNode/addConnection trigger async updates). */
void pumpRebuild()
{
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
}

/** Render one block through the graph's real op sequence. */
void renderOneBlock (GraphNode& graph)
{
    juce::AudioSampleBuffer audio (2, kBlockSize);
    juce::AudioSampleBuffer cv (1, kBlockSize);
    juce::MidiBuffer midi;
    audio.clear();
    cv.clear();
    RenderContext rc (audio, cv, midi, kBlockSize);
    graph.render (rc);
}

} // namespace

BOOST_AUTO_TEST_SUITE (CVFlowTests)

// 1 + 5: Constant -> Readout through the BUILT graph; value arrives and the
// lock-free UI latches read it on both ends of the cable.
BOOST_AUTO_TEST_CASE (cv_flows_constant_to_readout)
{
    PreparedGraph pg;

    ProcessorPtr constant = pg.graph.addNode (new ConstantNode());
    ProcessorPtr readout = pg.graph.addNode (new ReadoutNode());
    BOOST_REQUIRE (constant != nullptr && readout != nullptr);

    setConstantValue (*constant, 0.5f);

    // ConstantNode: port 0 = cv_out. ReadoutNode: port 0 = cv_in.
    BOOST_REQUIRE (pg.graph.addConnection (constant->nodeId, 0, readout->nodeId, 0));
    pumpRebuild();

    renderOneBlock (pg.graph);

    auto* ro = dynamic_cast<ReadoutNode*> (readout.get());
    BOOST_REQUIRE (ro != nullptr);
    BOOST_CHECK_CLOSE (ro->getCurrentDisplayValue(), 0.5f, 0.001);

    // The generic per-port CV latch (flow-debug feed) must agree.
    BOOST_REQUIRE_EQUAL (constant->getNumOutputCVChannels(), 1);
    BOOST_CHECK_CLOSE (constant->getOutputCV (0), 0.5f, 0.001);
    BOOST_CHECK_CLOSE (readout->getOutputCV (0), 0.5f, 0.001);
}

// 2: two CV sources into ONE input port sum (CvCopy + CvAdd ops).
BOOST_AUTO_TEST_CASE (cv_multiple_sources_sum)
{
    PreparedGraph pg;

    ProcessorPtr c1 = pg.graph.addNode (new ConstantNode());
    ProcessorPtr c2 = pg.graph.addNode (new ConstantNode());
    ProcessorPtr readout = pg.graph.addNode (new ReadoutNode());
    BOOST_REQUIRE (c1 != nullptr && c2 != nullptr && readout != nullptr);

    setConstantValue (*c1, 0.25f);
    setConstantValue (*c2, 0.5f);

    BOOST_REQUIRE (pg.graph.addConnection (c1->nodeId, 0, readout->nodeId, 0));
    BOOST_REQUIRE (pg.graph.addConnection (c2->nodeId, 0, readout->nodeId, 0));
    pumpRebuild();

    renderOneBlock (pg.graph);

    auto* ro = dynamic_cast<ReadoutNode*> (readout.get());
    BOOST_REQUIRE (ro != nullptr);
    BOOST_CHECK_CLOSE (ro->getCurrentDisplayValue(), 0.75f, 0.001);
}

// 3: unconnected CV input reads the shared zero buffer.
BOOST_AUTO_TEST_CASE (cv_unconnected_input_reads_zero)
{
    PreparedGraph pg;

    ProcessorPtr readout = pg.graph.addNode (new ReadoutNode());
    BOOST_REQUIRE (readout != nullptr);
    pumpRebuild();

    renderOneBlock (pg.graph);

    auto* ro = dynamic_cast<ReadoutNode*> (readout.get());
    BOOST_REQUIRE (ro != nullptr);
    BOOST_CHECK_SMALL (ro->getCurrentDisplayValue(), 1.0e-6f);
}

// 4: multi-hop CV chain — Constant(0.3) -> Add.A, Constant(0.2) -> Add.B,
// Add -> Readout. Proves CV output buffers route onward as inputs.
BOOST_AUTO_TEST_CASE (cv_add_node_chain)
{
    PreparedGraph pg;

    ProcessorPtr a = pg.graph.addNode (new ConstantNode());
    ProcessorPtr b = pg.graph.addNode (new ConstantNode());
    ProcessorPtr add = pg.graph.addNode (new AddNode());
    ProcessorPtr readout = pg.graph.addNode (new ReadoutNode());
    BOOST_REQUIRE (a != nullptr && b != nullptr && add != nullptr && readout != nullptr);

    setConstantValue (*a, 0.3f);
    setConstantValue (*b, 0.2f);

    // AddNode ports: 0 = cv_in_a, 1 = cv_in_b, 2 = cv_out.
    BOOST_REQUIRE (pg.graph.addConnection (a->nodeId, 0, add->nodeId, 0));
    BOOST_REQUIRE (pg.graph.addConnection (b->nodeId, 0, add->nodeId, 1));
    BOOST_REQUIRE (pg.graph.addConnection (add->nodeId, 2, readout->nodeId, 0));
    pumpRebuild();

    renderOneBlock (pg.graph);

    auto* ro = dynamic_cast<ReadoutNode*> (readout.get());
    BOOST_REQUIRE (ro != nullptr);
    BOOST_CHECK_CLOSE (ro->getCurrentDisplayValue(), 0.5f, 0.001);
    BOOST_CHECK_CLOSE (add->getOutputCV (0), 0.5f, 0.001);
}

// Wave-1 gate: a CONDITION evaluated through the real built graph.
// Constant(0.8) -> Comparator.A, Constant(0.5) -> Comparator.B, > -> Readout
// reads 1.0; flipping the operator to `less` reads 0.0 on the next block.
BOOST_AUTO_TEST_CASE (cv_conditional_chain_comparator)
{
    PreparedGraph pg;

    ProcessorPtr a = pg.graph.addNode (new ConstantNode());
    ProcessorPtr b = pg.graph.addNode (new ConstantNode());
    ProcessorPtr cmp = pg.graph.addNode (new ComparatorNode());
    ProcessorPtr readout = pg.graph.addNode (new ReadoutNode());
    BOOST_REQUIRE (a != nullptr && b != nullptr && cmp != nullptr && readout != nullptr);

    setConstantValue (*a, 0.8f);
    setConstantValue (*b, 0.5f);

    // ComparatorNode ports: 0 = cv_in_a, 1 = cv_in_b, 2 = cv_out.
    BOOST_REQUIRE (pg.graph.addConnection (a->nodeId, 0, cmp->nodeId, 0));
    BOOST_REQUIRE (pg.graph.addConnection (b->nodeId, 0, cmp->nodeId, 1));
    BOOST_REQUIRE (pg.graph.addConnection (cmp->nodeId, 2, readout->nodeId, 0));
    pumpRebuild();

    renderOneBlock (pg.graph);

    auto* ro = dynamic_cast<ReadoutNode*> (readout.get());
    auto* comparator = dynamic_cast<ComparatorNode*> (cmp.get());
    BOOST_REQUIRE (ro != nullptr && comparator != nullptr);

    BOOST_CHECK_CLOSE (ro->getCurrentDisplayValue(), 1.0f, 0.001); // 0.8 > 0.5
    BOOST_CHECK_CLOSE (cmp->getOutputCV (0), 1.0f, 0.001);

    comparator->setOperator (ComparatorNode::Op::less); // runtime re-condition
    renderOneBlock (pg.graph);
    BOOST_CHECK_SMALL (ro->getCurrentDisplayValue(), 1.0e-6f); // 0.8 < 0.5 is false
    BOOST_CHECK_SMALL (cmp->getOutputCV (0), 1.0e-6f);
}

// Repeated renders stay stable (ops + latches are idempotent per block).
BOOST_AUTO_TEST_CASE (cv_repeated_render_stable)
{
    PreparedGraph pg;

    ProcessorPtr constant = pg.graph.addNode (new ConstantNode());
    ProcessorPtr readout = pg.graph.addNode (new ReadoutNode());
    BOOST_REQUIRE (constant != nullptr && readout != nullptr);
    setConstantValue (*constant, -0.8f);
    BOOST_REQUIRE (pg.graph.addConnection (constant->nodeId, 0, readout->nodeId, 0));
    pumpRebuild();

    for (int i = 0; i < 8; ++i)
        renderOneBlock (pg.graph);

    auto* ro = dynamic_cast<ReadoutNode*> (readout.get());
    BOOST_REQUIRE (ro != nullptr);
    BOOST_CHECK_CLOSE (ro->getCurrentDisplayValue(), -0.8f, 0.001);
    BOOST_CHECK_CLOSE (constant->getOutputCV (0), -0.8f, 0.001);
}

BOOST_AUTO_TEST_SUITE_END()
