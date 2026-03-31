// Copyright 2014-2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <array>

#include <element/datapath.hpp>
#include <element/node.hpp>
#include <element/nodefactory.hpp>
#include <element/plugins.hpp>
#include <element/settings.hpp>

#include "engine/clapprovider.hpp"
#include "engine/sandboxhost.hpp"
#include "engine/ionode.hpp"
#include "nodes/nodetypes.hpp"
#include "nodes/sandboxedprocessor.hpp"
#include "ui/pluginusagetracker.hpp"
#include "utils.hpp"

#define EL_DEAD_AUDIO_PLUGINS_FILENAME "scanner/crashed.txt"
#define EL_PLUGIN_SCANNER_SLAVE_LIST_PATH "scanner/list.xml"
#define EL_PLUGIN_SCANNER_WAITING_STATE "waiting"
#define EL_PLUGIN_SCANNER_READY_STATE "ready"

#define EL_PLUGIN_SCANNER_READY_ID "ready"
#define EL_PLUGIN_SCANNER_START_ID "start"
#define EL_PLUGIN_SCANNER_FINISHED_ID "finished"

#define EL_PLUGIN_SCANNER_DEFAULT_TIMEOUT 60000 // 60 Seconds (increased for heavy plugins)

#include <errno.h>

#if JUCE_MAC
// AU metadata reading is in pluginmanager_au.mm to avoid namespace
// conflicts between juce:: and macOS AudioToolbox types.
extern bool readAUMetadata (const juce::String& identifier, juce::PluginDescription& desc);
#endif

namespace element {
using namespace juce;

namespace detail {
static const char* pluginListKey() { return Settings::pluginListKey; }
/* noop. prevent OS error dialogs from child process */
static void pluginScannerCrashHandler (void*) {}
static File pluginsXmlFile() { return DataPath::applicationDataDir().getChildFile ("plugins.xml"); }

static FileSearchPath readSearchPath (const PropertiesFile& props, const String& f)
{
    const auto key = String (Settings::lastPluginScanPathPrefix) + f;
    return FileSearchPath (props.getValue (key));
}

static File scannerExeFullPath()
{
    auto scannerExe = File::getSpecialLocation (File::currentExecutableFile);

#if JUCE_LINUX
    if (! scannerExe.existsAsFile())
    {
        std::array<char, PATH_MAX> path {};
        const ssize_t len = readlink ("/proc/self/exe", path.data(), PATH_MAX - 1);
        if (len > 0)
        {
            path[static_cast<size_t> (len)] = '\0';
            scannerExe = File (String (path.data()));
        }
    }
#endif

    return scannerExe;
}

static juce::StringArray readDeadMansPedalFile()
{
    const auto file = DataPath::applicationDataDir().getChildFile (EL_DEAD_AUDIO_PLUGINS_FILENAME);
    StringArray lines;
    file.readLines (lines);
    lines.removeEmptyStrings();
    return lines;
}

static void setDeadMansPedalFile (const StringArray& newContents)
{
    auto deadMansPedalFile = DataPath::applicationDataDir().getChildFile (EL_DEAD_AUDIO_PLUGINS_FILENAME);
    if (deadMansPedalFile.isDirectory())
        deadMansPedalFile.deleteRecursively();
    if (! deadMansPedalFile.exists())
        deadMansPedalFile.create();
    if (deadMansPedalFile.existsAsFile() && deadMansPedalFile.getFullPathName().isNotEmpty())
        deadMansPedalFile.replaceWithText (newContents.joinIntoString ("\n"), true, true);
}

static void applyBlacklistingsFromDeadMansPedal (KnownPluginList& list)
{
    // If any plugins have crashed recently when being loaded, move them to the
    // end of the list to give the others a chance to load correctly..
    for (auto& crashedPlugin : readDeadMansPedalFile())
        list.addToBlacklist (crashedPlugin);
}

} // namespace detail

//==============================================================================
class PluginScannerCoordinator : public juce::ChildProcessCoordinator
{
public:
    explicit PluginScannerCoordinator (PluginScanner& o)
        : owner (o)
    {
        if (! launchScanner (EL_PLUGIN_SCANNER_DEFAULT_TIMEOUT, 0))
        {
            o.listeners.call (&PluginScanner::Listener::audioPluginScanFinished);
            juce::AlertWindow::showMessageBoxAsync (
                juce::MessageBoxIconType::WarningIcon,
                "Plugin Scanner",
                "Could not launch plugin scanner.");
        }
    }

    ~PluginScannerCoordinator() {}

    enum class State
    {
        timeout,
        gotResult,
        connectionLost,
    };

    struct Response
    {
        State state;
        std::unique_ptr<XmlElement> xml;
    };

    Response getResponse()
    {
        std::unique_lock<std::mutex> lock { mutex };

        if (! condvar.wait_for (lock, std::chrono::milliseconds { 50 }, [&] { return gotResult || connectionLost; }))
            return { State::timeout, nullptr };

        const auto state = connectionLost ? State::connectionLost : State::gotResult;
        connectionLost = false;
        gotResult = false;

        return { state, std::move (pluginDescription) };
    }

    void handleMessageFromWorker (const MemoryBlock& mb) override
    {
        const std::lock_guard<std::mutex> lock { mutex };
        pluginDescription = juce::parseXML (mb.toString());
        gotResult = true;
        condvar.notify_one();
    }

    void handleConnectionLost() override
    {
        const std::lock_guard<std::mutex> lock { mutex };
        connectionLost = true;
        condvar.notify_one();
    }

private:
    PluginScanner& owner;

    std::mutex mutex;
    std::condition_variable condvar;

    std::unique_ptr<XmlElement> pluginDescription;
    bool connectionLost = false;
    bool gotResult = false;

    bool launchScanner (const int timeout = EL_PLUGIN_SCANNER_DEFAULT_TIMEOUT, const int flags = 0)
    {
        auto scannerExe = owner.scannerExeFile();
        if (! scannerExe.existsAsFile())
        {
            Logger::writeToLog ("Failed to launch plugin scanner.");
            return false;
        }

        Logger::writeToLog (String ("launching plugin scanner: ") + scannerExe.getFullPathName());
        return launchWorkerProcess (scannerExe,
                                    EL_PLUGIN_SCANNER_PROCESS_ID,
                                    timeout,
                                    flags);
    }
};

//==============================================================================
class PluginScannerWorker : public juce::ChildProcessWorker,
                            public juce::AsyncUpdater
{
public:
    PluginScannerWorker()
    {
        SystemStats::setApplicationCrashHandler (detail::pluginScannerCrashHandler);
        auto logfile = DataPath::applicationDataDir().getChildFile ("log/scanner.log");
        logfile.create();
        logger = std::make_unique<juce::FileLogger> (logfile, "Plugin Scanner");
        Logger::setCurrentLogger (logger.get());
    }

    ~PluginScannerWorker()
    {
        Logger::setCurrentLogger (nullptr);
    }

    void handleMessageFromCoordinator (const MemoryBlock& mb) override
    {
        if (mb.isEmpty())
            return;

        const std::lock_guard<std::mutex> lock (mutex);

        if (const auto results = doScan (mb); ! results.isEmpty())
        {
            sendResults (results);
        }
        else
        {
            pendingBlocks.emplace (mb);
            triggerAsyncUpdate();
        }
    }

    void handleAsyncUpdate() override
    {
        for (;;)
        {
            const std::lock_guard<std::mutex> lock (mutex);

            if (pendingBlocks.empty())
                return;

            sendResults (doScan (pendingBlocks.front()));
            pendingBlocks.pop();
        }
    }

    OwnedArray<PluginDescription> doScan (const MemoryBlock& block)
    {
        MemoryInputStream stream { block, false };
        const auto formatName = stream.readString();
        const auto identifier = stream.readString();
        String msg = "scan: ";
        msg << formatName << ": " << identifier;
        logger->logMessage (msg);
        return nullptr == plugins->getAudioPluginFormat (formatName)
                   ? scanProvider (formatName, identifier)
                   : scanJuce (formatName, identifier);
    }

    OwnedArray<PluginDescription> scanJuce (const String& formatName, const String& identifier)
    {
        PluginDescription pd;
        pd.pluginFormatName = formatName;
        pd.fileOrIdentifier = identifier;
        pd.uniqueId = pd.deprecatedUid = 0;

        const auto matchingFormat = plugins->getAudioPluginFormat (formatName);

        OwnedArray<PluginDescription> results;

        if (matchingFormat != nullptr
            && (MessageManager::getInstance()->isThisTheMessageThread()
                || matchingFormat->requiresUnblockedMessageThreadDuringCreation (pd)))
        {
            matchingFormat->findAllTypesForFile (results, identifier);
        }

        return results;
    }

    OwnedArray<PluginDescription> scanProvider (const String& format, const String& ID)
    {
        auto& nodes = plugins->getNodeFactory();

        OwnedArray<PluginDescription> results;

        for (auto* p : nodes.providers())
        {
            if (p->format() != format)
                continue;

#if 0
            if (auto inst = p->create (ID))
            {
                auto d = results.add (new PluginDescription());
                inst->getPluginDescription (*d);
            }
#else
            p->scan (ID, results);
#endif

            break;
        }

        return results;
    }

    void sendResults (const OwnedArray<PluginDescription>& results)
    {
        XmlElement xml ("LIST");

        for (const auto& desc : results)
            xml.addChildElement (desc->createXml().release());

        const auto str = xml.toString();
        sendMessageToCoordinator ({ str.toRawUTF8(), str.getNumBytesAsUTF8() });
    }

    void handleConnectionMade() override
    {
        logger->logMessage ("[scanner] connection to coordinator established");
        logger->logMessage ("[scanner] creating global objects");
        settings = std::make_unique<Settings>();
        plugins = std::make_unique<PluginManager>();

        logger->logMessage ("[scanner] setting up formats");
        auto& nf = plugins->getNodeFactory();
        nf.add (new CLAPProvider());
        plugins->addDefaultFormats();
        plugins->setPlayConfig (48000.0, 1024);
    }

    void handleConnectionLost() override
    {
        cancelPendingUpdate();
        if (logger)
            logger->logMessage ("[scanner] connection lost");
        Logger::setCurrentLogger (nullptr);
        logger.reset();
        settings = nullptr;
        plugins = nullptr;
        JUCEApplication::quit();
    }

private:
    std::unique_ptr<Settings> settings;
    std::unique_ptr<PluginManager> plugins;
    std::mutex mutex;
    std::queue<MemoryBlock> pendingBlocks;
    std::unique_ptr<juce::FileLogger> logger;
};

//==============================================================================
PluginScanner::PluginScanner (PluginManager& manager)
    : _manager (manager),
      list (manager.getKnownPlugins()),
      _scannerExe (detail::scannerExeFullPath()) {}

PluginScanner::~PluginScanner()
{
    listeners.clear();
    superprocess.reset();
}

void PluginScanner::cancel()
{
    cancelFlag = 1;
}

bool PluginScanner::isScanning() const { return superprocess != nullptr; }

bool PluginScanner::retrieveDescriptions (const String& formatName,
                                          const String& fileOrIdentifier,
                                          OwnedArray<PluginDescription>& result)
{
    if (superprocess == nullptr)
        superprocess = std::make_unique<PluginScannerCoordinator> (*this);

    MemoryBlock block;
    MemoryOutputStream stream { block, true };
    stream.writeString (formatName);
    stream.writeString (fileOrIdentifier);

    if (! superprocess->sendMessageToWorker (block))
        return false;

    using State = PluginScannerCoordinator::State;

    for (;;)
    {
        if (cancelFlag.get() != 0)
            return true;

        const auto response = superprocess->getResponse();

        if (response.state == State::timeout)
        {
            // Pump the message loop so the UI stays responsive during scanning
            if (MessageManager::getInstance()->isThisTheMessageThread())
                MessageManager::getInstance()->runDispatchLoopUntil (4);
            continue;
        }

        if (response.xml != nullptr)
        {
            for (const auto* item : response.xml->getChildIterator())
            {
                auto desc = std::make_unique<PluginDescription>();

                if (desc->loadFromXml (*item))
                    result.add (std::move (desc));
            }
        }

        if (response.state == State::connectionLost)
        {
            // Scanner subprocess crashed on this plugin.  Reset it so
            // a fresh subprocess is spawned for the next plugin.
            superprocess.reset();
        }

        return (response.state == State::gotResult);
    }
}

File PluginScanner::scannerExeFile() const noexcept { return _scannerExe; }

// Helper to check if a plugin identifier should be skipped during scanning
static bool shouldSkipPluginScan (const String& ID)
{
    // Skip Element's own plugins to prevent recursive loading issues
    if (ID.containsIgnoreCase ("KshV") || ID.containsIgnoreCase ("Kushview"))
        return true;
    if (ID.containsIgnoreCase ("KV-Element") || ID.containsIgnoreCase ("Element.component"))
        return true;
    if (ID.containsIgnoreCase ("Element.vst3") || ID.containsIgnoreCase ("Element.clap"))
        return true;

    return false;
}

void PluginScanner::scanAudioFormat (const String& formatName)
{
    detail::applyBlacklistingsFromDeadMansPedal (list);

    StringArray identifiers;
    std::function<String (const String&)> pluginName = [] (const String& ID) -> juce::String { return ID; };

    if (auto* format = _manager.getAudioPluginFormat (formatName))
    {
        pluginName = [format] (const String& ID) {
            return format->getNameOfPluginFromIdentifier (ID);
        };

        identifiers = format->searchPathsForPlugins (
            detail::readSearchPath (*_manager.props, formatName),
            true,
            true);
    }
    else if (auto* provider = _manager.getProvider (formatName))
    {
        identifiers = provider->findTypes (
            detail::readSearchPath (*_manager.props, formatName),
            true,
            false);
    }

    listeners.call (&Listener::audioPluginScanProgress, 0.0f);

    float step = 1.f;
    for (const auto& ID : identifiers)
    {
        if (cancelFlag.get() != 0)
            return;

        // Skip Element's own plugins
        if (shouldSkipPluginScan (ID))
        {
            step += 1.f;
            continue;
        }

        listeners.call (&Listener::audioPluginScanStarted, pluginName (ID));

        if (list.getTypeForFile (ID) || list.getBlacklistedFiles().contains (ID))
            continue;

        OwnedArray<PluginDescription> descriptions;

        auto crashed = detail::readDeadMansPedalFile();
        crashed.removeString (ID);
        crashed.add (ID);
        detail::setDeadMansPedalFile (crashed);

        if (retrieveDescriptions (formatName, ID, descriptions))
        {
            for (auto* desc : descriptions)
                list.addType (*desc);

            // Managed to load without crashing, so remove it from the dead-man's-pedal..
            crashed.removeString (ID);
            detail::setDeadMansPedalFile (crashed);
        }

        if (descriptions.size() == 0 && ! list.getBlacklistedFiles().contains (ID))
            failedIdentifiers.add (ID);

        listeners.call (&Listener::audioPluginScanProgress,
                        step / static_cast<float> (identifiers.size()));
        step += 1.f;
    }
}

void PluginScanner::scanForAudioPlugins (const juce::String& formatName)
{
    const juce::StringArray identifiers { formatName };
    scanForAudioPlugins (identifiers);
}

void PluginScanner::scanForAudioPlugins (const StringArray& formats)
{
    if (! scannerExeFile().existsAsFile())
        return;

    detail::setDeadMansPedalFile ({});
    cancelFlag = 0;

    for (const auto& format : formats)
    {
        scanAudioFormat (format);
        if (cancelFlag.get() != 0)
            break;
    }

    superprocess.reset();
    cancelFlag = 0;

    auto crashed = detail::readDeadMansPedalFile();
    for (const auto& c : failedIdentifiers)
        crashed.add (c);
    crashed.removeDuplicates (false);
    crashed.removeEmptyStrings();
    detail::setDeadMansPedalFile (crashed);
    detail::applyBlacklistingsFromDeadMansPedal (list);
    detail::setDeadMansPedalFile ({});
    failedIdentifiers.clearQuick(); // FIXME: this is a workaround that
    // prevents the UI from showing to
    // many errors about known-crashed
    // plugins
    listeners.call (&Listener::audioPluginScanFinished);
}

// --- Lightweight metadata helpers (no plugin instantiation) ---

/** Read VST3 metadata from moduleinfo.json without loading the plugin. */
static bool readVST3ModuleInfo (const String& identifier, OwnedArray<PluginDescription>& results)
{
    File vst3File (identifier);
    if (! vst3File.isDirectory())
        return false;

    auto moduleInfo = vst3File.getChildFile ("Contents/Resources/moduleinfo.json");
    if (! moduleInfo.existsAsFile())
        return false;

    auto json = JSON::parse (moduleInfo.loadFileAsString());
    if (json.isVoid())
        return false;

    auto factoryInfo = json.getProperty ("Factory Info", var());
    String vendor = factoryInfo.getProperty ("Vendor", "Unknown").toString();
    String moduleVersion = json.getProperty ("Version", "").toString();

    auto classes = json.getProperty ("Classes", var());
    if (! classes.isArray())
        return false;

    for (int i = 0; i < classes.getArray()->size(); ++i)
    {
        auto cls = classes.getArray()->getReference (i);
        String category = cls.getProperty ("Category", "").toString();

        // Only add "Audio Module Class" entries (skip controller classes)
        if (category != "Audio Module Class")
            continue;

        auto* desc = results.add (new PluginDescription());
        desc->name = cls.getProperty ("Name", "Unknown").toString();
        desc->manufacturerName = cls.getProperty ("Vendor", vendor).toString();
        desc->version = cls.getProperty ("Version", moduleVersion).toString();
        desc->pluginFormatName = "VST3";
        desc->fileOrIdentifier = identifier;
        desc->descriptiveName = desc->name;
        desc->numInputChannels = 2;
        desc->numOutputChannels = 2;

        // Parse sub-categories
        auto subCats = cls.getProperty ("Sub Categories", var());
        StringArray catStrings;
        if (subCats.isArray())
        {
            for (int j = 0; j < subCats.getArray()->size(); ++j)
                catStrings.add (subCats.getArray()->getReference (j).toString());
        }

        if (catStrings.contains ("Instrument") || catStrings.contains ("Synth"))
        {
            desc->category = "Instrument";
            desc->isInstrument = true;
        }
        else if (catStrings.contains ("Fx") || catStrings.contains ("Effect"))
        {
            desc->category = catStrings.joinIntoString ("|");
            desc->isInstrument = false;
        }
        else
        {
            desc->category = catStrings.joinIntoString ("|");
            desc->isInstrument = false;
        }
    }

    return results.size() > 0;
}

void PluginScanner::quickScanForPlugins (const StringArray& formats)
{
    cancelFlag = 0;
    int totalAdded = 0;

    for (const auto& formatName : formats)
    {
        if (cancelFlag.get() != 0)
            break;

        if (auto* format = _manager.getAudioPluginFormat (formatName))
        {
            auto identifiers = format->searchPathsForPlugins (
                detail::readSearchPath (*_manager.props, formatName),
                true,
                true);

            float step = 0.f;
            for (const auto& ID : identifiers)
            {
                if (cancelFlag.get() != 0)
                    break;

                if (shouldSkipPluginScan (ID))
                {
                    step += 1.f;
                    continue;
                }

                if (list.getTypeForFile (ID) || list.getBlacklistedFiles().contains (ID))
                {
                    step += 1.f;
                    continue;
                }

                listeners.call (&Listener::audioPluginScanStarted,
                                format->getNameOfPluginFromIdentifier (ID));

                bool added = false;

#if JUCE_MAC
                // AU: read from AudioComponent registry (instant, no loading)
                if (formatName == "AudioUnit")
                {
                    PluginDescription desc;
                    if (readAUMetadata (ID, desc))
                    {
                        list.removeFromBlacklist (ID);
                        list.addType (desc);
                        ++totalAdded;
                        added = true;
                    }
                }
#endif

                // VST3: read from moduleinfo.json (fast file read, no loading)
                if (! added && formatName == "VST3")
                {
                    OwnedArray<PluginDescription> descriptions;
                    if (readVST3ModuleInfo (ID, descriptions))
                    {
                        for (auto* d : descriptions)
                        {
                            list.removeFromBlacklist (d->fileOrIdentifier);
                            list.addType (*d);
                            ++totalAdded;
                        }
                        added = true;
                    }
                }

                // Fallback: create minimal description from filename
                if (! added)
                {
                    PluginDescription desc;
                    desc.pluginFormatName = formatName;
                    desc.fileOrIdentifier = ID;
                    desc.name = format->getNameOfPluginFromIdentifier (ID);
                    desc.descriptiveName = desc.name;
                    desc.manufacturerName = "Unknown";
                    desc.category = "Unknown";
                    desc.numInputChannels = 2;
                    desc.numOutputChannels = 2;
                    desc.isInstrument = false;
                    list.removeFromBlacklist (ID);
                    list.addType (desc);
                    ++totalAdded;
                }

                listeners.call (&Listener::audioPluginScanProgress,
                                ++step / static_cast<float> (identifiers.size()));
            }
        }
        else if (auto* provider = _manager.getProvider (formatName))
        {
            auto providerIds = provider->findTypes (
                detail::readSearchPath (*_manager.props, formatName),
                true,
                false);

            for (const auto& ID : providerIds)
            {
                if (list.getTypeForFile (ID))
                    continue;

                OwnedArray<PluginDescription> descriptions;
                provider->scan (ID, descriptions);

                for (auto* d : descriptions)
                {
                    list.addType (*d);
                    ++totalAdded;
                }
            }
        }
    }

    cancelFlag = 0;
    Logger::writeToLog ("Quick scan complete: " + String (totalAdded) + " plugins added");
    listeners.call (&Listener::audioPluginScanFinished);
}

//==============================================================================
using UnverifiedPluginMap = HashMap<String, StringArray>;
using UnverifiedPluginPaths = HashMap<String, FileSearchPath>;

class UnverifiedPlugins : private Thread
{
public:
    UnverifiedPlugins() : Thread ("euvpl") {}

    ~UnverifiedPlugins()
    {
        cancelFlag.set (1);
        if (isThreadRunning())
            stopThread (1000);
    }

    void searchForPlugins (PropertiesFile* props)
    {
        if (isThreadRunning())
            return;

        if (props)
        {
            for (const auto& f : Util::compiledAudioPluginFormats())
            {
                const auto key = String (Settings::lastPluginScanPathPrefix) + f;
                paths.set (f, FileSearchPath (props->getValue (key)));
            }
        }
        else
        {
            paths.clear();
        }

        startThread (Thread::Priority::background);
    }

    void getPlugins (OwnedArray<PluginDescription>& plugs,
                     const String& format,
                     KnownPluginList& list)
    {
        ScopedLock sl (lock);
        if (plugins.contains (format))
        {
            for (const auto& file : plugins.getReference (format))
            {
                if (nullptr != list.getTypeForFile (file))
                    continue;
                auto* const desc = plugs.add (new PluginDescription());
                desc->pluginFormatName = format;
                desc->fileOrIdentifier = file;
            }
        }
    }

private:
    friend class Thread;
    CriticalSection lock;
    UnverifiedPluginMap plugins;
    UnverifiedPluginPaths paths;

    struct Item
    {
        String name;
        String identifier;
    };

    Atomic<int> cancelFlag;

    void run() override
    {
        cancelFlag.set (0);

        PluginManager pluginManager;
        pluginManager.addDefaultFormats();
        auto& manager (pluginManager.getAudioPluginFormats());

        // JUCE Formats.
        for (int i = 0; i < manager.getNumFormats(); ++i)
        {
            if (threadShouldExit() || cancelFlag.get() != 0)
                break;

            auto* const format = manager.getFormat (i);
            FileSearchPath path = paths[format->getName()];
            path.addPath (format->getDefaultLocationsToSearch());
            const auto found = format->searchPathsForPlugins (path, true, true);

            ScopedLock sl (lock);
            plugins.set (format->getName(), found);
        }

        // Element Node Providers
        auto& factory = pluginManager.getNodeFactory();
        for (auto provider : factory.providers())
        {
            // FIXME: CLAP and other unverified support.
        }

        cancelFlag.set (0);
    }
};

//==============================================================================
class PluginManager::Private : public PluginScanner::Listener
{
public:
    Private (PluginManager& o)
        : owner (o)
    {
        deadAudioPlugins = DataPath::applicationDataDir().getChildFile (EL_DEAD_AUDIO_PLUGINS_FILENAME);
        usageTracker = std::make_unique<PluginUsageTracker> (allPlugins);
    }

    ~Private() {}

    /** returns true if anything changed in the plugin list */
    bool updateBlacklistedAudioPlugins()
    {
        bool didSomething = false;

        if (deadAudioPlugins.existsAsFile())
        {
            PluginDirectoryScanner::applyBlacklistingsFromDeadMansPedal (
                allPlugins, deadAudioPlugins);
            deadAudioPlugins.deleteFile();
            didSomething = true;
        }

        return didSomething;
    }

    void searchUnverifiedPlugins (PropertiesFile* props)
    {
        unverified.searchForPlugins (props);
    }

    void getUnverifiedPlugins (const String& format, OwnedArray<PluginDescription>& plugs)
    {
        unverified.getPlugins (plugs, format, allPlugins);
    }

private:
    friend class PluginManager;
    PluginManager& owner;
    AudioPluginFormatManager formats;
    KnownPluginList allPlugins;
    File deadAudioPlugins;
    UnverifiedPlugins unverified;
    NodeFactory nodes;
    double sampleRate = 44100.0;
    int blockSize = 512;
    std::unique_ptr<PluginScanner> scanner;
    bool hasAddedFormats = false;
    std::unique_ptr<PluginUsageTracker> usageTracker;

    void scanAudioPlugins (const StringArray& names)
    {
        if (scanner)
        {
            scanner->removeListener (this);
            scanner->cancel();
            scanner = nullptr;
        }

        StringArray formatsToScan = names;
        if (formatsToScan.isEmpty())
        {
            for (int i = 0; i < formats.getNumFormats(); ++i)
                if (formats.getFormat (i)->getName() != "Element" && formats.getFormat (i)->canScanForPlugins())
                    formatsToScan.add (formats.getFormat (i)->getName());
            formatsToScan.add ("LV2");
        }

        scanner = std::make_unique<PluginScanner> (owner);
        scanner->addListener (this);
        scanner->scanForAudioPlugins (formatsToScan);
    }

    void audioPluginScanFinished() override
    {
        {
            ScopedLock sl (lock);
            scannedPlugin = String();
            progress = -1.0;
        }

        owner.scanFinished();
    }

    void audioPluginScanStarted (const String& plugin) override
    {
        DBG ("[element] scanning: " << plugin);
        ScopedLock sl (lock);
        scannedPlugin = plugin;
    }

    void audioPluginScanProgress (const float p) override
    {
        ScopedLock sl (lock);
        progress = p;
    }

    String getScannedPluginName() const
    {
        ScopedLock sl (lock);
        return scannedPlugin;
    }

private:
    CriticalSection lock;
    String scannedPlugin;
    float progress = -1.0;
};

PluginManager::PluginManager()
{
    priv.reset (new Private (*this));
}

PluginManager::~PluginManager()
{
    priv.reset();
}

void PluginManager::addDefaultFormats()
{
    if (priv->hasAddedFormats)
        return;

    auto& audioPlugs = getAudioPluginFormats();
    for (const auto& fmt : Util::compiledAudioPluginFormats())
    {
        if (fmt == "")
            continue;

#if JUCE_MAC && JUCE_PLUGINHOST_AU
        else if (fmt == "AudioUnit")
            audioPlugs.addFormat (std::make_unique<AudioUnitPluginFormat>());
#endif

#if JUCE_PLUGINHOST_VST
        else if (fmt == "VST")
            audioPlugs.addFormat (std::make_unique<VSTPluginFormat>());
#endif

#if JUCE_PLUGINHOST_VST3
        else if (fmt == "VST3")
            audioPlugs.addFormat (std::make_unique<VST3PluginFormat>());
#endif

#if JUCE_PLUGINHOST_LV2
        else if (fmt == "LV2")
            audioPlugs.addFormat (std::make_unique<LV2PluginFormat>());
#endif

#if JUCE_PLUGINHOST_LADSPA
        else if (fmt == "LADSPA")
            audioPlugs.addFormat (std::make_unique<LADSPAPluginFormat>());
#endif
    }

    priv->hasAddedFormats = true;
}

void PluginManager::addFormat (std::unique_ptr<juce::AudioPluginFormat> fmt)
{
    getAudioPluginFormats().addFormat (std::move (fmt));
}

NodeFactory& PluginManager::getNodeFactory() { return priv->nodes; }

FileSearchPath PluginManager::defaultSearchPath (juce::StringRef formatName) const noexcept
{
    if (auto apf = getAudioPluginFormat (formatName))
        return apf->getDefaultLocationsToSearch();

    for (auto provider : priv->nodes.providers())
        if (provider->format() == formatName)
            return provider->defaultSearchPath();

    return {};
}

void PluginManager::addToKnownPlugins (const PluginDescription& desc)
{
    auto* const format = getAudioPluginFormat (desc.pluginFormatName);
    auto& list = priv->allPlugins;
    if (format && nullptr == list.getTypeForFile (desc.fileOrIdentifier))
    {
        OwnedArray<PluginDescription> dummy;
        list.removeFromBlacklist (desc.fileOrIdentifier);
        list.scanAndAddFile (desc.fileOrIdentifier, true, dummy, *format);
    }
}

void PluginManager::searchUnverifiedPlugins()
{
    if (! priv)
        return;
    priv->searchUnverifiedPlugins (this->props);
}

juce::ChildProcessWorker* PluginManager::createAudioPluginScannerWorker()
{
    return new PluginScannerWorker();
}

PluginScanner* PluginManager::createAudioPluginScanner()
{
    auto* scanner = new PluginScanner (*this);
    return scanner;
}

PluginScanner* PluginManager::getBackgroundAudioPluginScanner()
{
    if (! priv)
        return nullptr;

    if (! priv->scanner)
    {
        priv->scanner.reset (createAudioPluginScanner());
        priv->scanner->addListener (priv.get());
    }

    return priv->scanner.get();
}

bool PluginManager::isScanningAudioPlugins()
{
    return (priv && priv->scanner) ? priv->scanner->isScanning()
                                   : false;
}

AudioPluginInstance* PluginManager::createAudioPlugin (const PluginDescription& desc, String& errorMsg)
{
    return getAudioPluginFormats().createPluginInstance (
                                      desc, priv->sampleRate, priv->blockSize, errorMsg)
        .release();
}

Processor* PluginManager::createGraphNode (const PluginDescription& desc, String& errorMsg)
{
    errorMsg.clear();
    auto& nodes = getNodeFactory();
    if (auto* const plugin = createAudioPlugin (desc, errorMsg))
    {
        plugin->enableAllBuses();
        return NodeFactory::wrap (plugin);
    }

    if (desc.pluginFormatName == "Internal")
    {
        errorMsg.clear();
        if (desc.fileOrIdentifier == "audio.input")
            return new IONode (IONode::audioInputNode);
        else if (desc.fileOrIdentifier == "audio.output")
            return new IONode (IONode::audioOutputNode);
        else if (desc.fileOrIdentifier == "midi.input")
            return new IONode (IONode::midiInputNode);
        else if (desc.fileOrIdentifier == "midi.output")
            return new IONode (IONode::midiOutputNode);
        else
        {
            errorMsg = "Could not create internal node";
            errorMsg << ": " << desc.fileOrIdentifier;
            return nullptr;
        }
    }

    errorMsg.clear();
    if (! isAudioPluginFormatSupported (desc.pluginFormatName))
    {
        errorMsg = desc.name;
        errorMsg << ": invalid format: " << desc.pluginFormatName;
        return nullptr;
    }

    if (auto* node = nodes.instantiate (desc))
        return node;

    errorMsg = desc.name;
    errorMsg << " not found.";
    return nullptr;
}

Processor* PluginManager::createSandboxedGraphNode (const PluginDescription& desc, String& errorMsg)
{
    // DISABLED: sandbox IPC is fundamentally broken — process-local semaphores,
    // shared memory issues. Always return null to fall back to in-process loading.
    errorMsg = "Sandbox mode is currently disabled due to IPC stability issues";
    juce::Logger::writeToLog ("[element] sandbox disabled: loading " + desc.name + " in-process");
    return nullptr;

    errorMsg.clear();

    // Only create sandboxed nodes for external plugins (not internal nodes)
    if (desc.pluginFormatName == "Internal")
    {
        errorMsg = "Internal nodes cannot be sandboxed";
        return nullptr;
    }

    // Check if the plugin format is supported
    if (! isAudioPluginFormatSupported (desc.pluginFormatName))
    {
        errorMsg = desc.name;
        errorMsg << ": invalid format: " << desc.pluginFormatName;
        return nullptr;
    }

    // Create the sandboxed processor node
    auto* node = new SandboxedProcessorNode (desc, *this);

    // Check if sandbox launched successfully
    if (node->getSandboxState() == SandboxHost::State::Error ||
        node->getSandboxState() == SandboxHost::State::Idle)
    {
        errorMsg = "Failed to create sandboxed node for: " + desc.name;
        delete node;
        return nullptr;
    }

    return node;
}

AudioPluginFormatManager& PluginManager::getAudioPluginFormats()
{
    return priv->formats;
}

bool PluginManager::isAudioPluginFormatSupported (const String& name) const
{
    auto& fmts = priv->formats;
    for (int i = 0; i < fmts.getNumFormats(); ++i)
        if (fmts.getFormat (i)->getName() == name)
            return true;
    auto& nodes = priv->nodes;
    for (const auto* provider : nodes.providers())
        if (provider->format() == name)
            return true;
    return false;
}

AudioPluginFormat* PluginManager::getAudioPluginFormat (const String& name) const
{
    auto& manager = priv->formats;
    for (int i = 0; i < manager.getNumFormats(); ++i)
    {
        AudioPluginFormat* fmt = manager.getFormat (i);
        if (fmt && fmt->getName() == name)
            return fmt;
    }

    return nullptr;
}

KnownPluginList& PluginManager::getKnownPlugins() { return priv->allPlugins; }
const KnownPluginList& PluginManager::getKnownPlugins() const { return priv->allPlugins; }
const File& PluginManager::getDeadAudioPluginsFile() const { return priv->deadAudioPlugins; }
PluginUsageTracker& PluginManager::getUsageTracker() { return *priv->usageTracker; }

void PluginManager::saveUserPlugins (ApplicationProperties& settings)
{
    setPropertiesFile (settings.getUserSettings());
    if (auto elm = priv->allPlugins.createXml())
    {
        const auto file = detail::pluginsXmlFile();
        elm->writeTo (file);

        // Keep a backup so plugin data survives crashes or failed updates
        const auto backup = file.withFileExtension ("xml.backup");
        file.copyFileTo (backup);
    }
}

void PluginManager::restoreUserPlugins (ApplicationProperties& settings)
{
    setPropertiesFile (settings.getUserSettings());
    if (props == nullptr)
        return;

    // transfer old plugins to new.
    if (auto xml = props->getXmlValue (detail::pluginListKey()))
    {
        xml->writeTo (detail::pluginsXmlFile());
        props->removeValue (detail::pluginListKey());
    }

    const auto file = detail::pluginsXmlFile();
    auto xml = XmlDocument::parse (file);

    // Fall back to backup if primary is missing or corrupt
    if (! xml)
    {
        const auto backup = file.withFileExtension ("xml.backup");
        if (backup.existsAsFile())
        {
            xml = XmlDocument::parse (backup);
            if (xml)
            {
                // Restore the primary from backup
                backup.copyFileTo (file);
                std::clog << "[element] restored plugin list from backup" << std::endl;
            }
        }
    }

    if (xml)
        restoreUserPlugins (*xml);
    settings.saveIfNeeded();
}

void PluginManager::restoreUserPlugins (const XmlElement& xml)
{
    priv->allPlugins.recreateFromXml (xml);
    scanInternalPlugins();
    priv->updateBlacklistedAudioPlugins();
    if (props == nullptr)
        return;
}

void PluginManager::setPlayConfig (double sampleRate, int blockSize)
{
    priv->sampleRate = sampleRate;
    priv->blockSize = blockSize;
}

void PluginManager::scanAudioPlugins (const StringArray& names)
{
    if (! priv)
        return;

    scanInternalPlugins();

    if (isScanningAudioPlugins())
        return;

    priv->scanAudioPlugins (names);
}

String PluginManager::getCurrentlyScannedPluginName() const
{
    return (priv) ? priv->getScannedPluginName() : String();
}

void PluginManager::scanInternalPlugins()
{
    auto& nodes = priv->nodes;

    auto& known = getKnownPlugins();
    const auto types = known.getTypes();
    for (const auto& t : types)
    {
        if (t.pluginFormatName != EL_NODE_FORMAT_NAME)
            continue;
        known.removeType (t);
        known.removeFromBlacklist (t.fileOrIdentifier);
        known.removeFromBlacklist (t.createIdentifierString());
    }

    OwnedArray<PluginDescription> ds;
    for (const auto& nodeTypeId : nodes.knownIDs())
    {
        nodes.getPluginDescriptions (ds, nodeTypeId);
    }
    for (const auto* const d : ds)
    {
        known.removeType (*d);
        known.removeFromBlacklist (d->fileOrIdentifier);
        known.removeFromBlacklist (d->createIdentifierString());
        known.addType (*d);
    }
}

void PluginManager::getUnverifiedPlugins (const String& formatName, OwnedArray<PluginDescription>& plugins)
{
    priv->getUnverifiedPlugins (formatName, plugins);
    if (plugins.isEmpty())
        priv->searchUnverifiedPlugins (props);
}

void PluginManager::scanFinished()
{
    // this file is deprecated and should just be removed.
    if (PluginScanner::getWorkerPluginListFile().existsAsFile())
        PluginScanner::getWorkerPluginListFile().deleteFile();
    sendChangeMessage();
}

void PluginManager::restoreAudioPlugins (const File& file)
{
    if (auto xml = XmlDocument::parse (file))
        restoreUserPlugins (*xml);
}

const File& PluginScanner::getWorkerPluginListFile()
{
    static File _listTempFile;
#if 0
    if (_listTempFile == File())
        _listTempFile = File::createTempFile ("el-pm-worker");
#else
    if (_listTempFile == File())
        _listTempFile = DataPath::applicationDataDir().getChildFile (EL_PLUGIN_SCANNER_SLAVE_LIST_PATH);
#endif
    return _listTempFile;
}

PluginDescription PluginManager::findDescriptionFor (const Node& node) const
{
    PluginDescription desc;

    const String identifierString (node.getProperty (tags::pluginIdentifierString).toString());
    bool wasFound = false;

    if (identifierString.isNotEmpty())
    {
        // fastest, find by identifer string in known plugins
        if (const auto type = getKnownPlugins().getTypeForIdentifierString (
                node.getProperty (tags::pluginIdentifierString).toString()))
        {
            desc = *type;
            wasFound = true;
        }
    }

    if (! wasFound)
    {
        // Manually load and search
        desc.pluginFormatName = node.getProperty (tags::format).toString();
        desc.fileOrIdentifier = node.getProperty (tags::identifier).toString();

        OwnedArray<PluginDescription> types;
        if (auto* format = getAudioPluginFormat (desc.pluginFormatName))
            format->findAllTypesForFile (types, desc.fileOrIdentifier);
        if (! types.isEmpty())
        {
            desc = *types.getFirst();
            wasFound = true;
        }
    }

    if (! wasFound)
    {
        // last resort
        node.getPluginDescription (desc);
    }

    return desc;
}

void PluginManager::saveDefaultNode (const Node& node)
{
    if (! node.isValid())
        return;
    auto desc = findDescriptionFor (node);
    auto file = DataPath::applicationDataDir().getChildFile ("nodes");
    file = file.getChildFile (desc.createIdentifierString());
    file.createDirectory();
    file = file.getChildFile ("default.eln");
    node.writeToFile (file);
}

Node PluginManager::getDefaultNode (const PluginDescription& desc) const
{
    auto file = DataPath::applicationDataDir().getChildFile ("nodes");
    file = file.getChildFile (desc.createIdentifierString());
    file = file.getChildFile ("default.eln");
    if (! file.existsAsFile())
        return Node();
    auto data = Node::parse (file);
    auto node = Node (Node::resetIds (data), false);
    Node::sanitizeProperties (data);
    data.removeProperty (tags::name, nullptr);
    return node;
}

NodeProvider* PluginManager::getProvider (const String& format) noexcept
{
    for (auto provider : getNodeFactory().providers())
        if (provider->format() == format)
            return provider;
    return nullptr;
}

} // namespace element
