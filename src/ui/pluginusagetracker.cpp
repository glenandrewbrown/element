// Copyright 2024 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include "ui/pluginusagetracker.hpp"

#include <element/datapath.hpp>

namespace element {
using namespace juce;

static constexpr int maxRecentEntries = 50;
static constexpr int coalescedSaveMs = 2000;
static constexpr const char* usageFileName = "plugin_usage.xml";

//=============================================================================
// PluginUsageTracker Implementation
//=============================================================================

PluginUsageTracker::PluginUsageTracker (KnownPluginList& knownPluginsRef)
    : knownPlugins (knownPluginsRef)
{
    // Persist beside the rest of the app data (Element.conf, plugins.xml) under
    // the canonical Kushview/Element data dir. The old location
    // (~/Library/Application Support/Element/plugin_usage.xml) never matched
    // anything else and the dir was never even created, so RECENT/FAVOURITE
    // state silently failed to persist. One-shot migrate any legacy file.
    settingsFile = DataPath::applicationDataDir().getChildFile (usageFileName);

    migrateLegacyFile();
    load();
}

PluginUsageTracker::PluginUsageTracker (KnownPluginList& knownPluginsRef, const File& settingsFileToUse)
    : knownPlugins (knownPluginsRef)
{
    settingsFile = settingsFileToUse;
    load();
}

PluginUsageTracker::~PluginUsageTracker()
{
    removeAllChangeListeners();
    stopTimer();

    if (savePending)
        save();
}

void PluginUsageTracker::recordUsage (const PluginDescription& desc)
{
    jassert (MessageManager::existsAndIsCurrentThread());

    String identifier = desc.createIdentifierString();
    int index = findEntry (identifier);

    if (index >= 0)
    {
        recentlyUsed.getReference (index).lastUsed = Time::getCurrentTime();
        recentlyUsed.getReference (index).useCount++;

        // Move to front
        auto entry = recentlyUsed[index];
        recentlyUsed.remove (index);
        recentlyUsed.insert (0, entry);
    }
    else
    {
        UsageEntry entry;
        entry.pluginIdentifier = identifier;
        entry.lastUsed = Time::getCurrentTime();
        entry.useCount = 1;
        recentlyUsed.insert (0, entry);
    }

    // Keep only the most recent entries
    while (recentlyUsed.size() > maxRecentEntries)
        recentlyUsed.removeLast();

    scheduleSave();
    sendChangeMessage();
}

void PluginUsageTracker::toggleFavorite (const PluginDescription& desc)
{
    jassert (MessageManager::existsAndIsCurrentThread());

    String identifier = desc.createIdentifierString();

    if (favoriteIdentifiers.contains (identifier))
        favoriteIdentifiers.removeString (identifier);
    else
        favoriteIdentifiers.add (identifier);

    scheduleSave();
    sendChangeMessage();
}

bool PluginUsageTracker::isFavorite (const PluginDescription& desc) const
{
    return favoriteIdentifiers.contains (desc.createIdentifierString());
}

Array<PluginDescription> PluginUsageTracker::getFavorites() const
{
    Array<PluginDescription> results;
    const auto types = knownPlugins.getTypes();

    for (const auto& type : types)
    {
        if (favoriteIdentifiers.contains (type.createIdentifierString()))
            results.add (type);
    }

    return results;
}

Array<PluginDescription> PluginUsageTracker::getRecentlyUsed (int maxItems) const
{
    Array<PluginDescription> results;
    const auto types = knownPlugins.getTypes();

    for (int i = 0; i < jmin (maxItems, recentlyUsed.size()); ++i)
    {
        const auto& identifier = recentlyUsed[i].pluginIdentifier;

        for (const auto& type : types)
        {
            if (type.createIdentifierString() == identifier)
            {
                results.add (type);
                break;
            }
        }
    }

    return results;
}

void PluginUsageTracker::save()
{
    ValueTree data ("PluginUsage");

    // Save recently used
    ValueTree recentData ("RecentlyUsed");
    for (auto& entry : recentlyUsed)
    {
        ValueTree entryData ("Entry");
        entryData.setProperty ("identifier", entry.pluginIdentifier, nullptr);
        entryData.setProperty ("lastUsed", entry.lastUsed.toMilliseconds(), nullptr);
        entryData.setProperty ("useCount", entry.useCount, nullptr);
        recentData.appendChild (entryData, nullptr);
    }
    data.appendChild (recentData, nullptr);

    // Save favorites
    ValueTree favData ("Favorites");
    for (auto& fav : favoriteIdentifiers)
    {
        ValueTree favEntry ("Favorite");
        favEntry.setProperty ("identifier", fav, nullptr);
        favData.appendChild (favEntry, nullptr);
    }
    data.appendChild (favData, nullptr);

    if (auto xml = data.createXml())
    {
        settingsFile.getParentDirectory().createDirectory();

        if (xml->writeTo (settingsFile))
        {
            savePending = false;
        }
        else
        {
            juce::Logger::writeToLog ("[element] failed to save plugin usage data");
        }
    }
}

void PluginUsageTracker::load()
{
    recentlyUsed.clear();
    favoriteIdentifiers.clear();

    if (! settingsFile.existsAsFile())
        return;

    auto xml = XmlDocument::parse (settingsFile);

    if (xml == nullptr)
    {
        Logger::writeToLog ("[element] plugin_usage.xml parse failed — starting with empty usage data");
        return;
    }

    {
        auto data = ValueTree::fromXml (*xml);

        // Load recently used
        auto recentData = data.getChildWithName ("RecentlyUsed");
        for (int i = 0; i < recentData.getNumChildren(); ++i)
        {
            auto entryData = recentData.getChild (i);
            UsageEntry entry;
            entry.pluginIdentifier = entryData.getProperty ("identifier").toString();
            entry.lastUsed = Time (static_cast<int64> (entryData.getProperty ("lastUsed")));
            entry.useCount = entryData.getProperty ("useCount", 1);
            recentlyUsed.add (entry);
        }

        // Load favorites
        auto favData = data.getChildWithName ("Favorites");
        for (int i = 0; i < favData.getNumChildren(); ++i)
        {
            auto favEntry = favData.getChild (i);
            favoriteIdentifiers.add (favEntry.getProperty ("identifier").toString());
        }
    }
}

void PluginUsageTracker::migrateLegacyFile()
{
    // If the new canonical file already exists, nothing to migrate.
    if (settingsFile.existsAsFile())
        return;

    const File legacy = File::getSpecialLocation (File::userApplicationDataDirectory)
                            .getChildFile ("Element")
                            .getChildFile (usageFileName);

    if (legacy == settingsFile || ! legacy.existsAsFile())
        return;

    settingsFile.getParentDirectory().createDirectory();
    if (legacy.moveFileTo (settingsFile))
        Logger::writeToLog ("[element] migrated legacy plugin_usage.xml to canonical data dir");
    else
        Logger::writeToLog ("[element] failed migrating legacy plugin_usage.xml");
}

void PluginUsageTracker::clearRecentlyUsed()
{
    recentlyUsed.clear();
    scheduleSave();
    sendChangeMessage();
}

int PluginUsageTracker::findEntry (const String& identifier) const
{
    for (int i = 0; i < recentlyUsed.size(); ++i)
    {
        if (recentlyUsed[i].pluginIdentifier == identifier)
            return i;
    }

    return -1;
}

StringArray PluginUsageTracker::getRecentlyUsedIdentifiers (int maxItems) const
{
    StringArray identifiers;
    for (int i = 0; i < jmin (maxItems, recentlyUsed.size()); ++i)
    {
        identifiers.add (recentlyUsed[i].pluginIdentifier);
    }
    return identifiers;
}

int PluginUsageTracker::getUseCountForIdentifier (const String& identifier) const
{
    const int idx = findEntry (identifier);
    return idx >= 0 ? recentlyUsed[idx].useCount : 0;
}

std::map<String, int> PluginUsageTracker::getUsageCounts() const
{
    std::map<String, int> counts;
    for (const auto& entry : recentlyUsed)
        counts[entry.pluginIdentifier] = entry.useCount;
    return counts;
}

bool PluginUsageTracker::isRecentlyUsed (const PluginDescription& desc) const
{
    String identifier = desc.createIdentifierString();
    return findEntry (identifier) >= 0;
}

void PluginUsageTracker::scheduleSave()
{
    savePending = true;
    startTimer (coalescedSaveMs);
}

void PluginUsageTracker::timerCallback()
{
    stopTimer();
    save();
}

} // namespace element
