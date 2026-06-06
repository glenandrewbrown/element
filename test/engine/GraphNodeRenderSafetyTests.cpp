// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// P0 engine-safety gate (CCG fix wave 2026-06-06, findings C1 + C2).
//
// C1: GraphNode::buildRenderingSequence() used to free the swapped-out render
// op array immediately after the atomic exchange, while the audio thread may
// still be iterating it after its acquire load (use-after-free). The fix is
// deferred reclamation keyed off a render-generation counter — these tests
// hammer the swap path while a real render loop runs, mimicking the engine
// (which holds the graph property lock around render, exactly as the renderer
// thread does here — see AudioEngine renderGraphs / audioengine.cpp:155).
//
// C2: the shared render pools were hard-capped at 4096 samples while render()
// trusted the live numSamples — out-of-bounds for host blocks > 4096 (offline
// bounce). Pools now size from the negotiated max block size; a defensive
// clamp protects against out-of-contract hosts.

#include <boost/test/unit_test.hpp>

#include <atomic>
#include <thread>

#include <element/context.hpp>

#include "engine/graphnode.hpp"
#include "nodes/constantnode.hpp"
#include "nodes/readoutnode.hpp"
#include "fixture/PreparedGraph.h"
#include "testutil.hpp"

using namespace element;

namespace {

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

/** Render one block through the graph's real op sequence, holding the graph
    property lock exactly as AudioEngine::renderGraphs does. */
void renderOneBlock (GraphNode& graph, const int blockSize)
{
    juce::AudioSampleBuffer audio (2, blockSize);
    juce::AudioSampleBuffer cv (1, blockSize);
    juce::MidiBuffer midi;
    audio.clear();
    cv.clear();
    RenderContext rc (audio, cv, midi, blockSize);
    const juce::ScopedLock sl (graph.getPropertyLock());
    graph.render (rc);
}

} // namespace

BOOST_AUTO_TEST_SUITE (GraphNodeRenderSafetyTests)

// C1: rebuild the op sequence repeatedly while a render loop runs on another
// thread. Before the deferred-reclamation fix this is a use-after-free (the
// old op array was freed while the renderer could still be iterating it) —
// crashes intermittently, deterministically under ASan.
BOOST_AUTO_TEST_CASE (swap_under_render_stress)
{
    PreparedGraph pg;

    ProcessorPtr constant = pg.graph.addNode (new ConstantNode());
    ProcessorPtr readout = pg.graph.addNode (new ReadoutNode());
    BOOST_REQUIRE (constant != nullptr && readout != nullptr);
    setConstantValue (*constant, 0.5f);
    BOOST_REQUIRE (pg.graph.addConnection (constant->nodeId, 0, readout->nodeId, 0));
    pumpRebuild();

    std::atomic<bool> stop { false };
    std::atomic<int> rendered { 0 };

    std::thread renderer ([&] {
        while (! stop.load (std::memory_order_acquire))
        {
            renderOneBlock (pg.graph, 512);
            rendered.fetch_add (1, std::memory_order_relaxed);
        }
    });

    // Rebuild the rendering sequence as fast as possible — every call swaps
    // the active op array and retires the previous one.
    for (int i = 0; i < 300; ++i)
    {
        pg.graph.rebuild();
        std::this_thread::yield();
    }

    stop.store (true, std::memory_order_release);
    renderer.join();

    BOOST_CHECK_GT (rendered.load(), 0);

    // The graph must still be fully functional after the churn.
    renderOneBlock (pg.graph, 512);
    auto* ro = dynamic_cast<ReadoutNode*> (readout.get());
    BOOST_REQUIRE (ro != nullptr);
    BOOST_CHECK_CLOSE (ro->getCurrentDisplayValue(), 0.5f, 0.001);
}

// C2: a host that negotiates a max block size > 4096 must render correctly —
// the shared pools size from the negotiated max, not a hard 4096 cap.
BOOST_AUTO_TEST_CASE (render_block_larger_than_4096)
{
    constexpr int kBigBlock = 8192;
    PreparedGraph pg (44100.0, kBigBlock);

    ProcessorPtr constant = pg.graph.addNode (new ConstantNode());
    ProcessorPtr readout = pg.graph.addNode (new ReadoutNode());
    BOOST_REQUIRE (constant != nullptr && readout != nullptr);
    setConstantValue (*constant, 0.5f);
    BOOST_REQUIRE (pg.graph.addConnection (constant->nodeId, 0, readout->nodeId, 0));
    pumpRebuild();

    // Several full-size blocks: with the old 4096 pools this writes past the
    // pool allocations (heap corruption); now the value must simply arrive.
    for (int i = 0; i < 4; ++i)
        renderOneBlock (pg.graph, kBigBlock);

    auto* ro = dynamic_cast<ReadoutNode*> (readout.get());
    BOOST_REQUIRE (ro != nullptr);
    BOOST_CHECK_CLOSE (ro->getCurrentDisplayValue(), 0.5f, 0.001);
    BOOST_CHECK_CLOSE (constant->getOutputCV (0), 0.5f, 0.001);
}

// C1 follow-through: repeated rebuilds with NO renderer running must not
// accumulate or double-free retired arrays (reclamation happens on later
// rebuilds / destruction). Mostly a leak-detector + lifecycle exercise.
BOOST_AUTO_TEST_CASE (repeated_rebuild_without_render_is_clean)
{
    {
        PreparedGraph pg;
        ProcessorPtr constant = pg.graph.addNode (new ConstantNode());
        ProcessorPtr readout = pg.graph.addNode (new ReadoutNode());
        BOOST_REQUIRE (constant != nullptr && readout != nullptr);
        BOOST_REQUIRE (pg.graph.addConnection (constant->nodeId, 0, readout->nodeId, 0));
        pumpRebuild();

        for (int i = 0; i < 64; ++i)
            pg.graph.rebuild();

        // A render between rebuilds advances the generation so earlier
        // retirees become reclaimable on the next rebuild.
        renderOneBlock (pg.graph, 512);
        pg.graph.rebuild();
    }
    // PreparedGraph destructor ran releaseResources + clear + ~GraphNode
    // (force reclamation). JUCE's leak detector flags leaked ops at exit.
    BOOST_CHECK (true);
}

BOOST_AUTO_TEST_SUITE_END()
