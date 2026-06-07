// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// N2 / Decision D-1 — alias-aware VST3-primary plugin dedupe.
//
// Unit-tests the PURE grouping helper `element::buildPluginGroupRows` directly.
// No Context, engine, or message thread: the function takes a plain view of the
// scanned plugin list + the persisted usage / favourite / recent data and
// returns the JSON-ready grouped rows. This is the headless seam the live
// `buildPluginListJson()` delegates to.
//
// Asserts:
//   (a) a VST3+AU family collapses to ONE row, VST3 chosen as primary;
//   (b) the row carries aliases[] (both ids) + structured variants[{format,id}];
//   (c) usageCount is AGGREGATED across the variants;
//   (d) isFavorite is true when ANY alias is starred (the AU keeps the family
//       in Favourites even though the VST3 row is shown — no orphaning);
//   (e) recentRank is the BEST (lowest) alias rank;
//   (f) a solitary plugin emits a single-variant group (aliases == [its id]);
//   (g) family order is stable (first-appearance), and primary choice is
//       deterministic regardless of scan order;
//   (h) the grouping never depends on / mutates any external list (pure).

#include <boost/test/unit_test.hpp>

#include <element/juce.hpp>
#include <element/ui/element_webview_host.hpp>

#include <map>
#include <vector>

using namespace element;
using namespace juce;

#if JUCE_WEB_BROWSER

namespace {

PluginGroupSource mk (const String& name,
                      const String& manufacturer,
                      const String& format,
                      const String& identifier,
                      bool isInstrument = false,
                      int numOut = 2,
                      const String& category = "Reverb")
{
    PluginGroupSource s;
    s.name = name;
    s.manufacturer = manufacturer;
    s.format = format;
    s.identifier = identifier;
    s.isInstrument = isInstrument;
    s.numInputChannels = 2;
    s.numOutputChannels = numOut;
    s.category = category;
    s.version = "1.0";
    s.descriptiveName = name;
    return s;
}

// Find the single emitted row whose primary identifier == id (or fail).
const DynamicObject* rowWithPrimary (const Array<var>& rows, const String& id)
{
    for (const auto& r : rows)
        if (auto* o = r.getDynamicObject())
            if (o->getProperty ("identifier").toString() == id)
                return o;
    return nullptr;
}

StringArray aliasesOf (const DynamicObject* o)
{
    StringArray out;
    if (o == nullptr)
        return out;
    if (auto* arr = o->getProperty ("aliases").getArray())
        for (const auto& a : *arr)
            out.add (a.toString());
    return out;
}

} // namespace

BOOST_AUTO_TEST_SUITE (PluginGroupingTests)

BOOST_AUTO_TEST_CASE (vst3_and_au_collapse_to_one_vst3_primary_row)
{
    std::vector<PluginGroupSource> src {
        mk ("BigVerb", "Acme", "AudioUnit", "au:BigVerb"),
        mk ("BigVerb", "Acme", "VST3", "vst3:BigVerb"),
    };
    const auto rows = buildPluginGroupRows (src, {}, {}, {});

    BOOST_REQUIRE_EQUAL (rows.size(), 1);
    auto* o = rows[0].getDynamicObject();
    BOOST_REQUIRE (o != nullptr);
    // (a) VST3 is the primary even though the AU was scanned first.
    BOOST_CHECK_EQUAL (o->getProperty ("identifier").toString().toStdString(), std::string ("vst3:BigVerb"));
    BOOST_CHECK_EQUAL (o->getProperty ("format").toString().toStdString(), std::string ("VST3"));

    // (b) both identifiers present as aliases; structured variants.
    const auto al = aliasesOf (o);
    BOOST_CHECK_EQUAL (al.size(), 2);
    BOOST_CHECK (al.contains ("vst3:BigVerb"));
    BOOST_CHECK (al.contains ("au:BigVerb"));

    auto* variants = o->getProperty ("variants").getArray();
    BOOST_REQUIRE (variants != nullptr);
    BOOST_REQUIRE_EQUAL (variants->size(), 2);
    // primary-first ordering.
    BOOST_CHECK_EQUAL ((*variants)[0].getDynamicObject()->getProperty ("format").toString().toStdString(),
                       std::string ("VST3"));
    BOOST_CHECK_EQUAL ((*variants)[0].getDynamicObject()->getProperty ("identifier").toString().toStdString(),
                       std::string ("vst3:BigVerb"));
}

BOOST_AUTO_TEST_CASE (usage_count_aggregates_across_aliases)
{
    std::vector<PluginGroupSource> src {
        mk ("BigVerb", "Acme", "VST3", "vst3:BigVerb"),
        mk ("BigVerb", "Acme", "AudioUnit", "au:BigVerb"),
    };
    std::map<String, int> usage {
        { "vst3:BigVerb", 3 },
        { "au:BigVerb", 4 },
    };
    const auto rows = buildPluginGroupRows (src, usage, {}, {});
    auto* o = rowWithPrimary (rows, "vst3:BigVerb");
    BOOST_REQUIRE (o != nullptr);
    // (c) 3 + 4 aggregated.
    BOOST_CHECK_EQUAL ((int) o->getProperty ("usageCount"), 7);
}

BOOST_AUTO_TEST_CASE (starred_au_keeps_family_favorited)
{
    std::vector<PluginGroupSource> src {
        mk ("BigVerb", "Acme", "VST3", "vst3:BigVerb"),
        mk ("BigVerb", "Acme", "AudioUnit", "au:BigVerb"),
    };
    // Only the AU is starred — the VST3 primary row must still report favourite.
    StringArray favorites { "au:BigVerb" };
    const auto rows = buildPluginGroupRows (src, {}, favorites, {});
    auto* o = rowWithPrimary (rows, "vst3:BigVerb");
    BOOST_REQUIRE (o != nullptr);
    // (d) any-alias-starred ⇒ group favourited (no orphaned AU).
    BOOST_CHECK ((bool) o->getProperty ("isFavorite"));
}

BOOST_AUTO_TEST_CASE (recent_rank_is_best_alias_rank)
{
    std::vector<PluginGroupSource> src {
        mk ("BigVerb", "Acme", "VST3", "vst3:BigVerb"),
        mk ("BigVerb", "Acme", "AudioUnit", "au:BigVerb"),
    };
    // recents are most-recent-first: AU at index 2, nothing for the VST3.
    StringArray recents { "other:X", "other:Y", "au:BigVerb" };
    const auto rows = buildPluginGroupRows (src, {}, {}, recents);
    auto* o = rowWithPrimary (rows, "vst3:BigVerb");
    BOOST_REQUIRE (o != nullptr);
    // (e) best (lowest) rank among aliases == 2.
    BOOST_CHECK_EQUAL ((int) o->getProperty ("recentRank"), 2);

    // A family with no recent alias reports -1.
    std::vector<PluginGroupSource> solo { mk ("Lonely", "Acme", "VST3", "vst3:Lonely") };
    const auto soloRows = buildPluginGroupRows (solo, {}, {}, recents);
    BOOST_REQUIRE_EQUAL (soloRows.size(), 1);
    BOOST_CHECK_EQUAL ((int) soloRows[0].getDynamicObject()->getProperty ("recentRank"), -1);
}

BOOST_AUTO_TEST_CASE (solitary_plugin_emits_single_variant_group)
{
    std::vector<PluginGroupSource> src { mk ("OnlyAU", "Acme", "AudioUnit", "au:OnlyAU") };
    const auto rows = buildPluginGroupRows (src, {}, {}, {});
    BOOST_REQUIRE_EQUAL (rows.size(), 1);
    auto* o = rows[0].getDynamicObject();
    BOOST_REQUIRE (o != nullptr);
    // (f) AU is its own primary (no VST3 to promote); single alias.
    BOOST_CHECK_EQUAL (o->getProperty ("identifier").toString().toStdString(), std::string ("au:OnlyAU"));
    const auto al = aliasesOf (o);
    BOOST_CHECK_EQUAL (al.size(), 1);
    BOOST_CHECK (al.contains ("au:OnlyAU"));
}

BOOST_AUTO_TEST_CASE (distinct_families_are_not_merged_and_order_is_stable)
{
    std::vector<PluginGroupSource> src {
        mk ("Alpha", "Acme", "VST3", "vst3:Alpha"),
        mk ("Beta", "Acme", "VST3", "vst3:Beta"),
        mk ("Beta", "Acme", "AudioUnit", "au:Beta"),
        mk ("Alpha", "OtherCo", "VST3", "vst3:Alpha-OtherCo"), // same name, different maker → distinct
    };
    const auto rows = buildPluginGroupRows (src, {}, {}, {});
    // (g) three families: Acme/Alpha, Acme/Beta, OtherCo/Alpha — in first-seen order.
    BOOST_REQUIRE_EQUAL (rows.size(), 3);
    BOOST_CHECK_EQUAL (rows[0].getDynamicObject()->getProperty ("identifier").toString().toStdString(),
                       std::string ("vst3:Alpha"));
    BOOST_CHECK_EQUAL (rows[1].getDynamicObject()->getProperty ("identifier").toString().toStdString(),
                       std::string ("vst3:Beta"));
    BOOST_CHECK_EQUAL (rows[2].getDynamicObject()->getProperty ("identifier").toString().toStdString(),
                       std::string ("vst3:Alpha-OtherCo"));
}

BOOST_AUTO_TEST_CASE (primary_choice_is_order_independent)
{
    // VST3 last in scan order must still win.
    std::vector<PluginGroupSource> src {
        mk ("BigVerb", "Acme", "LV2", "lv2:BigVerb"),
        mk ("BigVerb", "Acme", "AudioUnit", "au:BigVerb"),
        mk ("BigVerb", "Acme", "VST3", "vst3:BigVerb"),
    };
    const auto rows = buildPluginGroupRows (src, {}, {}, {});
    BOOST_REQUIRE_EQUAL (rows.size(), 1);
    BOOST_CHECK_EQUAL (rows[0].getDynamicObject()->getProperty ("identifier").toString().toStdString(),
                       std::string ("vst3:BigVerb"));
    // (h) all three ids preserved as aliases regardless of which is primary.
    BOOST_CHECK_EQUAL (aliasesOf (rows[0].getDynamicObject()).size(), 3);
}

BOOST_AUTO_TEST_CASE (case_and_whitespace_insensitive_grouping)
{
    std::vector<PluginGroupSource> src {
        mk (" BigVerb ", "Acme", "VST3", "vst3:BigVerb"),
        mk ("bigverb", "acme", "AudioUnit", "au:BigVerb"),
    };
    const auto rows = buildPluginGroupRows (src, {}, {}, {});
    // Trimmed + lowercased key ⇒ same family.
    BOOST_REQUIRE_EQUAL (rows.size(), 1);
    BOOST_CHECK_EQUAL (aliasesOf (rows[0].getDynamicObject()).size(), 2);
}

BOOST_AUTO_TEST_SUITE_END()

#else // ! JUCE_WEB_BROWSER

BOOST_AUTO_TEST_SUITE (PluginGroupingTests)
BOOST_AUTO_TEST_CASE (skipped_no_web_browser) { BOOST_CHECK (true); }
BOOST_AUTO_TEST_SUITE_END()

#endif
