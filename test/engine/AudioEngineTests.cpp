// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// AudioEngineTests — Priority 2 in coverage audit.
// AudioEngine has ZERO direct tests; exercised only indirectly through
// AudioRoutingTests.  These tests cover the public graph-management API.
//
// Design: use a fresh local Context (not the shared test::context()) for each
// suite so tests do not corrupt shared state.  Mirrors the pattern used in
// RootGraphTests.cpp.
//
// Gaps covered:
//   • addGraph() / removeGraph() state invariants
//   • getGraph(index) returns correct pointer after addGraph
//   • getActiveGraph() / setActiveGraph() round-trip
//   • activate() / deactivate() lifecycle idempotency
//   • Null-arg guards

#include <boost/test/unit_test.hpp>

#include <element/audioengine.hpp>
#include <element/context.hpp>

#include "engine/rootgraph.hpp"
#include "testutil.hpp"

using namespace element;

// ---------------------------------------------------------------------------
// Helper: create a prepared RootGraph owned by the caller.
static RootGraph* makeGraph (Context& ctx)
{
    auto* rg = new RootGraph (ctx);
    rg->prepareToRender (44100.0, 512);
    return rg;
}

BOOST_AUTO_TEST_SUITE (AudioEngineTests)

// ---------------------------------------------------------------------------
// GAP: No test verifies the engine is reachable from Context.
BOOST_AUTO_TEST_CASE (engine_accessible_from_context)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);
    // audio() returns a ref-counted pointer — must be non-null.
    auto eng = ctx->audio();
    BOOST_CHECK (eng != nullptr);
}

// ---------------------------------------------------------------------------
// GAP: After addGraph() the graph is retrievable via getGraph().
BOOST_AUTO_TEST_CASE (add_graph_retrievable)
{
    Context ctx (RunMode::Standalone);
    auto* eng = ctx.audio().get();
    BOOST_REQUIRE (eng != nullptr);

    auto* rg = makeGraph (ctx);
    eng->addGraph (rg);

    // Graph must be reachable at index 0 (we started with an empty engine).
    RootGraph* retrieved = eng->getGraph (0);
    BOOST_CHECK_EQUAL (retrieved, rg);

    eng->removeGraph (rg);
    rg->releaseResources();
    delete rg;
}

// ---------------------------------------------------------------------------
// GAP: After removeGraph() the slot returns nullptr.
BOOST_AUTO_TEST_CASE (remove_graph_not_retrievable)
{
    Context ctx (RunMode::Standalone);
    auto* eng = ctx.audio().get();
    BOOST_REQUIRE (eng != nullptr);

    auto* rg = makeGraph (ctx);
    eng->addGraph (rg);
    eng->removeGraph (rg);

    // Index 0 must now return nullptr.
    BOOST_CHECK (eng->getGraph (0) == nullptr);

    rg->releaseResources();
    delete rg;
}

// ---------------------------------------------------------------------------
// GAP: getActiveGraph() / setActiveGraph() round-trip.
BOOST_AUTO_TEST_CASE (set_active_graph_roundtrip)
{
    Context ctx (RunMode::Standalone);
    auto* eng = ctx.audio().get();
    BOOST_REQUIRE (eng != nullptr);

    auto* rg1 = makeGraph (ctx);
    auto* rg2 = makeGraph (ctx);
    eng->addGraph (rg1);
    eng->addGraph (rg2);

    eng->setActiveGraph (1);
    BOOST_CHECK_EQUAL (eng->getActiveGraph(), 1);

    eng->setActiveGraph (0);
    BOOST_CHECK_EQUAL (eng->getActiveGraph(), 0);

    eng->removeGraph (rg2);
    eng->removeGraph (rg1);
    rg1->releaseResources();
    rg2->releaseResources();
    delete rg1;
    delete rg2;
}

// ---------------------------------------------------------------------------
// GAP: Multiple addGraph / removeGraph cycles must not crash.
BOOST_AUTO_TEST_CASE (add_remove_cycle)
{
    Context ctx (RunMode::Standalone);
    auto* eng = ctx.audio().get();
    BOOST_REQUIRE (eng != nullptr);

    for (int i = 0; i < 3; ++i)
    {
        auto* rg = makeGraph (ctx);
        BOOST_CHECK_NO_THROW (eng->addGraph (rg));
        BOOST_CHECK_NO_THROW (eng->removeGraph (rg));
        rg->releaseResources();
        delete rg;
    }
}

// ---------------------------------------------------------------------------
// GAP: activate() / deactivate() lifecycle must be idempotent.
BOOST_AUTO_TEST_CASE (activate_deactivate_idempotent)
{
    Context ctx (RunMode::Standalone);
    auto* eng = ctx.audio().get();
    BOOST_REQUIRE (eng != nullptr);

    BOOST_CHECK_NO_THROW (eng->activate());
    BOOST_CHECK_NO_THROW (eng->deactivate());
    BOOST_CHECK_NO_THROW (eng->deactivate()); // second deactivate must not crash
    BOOST_CHECK_NO_THROW (eng->activate());
    BOOST_CHECK_NO_THROW (eng->deactivate());
}

// ---------------------------------------------------------------------------
// GAP: External playback lifecycle (for plug-in wrapper mode).
BOOST_AUTO_TEST_CASE (external_playback_lifecycle)
{
    Context ctx (RunMode::Standalone);
    auto* eng = ctx.audio().get();
    BOOST_REQUIRE (eng != nullptr);

    BOOST_CHECK_NO_THROW (eng->prepareExternalPlayback (44100.0, 512, 2, 2));
    BOOST_CHECK_NO_THROW (eng->releaseExternalResources());
    // Second release must be safe.
    BOOST_CHECK_NO_THROW (eng->releaseExternalResources());
}

BOOST_AUTO_TEST_SUITE_END()
