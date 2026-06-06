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

#include "nodes/logicnodes.hpp" // P0 — ComparatorNode for the intMode round-trip
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
// ---------------------------------------------------------------------------
// P0 — splice a live element.compare node (carrying a real ComparatorNode
// Processor in tags::object) into the active graph's node list, exactly the
// shape a built-in node Block has on the model tree. Returns the node's uuid
// and the raw Processor pointer (owned by the ValueTree's ref-counted object
// property). Empty uuid on failure.
struct CompareFixture
{
    String                                uuid;
    juce::ReferenceCountedObjectPtr<ComparatorNode> proc;
};

static CompareFixture installCompareNode()
{
    CompareFixture fx;
    if (! ensureActiveGraph())
        return fx;

    auto* ctx = test::context();
    if (ctx == nullptr)
        return fx;
    auto sess = ctx->session();
    if (sess == nullptr)
        return fx;

    Node active (sess->getActiveGraph());
    if (! active.isGraph())
        return fx;

    fx.proc = new ComparatorNode();

    // Build the model node ValueTree the same way createDefaultGraph does for
    // built-in IO nodes, plus tags::object → the live Processor so the host's
    // getObject() resolves + casts to ComparatorNode.
    Node n (types::Node); // stamps a fresh tags::uuid via setMissingProperties
    n.setProperty (tags::type, "plugin")
        .setProperty (tags::format, "Internal")
        .setProperty (tags::identifier, "element.compare")
        .setProperty (tags::name, "Comparator")
        .setProperty (tags::object, fx.proc.get());

    ValueTree activeNodes (active.getNodesValueTree());
    if (! activeNodes.isValid())
    {
        fx.proc = nullptr;
        return fx;
    }
    activeNodes.addChild (n.data(), -1, nullptr);

    fx.uuid = n.getUuidString();
    return fx;
}

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

    // Contract: structured var OR a JSON string (consumers accept both — see
    // useJuceBridge onGraphState). Since ff023feb8 the handler returns a
    // structured var (avoids JUCE's emitCompletionEvent O(n²) quote-escape on
    // large sessions), so parse only when a string arrives.
    var parsed = result;
    if (result.isString())
    {
        const String json (result.toString());
        juce::Result parseResult = JSON::parse (json, parsed);
        BOOST_REQUIRE_MESSAGE (parseResult.wasOk(), "elementGetGraphState returned invalid JSON: " + json);
    }

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

// ── Test 6 (U11) ─────────────────────────────────────────────────────────────
// elementGetInstances — JSON shape. The registry is queryable even when no
// PluginProcessor was constructed in the test (the honest standalone case): the
// `instances` array is present (possibly empty) and `selfId` is an int.
BOOST_AUTO_TEST_CASE (getInstances_json_shape)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);
    const var result = BridgeContractTest::invoke (host, "elementGetInstances");

    BOOST_REQUIRE (! result.isVoid() && ! result.isUndefined());

    const String json (result.toString());
    var parsed;
    juce::Result parseResult = JSON::parse (json, parsed);
    BOOST_REQUIRE_MESSAGE (parseResult.wasOk(), "elementGetInstances returned invalid JSON: " + json);

    auto* obj = parsed.getDynamicObject();
    BOOST_REQUIRE (obj != nullptr);

    // instances array present (may be empty — honest standalone/no-plugin case).
    BOOST_CHECK (obj->getProperty ("instances").isArray());
    // selfId is an int (−1 when the host's Context is not a plugin instance).
    BOOST_CHECK (obj->getProperty ("selfId").isInt());
}

// ── §2.3 change-sentinel ──────────────────────────────────────────────────────
// The steady-state JSON pollers (elementGetEngineSnapshot / elementGetInstances)
// reply with a "~" sentinel when the new reply is byte-identical to the previous
// one, so an idle poll serialises ~nothing on the message thread. First call on a
// fresh host MUST be the real JSON (empty cache); an immediate second call with
// no intervening state change MUST be exactly "~". The webview treats "~" as
// "no change" (returns null / skips the store set).
BOOST_AUTO_TEST_CASE (engineSnapshot_and_instances_emit_change_sentinel)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    for (const char* fn : { "elementGetEngineSnapshot", "elementGetInstances" })
    {
        const var first = BridgeContractTest::invoke (host, fn);
        BOOST_REQUIRE (! first.isVoid() && ! first.isUndefined());
        // First reply is real JSON, never the sentinel.
        const String firstStr (first.toString());
        BOOST_CHECK_MESSAGE (firstStr != "~",
            String (fn) + " first reply must be real JSON, got the sentinel");
        var parsed;
        BOOST_CHECK_MESSAGE (JSON::parse (firstStr, parsed).wasOk(),
            String (fn) + " first reply must parse as JSON: " + firstStr);

        // Second identical-state reply collapses to the literal "~".
        const var second = BridgeContractTest::invoke (host, fn);
        BOOST_CHECK_EQUAL (second.toString(), String ("~"));
    }
}

// ── Test 7 (U11) ─────────────────────────────────────────────────────────────
// elementGetInstanceSnapshot with an unknown id → honest-degraded result:
// `unavailable:true` and an empty `graphs` array (NOT a fabricated graph).
BOOST_AUTO_TEST_CASE (getInstanceSnapshot_unknown_id_is_unavailable)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);
    const var result = BridgeContractTest::invoke (
        host, "elementGetInstanceSnapshot", Array<var> { var (99999) });

    BOOST_REQUIRE (! result.isVoid() && ! result.isUndefined());

    // Result is a JSON string (the unavailable path serialises with JSON::toString).
    const String json (result.toString());
    var parsed;
    juce::Result parseResult = JSON::parse (json, parsed);
    BOOST_REQUIRE_MESSAGE (parseResult.wasOk(),
        "elementGetInstanceSnapshot returned invalid JSON: " + json);

    auto* obj = parsed.getDynamicObject();
    BOOST_REQUIRE (obj != nullptr);

    BOOST_CHECK_EQUAL ((bool) obj->getProperty ("unavailable"), true);
    BOOST_CHECK (obj->getProperty ("graphs").isArray());
    BOOST_CHECK_EQUAL (obj->getProperty ("graphs").size(), 0);
}

// ── Test 8 (P0) ──────────────────────────────────────────────────────────────
// Snapshot blocks carry `identifier`. The spliced element.compare node's block
// must expose identifier == "element.compare" so the webview can branch its
// inline controls on the built-in node type.
BOOST_AUTO_TEST_CASE (snapshot_block_carries_identifier)
{
    const CompareFixture fx (installCompareNode());
    BOOST_REQUIRE_MESSAGE (fx.uuid.isNotEmpty(), "failed to install element.compare node");

    auto* ctx = test::context();
    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    // elementGetGraphState returns a structured var (object), not a JSON string.
    const var parsed = BridgeContractTest::invoke (host, "elementGetGraphState");
    auto* obj = parsed.getDynamicObject();
    BOOST_REQUIRE (obj != nullptr);

    const var blocks (obj->getProperty ("blocks"));
    BOOST_REQUIRE (blocks.isArray());

    bool foundIdentifier = false;
    for (const var& item : *blocks.getArray())
        if (auto* b = item.getDynamicObject())
            if (b->getProperty ("id").toString() == fx.uuid)
            {
                BOOST_CHECK_EQUAL (b->getProperty ("identifier").toString(),
                                   String ("element.compare"));
                foundIdentifier = true;
            }

    BOOST_CHECK_MESSAGE (foundIdentifier, "element.compare block not found in snapshot blocks");
}

// ── Test 9 (P0) ──────────────────────────────────────────────────────────────
// elementNodeSetIntMode mutates the ComparatorNode operator, and the NEXT
// snapshot's `intMode` reflects engine truth. Default op = greater (0); set to
// notEqual (5) and assert both the processor getter and the snapshot.
BOOST_AUTO_TEST_CASE (setIntMode_updates_processor_and_snapshot)
{
    const CompareFixture fx (installCompareNode());
    BOOST_REQUIRE_MESSAGE (fx.uuid.isNotEmpty(), "failed to install element.compare node");
    BOOST_REQUIRE (fx.proc != nullptr);

    // Sanity: starts at the default operator (greater == 0).
    BOOST_REQUIRE_EQUAL ((int) fx.proc->getOperator(), (int) ComparatorNode::Op::greater);

    auto* ctx = test::context();
    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    const int newMode = (int) ComparatorNode::Op::notEqual; // 5
    const var setResult = BridgeContractTest::invoke (
        host, "elementNodeSetIntMode", Array<var> { var (fx.uuid), var (newMode) });
    BOOST_CHECK_EQUAL ((bool) setResult, true);

    // Engine truth: the processor's atomic operator updated.
    BOOST_CHECK_EQUAL ((int) fx.proc->getOperator(), newMode);

    // Snapshot truth: the block's intMode reflects the new operator.
    // elementGetGraphState returns a structured var (object), not a JSON string.
    const var snap = BridgeContractTest::invoke (host, "elementGetGraphState");
    auto* snapObj = snap.getDynamicObject();
    BOOST_REQUIRE (snapObj != nullptr);

    const var blocks (snapObj->getProperty ("blocks"));
    BOOST_REQUIRE (blocks.isArray());

    bool foundMode = false;
    for (const var& item : *blocks.getArray())
        if (auto* b = item.getDynamicObject())
            if (b->getProperty ("id").toString() == fx.uuid)
            {
                BOOST_CHECK_EQUAL ((int) b->getProperty ("intMode"), newMode);
                foundMode = true;
            }

    BOOST_CHECK_MESSAGE (foundMode, "element.compare block not found in snapshot for intMode check");
}

// ── Test 10 (P0) ─────────────────────────────────────────────────────────────
// elementNodeSetIntMode on an unknown / non-logic node returns false (honest).
BOOST_AUTO_TEST_CASE (setIntMode_unknown_node_returns_false)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);
    const var result = BridgeContractTest::invoke (
        host, "elementNodeSetIntMode",
        Array<var> { var (String ("nonexistent-uuid")), var (2) });

    BOOST_CHECK_EQUAL ((bool) result, false);
}

BOOST_AUTO_TEST_SUITE_END()
