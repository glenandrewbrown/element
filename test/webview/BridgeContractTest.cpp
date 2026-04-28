// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// P1-17 — Bridge contract tests.
// Exercises 5 representative native-bridge functions through the registered
// lambda map, asserting JSON shapes without requiring a live WebBrowserComponent.
// All tests run on the message thread (guarded by JuceMessageManagerFixture in
// TestMain.cpp).  The host is constructed with skipBrowser=true so no
// WebView window is created.

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/graph.hpp>
#include <element/juce.hpp>
#include <element/session.hpp>
#include <element/ui/element_webview_host.hpp>

#include "testutil.hpp"

using namespace element;
using namespace juce;

// ---------------------------------------------------------------------------
// Test-only friend class — gives access to invokeForTest and bridgeFunctions.
// The friend declaration is in element_webview_host.hpp.
class BridgeContractTest
{
public:
    static var invoke (ElementWebViewHost& host,
                       const String& name,
                       const Array<var>& args = {})
    {
        return host.invokeForTest (name, args);
    }
};

// ---------------------------------------------------------------------------
// Helper: ensure the test context has an active graph for tests that need one.
// Returns false if the session is unavailable.
static bool ensureActiveGraph()
{
    auto* ctx = test::context();
    if (ctx == nullptr)
        return false;
    auto sess = ctx->session();
    if (sess == nullptr)
        return false;
    if (sess->getActiveGraph().isGraph())
        return true; // already set up by a prior test in this run

    const Node G (Graph::create ("TestGraph", 2, 2, true, true));
    return sess->addGraph (G, true);
}

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (BridgeContractTests)

// ── Test 1 ──────────────────────────────────────────────────────────────────
// elementGetGraphState — no graph required.
// Asserts: JSON parses, has schema:2, session object, graphs array.
BOOST_AUTO_TEST_CASE (getGraphState_json_shape)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);
    const var result = BridgeContractTest::invoke (host, "elementGetGraphState");

    BOOST_REQUIRE (! result.isVoid() && ! result.isUndefined());

    // Result is a JSON string — parse it.
    const String json (result.toString());
    var parsed;
    juce::Result parseResult = JSON::parse (json, parsed);
    BOOST_REQUIRE_MESSAGE (parseResult.wasOk(), "elementGetGraphState returned invalid JSON: " + json);

    auto* obj = parsed.getDynamicObject();
    BOOST_REQUIRE (obj != nullptr);

    // schema:2 must be present
    BOOST_CHECK_EQUAL ((int) obj->getProperty ("schema"), 2);

    // session object must be present
    BOOST_CHECK (obj->getProperty ("session").isObject());

    // graphs array must be present (may be empty without a loaded session)
    BOOST_CHECK (obj->getProperty ("graphs").isArray());
}

// ── Test 2 ──────────────────────────────────────────────────────────────────
// elementGraphCreateWirelessBus / elementGraphGetWirelessBuses round-trip.
// Requires an active graph.
BOOST_AUTO_TEST_CASE (wirelessBus_create_and_list)
{
    BOOST_REQUIRE (ensureActiveGraph());

    auto* ctx = test::context();
    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    // Build input: { name: "test", signalType: "audio" }
    DynamicObject::Ptr input (new DynamicObject());
    input->setProperty ("name",       "test");
    input->setProperty ("signalType", "audio");
    Array<var> createArgs { var (input.get()) };

    const var createResult = BridgeContractTest::invoke (host, "elementGraphCreateWirelessBus", createArgs);
    BOOST_REQUIRE (! createResult.isVoid());

    const String createJson (createResult.toString());
    var createParsed;
    BOOST_REQUIRE (JSON::parse (createJson, createParsed).wasOk());

    auto* createObj = createParsed.getDynamicObject();
    BOOST_REQUIRE (createObj != nullptr);

    // Must have id, name, signalType
    const String busId (createObj->getProperty ("id").toString());
    BOOST_CHECK (busId.isNotEmpty());
    BOOST_CHECK_EQUAL (createObj->getProperty ("name").toString(), String ("test"));
    BOOST_CHECK_EQUAL (createObj->getProperty ("signalType").toString(), String ("audio"));

    // Now list buses — the new id must appear
    const var listResult = BridgeContractTest::invoke (host, "elementGraphGetWirelessBuses");
    BOOST_REQUIRE (! listResult.isVoid());

    var listParsed;
    BOOST_REQUIRE (JSON::parse (listResult.toString(), listParsed).wasOk());
    BOOST_REQUIRE (listParsed.isArray());

    bool found = false;
    if (const auto* arr = listParsed.getArray())
        for (const var& item : *arr)
            if (auto* entry = item.getDynamicObject())
                if (entry->getProperty ("id").toString() == busId)
                    found = true;

    BOOST_CHECK_MESSAGE (found, "Created bus id not found in elementGraphGetWirelessBuses response");
}

// ── Test 3 ──────────────────────────────────────────────────────────────────
// elementGraphSetConnectionSource — fail path with no valid graph context.
// Pass a malformed cableId; expect { ok: false, error: ... }.
BOOST_AUTO_TEST_CASE (setConnectionSource_missing_graph_returns_error)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    // Supply a syntactically valid-looking but non-existent cable id.
    // The function will fail at "no active session" or "cable not found".
    const String fakeCableId ("cable_"
        + String::fromUTF8 ("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa") + "_0_"
        + String::fromUTF8 ("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb") + "_0_0");

    Array<var> args {
        var (fakeCableId),
        var (String ("cccccccc-cccc-cccc-cccc-cccccccccccc")),
        var (0)
    };

    const var result = BridgeContractTest::invoke (host, "elementGraphSetConnectionSource", args);
    BOOST_REQUIRE (! result.isVoid());

    var parsed;
    BOOST_REQUIRE (JSON::parse (result.toString(), parsed).wasOk());

    auto* obj = parsed.getDynamicObject();
    BOOST_REQUIRE (obj != nullptr);

    BOOST_CHECK_EQUAL ((bool) obj->getProperty ("ok"), false);
    BOOST_CHECK (obj->getProperty ("error").toString().isNotEmpty());
}

// ── Test 4 ──────────────────────────────────────────────────────────────────
// elementDashboardSetLayout / elementDashboardGetLayout round-trip.
// Requires an active graph.
BOOST_AUTO_TEST_CASE (dashboard_set_get_layout)
{
    BOOST_REQUIRE (ensureActiveGraph());

    auto* ctx = test::context();
    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    // Build input: { widgets: [{ id:"w1", kind:"knob", x:10, y:20, w:64, h:80 }] }
    DynamicObject::Ptr widget (new DynamicObject());
    widget->setProperty ("id",   "w1");
    widget->setProperty ("kind", "knob");
    widget->setProperty ("x",    10);
    widget->setProperty ("y",    20);
    widget->setProperty ("w",    64);
    widget->setProperty ("h",    80);

    Array<var> widgetsArr { var (widget.get()) };

    DynamicObject::Ptr layoutInput (new DynamicObject());
    layoutInput->setProperty ("widgets", var (widgetsArr));

    Array<var> setArgs { var (layoutInput.get()) };
    const var setResult = BridgeContractTest::invoke (host, "elementDashboardSetLayout", setArgs);
    BOOST_REQUIRE (! setResult.isVoid());

    var setParsed;
    BOOST_REQUIRE (JSON::parse (setResult.toString(), setParsed).wasOk());
    auto* setObj = setParsed.getDynamicObject();
    BOOST_REQUIRE (setObj != nullptr);
    BOOST_CHECK_EQUAL ((bool) setObj->getProperty ("ok"), true);

    // Now retrieve layout
    const var getResult = BridgeContractTest::invoke (host, "elementDashboardGetLayout");
    BOOST_REQUIRE (! getResult.isVoid());

    var getParsed;
    BOOST_REQUIRE (JSON::parse (getResult.toString(), getParsed).wasOk());
    BOOST_REQUIRE (getParsed.isArray());

    const auto* arr = getParsed.getArray();
    BOOST_REQUIRE (arr != nullptr && arr->size() >= 1);

    bool foundWidget = false;
    for (const var& item : *arr)
        if (auto* w = item.getDynamicObject())
            if (w->getProperty ("id").toString() == "w1"
                && w->getProperty ("kind").toString() == "knob"
                && (int) w->getProperty ("x") == 10
                && (int) w->getProperty ("y") == 20)
                foundWidget = true;

    BOOST_CHECK_MESSAGE (foundWidget, "Widget 'w1' not found in elementDashboardGetLayout response");
}

// ── Test 5 ──────────────────────────────────────────────────────────────────
// elementPerformMarkParameterMapped / elementPerformGetMappedParameters round-trip.
// Requires an active graph.
BOOST_AUTO_TEST_CASE (performMappedParameters_mark_and_get)
{
    BOOST_REQUIRE (ensureActiveGraph());

    auto* ctx = test::context();
    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    // Mark { nodeId: "abc", paramIndex: 5, mapped: true }
    DynamicObject::Ptr markInput (new DynamicObject());
    markInput->setProperty ("nodeId",     "abc");
    markInput->setProperty ("paramIndex", 5);
    markInput->setProperty ("mapped",     true);

    Array<var> markArgs { var (markInput.get()) };
    const var markResult = BridgeContractTest::invoke (host, "elementPerformMarkParameterMapped", markArgs);
    BOOST_REQUIRE (! markResult.isVoid());

    var markParsed;
    BOOST_REQUIRE (JSON::parse (markResult.toString(), markParsed).wasOk());
    auto* markObj = markParsed.getDynamicObject();
    BOOST_REQUIRE (markObj != nullptr);
    BOOST_CHECK_EQUAL ((bool) markObj->getProperty ("ok"), true);

    // Retrieve mapped parameters
    const var getResult = BridgeContractTest::invoke (host, "elementPerformGetMappedParameters");
    BOOST_REQUIRE (! getResult.isVoid());

    var getParsed;
    BOOST_REQUIRE (JSON::parse (getResult.toString(), getParsed).wasOk());
    BOOST_REQUIRE (getParsed.isArray());

    bool foundMapping = false;
    if (const auto* arr = getParsed.getArray())
        for (const var& item : *arr)
            if (auto* entry = item.getDynamicObject())
                if (entry->getProperty ("nodeId").toString() == "abc"
                    && (int) entry->getProperty ("paramIndex") == 5)
                    foundMapping = true;

    BOOST_CHECK_MESSAGE (foundMapping,
        "Mapped parameter { nodeId:abc, paramIndex:5 } not found in elementPerformGetMappedParameters");
}

BOOST_AUTO_TEST_SUITE_END()
