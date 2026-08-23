// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Baseline tests for MappingService (audit P0-5). The service is registered,
// initialized, and activated by element::test::context(); these tests verify
// that the service is findable, that its lifecycle methods are idempotent,
// and that isLearning() returns false on a freshly activated service.

#include <boost/test/unit_test.hpp>

#include <element/services.hpp>

#include "fixture/ServicesFixture.hpp"
#include "services/mappingservice.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (MappingServiceTests)

BOOST_AUTO_TEST_CASE (construct_destruct)
{
    // Construct standalone (not added to a Services container). The Service
    // base destructor must run cleanly when owner is null — this verifies
    // the destruction path doesn't dereference an unset owner.
    auto svc = std::make_unique<MappingService>();
    BOOST_CHECK (svc != nullptr);
    svc.reset();
}

BOOST_AUTO_TEST_CASE (sibling_lookup)
{
    auto* svc = test::getService<MappingService>();
    BOOST_REQUIRE (svc != nullptr);
}

BOOST_AUTO_TEST_CASE (activate_deactivate)
{
    auto* svc = test::getService<MappingService>();
    BOOST_REQUIRE (svc != nullptr);
    // Already activated by test::context(). Deactivate then reactivate to
    // prove the lifecycle methods can run twice without crashing.
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
}

BOOST_AUTO_TEST_CASE (reactivate_after_deactivate)
{
    auto* svc = test::getService<MappingService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->deactivate()); // double-deactivate must be safe
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK_NO_THROW (svc->activate()); // double-activate must be safe
}

BOOST_AUTO_TEST_CASE (isLearning_returns_false_post_activate)
{
    // A freshly activated MappingService must not be in learn mode.
    auto* svc = test::getService<MappingService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK (! svc->isLearning());
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — MappingService learn-mode toggle (Team H batch 3)
// learn(true)/learn(false) toggle the controller-capture state. The
// service holds Boost.Signals2 connections internally; toggling must
// not leak connections nor leave the service in an inconsistent state.
// =====================================================================

BOOST_AUTO_TEST_SUITE (MappingServiceLearnModeTests)

BOOST_AUTO_TEST_CASE (learn_true_then_false_round_trip)
{
    auto* svc = test::getService<MappingService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->learn (true));
    BOOST_CHECK (svc->isLearning());

    BOOST_CHECK_NO_THROW (svc->learn (false));
    BOOST_CHECK (! svc->isLearning());
}

BOOST_AUTO_TEST_CASE (learn_default_true_argument)
{
    // learn() defaults to true (per header signature) — exercise that path.
    auto* svc = test::getService<MappingService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->learn());
    BOOST_CHECK (svc->isLearning());
    BOOST_CHECK_NO_THROW (svc->learn (false));
    BOOST_CHECK (! svc->isLearning());
}

BOOST_AUTO_TEST_CASE (learn_idempotent_double_toggle)
{
    // Setting the same state twice must not crash and must leave the
    // service's reported state matching the requested state.
    auto* svc = test::getService<MappingService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->learn (true));
    BOOST_CHECK_NO_THROW (svc->learn (true));
    BOOST_CHECK (svc->isLearning());

    BOOST_CHECK_NO_THROW (svc->learn (false));
    BOOST_CHECK_NO_THROW (svc->learn (false));
    BOOST_CHECK (! svc->isLearning());
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — MappingService removal API
// remove(ControllerMap) is exposed to the UI for clearing a binding.
// A default-constructed ControllerMap (no underlying ValueTree) must
// be tolerated — the UI can call this for an empty selection.
// =====================================================================

BOOST_AUTO_TEST_SUITE (MappingServiceRemovalTests)

BOOST_AUTO_TEST_CASE (remove_default_controller_map_does_not_crash)
{
    auto* svc = test::getService<MappingService>();
    BOOST_REQUIRE (svc != nullptr);
    ControllerMap empty;
    BOOST_CHECK_NO_THROW (svc->remove (empty));
}

BOOST_AUTO_TEST_CASE (remove_during_learn_mode_does_not_crash)
{
    // Edge case: UI clears a mapping while learn mode is active.
    auto* svc = test::getService<MappingService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->learn (true));
    ControllerMap empty;
    BOOST_CHECK_NO_THROW (svc->remove (empty));
    BOOST_CHECK_NO_THROW (svc->learn (false));
}

BOOST_AUTO_TEST_CASE (lifecycle_after_learn_round_trip)
{
    // Full cycle — learn on, learn off, deactivate, activate — must keep
    // the service responsive (no leftover signal connections cause
    // state-machine corruption).
    auto* svc = test::getService<MappingService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->learn (true));
    BOOST_CHECK_NO_THROW (svc->learn (false));
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK (! svc->isLearning());
}

BOOST_AUTO_TEST_SUITE_END()
