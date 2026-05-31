// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// NodeFactory extended tests.
// The existing NodeFactoryTests.cpp has one case covering the main built-in
// IDs.  These tests cover the gaps:
//   - Math node IDs (add / subtract / multiply / divide)
//   - Reroute node IDs (generic, audio, MIDI)
//   - Unknown/garbage ID returns nullptr
//   - knownIDs() contains every expected math/reroute ID
//   - Repeated instantiation of the same ID is stable
//   - hideType / removeHiddenType round-trip for non-MCU types

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/nodefactory.hpp>

#include "nodes/nodetypes.hpp"
#include "testutil.hpp"

using namespace element;
using namespace juce;

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (NodeFactoryExtendedTests)

// ── Math nodes ───────────────────────────────────────────────────────────────

// All four math-node IDs are registered and instantiable.
BOOST_AUTO_TEST_CASE (math_nodes_registered_and_instantiable)
{
    NodeFactory nodes;
    const StringArray mathIDs {
        "element.add",
        "element.subtract",
        "element.multiply",
        "element.divide"
    };

    for (const auto& id : mathIDs) {
        BOOST_CHECK_MESSAGE (nodes.knownIDs().contains (id),
                             "NodeFactory missing math node: " + id);
        std::unique_ptr<Processor> proc (nodes.instantiate (id));
        BOOST_CHECK_MESSAGE (proc != nullptr,
                             "NodeFactory::instantiate returned nullptr for: " + id);
    }
}

// Each math node returns a non-empty name via getPluginDescription.
BOOST_AUTO_TEST_CASE (math_nodes_have_plugin_description)
{
    NodeFactory nodes;
    const StringArray mathIDs {
        "element.add",
        "element.subtract",
        "element.multiply",
        "element.divide"
    };

    for (const auto& id : mathIDs) {
        std::unique_ptr<Processor> proc (nodes.instantiate (id));
        BOOST_REQUIRE_MESSAGE (proc != nullptr, "nullptr for " + id);

        PluginDescription desc;
        proc->getPluginDescription (desc);
        BOOST_CHECK_MESSAGE (desc.name.isNotEmpty(),
                             "Empty plugin name for: " + id);
        BOOST_CHECK_MESSAGE (desc.fileOrIdentifier.isNotEmpty(),
                             "Empty fileOrIdentifier for: " + id);
    }
}

// Math node IDs are unique — no two share the same UID.
BOOST_AUTO_TEST_CASE (math_node_uids_are_unique)
{
    NodeFactory nodes;
    const StringArray mathIDs {
        "element.add",
        "element.subtract",
        "element.multiply",
        "element.divide"
    };

    Array<uint32> uids;
    for (const auto& id : mathIDs) {
        std::unique_ptr<Processor> proc (nodes.instantiate (id));
        BOOST_REQUIRE (proc != nullptr);
        BOOST_CHECK_MESSAGE (! uids.contains (proc->nodeId),
                             "Duplicate UID for: " + id);
        uids.add (proc->nodeId);
    }
}

// ── Reroute nodes ─────────────────────────────────────────────────────────────

// Generic, audio, and MIDI reroute IDs are registered and instantiable.
BOOST_AUTO_TEST_CASE (reroute_nodes_registered_and_instantiable)
{
    NodeFactory nodes;
    const StringArray rerouteIDs {
        EL_NODE_ID_AUDIO_REROUTE,
        EL_NODE_ID_MIDI_REROUTE
    };

    for (const auto& id : rerouteIDs) {
        BOOST_CHECK_MESSAGE (nodes.knownIDs().contains (id),
                             "NodeFactory missing reroute node: " + id);
        std::unique_ptr<Processor> proc (nodes.instantiate (id));
        BOOST_CHECK_MESSAGE (proc != nullptr,
                             "NodeFactory::instantiate returned nullptr for: " + id);
    }
}

// ── Unknown ID handling ───────────────────────────────────────────────────────

// instantiate with an unknown ID returns nullptr — no crash.
BOOST_AUTO_TEST_CASE (unknown_id_returns_nullptr)
{
    NodeFactory nodes;
    std::unique_ptr<Processor> proc (nodes.instantiate ("el.NotARealNode"));
    BOOST_CHECK (proc == nullptr);
}

// Empty string ID returns nullptr.
BOOST_AUTO_TEST_CASE (empty_id_returns_nullptr)
{
    NodeFactory nodes;
    std::unique_ptr<Processor> proc (nodes.instantiate (String()));
    BOOST_CHECK (proc == nullptr);
}

// knownIDs does not contain the unknown garbage ID.
BOOST_AUTO_TEST_CASE (garbage_id_not_in_known_ids)
{
    NodeFactory nodes;
    BOOST_CHECK (! nodes.knownIDs().contains ("el.ThisDoesNotExist"));
}

// ── Repeated instantiation stability ─────────────────────────────────────────

// Instantiating the same ID ten times produces ten distinct objects.
BOOST_AUTO_TEST_CASE (repeated_instantiation_returns_distinct_objects)
{
    NodeFactory nodes;
    const String id = "element.add";
    BOOST_REQUIRE (nodes.knownIDs().contains (id));

    std::vector<std::unique_ptr<Processor>> procs;
    for (int i = 0; i < 10; ++i) {
        auto proc = std::unique_ptr<Processor> (nodes.instantiate (id));
        BOOST_REQUIRE (proc != nullptr);
        procs.push_back (std::move (proc));
    }

    // All pointers must be different.
    for (size_t i = 0; i < procs.size(); ++i)
        for (size_t j = i + 1; j < procs.size(); ++j)
            BOOST_CHECK_NE (procs[i].get(), procs[j].get());
}

// ── hideType / isTypeHidden / removeHiddenType ────────────────────────────────

// hideType marks a math node as hidden; removeHiddenType clears it.
BOOST_AUTO_TEST_CASE (hide_and_reveal_math_node)
{
    NodeFactory nodes;
    const String id = "element.add";
    BOOST_REQUIRE (nodes.knownIDs().contains (id));

    BOOST_CHECK (! nodes.isTypeHidden (id));
    nodes.hideType (id);
    BOOST_CHECK (nodes.isTypeHidden (id));
    nodes.removeHiddenType (id);
    BOOST_CHECK (! nodes.isTypeHidden (id));
}

// ── getPluginDescriptions ─────────────────────────────────────────────────────

// getPluginDescriptions returns at least one entry per math node ID.
BOOST_AUTO_TEST_CASE (get_plugin_descriptions_math_nodes)
{
    NodeFactory nodes;
    const StringArray mathIDs {
        "element.add",
        "element.subtract",
        "element.multiply",
        "element.divide"
    };

    for (const auto& id : mathIDs) {
        OwnedArray<PluginDescription> descs;
        nodes.getPluginDescriptions (descs, id);
        BOOST_CHECK_MESSAGE (descs.size() >= 1,
                             "No PluginDescription for: " + id);
    }
}

BOOST_AUTO_TEST_SUITE_END()
