// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Baseline tests for OSCService (audit P0-5). The service is registered,
// initialized, and activated by element::test::context(); these tests verify
// that the service is findable, that its lifecycle methods are idempotent,
// and that refreshWithSettings(false) does not crash with no network port
// configured (false = no alert on failure).

#include <boost/test/unit_test.hpp>

#include <element/services.hpp>

#include "fixture/ServicesFixture.hpp"
#include "services/oscservice.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (OSCServiceTests)

BOOST_AUTO_TEST_CASE (construct_destruct)
{
    // Construct standalone (not added to a Services container). The Service
    // base destructor must run cleanly when owner is null — this verifies
    // the destruction path doesn't dereference an unset owner.
    auto svc = std::make_unique<OSCService>();
    BOOST_CHECK (svc != nullptr);
    svc.reset();
}

BOOST_AUTO_TEST_CASE (sibling_lookup)
{
    auto* svc = test::getService<OSCService>();
    BOOST_REQUIRE (svc != nullptr);
}

BOOST_AUTO_TEST_CASE (activate_deactivate)
{
    auto* svc = test::getService<OSCService>();
    BOOST_REQUIRE (svc != nullptr);
    // Already activated by test::context(). Deactivate then reactivate to
    // prove the lifecycle methods can run twice without crashing.
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
}

BOOST_AUTO_TEST_CASE (reactivate_after_deactivate)
{
    auto* svc = test::getService<OSCService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->deactivate()); // double-deactivate must be safe
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK_NO_THROW (svc->activate()); // double-activate must be safe
}

BOOST_AUTO_TEST_CASE (refresh_with_settings_does_not_crash)
{
    // refreshWithSettings(false) reads OSC settings and starts/stops the host.
    // Passing false suppresses any alert dialog on failure — safe in headless tests.
    auto* svc = test::getService<OSCService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->refreshWithSettings (false));
}

// P1-9: sender API — connect to a real port and verify state tracking.
BOOST_AUTO_TEST_CASE (sender_connect_reports_state)
{
    // Use a standalone instance so this test is fully self-contained.
    OSCService svc;

    // Not connected before any call.
    BOOST_CHECK (! svc.isSenderConnected());

    // Connect to localhost on a high port (connection succeeds for UDP sender).
    const bool connected = svc.connectSender ("127.0.0.1", 19900);
    BOOST_CHECK (connected);
    BOOST_CHECK (svc.isSenderConnected());

    svc.disconnectSender();
    BOOST_CHECK (! svc.isSenderConnected());
}

// P1-9: sending on a disconnected sender must return false, never crash.
BOOST_AUTO_TEST_CASE (send_on_disconnected_sender_returns_false)
{
    OSCService svc;
    BOOST_REQUIRE (! svc.isSenderConnected());

    juce::OSCMessage msg (juce::OSCAddressPattern ("/test/ping"));
    msg.addInt32 (42);

    bool result = false;
    BOOST_CHECK_NO_THROW (result = svc.sendMessage (msg));
    BOOST_CHECK (! result);
}

BOOST_AUTO_TEST_SUITE_END()
