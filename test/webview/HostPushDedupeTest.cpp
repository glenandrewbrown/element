// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Wave-3 Task 1.2 / 1.3 — host-side perf gates (perf-diag #2 + #3).
//
// END-TO-END host tests (no JS bridge needed; run in the headless
// JuceMessageManagerFixture harness, same pattern as ContainerDiveTest.cpp).
// The host is built with skipBrowser=true. A test-local `BridgeContractTest`
// friend wrapper (the class is declared `friend` in element_webview_host.hpp)
// reaches the private members these gates assert on.
//
// Asserts:
//   Task 1.2b — listener narrowing (the window-drag fix):
//     (1) isWindowChromeProperty() is true ONLY for the four window-chrome
//         identifiers and false for block-position / session props (pure
//         predicate, harness-free).
//     (2) On the SAME node ValueTree: writing tags::windowX does NOT schedule a
//         graph push, while writing tags::x (block position) DOES. This is the
//         critic MAJOR-5 same-node assertion — the filter is by identifier, not
//         by tree (windowX and x live on the same node child tree).
//   Task 1.2a — output-dedupe:
//     (3) pushGraphSnapshot() populates the dedupe cache, and a second push with
//         byte-identical state leaves the cache equal to a fresh build (i.e. the
//         next push would be short-circuited). evalInBrowser() is a no-op with
//         skipBrowser=true, so the gate is asserted at its cache, not via an
//         eval call-count.
//     (4) A forced-refresh boundary (detachSessionListener) clears the cache so
//         the next push is never suppressed against stale JSON.
//   Task 1.3 — plugin-category memo:
//     (5) categoryForPluginIdentifier() returns "" for an empty / unknown id
//         (IDENTICAL to the prior linear-scan miss → nullptr → empty category),
//         and is stable across repeated calls (memo path exercised).

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/graph.hpp>
#include <element/juce.hpp>
#include <element/node.hpp>
#include <element/plugins.hpp>
#include <element/session.hpp>
#include <element/tags.hpp>
#include <element/ui/element_webview_host.hpp>

#include "testutil.hpp"

using namespace element;
using namespace juce;

// ---------------------------------------------------------------------------
// Test-only friend wrapper. A DISTINCT name from the global `BridgeContractTest`
// (which the other webview test TUs each define identically) so this differently-
// shaped wrapper does not violate the one-definition rule. MUST live in
// `namespace element` so it matches the `friend class HostPerfProbe;` declaration
// in element_webview_host.hpp (an unqualified friend class name resolves to the
// nearest enclosing namespace — `element` — so a global-scope class would NOT be
// the befriended entity and could not touch the private members).
namespace element {

class HostPerfProbe
{
public:
    static int  pendingMs (ElementWebViewHost& h)            { return h.graphPushPendingMs; }
    static void clearPending (ElementWebViewHost& h)         { h.graphPushPendingMs = 0; }
    static void push (ElementWebViewHost& h)                 { h.pushGraphSnapshot(); }
    static juce::String lastJson (ElementWebViewHost& h)     { return h.lastPushedGraphJson; }
    static juce::String buildJson (ElementWebViewHost& h)    { return h.buildActiveGraphJson(); }
    static void detach (ElementWebViewHost& h)               { h.detachSessionListener(); }
    static juce::String category (ElementWebViewHost& h, const juce::String& id)
    {
        return h.categoryForPluginIdentifier (id);
    }
};

} // namespace element

using element::HostPerfProbe;

namespace {

// Install a clean single-graph session with ONE plain child node whose data
// tree we can write properties on. Returns that node's data() ValueTree (empty
// tree on failure). The node is a direct child of the active graph's node list
// — under the session root the host listens to.
static ValueTree installSessionWithNode (Context& ctx)
{
    auto sess = ctx.session();
    if (sess == nullptr)
        return {};

    Node top (Graph::create ("TopGraph", 2, 2, true, true));
    if (! sess->addGraph (top, true))
        return {};

    Node active (sess->getActiveGraph());
    if (! active.isGraph())
        return {};

    // A nested default graph node is a convenient real child with a stable uuid.
    Node child (Node::createDefaultGraph ("ChildNode"));
    ValueTree activeNodes (active.getNodesValueTree());
    if (! activeNodes.isValid())
        return {};
    activeNodes.addChild (child.data(), -1, nullptr);
    return child.data();
}

} // namespace

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (HostPushDedupeTests)

// ── Task 1.2b (1) — the pure predicate ───────────────────────────────────────
BOOST_AUTO_TEST_CASE (window_chrome_predicate_matches_only_chrome_props)
{
    BOOST_CHECK (ElementWebViewHost::isWindowChromeProperty (tags::windowX));
    BOOST_CHECK (ElementWebViewHost::isWindowChromeProperty (tags::windowY));
    BOOST_CHECK (ElementWebViewHost::isWindowChromeProperty (tags::windowVisible));
    BOOST_CHECK (ElementWebViewHost::isWindowChromeProperty (tags::windowOnTop));

    // Block-position props MUST NOT be treated as chrome — they still push.
    BOOST_CHECK (! ElementWebViewHost::isWindowChromeProperty (tags::x));
    BOOST_CHECK (! ElementWebViewHost::isWindowChromeProperty (tags::y));
    // Session-root props + arbitrary identifiers are not chrome either.
    BOOST_CHECK (! ElementWebViewHost::isWindowChromeProperty (tags::tempo));
    BOOST_CHECK (! ElementWebViewHost::isWindowChromeProperty (tags::name));
    BOOST_CHECK (! ElementWebViewHost::isWindowChromeProperty (Identifier ("bypass")));
}

// ── Task 1.2b (2) — THE window-drag fix, on the SAME node tree (MAJOR-5) ─────
BOOST_AUTO_TEST_CASE (windowX_does_not_schedule_push_but_blockX_does)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);

    // Non-const: we write properties on this tree below (ValueTree is a
    // ref-counted handle, so this shares the live node data the host listens to).
    ValueTree nodeData (installSessionWithNode (*ctx));
    BOOST_REQUIRE_MESSAGE (nodeData.isValid(), "failed to install node session");

    // Construct AFTER the session exists so the host's ValueTree listener is
    // attached to the session root and fires on this node's descendant writes.
    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    // Settle: clear any push the construction / session install scheduled.
    HostPerfProbe::clearPending (host);
    BOOST_REQUIRE_EQUAL (HostPerfProbe::pendingMs (host), 0);

    // A window-chrome write on the node tree must NOT schedule a push.
    nodeData.setProperty (tags::windowX, 123, nullptr);
    BOOST_CHECK_MESSAGE (HostPerfProbe::pendingMs (host) == 0,
                         "windowX write scheduled a graph push (window-drag lag not fixed)");
    nodeData.setProperty (tags::windowY, 456, nullptr);
    BOOST_CHECK_EQUAL (HostPerfProbe::pendingMs (host), 0);
    nodeData.setProperty (tags::windowVisible, true, nullptr);
    BOOST_CHECK_EQUAL (HostPerfProbe::pendingMs (host), 0);
    nodeData.setProperty (tags::windowOnTop, false, nullptr);
    BOOST_CHECK_EQUAL (HostPerfProbe::pendingMs (host), 0);

    // A block-position write on the SAME node tree MUST schedule a push.
    nodeData.setProperty (tags::x, 200.0, nullptr);
    BOOST_CHECK_MESSAGE (HostPerfProbe::pendingMs (host) > 0,
                         "block-x write on the same node tree did NOT schedule a push "
                         "(the filter wrongly dropped a canvas-relevant prop)");
}

// ── Task 1.2a (3) — output-dedupe cache is populated + stable ────────────────
BOOST_AUTO_TEST_CASE (push_populates_dedupe_cache_and_identical_state_stays_cached)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);
    BOOST_REQUIRE (installSessionWithNode (*ctx).isValid());

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    // Before any push the cache is empty.
    BOOST_CHECK (HostPerfProbe::lastJson (host).isEmpty());

    // WARM-UP: the snapshot embeds the audio device list, which the
    // DeviceManager enumerates lazily/asynchronously — so the very first build
    // can differ from later builds purely because devices have since populated
    // (a test-environment transient, NOT a dedupe-logic issue). Pump the message
    // queue and push once so the device list has settled before we assert the
    // gate against a STABLE pair of builds.
    juce::MessageManager::getInstance()->runDispatchLoopUntil (50);
    HostPerfProbe::push (host);
    juce::MessageManager::getInstance()->runDispatchLoopUntil (50);

    // Re-push now that state is settled; this is the baseline the gate caches.
    HostPerfProbe::push (host);
    const String cached (HostPerfProbe::lastJson (host));
    BOOST_REQUIRE_MESSAGE (cached.isNotEmpty(), "push did not populate the dedupe cache");

    // With no state change, a fresh build equals the cache → the next push would
    // be short-circuited (the dedupe gate's decision). Guarded against the device
    // warm-up by the settle above.
    BOOST_CHECK_EQUAL (cached, HostPerfProbe::buildJson (host));

    // A second push with identical state leaves the cache byte-identical.
    HostPerfProbe::push (host);
    BOOST_CHECK_EQUAL (HostPerfProbe::lastJson (host), cached);
}

// ── Task 1.2a (4) — detach clears the cache (forced-refresh boundary) ────────
BOOST_AUTO_TEST_CASE (detach_clears_dedupe_cache)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);
    BOOST_REQUIRE (installSessionWithNode (*ctx).isValid());

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);
    HostPerfProbe::push (host);
    BOOST_REQUIRE (HostPerfProbe::lastJson (host).isNotEmpty());

    HostPerfProbe::detach (host);
    BOOST_CHECK_MESSAGE (HostPerfProbe::lastJson (host).isEmpty(),
                         "detachSessionListener did not clear the push dedupe cache");
}

// ── Task 1.3 (5) — category memo miss-path matches the linear-scan contract ──
BOOST_AUTO_TEST_CASE (category_lookup_empty_for_unknown_or_empty_id)
{
    auto* ctx = test::context();
    BOOST_REQUIRE (ctx != nullptr);
    BOOST_REQUIRE (installSessionWithNode (*ctx).isValid());

    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    // Empty id → empty (same as the prior linear scan returning nullptr).
    BOOST_CHECK (HostPerfProbe::category (host, String()).isEmpty());

    // An identifier not present in the KnownPluginList → empty, stable across
    // repeated calls (the memo is built once then read).
    const String bogus ("not.a.real.plugin.identifier-0000");
    BOOST_CHECK (HostPerfProbe::category (host, bogus).isEmpty());
    BOOST_CHECK (HostPerfProbe::category (host, bogus).isEmpty());
}

BOOST_AUTO_TEST_SUITE_END()
