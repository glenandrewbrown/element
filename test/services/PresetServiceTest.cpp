// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Baseline tests for PresetService (audit P0-5). The service is registered,
// initialized, and activated by element::test::context(); these tests verify
// that the service is findable, that its lifecycle methods are idempotent,
// and that one canonical public method (refresh) does not crash.

#include <boost/test/unit_test.hpp>

#include <element/node.hpp>
#include <element/services.hpp>

#include "fixture/ServicesFixture.hpp"
#include "services/presetservice.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (PresetServiceTests)

BOOST_AUTO_TEST_CASE (construct_destruct)
{
    // Construct standalone (not added to a Services container). The Service
    // base destructor must run cleanly when owner is null — this verifies
    // the destruction path doesn't dereference an unset owner.
    auto svc = std::make_unique<PresetService>();
    BOOST_CHECK (svc != nullptr);
    svc.reset();
}

BOOST_AUTO_TEST_CASE (sibling_lookup)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);
}

BOOST_AUTO_TEST_CASE (activate_deactivate)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);
    // Already activated by test::context(). Deactivate then reactivate to
    // prove the lifecycle methods can run twice without crashing.
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
}

BOOST_AUTO_TEST_CASE (reactivate_after_deactivate)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->deactivate()); // double-deactivate must be safe
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK_NO_THROW (svc->activate()); // double-activate must be safe
}

BOOST_AUTO_TEST_CASE (refresh_does_not_crash)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->refresh());
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — PresetService refresh stability (Team H batch 3)
// refresh() rescans the preset directory. Repeated calls must not leak
// nor corrupt the in-memory preset list.
// =====================================================================

BOOST_AUTO_TEST_SUITE (PresetServiceRefreshTests)

BOOST_AUTO_TEST_CASE (refresh_idempotent_three_times)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->refresh());
    BOOST_CHECK_NO_THROW (svc->refresh());
    BOOST_CHECK_NO_THROW (svc->refresh());
}

BOOST_AUTO_TEST_CASE (refresh_after_lifecycle_round_trip)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK_NO_THROW (svc->refresh());
}

BOOST_AUTO_TEST_CASE (refresh_then_deactivate_no_crash)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->refresh());
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate()); // restore for any later tests
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — PresetService::add() with invalid Node
// add() takes a Node and an optional preset name. Default-constructed
// Nodes (the UI's "no selection" state) must be rejected gracefully —
// never throw, never crash. P1-10 visible regression context: Save
// preset path is reachable from window.prompt() in webview UX.
// =====================================================================

BOOST_AUTO_TEST_SUITE (PresetServiceAddTests)

BOOST_AUTO_TEST_CASE (add_default_node_does_not_crash)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    Node empty;
    BOOST_CHECK_NO_THROW (svc->add (empty, "test_preset_name"));
}

BOOST_AUTO_TEST_CASE (add_default_node_with_default_name)
{
    // Default-constructed name (empty string) is the "use node name" path.
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    Node empty;
    BOOST_CHECK_NO_THROW (svc->add (empty));
}

BOOST_AUTO_TEST_CASE (add_default_node_then_refresh)
{
    // The end-to-end user flow: add a preset, then refresh to surface it
    // in the picker. Both must remain safe even with invalid input.
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    Node empty;
    BOOST_CHECK_NO_THROW (svc->add (empty, "phaseH_smoke"));
    BOOST_CHECK_NO_THROW (svc->refresh());
}

BOOST_AUTO_TEST_SUITE_END()
