// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Naming QA for every browsable internal node (Glen, 2026-06-06: "QA the
// naming of all blocks and lists so they present useful information and no
// duplicates"). Enumerates BOTH internal-description paths the plugin list is
// built from:
//   1. NodeFactory::knownIDs() -> getPluginDescriptions  (pluginmanager.cpp
//      scanInternalPlugins path)
//   2. ElementAudioPluginFormat::searchPathsForPlugins -> findAllTypesForFile
//      (the internal "scan" path)
// and asserts every browsable entry has a human, unique, non-ID name.
// Regression-guards: the two MIDI device directions sharing one name; the
// media player leaking its raw type ID as the description; Placeholder
// appearing as an addable Block.

#include <map>

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/nodefactory.hpp>
#include <element/plugins.hpp>

#include "engine/internalformat.hpp"
#include "testutil.hpp"

using namespace element;

namespace {

/** Collect descriptions from both internal enumeration paths. */
static void collectInternalDescriptions (Context& ctx, juce::OwnedArray<juce::PluginDescription>& out)
{
    auto& nodes = ctx.plugins().getNodeFactory();
    for (const auto& id : nodes.knownIDs())
        nodes.getPluginDescriptions (out, id);

    ElementAudioPluginFormat format (ctx);
    for (const auto& id : format.searchPathsForPlugins ({}, true, false))
        format.findAllTypesForFile (out, id);
}

static bool looksLikeTypeId (const juce::String& s)
{
    return s.startsWith ("element.") || s.startsWith ("el.");
}

} // namespace

BOOST_AUTO_TEST_SUITE (InternalNodeNamingTests)

// Every browsable internal node: non-empty, human (not a raw type id) name
// AND descriptive text that is not a raw type id either.
BOOST_AUTO_TEST_CASE (names_are_human_and_descriptions_never_leak_ids)
{
    auto ctx = element::test::context();
    juce::OwnedArray<juce::PluginDescription> ds;
    collectInternalDescriptions (*ctx, ds);
    BOOST_REQUIRE_GT (ds.size(), 0);

    for (const auto* d : ds)
    {
        BOOST_CHECK_MESSAGE (d->name.trim().isNotEmpty(),
                             "empty name for " << d->fileOrIdentifier);
        BOOST_CHECK_MESSAGE (! looksLikeTypeId (d->name),
                             "raw type id leaked as NAME: " << d->name);
        BOOST_CHECK_MESSAGE (d->name != d->fileOrIdentifier,
                             "name == identifier for " << d->fileOrIdentifier);
        BOOST_CHECK_MESSAGE (! looksLikeTypeId (d->descriptiveName),
                             "raw type id leaked as DESCRIPTION for "
                                 << d->fileOrIdentifier << ": " << d->descriptiveName);
    }
}

// No two DIFFERENT internal types may present the same browsable name —
// "MIDI device node" twice in QuickAdd was indistinguishable.
BOOST_AUTO_TEST_CASE (names_are_unique_per_type)
{
    auto ctx = element::test::context();
    juce::OwnedArray<juce::PluginDescription> ds;
    collectInternalDescriptions (*ctx, ds);

    std::map<juce::String, juce::StringArray> byName;
    for (const auto* d : ds)
        byName[d->name].addIfNotAlreadyThere (d->fileOrIdentifier);

    for (const auto& [name, ids] : byName)
        BOOST_CHECK_MESSAGE (ids.size() <= 1,
                             "duplicate browsable name '" << name
                                 << "' used by: " << ids.joinIntoString (", "));
}

// The two MIDI device directions must be tellable apart by name alone.
BOOST_AUTO_TEST_CASE (midi_device_directions_have_distinct_names)
{
    auto ctx = element::test::context();
    ElementAudioPluginFormat format (*ctx);

    juce::OwnedArray<juce::PluginDescription> in, out;
    format.findAllTypesForFile (in, EL_NODE_ID_MIDI_INPUT_DEVICE);
    format.findAllTypesForFile (out, EL_NODE_ID_MIDI_OUTPUT_DEVICE);
    BOOST_REQUIRE_EQUAL (in.size(), 1);
    BOOST_REQUIRE_EQUAL (out.size(), 1);

    BOOST_CHECK_NE (in[0]->name, out[0]->name);
    BOOST_CHECK (in[0]->name.containsIgnoreCase ("input"));
    BOOST_CHECK (out[0]->name.containsIgnoreCase ("output"));
}

// Placeholder is the internal stand-in for missing nodes on session load —
// it must NOT be browsable/addable.
BOOST_AUTO_TEST_CASE (placeholder_is_not_browsable)
{
    auto ctx = element::test::context();
    ElementAudioPluginFormat format (*ctx);
    const auto ids = format.searchPathsForPlugins ({}, true, false);
    BOOST_CHECK_MESSAGE (! ids.contains (EL_NODE_ID_PLACEHOLDER),
                         "Placeholder is listed as an addable Block");
}

// Regression guard for INV-naming §(c): a PluginDescription whose name field
// is empty (or already a path) must never surface a raw file path as the block
// title. GraphManager stamps and Node::getDisplayName() both use the shared
// cleanPluginDisplayName() helper from node.hpp.
BOOST_AUTO_TEST_CASE (path_like_names_are_cleaned_to_basename)
{
    struct Case { juce::String raw; juce::String expected; };
    const std::vector<Case> cases = {
        // Scanner-produced paths with plugin extension → clean basename.
        { "/Library/Audio/Plug-Ins/VST3/RX 10 De-reverb.vst3", "RX 10 De-reverb" },
        { "C:\\Program Files\\VSTPlugins\\My Synth.dll",        "My Synth"         },
        { "/usr/lib/lv2/myplugin.so",                           "myplugin"         },
        { "RX 10 De-reverb.vst3",                               "RX 10 De-reverb" }, // no leading path
        // Already-clean human names → UNCHANGED (including names with '/').
        { "Drums/Bus",   "Drums/Bus"   }, // user rename — must NOT be truncated to "Bus"
        { "Supercharger", "Supercharger" },
        { "eVerb",        "eVerb"        },
        // Edge cases.
        { "",             ""             }, // empty stays empty
    };

    for (const auto& c : cases)
    {
        const juce::String got = element::cleanPluginDisplayName (c.raw);
        BOOST_CHECK_MESSAGE (got == c.expected,
                             "cleanPluginDisplayName(\"" << c.raw << "\") = \""
                                 << got << "\", expected \"" << c.expected << "\"");
    }
}

BOOST_AUTO_TEST_SUITE_END()
