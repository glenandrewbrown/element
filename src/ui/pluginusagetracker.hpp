// Copyright 2024 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_events/juce_events.h>

namespace element {

using namespace juce;

/** Tracks plugin usage for favorites and recently used features.
    Inherits from ChangeBroadcaster so UI can listen for changes,
    and from Timer for coalesced saves (avoids writing to disk on every mutation).
*/
class PluginUsageTracker : public ChangeBroadcaster,
                           private Timer
{
public:
    /** Create a tracker with access to the known plugin list.
        @param knownPlugins  The KnownPluginList used to resolve identifiers to descriptions.
    */
    explicit PluginUsageTracker (KnownPluginList& knownPlugins);
    ~PluginUsageTracker() override;

    /** Mark a plugin as used (updates recently used list).
        Must be called on the message thread. */
    void recordUsage (const PluginDescription& desc);

    /** Toggle favorite status for a plugin.
        Must be called on the message thread. */
    void toggleFavorite (const PluginDescription& desc);

    /** Check if a plugin is a favorite */
    bool isFavorite (const PluginDescription& desc) const;

    /** Get list of favorite plugins by matching against the KnownPluginList */
    Array<PluginDescription> getFavorites() const;

    /** Get recently used plugins (most recent first) by matching against the KnownPluginList */
    Array<PluginDescription> getRecentlyUsed (int maxItems = 10) const;

    /** Get recently used plugin identifiers (most recent first) */
    StringArray getRecentlyUsedIdentifiers (int maxItems = 10) const;

    /** Check if a plugin was recently used */
    bool isRecentlyUsed (const PluginDescription& desc) const;

    /** Get all favorite identifiers */
    const StringArray& getFavoriteIdentifiers() const { return favoriteIdentifiers; }

    /** Save to settings */
    void save();

    /** Load from settings */
    void load();

    /** Clear recently used list */
    void clearRecentlyUsed();

private:
    struct UsageEntry
    {
        String pluginIdentifier;
        Time lastUsed;
        int useCount { 0 };
    };

    KnownPluginList& knownPlugins;
    Array<UsageEntry> recentlyUsed;
    StringArray favoriteIdentifiers;
    File settingsFile;
    bool savePending { false };

    int findEntry (const String& identifier) const;
    void scheduleSave();
    void timerCallback() override;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginUsageTracker)
};

} // namespace element
