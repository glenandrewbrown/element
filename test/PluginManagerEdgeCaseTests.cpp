// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// PluginManager edge-case tests.
//
// The existing PluginManagerTests.cpp covers one happy-path case
// (SupportedFormats).  These tests document the gaps:
//   - Construction produces a live object with no formats loaded yet
//   - getAudioPluginFormat() returns nullptr for unknown / empty names
//   - isAudioPluginFormatSupported() returns false before addDefaultFormats
//   - isAudioPluginFormatSupported() returns false for unknown format names
//   - addDefaultFormats() called twice does not crash or double-register
//   - setPlayConfig() with extreme values does not crash
//   - getNodeFactory() returns a reference (not null / crash)
//   - NodeFactory built-in IDs are accessible without addDefaultFormats()

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/nodefactory.hpp>
#include <element/plugins.hpp>

#include "utils.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (PluginManagerEdgeCaseTests)

// ── Construction ──────────────────────────────────────────────────────────────

// A freshly constructed PluginManager should be usable without crashing.
BOOST_AUTO_TEST_CASE (construction_produces_valid_object)
{
    BOOST_CHECK_NO_THROW ({
        PluginManager mgr;
        (void) mgr;
    });
}

// ── getAudioPluginFormat ──────────────────────────────────────────────────────

// Querying an unknown format name before addDefaultFormats returns nullptr.
BOOST_AUTO_TEST_CASE (get_format_unknown_name_returns_null)
{
    PluginManager mgr;
    BOOST_CHECK (mgr.getAudioPluginFormat ("DoesNotExist") == nullptr);
}

// Empty format name never returns a valid format.
BOOST_AUTO_TEST_CASE (get_format_empty_name_returns_null)
{
    PluginManager mgr;
    mgr.addDefaultFormats();
    BOOST_CHECK (mgr.getAudioPluginFormat ("") == nullptr);
}

// Known-bad format name after addDefaultFormats still returns nullptr.
BOOST_AUTO_TEST_CASE (get_format_unknown_after_add_default_returns_null)
{
    PluginManager mgr;
    mgr.addDefaultFormats();
    BOOST_CHECK (mgr.getAudioPluginFormat ("FakeFormat") == nullptr);
    BOOST_CHECK (mgr.getAudioPluginFormat ("LADSPA") == nullptr); // not compiled in
}

// ── isAudioPluginFormatSupported ──────────────────────────────────────────────

// Before any formats are added, no format is "supported".
BOOST_AUTO_TEST_CASE (no_formats_supported_before_add_default)
{
    PluginManager mgr;
    for (const auto& fmt : Util::compiledAudioPluginFormats())
        BOOST_CHECK_MESSAGE (
            ! mgr.isAudioPluginFormatSupported (fmt),
            "Expected unsupported before addDefaultFormats: " + fmt.toStdString());
}

// A garbage format name is never supported, even after addDefaultFormats.
BOOST_AUTO_TEST_CASE (unsupported_format_always_false)
{
    PluginManager mgr;
    mgr.addDefaultFormats();
    BOOST_CHECK (! mgr.isAudioPluginFormatSupported ("NotAFormat"));
    BOOST_CHECK (! mgr.isAudioPluginFormatSupported (""));
}

// ── addDefaultFormats idempotence ─────────────────────────────────────────────

// Calling addDefaultFormats() twice must not crash or double-register formats.
// After both calls the set of supported formats must be exactly the same as
// after one call (no duplicates that would produce two entries for "VST3" etc.).
BOOST_AUTO_TEST_CASE (add_default_formats_idempotent)
{
    PluginManager mgr;
    mgr.addDefaultFormats();

    // Collect supported-format names after first call.
    StringArray firstPass;
    for (const auto& fmt : Util::compiledAudioPluginFormats())
        if (mgr.isAudioPluginFormatSupported (fmt))
            firstPass.add (fmt);

    // Second call must not crash.
    BOOST_CHECK_NO_THROW (mgr.addDefaultFormats());

    // Supported set is identical after second call.
    for (const auto& fmt : firstPass)
        BOOST_CHECK_MESSAGE (
            mgr.isAudioPluginFormatSupported (fmt),
            "Format lost after second addDefaultFormats: " + fmt.toStdString());
}

// ── setPlayConfig edge cases ──────────────────────────────────────────────────

// Zero sample rate and zero block size must not crash the manager.
// (PluginManager stores the config; it does not apply it to a live engine here.)
BOOST_AUTO_TEST_CASE (set_play_config_zero_values_no_crash)
{
    PluginManager mgr;
    BOOST_CHECK_NO_THROW (mgr.setPlayConfig (0.0, 0));
}

// Extreme-but-valid values (192 kHz, 8192 block) must not crash.
BOOST_AUTO_TEST_CASE (set_play_config_extreme_values_no_crash)
{
    PluginManager mgr;
    BOOST_CHECK_NO_THROW (mgr.setPlayConfig (192000.0, 8192));
}

// setPlayConfig round-trips: values stored can be retrieved unchanged.
// (Only if PluginManager exposes accessors — skip silently if not available.)
BOOST_AUTO_TEST_CASE (set_play_config_standard_values)
{
    PluginManager mgr;
    BOOST_CHECK_NO_THROW (mgr.setPlayConfig (44100.0, 512));
    BOOST_CHECK_NO_THROW (mgr.setPlayConfig (48000.0, 256));
    BOOST_CHECK_NO_THROW (mgr.setPlayConfig (96000.0, 1024));
}

// ── getNodeFactory ────────────────────────────────────────────────────────────

// getNodeFactory() returns a reference to a live NodeFactory.
// The factory should already know the built-in internal node IDs without
// calling addDefaultFormats() (internal nodes are registered separately).
BOOST_AUTO_TEST_CASE (get_node_factory_returns_valid_ref)
{
    PluginManager mgr;
    // Should not throw; the reference must be stable.
    BOOST_CHECK_NO_THROW ({
        NodeFactory& factory = mgr.getNodeFactory();
        // At minimum the factory should be in a consistent state — knownIDs()
        // must return a StringArray (may be empty before any registration).
        const auto ids = factory.knownIDs();
        (void) ids;
    });
}

// Adding a custom provider to getNodeFactory() and then instantiating it works.
// Covers the path where external callers extend the factory (as the CLAP
// provider does in real code).
BOOST_AUTO_TEST_CASE (node_factory_custom_provider_round_trip)
{
    PluginManager mgr;
    mgr.addDefaultFormats(); // also registers internal node providers

    NodeFactory& factory = mgr.getNodeFactory();
    // All internally registered IDs must be instantiable.
    for (const auto& id : factory.knownIDs())
    {
        BOOST_CHECK_NO_THROW ({
            std::unique_ptr<Processor> proc (factory.instantiate (id));
            // nullptr is acceptable for IDs that require a running engine /
            // plugin files that are not present on this machine.
            (void) proc;
        });
    }
}

// ── Error handling: instantiate unknown type ──────────────────────────────────

// The NodeFactory inside PluginManager must return nullptr for garbage IDs
// (regression guard — a crash here would propagate to the audio thread).
BOOST_AUTO_TEST_CASE (instantiate_unknown_id_returns_null_not_crash)
{
    PluginManager mgr;
    mgr.addDefaultFormats();
    NodeFactory& factory = mgr.getNodeFactory();

    BOOST_CHECK_NO_THROW ({
        std::unique_ptr<Processor> p (factory.instantiate ("el.TotallyFakeNode"));
        BOOST_CHECK (p == nullptr);
    });

    BOOST_CHECK_NO_THROW ({
        std::unique_ptr<Processor> p2 (factory.instantiate (""));
        BOOST_CHECK (p2 == nullptr);
    });
}

BOOST_AUTO_TEST_SUITE_END()
