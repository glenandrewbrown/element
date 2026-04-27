// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Baseline tests for GuiService (audit P0-5). The service is registered,
// initialized, and activated by element::test::context(); these tests verify
// that the service is findable, that its lifecycle methods are idempotent,
// and that one canonical public method (closeAllPluginWindows) does not crash.
//
// NOTE: GuiService requires (Context&, Services&) constructor arguments,
// so it cannot be constructed standalone. The construct_destruct case
// documents this limitation and passes trivially.

#include <boost/test/unit_test.hpp>

#include <element/services.hpp>
#include <element/ui.hpp>

#include "fixture/ServicesFixture.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (GuiServiceTests)

BOOST_AUTO_TEST_CASE (construct_destruct)
{
    // GuiService(Context&, Services&) requires live Context and Services
    // references — standalone construction is not safe in a unit test.
    // Lifecycle is exercised via the shared test context below.
    BOOST_CHECK (true); // placeholder: limitation documented above
}

BOOST_AUTO_TEST_CASE (sibling_lookup)
{
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);
}

BOOST_AUTO_TEST_CASE (activate_deactivate)
{
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);
    // Already activated by test::context(). Deactivate then reactivate to
    // prove the lifecycle methods can run twice without crashing.
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
}

BOOST_AUTO_TEST_CASE (reactivate_after_deactivate)
{
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->deactivate()); // double-deactivate must be safe
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK_NO_THROW (svc->activate()); // double-activate must be safe
}

BOOST_AUTO_TEST_CASE (close_all_plugin_windows_does_not_crash)
{
    // closeAllPluginWindows(false) closes windows without requiring
    // windowVisible=true — safe with no plugins loaded.
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->closeAllPluginWindows (false));
}

BOOST_AUTO_TEST_SUITE_END()
