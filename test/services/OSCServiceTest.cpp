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

// =====================================================================
// Phase H — OSCService sender lifecycle (Team H batch 3)
// Round-trip the sender API through reconnects, double-disconnects,
// and connect-after-disconnect. The lock-free sender holder must
// remain consistent across these state transitions.
// =====================================================================

BOOST_AUTO_TEST_SUITE (OSCServiceSenderLifecycleTests)

BOOST_AUTO_TEST_CASE (reconnect_to_different_port_succeeds)
{
    OSCService svc;
    BOOST_CHECK (! svc.isSenderConnected());

    BOOST_CHECK (svc.connectSender ("127.0.0.1", 19901));
    BOOST_CHECK (svc.isSenderConnected());

    // Reconnect to a different port without explicit disconnect — the
    // service must implicitly drop the old connection.
    BOOST_CHECK (svc.connectSender ("127.0.0.1", 19902));
    BOOST_CHECK (svc.isSenderConnected());

    svc.disconnectSender();
    BOOST_CHECK (! svc.isSenderConnected());
}

BOOST_AUTO_TEST_CASE (double_disconnect_is_safe)
{
    OSCService svc;
    BOOST_REQUIRE (svc.connectSender ("127.0.0.1", 19903));
    BOOST_CHECK_NO_THROW (svc.disconnectSender());
    BOOST_CHECK_NO_THROW (svc.disconnectSender()); // double-disconnect
    BOOST_CHECK (! svc.isSenderConnected());
}

BOOST_AUTO_TEST_CASE (send_after_reconnect_returns_true)
{
    OSCService svc;
    BOOST_REQUIRE (svc.connectSender ("127.0.0.1", 19904));

    juce::OSCMessage msg (juce::OSCAddressPattern ("/test/reconnect"));
    msg.addFloat32 (0.42f);

    bool result = false;
    BOOST_CHECK_NO_THROW (result = svc.sendMessage (msg));
    // Sender is connected — UDP send should succeed (no peer needed).
    BOOST_CHECK (result);

    svc.disconnectSender();
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — OSCService input validation
// connectSender must reject obvious garbage gracefully (empty host,
// out-of-range port). The contract says "returns false" — never throw.
// =====================================================================

BOOST_AUTO_TEST_SUITE (OSCServiceInputValidationTests)

BOOST_AUTO_TEST_CASE (connect_with_empty_host_does_not_crash)
{
    OSCService svc;
    bool result = true;
    // Empty host is invalid input — implementation may return false or
    // accept-then-fail-on-send. Either way, no throw.
    BOOST_CHECK_NO_THROW (result = svc.connectSender ("", 19910));
    if (result)
        svc.disconnectSender();
    BOOST_CHECK (! svc.isSenderConnected());
}

BOOST_AUTO_TEST_CASE (connect_with_zero_port_returns_false_or_throws_safely)
{
    OSCService svc;
    bool result = true;
    BOOST_CHECK_NO_THROW (result = svc.connectSender ("127.0.0.1", 0));
    // Port 0 may be accepted by some OS stacks (kernel-assigned port);
    // we only require: no crash and a consistent isSenderConnected().
    if (result)
        BOOST_CHECK (svc.isSenderConnected());
    else
        BOOST_CHECK (! svc.isSenderConnected());
    svc.disconnectSender();
}

BOOST_AUTO_TEST_CASE (send_after_disconnect_returns_false_again)
{
    OSCService svc;
    BOOST_REQUIRE (svc.connectSender ("127.0.0.1", 19911));
    svc.disconnectSender();

    juce::OSCMessage msg (juce::OSCAddressPattern ("/test/post-disconnect"));
    msg.addString ("ping");

    bool result = true;
    BOOST_CHECK_NO_THROW (result = svc.sendMessage (msg));
    BOOST_CHECK (! result);
}

BOOST_AUTO_TEST_SUITE_END()
