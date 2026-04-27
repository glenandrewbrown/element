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
