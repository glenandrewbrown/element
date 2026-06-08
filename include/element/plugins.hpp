// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <functional>

#include <element/juce/audio_processors.hpp>
#include <element/signals.hpp>

#define EL_PLUGIN_SCANNER_PROCESS_ID "pspelbg"

namespace element {

class ChildProcessSlave;
class Processor;
class Node;
class NodeFactory;
class NodeProvider;
class PluginScannerCoordinator;
class PluginScanner;
class SandboxedProcessorNode;
class PluginUsageTracker;

class PluginManager : public juce::ChangeBroadcaster {
public:
    PluginManager();
    ~PluginManager();

    /** Add default plugin formats */
    void addDefaultFormats();

    /** Add a plugin format */
    void addFormat (std::unique_ptr<juce::AudioPluginFormat>);

    /** Get the dead mans pedal file */
    const juce::File& getDeadAudioPluginsFile() const;

    /** Access to the main known plugins list */
    juce::KnownPluginList& getKnownPlugins();
    const juce::KnownPluginList& getKnownPlugins() const;

    /** Access the plugin usage tracker (favorites, recently used) */
    PluginUsageTracker& getUsageTracker();

    /** Scan/Add a description to the known plugins */
    void addToKnownPlugins (const juce::PluginDescription& desc);

    /** Returns the audio plugin format manager */
    juce::AudioPluginFormatManager& getAudioPluginFormats();

    /** Returns true if an audio plugin format is supported */
    bool isAudioPluginFormatSupported (const juce::String&) const;

    /** Returns an audio plugin format by name */
    juce::AudioPluginFormat* getAudioPluginFormat (const juce::String& formatName) const;

    /** Returns an audio plugin format by type */
    template <class FormatType>
    inline FormatType* format()
    {
        auto& f (getAudioPluginFormats());
        for (int i = 0; i < f.getNumFormats(); ++i)
            if (FormatType* fmt = dynamic_cast<FormatType*> (f.getFormat (i)))
                return fmt;
        return nullptr;
    }

    /** Returns the node factory. */
    NodeFactory& getNodeFactory();

    /** Returns the default search path for a given format. */
    juce::FileSearchPath defaultSearchPath (juce::StringRef format) const noexcept;

    /** creates a child process slave used in start up */
    juce::ChildProcessWorker* createAudioPluginScannerWorker();

    /** creates a new plugin scanner for use by a third party, e.g. plugin manager UI */
    PluginScanner* createAudioPluginScanner();

    /** gets the internal plugins scanner used for background scanning */
    PluginScanner* getBackgroundAudioPluginScanner();

    /** Scans for all audio plugin types using a child process */
    void scanAudioPlugins (const juce::StringArray& formats = juce::StringArray());

    /** Returns true if a scan is in progress using the child process */
    bool isScanningAudioPlugins();

    /** Returns the name of the currently scanned plugin. This value
	    is not suitable for use in loading plugins */
    juce::String getCurrentlyScannedPluginName() const;

    /** Looks for new or updated internal/element plugins */
    void scanInternalPlugins();

    /** Save the known plugins to user settings */
    void saveUserPlugins (juce::ApplicationProperties&);

    /** Restore user plugins. Will also scan internal plugins so they don't get removed
        by accident */
    void restoreUserPlugins (juce::ApplicationProperties&);

    /** Restore user plugins. Will also scan internal plugins so they don't get removed
        by accident */
    void restoreUserPlugins (const juce::XmlElement& xml);

    juce::AudioPluginInstance* createAudioPlugin (const juce::PluginDescription& desc, juce::String& errorMsg);
    Processor* createGraphNode (const juce::PluginDescription& desc, juce::String& errorMsg);

    /** Wave-3 Phase 4 — asynchronous variant of createGraphNode.
     *
     *  For EXTERNAL (JUCE-format) plugins this routes instantiation through
     *  AudioPluginFormatManager::createPluginInstanceAsync so the message thread
     *  is NOT blocked while a heavy plugin loads. The callback receives the wrapped
     *  Processor (ownership transferred) or nullptr + an error string.
     *
     *  RT-safety: JUCE guarantees the completion callback runs on the MESSAGE
     *  THREAD (juce_AudioPluginFormatManager.h: "called on the message thread"),
     *  so the supplied callback may safely touch the model/engine.
     *
     *  Internal / NodeFactory / IO nodes are cheap to build and are created
     *  SYNCHRONOUSLY (the callback is invoked inline, still on the calling thread),
     *  reusing createGraphNode so there is no behaviour change for them. */
    using GraphNodeCreationCallback = std::function<void (Processor*, const juce::String&)>;
    void createGraphNodeAsync (const juce::PluginDescription& desc, GraphNodeCreationCallback callback);

    /** Create a sandboxed graph node that runs the plugin in an isolated process.
     *  This provides crash isolation - if the plugin crashes, only the sandbox
     *  process is affected, not the main host application.
     */
    Processor* createSandboxedGraphNode (const juce::PluginDescription& desc, juce::String& errorMsg);

    //==========================================================================
    /** Lifecycle event from a sandboxed (out-of-process) plugin node. */
    enum class SandboxEvent
    {
        Crashed = 0,         ///< (0) Worker process died; recovery may be attempted.
        Restarted,           ///< (1) Worker process was relaunched after a crash.
        LoadFailed,          ///< (2) Plugin failed to load in the worker.
        Error,               ///< (3) Non-fatal worker error.
        FellBackInProcess    ///< (4) Sandbox requested but worker creation failed;
                             ///<     plugin loaded IN-PROCESS so the user is NOT
                             ///<     crash-protected. Honesty signal — NOT a crash.
                             ///<     element_webview_host.cpp maps this int (4) to
                             ///<     the "inProcessFallback" kind string.
    };

    /** Emitted (message thread) when a sandboxed plugin node reports a lifecycle
     *  event. Args: (nodeId, event, reason). Subscribed by the webview host to
     *  surface a "plugin crashed — reload" affordance on the Block. Emitting is a
     *  pass-through helper so SandboxedProcessorNode (which only holds a
     *  PluginManager&) can publish without reaching into UI services. */
    Signal<void (juce::uint32 /*nodeId*/, SandboxEvent, juce::String /*reason*/)> sigSandboxEvent;

    /** Publish a sandbox lifecycle event on sigSandboxEvent. */
    void emitSandboxEvent (juce::uint32 nodeId, SandboxEvent event, const juce::String& reason = {})
    {
        sigSandboxEvent (nodeId, event, reason);
    }

    /** Set the play config used when instantiating plugins */
    void setPlayConfig (double sampleRate, int blockSize);

    /** Give a properties file to be used when settings aren't available. FIXME */
    void setPropertiesFile (juce::PropertiesFile* pf) { props = pf; }

    /** Search for unverified plugins in background thread */
    void searchUnverifiedPlugins();

    /** This will get a possible list of plugins. Trying to load this might fail */
    void getUnverifiedPlugins (const juce::String& formatName, juce::OwnedArray<juce::PluginDescription>& plugins);

    /** Restore User Plugins From a file */
    void restoreAudioPlugins (const juce::File&);

    /** Get a juce:: PluginDescription for a Node */
    juce::PluginDescription findDescriptionFor (const Node&) const;

    /** Saves the default node state */
    void saveDefaultNode (const Node& node);

    /** Returns the last saved default node state */
    Node getDefaultNode (const juce::PluginDescription& desc) const;

    /** Get the first node factory by format. e.g. "LV2" */
    NodeProvider* getProvider (const juce::String& format) noexcept;

private:
    friend class PluginScanner;
    juce::PropertiesFile* props = nullptr;
    class Private;
    std::unique_ptr<Private> priv;

    friend class PluginScannerCoordinator;
    void scanFinished();

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginManager)
};

class PluginScanner final {
public:
    PluginScanner (PluginManager& manager);
    ~PluginScanner();

    class Listener {
    public:
        Listener() {}
        virtual ~Listener() {}

        virtual void audioPluginScanFinished() {}
        virtual void audioPluginScanProgress (const float progress) { juce::ignoreUnused (progress); }
        virtual void audioPluginScanStarted (const juce::String& name) {}
    };

    static const juce::File& getWorkerPluginListFile();

    /** scan for plugins of type */
    void scanForAudioPlugins (const juce::String& formatName);

    /** Scan for plugins of multiple types */
    void scanForAudioPlugins (const juce::StringArray& formats);

    /** Quick scan: discover plugin files and add to list WITHOUT loading/validating.
        This is much faster and won't crash, but plugin metadata (name, manufacturer,
        I/O config) won't be populated until the plugin is first loaded. */
    void quickScanForPlugins (const juce::StringArray& formats);

    /** Cancels the current scan operation if possible. */
    void cancel();

    /** is scanning */
    bool isScanning() const;

    /** Add a listener */
    void addListener (Listener* listener) { listeners.add (listener); }

    /** Remove a listener */
    void removeListener (Listener* listener) { listeners.remove (listener); }

    /** Returns a list of plugins that failed to load */
    const juce::StringArray& getFailedFiles() const { return failedIdentifiers; }

    /** Returns the scanner exe to use for out-of-process scanning. */
    juce::File scannerExeFile() const noexcept;

    /** Set a specific scanner exe. */
    void setScannerExe (const juce::File& exe) { _scannerExe = exe; }

private:
    friend class PluginScannerCoordinator;
    PluginManager& _manager;
    std::unique_ptr<PluginScannerCoordinator> superprocess;
    juce::ListenerList<Listener> listeners;
    juce::StringArray identifiers, failedIdentifiers;
    juce::KnownPluginList& list;
    juce::Atomic<int> cancelFlag { 0 };
    juce::File _scannerExe;

    void scanAudioFormat (const juce::String& formatName);
    bool retrieveDescriptions (const juce::String& formatName,
                               const juce::String& fileOrIdentifier,
                               juce::OwnedArray<juce::PluginDescription>& result);
};

} // namespace element
