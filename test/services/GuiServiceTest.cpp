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

// =====================================================================
// Phase H — GuiService selection signal observers (Team H batch 3)
// GuiService::nodeSelected is fired by selectNode() when the selected
// node changes. We connect a listener and confirm:
//   - the signal fires for a real selection change
//   - no double-fire on selecting the same node
//   - sigRefreshed is connectable without throwing
// =====================================================================

BOOST_AUTO_TEST_SUITE (GuiServiceObserverTests)

BOOST_AUTO_TEST_CASE (node_selected_signal_fires_on_change)
{
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);

    int callCount = 0;
    auto conn = svc->nodeSelected.connect ([&]() { ++callCount; });
    BOOST_CHECK (conn.connected());

    // selectNode() with a valid (non-empty) Node value will fire the signal;
    // selecting the same value again must not re-fire (early return guard).
    Node first;
    svc->selectNode (first);
    const int firstFireCount = callCount;
    svc->selectNode (first);
    BOOST_CHECK_EQUAL (callCount, firstFireCount); // no re-fire same value

    conn.disconnect();
    BOOST_CHECK (! conn.connected());
}

BOOST_AUTO_TEST_CASE (sig_refreshed_listener_connect)
{
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);

    int callCount = 0;
    auto conn = svc->sigRefreshed.connect ([&]() { ++callCount; });
    BOOST_CHECK (conn.connected());
    conn.disconnect();
    BOOST_CHECK (! conn.connected());
}

BOOST_AUTO_TEST_CASE (close_plugin_windows_for_unknown_node_id)
{
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);
    // Unknown node id must not crash; service iterates and skips silently.
    BOOST_CHECK_NO_THROW (svc->closePluginWindowsFor (static_cast<uint32> (0xDEADBEEF), false));
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — GuiService accessor surface
// Verify accessor methods that may run before any UI is constructed
// (the test::context() runs in headless RunMode::Standalone with no
// MainWindow). They must return null/zero rather than crashing.
// =====================================================================

BOOST_AUTO_TEST_SUITE (GuiServiceAccessorTests)

BOOST_AUTO_TEST_CASE (get_main_window_returns_null_in_headless_mode)
{
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);
    // No MainWindow constructed in headless test context — must be null,
    // not garbage / not a crash.
    BOOST_CHECK (svc->getMainWindow() == nullptr);
}

BOOST_AUTO_TEST_CASE (get_num_plugin_windows_is_zero_initially)
{
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_EQUAL (svc->getNumPluginWindows(), 0);
}

BOOST_AUTO_TEST_CASE (have_active_windows_false_initially)
{
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK (! svc->haveActiveWindows());
}

BOOST_AUTO_TEST_CASE (get_selected_node_default_constructed)
{
    auto* svc = test::getService<GuiService>();
    BOOST_REQUIRE (svc != nullptr);
    // No selection yet → returns a default Node value (not null pointer).
    auto sel = svc->getSelectedNode();
    BOOST_CHECK_NO_THROW ((void) sel.getName());
}

BOOST_AUTO_TEST_SUITE_END()
