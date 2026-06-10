// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Baseline tests for PresetService (audit P0-5). The service is registered,
// initialized, and activated by element::test::context(); these tests verify
// that the service is findable, that its lifecycle methods are idempotent,
// and that one canonical public method (refresh) does not crash.

#include <boost/test/unit_test.hpp>

#include <element/node.hpp>
#include <element/services.hpp>

#include "fixture/ServicesFixture.hpp"
#include "services/presetservice.hpp"

using namespace juce;
using namespace element;

BOOST_AUTO_TEST_SUITE (PresetServiceTests)

BOOST_AUTO_TEST_CASE (construct_destruct)
{
    // Construct standalone (not added to a Services container). The Service
    // base destructor must run cleanly when owner is null — this verifies
    // the destruction path doesn't dereference an unset owner.
    auto svc = std::make_unique<PresetService>();
    BOOST_CHECK (svc != nullptr);
    svc.reset();
}

BOOST_AUTO_TEST_CASE (sibling_lookup)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);
}

BOOST_AUTO_TEST_CASE (activate_deactivate)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);
    // Already activated by test::context(). Deactivate then reactivate to
    // prove the lifecycle methods can run twice without crashing.
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
}

BOOST_AUTO_TEST_CASE (reactivate_after_deactivate)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->deactivate()); // double-deactivate must be safe
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK_NO_THROW (svc->activate()); // double-activate must be safe
}

BOOST_AUTO_TEST_CASE (refresh_does_not_crash)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);
    BOOST_CHECK_NO_THROW (svc->refresh());
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — PresetService refresh stability (Team H batch 3)
// refresh() rescans the preset directory. Repeated calls must not leak
// nor corrupt the in-memory preset list.
// =====================================================================

BOOST_AUTO_TEST_SUITE (PresetServiceRefreshTests)

BOOST_AUTO_TEST_CASE (refresh_idempotent_three_times)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->refresh());
    BOOST_CHECK_NO_THROW (svc->refresh());
    BOOST_CHECK_NO_THROW (svc->refresh());
}

BOOST_AUTO_TEST_CASE (refresh_after_lifecycle_round_trip)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate());
    BOOST_CHECK_NO_THROW (svc->refresh());
}

BOOST_AUTO_TEST_CASE (refresh_then_deactivate_no_crash)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    BOOST_CHECK_NO_THROW (svc->refresh());
    BOOST_CHECK_NO_THROW (svc->deactivate());
    BOOST_CHECK_NO_THROW (svc->activate()); // restore for any later tests
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// Phase H — PresetService::add() with invalid Node
// add() takes a Node and an optional preset name. Default-constructed
// Nodes (the UI's "no selection" state) must be rejected gracefully —
// never throw, never crash. P1-10 visible regression context: Save
// preset path is reachable from window.prompt() in webview UX.
// =====================================================================

BOOST_AUTO_TEST_SUITE (PresetServiceAddTests)

BOOST_AUTO_TEST_CASE (add_default_node_does_not_crash)
{
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    Node empty;
    BOOST_CHECK_NO_THROW (svc->add (empty, "test_preset_name"));
}

BOOST_AUTO_TEST_CASE (add_default_node_with_default_name)
{
    // Default-constructed name (empty string) is the "use node name" path.
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    Node empty;
    BOOST_CHECK_NO_THROW (svc->add (empty));
}

BOOST_AUTO_TEST_CASE (add_default_node_then_refresh)
{
    // The end-to-end user flow: add a preset, then refresh to surface it
    // in the picker. Both must remain safe even with invalid input.
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    Node empty;
    BOOST_CHECK_NO_THROW (svc->add (empty, "phaseH_smoke"));
    BOOST_CHECK_NO_THROW (svc->refresh());
}

BOOST_AUTO_TEST_SUITE_END()

// =====================================================================
// BlockPresetRoundTripTests (P3-T21)
// Verify save → mutate → load restores the original state using the new
// PresetService::saveBlockPreset / loadBlockPreset / listBlockPresets /
// setDefaultForPlugin API.  Tests operate on ValueTree-only Nodes (no
// live AudioProcessor) which is the correct unit boundary: the public
// methods manipulate the ValueTree and only call restorePluginState()
// at the end (which is a no-op when getObject()==nullptr).
// =====================================================================

BOOST_AUTO_TEST_SUITE (BlockPresetRoundTripTests)

namespace {
// Build a minimal valid Node ValueTree with format, identifier, and a
// base64 state blob so the preset file round-trip has real content.
static element::Node makeTestNode (const juce::String& format,
                                   const juce::String& identifier,
                                   const juce::String& name,
                                   const juce::String& stateB64)
{
    using namespace element;
    ValueTree data (types::Node);
    data.setProperty (tags::name,       name,       nullptr);
    data.setProperty (tags::format,     format,     nullptr);
    data.setProperty (tags::identifier, identifier, nullptr);
    data.setProperty (tags::uuid,       Uuid().toString(), nullptr);
    if (stateB64.isNotEmpty())
        data.setProperty (tags::state, stateB64, nullptr);
    return Node (data, false);
}
} // namespace

BOOST_AUTO_TEST_CASE (save_and_list)
{
    using namespace element;
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    const String format = "Internal";
    const String id     = "el.BlockPresetTest.SaveList";
    const String state  = MemoryBlock ("hello", 5).toBase64Encoding();

    Node node = makeTestNode (format, id, "TestBlock", state);
    BOOST_REQUIRE (node.isValid());

    const bool saved = svc->saveBlockPreset (node, "BlockPresetRoundTrip_SaveList");
    BOOST_CHECK (saved);

    const StringArray names = svc->listBlockPresets (format, id);
    BOOST_CHECK (names.contains ("BlockPresetRoundTrip_SaveList"));
}

BOOST_AUTO_TEST_CASE (save_mutate_load_restores_state)
{
    using namespace element;
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    const String format     = "Internal";
    const String id         = "el.BlockPresetTest.RoundTrip";
    const String origState  = MemoryBlock ("original_state_data", 19).toBase64Encoding();
    const String mutState   = MemoryBlock ("mutated_state_data",  18).toBase64Encoding();
    const String presetName = "BlockPresetRoundTrip_MutateLoad";

    // Save original state.
    Node node = makeTestNode (format, id, "RTNode", origState);
    BOOST_REQUIRE (svc->saveBlockPreset (node, presetName));

    // Mutate the node's in-memory state to simulate parameter changes.
    node.data().setProperty (tags::state, mutState, nullptr);
    BOOST_CHECK_EQUAL (node.data().getProperty (tags::state).toString().toStdString(),
                       mutState.toStdString());

    // Load should restore the original state.
    const bool loaded = svc->loadBlockPreset (node, presetName);
    BOOST_CHECK (loaded);
    BOOST_CHECK_EQUAL (node.data().getProperty (tags::state).toString().toStdString(),
                       origState.toStdString());
}

BOOST_AUTO_TEST_CASE (load_rejects_mismatched_identifier)
{
    using namespace element;
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    const String format      = "Internal";
    const String idA         = "el.BlockPresetTest.PluginA";
    const String idB         = "el.BlockPresetTest.PluginB";
    const String state       = MemoryBlock ("data", 4).toBase64Encoding();
    const String presetName  = "BlockPresetRoundTrip_MismatchGuard";

    Node nodeA = makeTestNode (format, idA, "NodeA", state);
    BOOST_REQUIRE (svc->saveBlockPreset (nodeA, presetName));

    // Node with a different identifier — load must return false.
    Node nodeB = makeTestNode (format, idB, "NodeB", String());
    const bool loaded = svc->loadBlockPreset (nodeB, presetName);
    BOOST_CHECK (! loaded);
}

BOOST_AUTO_TEST_CASE (set_default_and_query)
{
    using namespace element;
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    const String format = "Internal";
    const String id     = "el.BlockPresetTest.DefaultPreset";
    const String state  = MemoryBlock ("default_state", 13).toBase64Encoding();

    Node node = makeTestNode (format, id, "DefaultNode", state);
    const String defaultName = svc->setDefaultForPlugin (node);
    BOOST_CHECK (defaultName.isNotEmpty());

    // Query must return the same name.
    const String queried = svc->getDefaultPresetName (format, id);
    BOOST_CHECK_EQUAL (queried.toStdString(), defaultName.toStdString());

    // The default preset must appear in the list.
    const StringArray names = svc->listBlockPresets (format, id);
    BOOST_CHECK (names.contains (defaultName));
}

BOOST_AUTO_TEST_CASE (save_invalid_node_returns_false)
{
    using namespace element;
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    Node empty;
    BOOST_CHECK (! svc->saveBlockPreset (empty, "ShouldFail"));
}

BOOST_AUTO_TEST_CASE (load_nonexistent_preset_returns_false)
{
    using namespace element;
    auto* svc = test::getService<PresetService>();
    BOOST_REQUIRE (svc != nullptr);

    Node node = makeTestNode ("Internal", "el.BlockPresetTest.NoFile", "X",
                              MemoryBlock ("x", 1).toBase64Encoding());
    BOOST_CHECK (! svc->loadBlockPreset (node, "BlockPresetRoundTrip_DoesNotExist_zzz999"));
}

BOOST_AUTO_TEST_SUITE_END()
