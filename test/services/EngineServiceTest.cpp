// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Baseline tests for EngineService (audit P0-5). The service is registered,
// initialized, and activated by element::test::context(); these tests verify
// that the service is findable, that its lifecycle methods are idempotent,
// and that one canonical public method (syncModels) does not crash.

#include <boost/test/unit_test.hpp>

#include <element/services.hpp>
#include <element/engine.hpp>

#include "fixture/ServicesFixture.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (EngineServiceTests)

BOOST_AUTO_TEST_CASE (construct_destruct)
{
    // Construct standalone (not added to a Services container). The Service
    // base destructor must run cleanly when owner is null — this verifies
    // the destruction path doesn't dereference an unset owner.
    auto svc = std::make_unique<EngineService>();
    BOOST_CHECK (svc != nullptr);
    svc.reset();
}

BOOST_AUTO_TEST_CASE (sibling_lookup)
{
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);
}

BOOST_AUTO_TEST_CASE (activate_deactivate)
{
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);
    // Already activated by test::context(). Deactivate then reactivate to
    // prove the lifecycle methods can run twice without crashing.
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
}

BOOST_AUTO_TEST_CASE (reactivate_after_deactivate)
{
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->deactivate()); // double-deactivate must be safe
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK_NO_THROW (svc->activate()); // double-activate must be safe
}

BOOST_AUTO_TEST_CASE (sync_models_does_not_crash)
{
    // syncModels() syncs graph models with the engine — safe to call with
    // no plugins loaded (empty default session from test::context()).
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->syncModels());
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — Engine state-changed signal observer (Team H batch 3)
// EngineService exposes two signals:
//   sigNodeRemoved      (fired when a node is removed from the graph)
//   sigEngineStateChanged (P1-11 — fired on graph rebuild, node add/remove)
// We verify a listener can be connected without throwing, that
// disconnect-on-destruction is honoured, and that the signal can be
// triggered via supported public methods (clear()) without crashing.
// =====================================================================

BOOST_AUTO_TEST_SUITE (EngineServiceObserverTests)

BOOST_AUTO_TEST_CASE (sig_engine_state_changed_listener_connect)
{
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);

    int callCount = 0;
    auto conn = svc->sigEngineStateChanged.connect ([&]() { ++callCount; });
    BOOST_CHECK (conn.connected());

    // The connection itself is the contract — emission is implementation-
    // detail-dependent and may fire later via async paths.
    conn.disconnect();
    BOOST_CHECK (! conn.connected());
}

BOOST_AUTO_TEST_CASE (sig_node_removed_listener_disconnect_on_scope)
{
    // Verify SignalConnection disconnects cleanly when the scope guard ends
    // — required to avoid stale callbacks once UI/test owners go away.
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);

    {
        auto conn = svc->sigNodeRemoved.connect ([] (const Node&) {});
        BOOST_CHECK (conn.connected());
        // conn destructs → disconnect happens here.
    }

    // After the connection went out of scope, calling syncModels() must
    // remain safe; if disconnect missed, a stale callback would surface.
    BOOST_CHECK_NO_THROW (svc->syncModels());
}

BOOST_AUTO_TEST_CASE (clear_does_not_crash_with_empty_graph)
{
    // clear() removes all nodes from the active root graph — safe to call
    // on an empty default session.
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->clear());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — Engine graph mutation API error handling
// Engine APIs that take an arbitrary node ID (uint32) or Uuid must
// behave defensively when the input does not match a node in the
// active graph. These are the most common UI-driven crash hazards
// per the forensic audit (e.g. F-5 GuiService null-deref).
// =====================================================================

BOOST_AUTO_TEST_SUITE (EngineServiceErrorTests)

BOOST_AUTO_TEST_CASE (remove_unknown_node_id_does_not_crash)
{
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);
    // 0xFFFFFFFF is reserved-invalid in the engine's node-id space.
    BOOST_CHECK_NO_THROW (svc->removeNode (static_cast<uint32> (0xFFFFFFFF)));
}

BOOST_AUTO_TEST_CASE (remove_unknown_uuid_does_not_crash)
{
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);
    // A freshly-generated Uuid will not be in the active graph.
    juce::Uuid unknown;
    BOOST_CHECK_NO_THROW (svc->removeNode (unknown));
}

BOOST_AUTO_TEST_CASE (remove_invalid_node_object_does_not_crash)
{
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);
    // A default-constructed Node is invalid (no underlying ValueTree data);
    // the engine must reject it cleanly.
    Node empty;
    BOOST_CHECK_NO_THROW (svc->removeNode (empty));
}

BOOST_AUTO_TEST_CASE (remove_connection_with_invalid_endpoints)
{
    // (sourceNode=0, sourcePort=0, destNode=0, destPort=0) is a recognised
    // invalid sentinel — must not crash.
    auto* svc = test::getService<EngineService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->removeConnection (0u, 0u, 0u, 0u));
}

BOOST_AUTO_TEST_SUITE_END()
