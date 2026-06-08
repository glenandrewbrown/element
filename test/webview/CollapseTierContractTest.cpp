// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Wave-3 Task 2.0 — collapse-tier persisted-state contract (host side).
//
// Gates the C++ side of the DUAL-SIDED migration specified in
// .omo/plans/phase0-collapse-tier-contract.md. These are PURE static helpers on
// ElementWebViewHost (mirrors isWindowChromeProperty) so they unit-test with no
// Context/session/message-thread — harness-free.
//
// Asserts (contract acceptance §3 — the host read path coerces IDENTICALLY to
// the JS mapBlock path):
//   (1) validateCollapseTier() returns the three known tiers verbatim and clamps
//       any unknown/empty input to "macro" (the lean default).
//   (2) readCollapseTier() — read-path migration (contract §3.1):
//         - a node carrying a valid "collapseTier" string  → that tier;
//         - a node with an UNKNOWN "collapseTier"          → "macro" (validated);
//         - a legacy "collapsed"=true bool                 → "title";
//         - a legacy "collapsed"=false bool                → "macro";
//         - neither field present                          → "macro";
//         - BOTH present                                   → "collapseTier" wins.
//   (3) Dual-write round-trip (contract §4.1): a tree written the way the
//       elementNodeSetCollapseTier handler writes it ("collapseTier" + a derived
//       legacy "collapsed" bool = tier=="title") reads back to the SAME tier via
//       readCollapseTier, and the derived legacy bool matches tier=="title".

#include <boost/test/unit_test.hpp>

#include <element/juce.hpp>
#include <element/ui/element_webview_host.hpp>

using namespace element;
using namespace juce;

namespace {

// Build a bare Node-shaped ValueTree carrying only the collapse properties under
// test. readCollapseTier() consults exactly two identifiers ("collapseTier" /
// "collapsed"), so a minimal tree is a faithful stand-in for a real Node's
// objectData (the host reads via n.data()).
static ValueTree makeNode()
{
    return ValueTree (Identifier ("node"));
}

// Mirror EXACTLY how the elementNodeSetCollapseTier handler persists a tier:
// validate, write "collapseTier", and dual-write the derived legacy bool.
static void writeTierLikeHandler (ValueTree& n, const String& rawTier)
{
    const String tier = ElementWebViewHost::validateCollapseTier (rawTier);
    n.setProperty (Identifier ("collapseTier"), tier, nullptr);
    n.setProperty (Identifier ("collapsed"), tier == "title", nullptr);
}

} // namespace

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (CollapseTierContractTests)

// ── (1) validateCollapseTier — clamp unknown → "macro" ───────────────────────
BOOST_AUTO_TEST_CASE (validate_passes_known_tiers_and_clamps_unknown)
{
    BOOST_CHECK_EQUAL (ElementWebViewHost::validateCollapseTier ("title"), "title");
    BOOST_CHECK_EQUAL (ElementWebViewHost::validateCollapseTier ("macro"), "macro");
    BOOST_CHECK_EQUAL (ElementWebViewHost::validateCollapseTier ("expanded"), "expanded");

    // Any unknown / empty / mis-cased value → the lean default.
    BOOST_CHECK_EQUAL (ElementWebViewHost::validateCollapseTier (String()), "macro");
    BOOST_CHECK_EQUAL (ElementWebViewHost::validateCollapseTier ("compact"), "macro");
    BOOST_CHECK_EQUAL (ElementWebViewHost::validateCollapseTier ("Title"), "macro");
    BOOST_CHECK_EQUAL (ElementWebViewHost::validateCollapseTier ("0"), "macro");
}

// ── (2) readCollapseTier — the read-path migration matrix ────────────────────
BOOST_AUTO_TEST_CASE (read_prefers_valid_collapseTier_string)
{
    ValueTree n (makeNode());
    n.setProperty (Identifier ("collapseTier"), "expanded", nullptr);
    BOOST_CHECK_EQUAL (ElementWebViewHost::readCollapseTier (n), "expanded");

    n.setProperty (Identifier ("collapseTier"), "title", nullptr);
    BOOST_CHECK_EQUAL (ElementWebViewHost::readCollapseTier (n), "title");
}

BOOST_AUTO_TEST_CASE (read_clamps_unknown_collapseTier_to_macro)
{
    ValueTree n (makeNode());
    n.setProperty (Identifier ("collapseTier"), "bogus", nullptr);
    BOOST_CHECK_EQUAL (ElementWebViewHost::readCollapseTier (n), "macro");
}

BOOST_AUTO_TEST_CASE (read_migrates_legacy_collapsed_true_to_title)
{
    ValueTree n (makeNode());
    n.setProperty (Identifier ("collapsed"), true, nullptr);
    BOOST_CHECK_EQUAL (ElementWebViewHost::readCollapseTier (n), "title");
}

BOOST_AUTO_TEST_CASE (read_migrates_legacy_collapsed_false_to_macro)
{
    ValueTree n (makeNode());
    n.setProperty (Identifier ("collapsed"), false, nullptr);
    BOOST_CHECK_EQUAL (ElementWebViewHost::readCollapseTier (n), "macro");
}

BOOST_AUTO_TEST_CASE (read_defaults_absent_to_macro)
{
    ValueTree n (makeNode());
    BOOST_CHECK_EQUAL (ElementWebViewHost::readCollapseTier (n), "macro");
}

BOOST_AUTO_TEST_CASE (read_prefers_collapseTier_over_conflicting_legacy_bool)
{
    // An old .els migrated forward may carry BOTH keys; the new string is the
    // source of truth (the bool is migration-only). collapsed=true would coerce
    // to "title", but collapseTier="expanded" must win.
    ValueTree n (makeNode());
    n.setProperty (Identifier ("collapseTier"), "expanded", nullptr);
    n.setProperty (Identifier ("collapsed"), true, nullptr);
    BOOST_CHECK_EQUAL (ElementWebViewHost::readCollapseTier (n), "expanded");
}

// ── (3) dual-write round-trip (contract §4.1) ────────────────────────────────
BOOST_AUTO_TEST_CASE (dual_write_round_trips_through_read)
{
    for (const auto* raw : { "title", "macro", "expanded" })
    {
        ValueTree n (makeNode());
        writeTierLikeHandler (n, raw);

        // The tier reads back exactly (new build).
        BOOST_CHECK_EQUAL (ElementWebViewHost::readCollapseTier (n), String (raw));

        // The derived legacy bool an OLD build would read matches tier=="title"
        // (forward-tolerant degradation, never corruption).
        const bool legacy = (bool) n.getProperty (Identifier ("collapsed"));
        BOOST_CHECK_EQUAL (legacy, String (raw) == "title");

        // The new key survives an old-build save (JUCE retains unknown props),
        // so a subsequent read-migration still yields the full tier.
        BOOST_CHECK (n.hasProperty (Identifier ("collapseTier")));
    }
}

// An unknown tier written through the handler path is clamped on write AND the
// derived legacy bool is consistent with the clamped tier.
BOOST_AUTO_TEST_CASE (dual_write_clamps_unknown_then_round_trips)
{
    ValueTree n (makeNode());
    writeTierLikeHandler (n, "nonsense");
    BOOST_CHECK_EQUAL (ElementWebViewHost::readCollapseTier (n), "macro");
    BOOST_CHECK_EQUAL ((bool) n.getProperty (Identifier ("collapsed")), false);
}

BOOST_AUTO_TEST_SUITE_END()
