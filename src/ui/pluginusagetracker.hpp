// Copyright 2024 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_events/juce_events.h>

namespace element {

/** Tracks plugin usage for favorites and recently used features.
    Inherits from ChangeBroadcaster so UI can listen for changes,
    and from Timer for coalesced saves (avoids writing to disk on every mutation).
*/
class PluginUsageTracker : public juce::ChangeBroadcaster,
                           private juce::Timer
{
public:
    /** Create a tracker with access to the known plugin list.
        @param knownPlugins  The KnownPluginList used to resolve identifiers to descriptions.
    */
    explicit PluginUsageTracker (juce::KnownPluginList& knownPlugins);
    ~PluginUsageTracker() override;

    /** Mark a plugin as used (updates recently used list).
        Must be called on the message thread. */
    void recordUsage (const juce::PluginDescription& desc);

    /** Toggle favorite status for a plugin.
        Must be called on the message thread. */
    void toggleFavorite (const juce::PluginDescription& desc);

    /** Check if a plugin is a favorite */
    bool isFavorite (const juce::PluginDescription& desc) const;

    /** Get list of favorite plugins by matching against the KnownPluginList */
    juce::Array<juce::PluginDescription> getFavorites() const;

    /** Get recently used plugins (most recent first) by matching against the KnownPluginList */
    juce::Array<juce::PluginDescription> getRecentlyUsed (int maxItems = 10) const;

    /** Get recently used plugin identifiers (most recent first) */
    juce::StringArray getRecentlyUsedIdentifiers (int maxItems = 10) const;

    /** Check if a plugin was recently used */
    bool isRecentlyUsed (const juce::PluginDescription& desc) const;

    /** Get all favorite identifiers */
    const juce::StringArray& getFavoriteIdentifiers() const { return favoriteIdentifiers; }

    /** Save to settings */
    void save();

    /** Load from settings */
    void load();

    /** Clear recently used list */
    void clearRecentlyUsed();

private:
    struct UsageEntry
    {
        juce::String pluginIdentifier;
        juce::Time lastUsed;
        int useCount { 0 };
    };

    juce::KnownPluginList& knownPlugins;
    juce::Array<UsageEntry> recentlyUsed;
    juce::StringArray favoriteIdentifiers;
    juce::File settingsFile;
    bool savePending { false };

    int findEntry (const juce::String& identifier) const;
    void scheduleSave();
    void timerCallback() override;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginUsageTracker)
};

} // namespace element
