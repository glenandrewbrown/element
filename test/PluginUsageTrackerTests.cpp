// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Unit tests for PluginUsageTracker — the model behind the plugin browser's
// RECENT and FAVOURITE rails. These exercise the round-trips that were silently
// broken in production:
//   * recordUsage -> getRecentlyUsedIdentifiers (RECENT was dead: no call sites)
//   * toggleFavorite -> isFavorite -> save -> load (FAVOURITE persistence)
//
// Every case persists into a UNIQUE temp file via the test-seam constructor so
// the user's real ~/Library/Application Support/Kushview/Element/plugin_usage.xml
// is never touched.

#include <boost/test/unit_test.hpp>

#include "ui/pluginusagetracker.hpp"

using namespace juce;
using element::PluginUsageTracker;

namespace {

static PluginDescription makeDesc (const String& name, const String& fileOrId, const String& fmt = "VST3")
{
    PluginDescription d;
    d.name = name;
    d.fileOrIdentifier = fileOrId;
    d.pluginFormatName = fmt;
    d.uniqueId = name.hashCode();
    d.deprecatedUid = name.hashCode();
    return d;
}

static File makeTempUsageFile()
{
    return File::getSpecialLocation (File::tempDirectory)
        .getChildFile ("element_plugin_usage_test_" + String (Random::getSystemRandom().nextInt64()))
        .getChildFile ("plugin_usage.xml");
}

// RAII temp-file guard so a failing assertion still cleans the temp dir.
struct TempUsageFile
{
    TempUsageFile() : file (makeTempUsageFile()) {}
    ~TempUsageFile() { file.getParentDirectory().deleteRecursively(); }
    File file;
};

} // namespace

BOOST_AUTO_TEST_SUITE (PluginUsageTrackerTests)

// recordUsage must surface in getRecentlyUsedIdentifiers, most-recent-first,
// and de-duplicate (re-using an already-recorded plugin bumps it to the front
// and increments useCount rather than adding a second entry).
BOOST_AUTO_TEST_CASE (RecordUsageRoundTrip)
{
    TempUsageFile temp;
    KnownPluginList list;

    const auto a = makeDesc ("Alpha", "/plugins/Alpha.vst3");
    const auto b = makeDesc ("Beta", "/plugins/Beta.vst3");

    PluginUsageTracker tracker (list, temp.file);

    BOOST_REQUIRE (tracker.getRecentlyUsedIdentifiers().isEmpty());

    tracker.recordUsage (a);
    tracker.recordUsage (b);

    auto ids = tracker.getRecentlyUsedIdentifiers();
    BOOST_REQUIRE_EQUAL (ids.size(), 2);
    // Most recent first.
    BOOST_CHECK_EQUAL (ids[0].toStdString(), b.createIdentifierString().toStdString());
    BOOST_CHECK_EQUAL (ids[1].toStdString(), a.createIdentifierString().toStdString());

    BOOST_CHECK (tracker.isRecentlyUsed (a));
    BOOST_CHECK_EQUAL (tracker.getUseCountForIdentifier (a.createIdentifierString()), 1);

    // Re-using Alpha moves it to the front and increments its count — no dupes.
    tracker.recordUsage (a);
    ids = tracker.getRecentlyUsedIdentifiers();
    BOOST_REQUIRE_EQUAL (ids.size(), 2);
    BOOST_CHECK_EQUAL (ids[0].toStdString(), a.createIdentifierString().toStdString());
    BOOST_CHECK_EQUAL (tracker.getUseCountForIdentifier (a.createIdentifierString()), 2);
}

// toggleFavorite -> isFavorite -> save -> load must round-trip on disk using the
// SAME identifier form (createIdentifierString) the webview/native rows match on.
BOOST_AUTO_TEST_CASE (FavoriteSaveLoadRoundTrip)
{
    TempUsageFile temp;
    KnownPluginList list;

    const auto a = makeDesc ("Alpha", "/plugins/Alpha.vst3");
    const auto b = makeDesc ("Beta", "/plugins/Beta.vst3");
    list.addType (a);
    list.addType (b);

    {
        PluginUsageTracker tracker (list, temp.file);
        BOOST_CHECK (! tracker.isFavorite (a));

        tracker.toggleFavorite (a);
        BOOST_CHECK (tracker.isFavorite (a));
        BOOST_CHECK (! tracker.isFavorite (b));

        // Favourite identifiers are stored in createIdentifierString form.
        BOOST_CHECK (tracker.getFavoriteIdentifiers().contains (a.createIdentifierString()));

        // getFavorites resolves identifiers back to descriptions via the list.
        auto favs = tracker.getFavorites();
        BOOST_REQUIRE_EQUAL (favs.size(), 1);
        BOOST_CHECK_EQUAL (favs[0].createIdentifierString().toStdString(),
                           a.createIdentifierString().toStdString());

        tracker.save();
    }

    BOOST_REQUIRE (temp.file.existsAsFile());

    // Fresh tracker on the same file must observe the persisted favourite.
    {
        PluginUsageTracker reloaded (list, temp.file);
        BOOST_CHECK (reloaded.isFavorite (a));
        BOOST_CHECK (! reloaded.isFavorite (b));
        BOOST_CHECK (reloaded.getFavoriteIdentifiers().contains (a.createIdentifierString()));
    }

    // Toggling off then saving must clear it on disk too.
    {
        PluginUsageTracker tracker (list, temp.file);
        tracker.toggleFavorite (a);
        BOOST_CHECK (! tracker.isFavorite (a));
        tracker.save();
    }
    {
        PluginUsageTracker reloaded (list, temp.file);
        BOOST_CHECK (! reloaded.isFavorite (a));
    }
}

// Recently-used entries must also persist across save/load.
BOOST_AUTO_TEST_CASE (RecentlyUsedSaveLoadRoundTrip)
{
    TempUsageFile temp;
    KnownPluginList list;

    const auto a = makeDesc ("Alpha", "/plugins/Alpha.vst3");
    const auto b = makeDesc ("Beta", "/plugins/Beta.vst3");

    {
        PluginUsageTracker tracker (list, temp.file);
        tracker.recordUsage (a);
        tracker.recordUsage (b);
        tracker.recordUsage (a); // count(a)=2, order: a, b
        tracker.save();
    }

    {
        PluginUsageTracker reloaded (list, temp.file);
        auto ids = reloaded.getRecentlyUsedIdentifiers();
        BOOST_REQUIRE_EQUAL (ids.size(), 2);
        BOOST_CHECK_EQUAL (ids[0].toStdString(), a.createIdentifierString().toStdString());
        BOOST_CHECK_EQUAL (ids[1].toStdString(), b.createIdentifierString().toStdString());
        BOOST_CHECK_EQUAL (reloaded.getUseCountForIdentifier (a.createIdentifierString()), 2);
        BOOST_CHECK_EQUAL (reloaded.getUseCountForIdentifier (b.createIdentifierString()), 1);
    }
}

BOOST_AUTO_TEST_SUITE_END()
