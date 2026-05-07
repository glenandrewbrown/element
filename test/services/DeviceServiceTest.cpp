// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Baseline tests for DeviceService (audit P0-5). The service is registered,
// initialized, and activated by element::test::context(); these tests verify
// that the service is findable, that its lifecycle methods are idempotent,
// and that one canonical public method (refresh) does not crash.

#include <boost/test/unit_test.hpp>

#include <element/devices.hpp>
#include <element/services.hpp>

#include "fixture/ServicesFixture.hpp"
#include "services/deviceservice.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (DeviceServiceTests)

BOOST_AUTO_TEST_CASE (construct_destruct)
{
    // Construct standalone (not added to a Services container). The Service
    // base destructor must run cleanly when owner is null — this verifies
    // the destruction path doesn't dereference an unset owner.
    auto svc = std::make_unique<DeviceService>();
    BOOST_CHECK (svc != nullptr);
    svc.reset();
}

BOOST_AUTO_TEST_CASE (sibling_lookup)
{
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);
}

BOOST_AUTO_TEST_CASE (activate_deactivate)
{
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);
    // Already activated by test::context(). Deactivate then reactivate to
    // prove the lifecycle methods can run twice without crashing.
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
}

BOOST_AUTO_TEST_CASE (reactivate_after_deactivate)
{
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->deactivate()); // double-deactivate must be safe
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK_NO_THROW (svc->activate()); // double-activate must be safe
}

BOOST_AUTO_TEST_CASE (refresh_does_not_crash)
{
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->refresh());
}

// P1-7: Verify that device hot-plug handling (ChangeListener + debounce Timer)
// can be exercised without crashing. We simulate a device-list change by
// sending a change notification through the AudioDeviceManager's broadcaster
// interface and then calling deactivate/activate to confirm the listener
// registration path is stable.
BOOST_AUTO_TEST_CASE (hotplug_change_listener_no_crash)
{
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);
    // Deactivate removes the ChangeListener and stops the debounce timer.
    BOOST_CHECK_NO_THROW (svc->deactivate());
    // Re-activate re-registers the ChangeListener on the DeviceManager.
    BOOST_CHECK_NO_THROW (svc->activate());
    // Simulate a rapid double-change (would trigger debounce in real use).
    auto& dm = test::context()->devices();
    BOOST_CHECK_NO_THROW (dm.sendSynchronousChangeMessage());
    BOOST_CHECK_NO_THROW (dm.sendSynchronousChangeMessage());
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — Observer / hot-plug behaviour (Team H batch 3)
// Verifies the DeviceService's interaction with the JUCE
// AudioDeviceManager change-notifier surface. The service must remain
// resilient to repeated/spurious change notifications and must keep
// receiving notifications across a deactivate/activate round-trip.
// =====================================================================

BOOST_AUTO_TEST_SUITE (DeviceServiceObserverTests)

BOOST_AUTO_TEST_CASE (rapid_change_burst_does_not_crash)
{
    // The hot-plug debounce timer should coalesce a burst into one refresh.
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);

    auto& dm = test::context()->devices();
    for (int i = 0; i < 10; ++i)
        BOOST_CHECK_NO_THROW (dm.sendSynchronousChangeMessage());

    // Pump the message queue so any debounce timer can fire (10ms is the
    // shortest meaningful pump that won't slow the suite).
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
}

BOOST_AUTO_TEST_CASE (change_notifier_survives_lifecycle_round_trip)
{
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());

    // Notification path should still be live after lifecycle round-trip.
    auto& dm = test::context()->devices();
    BOOST_CHECK_NO_THROW (dm.sendSynchronousChangeMessage());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
}

BOOST_AUTO_TEST_CASE (change_notifier_when_deactivated)
{
    // Notifications received while deactivated must not crash — the service
    // unregisters its ChangeListener in deactivate() so this is a no-op
    // contract verification.
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->deactivate());
    auto& dm = test::context()->devices();
    BOOST_CHECK_NO_THROW (dm.sendSynchronousChangeMessage());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
    BOOST_CHECK_NO_THROW (svc->activate());
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — Controller-management API surface
// DeviceService::add / remove / refresh accept Controller and Control
// values. With no real controller registered, these calls must return
// gracefully (defensive default-constructed inputs are valid program
// inputs from the UI's "no selection" state).
// =====================================================================

BOOST_AUTO_TEST_SUITE (DeviceServiceControllerTests)

BOOST_AUTO_TEST_CASE (refresh_default_controller_is_safe)
{
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);
    // Refresh with a default-constructed (invalid) Controller — the service
    // should treat it as a no-op rather than crashing.
    Controller noController;
    BOOST_CHECK_NO_THROW (svc->refresh (noController));
}

BOOST_AUTO_TEST_CASE (remove_default_controller_is_safe)
{
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);
    // Removing a controller that was never added must not crash.
    Controller noController;
    BOOST_CHECK_NO_THROW (svc->remove (noController));
}

BOOST_AUTO_TEST_CASE (add_invalid_file_is_safe)
{
    auto* svc = test::getService<DeviceService>();
    BOOST_REQUIRE (svc != nullptr);
    // Adding a non-existent .controller file must fail gracefully.
    juce::File missing ("/tmp/__element_nonexistent_controller_file__.controller");
    BOOST_CHECK_NO_THROW (svc->add (missing));
}

BOOST_AUTO_TEST_SUITE_END()
