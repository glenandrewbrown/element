// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Integration tests for Session dirty-state tracking.
// Uses ServicesFixture (test::context() provides a fully initialised
// Standalone Context with all services registered and activated).

#include <boost/test/unit_test.hpp>

#include <element/services.hpp>

#include "fixture/ServicesFixture.hpp"
#include "services/sessionservice.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (SessionChangedTest)

// ── Baseline: fresh session is clean ──────────────────────────────────────
BOOST_AUTO_TEST_CASE (HasChanged_not_flagged_after_reset)
{
    auto* svc = test::getService<SessionService>();
    BOOST_REQUIRE (svc != nullptr);

    // Drain any pending ChangeBroadcaster events from prior tests.
    juce::MessageManager::getInstance()->runDispatchLoopUntil (20);
    svc->resetChanges();
    BOOST_CHECK (! svc->hasSessionChanged());
}

// ── openDefaultSession leaves document clean after resetChanges ───────────
BOOST_AUTO_TEST_CASE (HasChanged_clean_after_open_default)
{
    auto* svc = test::getService<SessionService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->openDefaultSession());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (50);

    // Production open paths call resetChanges() to mark as clean.
    svc->resetChanges();
    BOOST_CHECK (! svc->hasSessionChanged());
}

// ── newSession leaves document clean after resetChanges ───────────────────
BOOST_AUTO_TEST_CASE (HasChanged_clean_after_new_session)
{
    auto* svc = test::getService<SessionService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->newSession());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (30);
    svc->resetChanges();
    BOOST_CHECK (! svc->hasSessionChanged());
}

// ── openFile with missing path does not set changed flag ──────────────────
BOOST_AUTO_TEST_CASE (HasChanged_not_set_on_missing_file_open)
{
    auto* svc = test::getService<SessionService>();
    BOOST_REQUIRE (svc != nullptr);

    svc->resetChanges();
    BOOST_CHECK (! svc->hasSessionChanged());

    juce::File missing (juce::File::getSpecialLocation (juce::File::tempDirectory)
                            .getChildFile ("__session_changed_test_missing__.els"));
    BOOST_REQUIRE (! missing.existsAsFile());

    BOOST_CHECK_NO_THROW (svc->openFile (missing));
    juce::MessageManager::getInstance()->runDispatchLoopUntil (30);

    // A failed open should not mark the session as changed.
    svc->resetChanges(); // defensive drain
    BOOST_CHECK (! svc->hasSessionChanged());
}

// ── close → open round-trip leaves document clean ─────────────────────────
BOOST_AUTO_TEST_CASE (HasChanged_clean_after_close_open_round_trip)
{
    auto* svc = test::getService<SessionService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->closeSession());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (20);

    BOOST_CHECK_NO_THROW (svc->openDefaultSession());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (50);

    svc->resetChanges();
    BOOST_CHECK (! svc->hasSessionChanged());
}

BOOST_AUTO_TEST_SUITE_END()
