// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// P2-A1 — Container-dive END-TO-END host test (closes the dive coverage gap).
//
// The existing GraphCanvas / useGraphStore dive unit tests pass by MOCKING
// `nativeEnterContainer`, so they never exercise the real C++ resolver. This
// suite drives the REAL `elementEnterContainer` / `elementExitContainer`
// natives through `invokeForTest` against a real Session whose active graph
// holds a real nested-Graph (Container) child — the exact live scenario the
// lead reproduced ("GRAPH (NESTED) · 4 Blocks", double-click no-ops).
//
// It asserts:
//   (1) the snapshot emits the container with `isContainer:true` +
//       `containerNodeCount` and an `id` equal to the child's tags::uuid
//       (the SAME id the React `node.id` carries → what gets passed to enter);
//   (2) `elementEnterContainer(thatId)` returns true and deepens the snapshot
//       breadcrumb + sets `currentBoardId` (the dive actually happens);
//   (3) `elementExitContainer()` pops back to the top-level breadcrumb;
//   (4) the not-dived snapshot carries no `currentBoardId` (regression guard).
//
// Runs on the message thread (JuceMessageManagerFixture in TestMain.cpp);
// the host is built with skipBrowser=true (no WebView window). Uses the same
// BridgeContractTest friend wrapper as BridgeContractTest.cpp.

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/graph.hpp>
#include <element/juce.hpp>
#include <element/node.hpp>
#include <element/session.hpp>
#include <element/ui/element_webview_host.hpp>

#include "testutil.hpp"

using namespace element;
using namespace juce;

// ---------------------------------------------------------------------------
// Test-only friend wrapper. The `friend class BridgeContractTest` declaration
// in element_webview_host.hpp grants access to invokeForTest; reuse it here.
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

namespace {

// Parse a bridge result that is either a structured var (object) or a
// pre-serialised JSON string (elementGetGraphState returns a structured var).
static var asObject (const var& result)
{
    if (result.isObject())
        return result;
    var parsed;
    if (JSON::parse (result.toString(), parsed).wasOk())
        return parsed;
    return var();
}

// Fetch the current snapshot via elementGetGraphState and return it as a
// DynamicObject-bearing var.
static var snapshot (ElementWebViewHost& host)
{
    return asObject (BridgeContractTest::invoke (host, "elementGetGraphState"));
}

// Find the first block in a snapshot whose isContainer flag is true; return
// its "id" (== tags::uuid). Empty string if none.
static String firstContainerId (const var& snap)
{
    auto* obj = snap.getDynamicObject();
    if (obj == nullptr)
        return {};
    const var blocks = obj->getProperty ("blocks");
    if (const auto* arr = blocks.getArray())
        for (const var& b : *arr)
            if (auto* bo = b.getDynamicObject())
                if ((bool) bo->getProperty ("isContainer"))
                    return bo->getProperty ("id").toString();
    return {};
}

static int containerCount (const var& snap, const String& id)
{
    auto* obj = snap.getDynamicObject();
    if (obj == nullptr)
        return -1;
    if (const auto* arr = obj->getProperty ("blocks").getArray())
        for (const var& b : *arr)
            if (auto* bo = b.getDynamicObject())
                if (bo->getProperty ("id").toString() == id)
                    return (int) bo->getProperty ("containerNodeCount");
    return -1;
}

static int breadcrumbDepth (const var& snap)
{
    auto* obj = snap.getDynamicObject();
    if (obj == nullptr)
        return -1;
    if (const auto* arr = obj->getProperty ("breadcrumbs").getArray())
        return arr->size();
    return -1;
}

static bool hasCurrentBoardId (const var& snap)
{
    auto* obj = snap.getDynamicObject();
    return obj != nullptr && obj->hasProperty ("currentBoardId")
           && obj->getProperty ("currentBoardId").toString().isNotEmpty();
}

// Build a fresh single-graph session whose active graph holds ONE nested
// Container (a Graph node with 4 IO children → containerNodeCount == 4),
// mirroring the live "add a Graph block" scenario. Returns the nested
// container's tags::uuid (the dive target). Empty on failure.
static String installSessionWithContainer (Context& ctx)
{
    auto sess = ctx.session();
    if (sess == nullptr)
        return {};

    // A clean top-level graph (ports only, no children yet).
    Node top (Graph::create ("TopGraph", 2, 2, true, true));
    if (! sess->addGraph (top, true))
        return {};

    Node active (sess->getActiveGraph());
    if (! active.isGraph())
        return {};

    // The nested Container Block: a full default graph (4 IO child nodes →
    // getNumNodes() == 4). createDefaultGraph stamps a fresh tags::uuid.
    Node inner (Node::createDefaultGraph ("InnerBoard"));
    const String innerUuid (inner.getUuidString());
    if (innerUuid.isEmpty())
        return {};

    // Splice it in as a DIRECT child of the active graph's node list — the
    // exact relationship a canvas "Graph" Block has to its parent board.
    ValueTree activeNodes (active.getNodesValueTree());
    if (! activeNodes.isValid())
        return {};
    activeNodes.addChild (inner.data(), -1, nullptr);

    return innerUuid;
}

} // namespace

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (ContainerDiveTests)

// ── Test 1 ──────────────────────────────────────────────────────────────────
// The snapshot exposes the nested container with the metadata the React side
// keys the dive off: isContainer + containerNodeCount, id == child tags::uuid.
BOOST_AUTO_TEST_CASE (snapshot_exposes_container_with_uuid_id)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    const String containerUuid (installSessionWithContainer (*ctx));
    BOOST_REQUIRE_MESSAGE (containerUuid.isNotEmpty(), "failed to install container session");

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);
    const var snap (snapshot (host));
    BOOST_REQUIRE (snap.getDynamicObject() != nullptr);

    const String idFromSnapshot (firstContainerId (snap));
    BOOST_REQUIRE_MESSAGE (idFromSnapshot.isNotEmpty(),
                           "snapshot emitted no isContainer block");

    // The id the canvas would pass to nativeEnterContainer IS the engine uuid.
    BOOST_CHECK_EQUAL (idFromSnapshot, containerUuid);
    BOOST_CHECK_EQUAL (containerCount (snap, containerUuid), 4);
}

// ── Test 2 (THE regression that would have caught the live no-op) ────────────
// elementEnterContainer(uuid) must return true AND deepen the breadcrumb +
// set currentBoardId. A silent host no-op (false / unchanged breadcrumb) is
// exactly the observed "double-click does nothing" symptom.
BOOST_AUTO_TEST_CASE (enterContainer_dives_into_nested_board)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    const String containerUuid (installSessionWithContainer (*ctx));
    BOOST_REQUIRE (containerUuid.isNotEmpty());

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    // Top-level: breadcrumb == [sessionName, activeGraphName] (depth 2), no
    // currentBoardId.
    const var before (snapshot (host));
    const int depthBefore = breadcrumbDepth (before);
    BOOST_REQUIRE_MESSAGE (depthBefore >= 2, "unexpected top-level breadcrumb depth");
    BOOST_CHECK (! hasCurrentBoardId (before));

    // The id the React layer would pass (proven == uuid in Test 1).
    const String diveId (firstContainerId (before));
    BOOST_REQUIRE_EQUAL (diveId, containerUuid);

    // DIVE.
    const var enterResult (BridgeContractTest::invoke (
        host, "elementEnterContainer", Array<var> { var (diveId) }));
    BOOST_REQUIRE_MESSAGE (! enterResult.isVoid(),
                           "elementEnterContainer returned void (not registered?)");
    BOOST_CHECK_MESSAGE ((bool) enterResult == true,
                         "elementEnterContainer returned false — the dive no-opped "
                         "(host did not resolve the container by its snapshot id)");

    // After the dive the snapshot must walk the nested board: breadcrumb
    // deepened by one AND currentBoardId names the nested board.
    const var after (snapshot (host));
    BOOST_CHECK_EQUAL (breadcrumbDepth (after), depthBefore + 1);
    BOOST_CHECK_MESSAGE (hasCurrentBoardId (after),
                         "currentBoardId absent after dive — snapshot still on parent board");

    auto* afterObj = after.getDynamicObject();
    BOOST_REQUIRE (afterObj != nullptr);
    BOOST_CHECK_EQUAL (afterObj->getProperty ("currentBoardId").toString(), containerUuid);
}

// ── Test 3 ──────────────────────────────────────────────────────────────────
// exitContainer pops back to the top-level breadcrumb and drops currentBoardId.
BOOST_AUTO_TEST_CASE (exitContainer_returns_to_parent_board)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    const String containerUuid (installSessionWithContainer (*ctx));
    BOOST_REQUIRE (containerUuid.isNotEmpty());

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    const var before (snapshot (host));
    const int depthBefore = breadcrumbDepth (before);
    const String diveId (firstContainerId (before));
    BOOST_REQUIRE_EQUAL (diveId, containerUuid);

    BOOST_REQUIRE ((bool) BridgeContractTest::invoke (
        host, "elementEnterContainer", Array<var> { var (diveId) }) == true);
    BOOST_REQUIRE_EQUAL (breadcrumbDepth (snapshot (host)), depthBefore + 1);

    // EXIT.
    const var exitResult (BridgeContractTest::invoke (host, "elementExitContainer"));
    BOOST_CHECK_MESSAGE ((bool) exitResult == true, "elementExitContainer returned false");

    const var after (snapshot (host));
    BOOST_CHECK_EQUAL (breadcrumbDepth (after), depthBefore);
    BOOST_CHECK (! hasCurrentBoardId (after));

    // And exiting again at the top is an honest no-op (false).
    BOOST_CHECK ((bool) BridgeContractTest::invoke (host, "elementExitContainer") == false);
}

// ── Test 4 (regression guard) ───────────────────────────────────────────────
// A not-dived snapshot must NOT carry currentBoardId (byte-shape guard: empty
// boardPath behaves byte-identically to the pre-dive output).
BOOST_AUTO_TEST_CASE (not_dived_snapshot_has_no_currentBoardId)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    const String containerUuid (installSessionWithContainer (*ctx));
    BOOST_REQUIRE (containerUuid.isNotEmpty());

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);
    BOOST_CHECK (! hasCurrentBoardId (snapshot (host)));
}

// ── Test 5 ──────────────────────────────────────────────────────────────────
// A bogus / non-container uuid is a safe no-op (false), and an empty uuid too.
BOOST_AUTO_TEST_CASE (enterContainer_rejects_bogus_uuid)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);
    BOOST_REQUIRE (installSessionWithContainer (*ctx).isNotEmpty());

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    BOOST_CHECK ((bool) BridgeContractTest::invoke (
        host, "elementEnterContainer",
        Array<var> { var (String ("ffffffffffffffffffffffffffffffff")) }) == false);

    BOOST_CHECK ((bool) BridgeContractTest::invoke (
        host, "elementEnterContainer", Array<var> { var (String()) }) == false);
}

BOOST_AUTO_TEST_SUITE_END()
