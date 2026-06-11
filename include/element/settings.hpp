// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/core.hpp>
#include <element/juce/data_structures.hpp>
#include <element/juce/gui_basics.hpp>

namespace juce { class PluginDescription; }

namespace element {

class Context;

struct MidiPanicParams;

class Settings : public juce::ApplicationProperties {
public:
    Settings();
    ~Settings();

    static const char* checkForUpdatesKey;
    static const char* pluginListKey;
    static const char* pluginFormatsKey;
    static const char* pluginWindowOnTopDefault;
    static const char* lastPluginScanPathPrefix;
    static const char* scanForPluginsOnStartKey;
    static const char* showPluginWindowsKey;
    static const char* openLastUsedSessionKey;
    static const char* askToSaveSessionKey;
    static const char* defaultNewSessionFile;
    static const char* generateMidiClockKey;
    static const char* sendMidiClockToInputKey;
    static const char* hidePluginWindowsWhenFocusLostKey;
    static const char* lastGraphKey;
    static const char* lastSessionKey;
    static const char* legacyInterfaceKey;
    static const char* midiEngineKey;
    static const char* oscHostPortKey;
    static const char* oscHostEnabledKey;
    static const char* systrayKey;
    static const char* midiOutLatencyKey;
    static const char* desktopScaleKey;
    static const char* mainContentTypeKey;
    static const char* pluginListHeaderKey;
    static const char* devicesKey;
    static const char* keymappingsKey;
    static const char* clockSourceKey;
    static const char* updateChannelKey;
    static const char* updateKeyTypeKey;
    static const char* updateKeyKey;
    static const char* updateKeyUserKey;
    static const char* transportStartStopContinue;
    static const char* pluginSandboxModeKey;

    bool getBool (std::string_view key, bool fallback = false) const noexcept;

    void set (std::string_view key, const juce::var& value);

    std::unique_ptr<juce::XmlElement> getLastGraph() const;
    void setLastGraph (const juce::ValueTree& data);

    /** Returns true if updates shoul be checked for on launch */
    bool checkForUpdates() const;

    /** Set if should check updates on start */
    void setCheckForUpdates (const bool shouldCheck);

    /** Returns true if plugins should be scanned on startup */
    bool scanForPluginsOnStartup() const;

    /** Set if plugins should be scanned during startup */
    void setScanForPluginsOnStartup (const bool shouldScan);

    /** True if plugin windows should be made visible when added to a graph */
    bool showPluginWindowsWhenAdded() const;
    void setShowPluginWindowsWhenAdded (const bool);

    /** True if the last used session should be opened on launch.
        If running as Solo/Lite, then this returns true if the last
        Graph should be opened on launch instead of a Session
     */
    bool openLastUsedSession() const;
    void setOpenLastUsedSession (const bool);

    /** True if plugin windows are on top by default */
    bool pluginWindowsOnTop() const;
    void setPluginWindowsOnTop (const bool);

    /** True if the user should be prompted to save when exiting the app */
    bool askToSaveSession();
    void setAskToSaveSession (const bool);

    const juce::File getDefaultNewSessionFile() const;
    void setDefaultNewSessionFile (const juce::File&);

    void addItemsToMenu (Context&, juce::PopupMenu&);
    bool performMenuResult (Context&, const int result);

    void setGenerateMidiClock (const bool);
    bool generateMidiClock() const;

    void setSendMidiClockToInput (const bool);
    bool sendMidiClockToInput() const;

    void setHidePluginWindowsWhenFocusLost (const bool);
    bool hidePluginWindowsWhenFocusLost() const;

    void setUseLegacyInterface (const bool);
    bool useLegacyInterface() const;

    bool isOscHostEnabled() const;
    void setOscHostEnabled (bool);
    int getOscHostPort() const;
    void setOscHostPort (int);

    bool isSystrayEnabled() const;
    void setSystrayEnabled (bool);

    double getMidiOutLatency() const;
    void setMidiOutLatency (double latencyMs);

    double getDesktopScale() const;
    void setDesktopScale (double);

    juce::String getMainContentType() const;
    void setMainContentType (const juce::String&);

    juce::String getClockSource() const;
    void setClockSource (const juce::String&);

    /** Returns the update Key type to use when checking. */
    juce::String getUpdateKeyType() const;

    /** Set the key type. Possible values are patreon, element-v1, or 
        membership.
     */
    void setUpdateKeyType (const String& slug);

    /** Returns the update key user. */
    juce::String getUpdateKeyUser() const;

    /** Set the update key user. */
    void setUpdateKeyUser (const String& user);

    /** Returns the update Key to use when checking. */
    juce::String getUpdateKey() const;

    /** Set the user's update key text. */
    void setUpdateKey (const String& key);

    /** Returns the update channel. */
    juce::String getUpdateChannel() const;

    /** Change the update channgel. stable or nightly. */
    void setUpdateChannel (const String& key);

    /** Set global midi panic settings. */
    void setMidiPanicParams (MidiPanicParams);

    /** Get global midi panic settings. */
    MidiPanicParams getMidiPanicParams() const;

    void setTransportRespondToStartStopContinue (bool shouldRespond);
    bool transportRespondToStartStopContinue() const;

    /** Default plugin sandbox mode when the user has set no explicit preference.
     *  Glen's INTENT (2026-06-09): ALL third-party plugins out-of-process by
     *  default (crash isolation + no message-thread freeze on heavy loads).
     *  FLIPPED TO 1 (2026-06-10) after the two blockers proved fixed live:
     *  (a) "helper does not launch" was a misdiagnosis — the worker launches
     *  and loads AUs out-of-process; the real defect was wantsContext()==false
     *  on SandboxedProcessorNode routing the render op to a null AudioProcessor
     *  (audio-thread SIGSEGV, masked by a leaked empty crash handler), and
     *  (b) the session-load "hang" was the same crash + a permanent xrun storm
     *  from a diverged host sequence counter — both fixed (self-healing
     *  expected-sequence + teardown-guarded restarts). Verified live: empty-board
     *  add, Default.els session load with 2 sandboxed AUs, and worker SIGKILL →
     *  single restart recovery, host alive throughout.
     *  0 = disabled · 1 = all external plugins sandboxed · 2 = AU-only.
     */
    static constexpr int defaultPluginSandboxMode = 1;

    /** Get plugin sandbox mode.
     *  0 = disabled
     *  1 = all external plugins sandboxed (DEFAULT — defaultPluginSandboxMode)
     *  2 = only problematic plugins sandboxed (AU-only)
     */
    int getPluginSandboxMode() const;
    void setPluginSandboxMode (int mode);

    /** Check if a specific plugin should be sandboxed based on current mode. */
    bool shouldSandboxPlugin (const juce::PluginDescription& desc) const;

    /** Number of pre-launched blank sandbox workers kept warm so an add skips
        process spawn + connect (T7 warm pool). 0 disables the warm pool. */
    int getSandboxWarmPoolSize() const;

    /** Max parked (still-loaded) sandbox workers kept alive after their node is
        removed, for instant re-add / session-reload reuse. 0 disables parking. */
    int getMaxParkedSandboxInstances() const;

    /** Pre-open the plugin editor HIDDEN in the worker right after load, so
        heavy editor-time init (Kontakt licence/content scan) is paid before the
        user first opens it. */
    bool shouldPrewarmSandboxEditor() const;

    static const char* sandboxWarmPoolSizeKey;
    static const char* sandboxParkedMaxKey;
    static const char* sandboxPrewarmEditorKey;

    /** Obfuscate a string for storage (XOR + base64). Not cryptographic —
        prevents casual plaintext exposure in preference files. */
    static juce::String obfuscate (const juce::String& plaintext);

    /** Reverse obfuscation. */
    static juce::String deobfuscate (const juce::String& obfuscated);

private:
    juce::PropertiesFile* getProps() const;
};

} // namespace element
