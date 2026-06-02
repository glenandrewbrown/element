// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/engine.hpp>
#include <element/ui.hpp>
#include <element/plugins.hpp>
#include <element/settings.hpp>

#include "services/sessionservice.hpp"
#include "services/mappingservice.hpp"
#include "services/deviceservice.hpp"
#include "engine/internalformat.hpp"

#include "pluginprocessor.hpp"
#include "plugineditor.hpp"
#include "verbose_log.hpp"

#include <algorithm>
#include <atomic>
#include <mutex>
#include <vector>

// PLUGIN_DBG is kept as a no-op for legacy call sites; new diagnostics go
// through the EL_LOG* macros which write to element-verbose.log regardless
// of debug/release builds. PLUGIN_DBG remains available for high-volume
// per-block prints that should never ship.
// #define PLUGIN_DBG(msg) DBG(msg)
#define PLUGIN_DBG(msg)

namespace element {

using namespace juce;

//=============================================================================
// U11 — process-wide registry of live PluginProcessor instances (Branch-A,
// in-process). Populated in the ctor, cleared in the dtor. Message-thread /
// host-side only — guarded by a small mutex, never used on the audio thread.
// Scan-safe: registration is just push_back(this) (no Context), so a DAW
// metadata-scan ctor is cheap; the dtor's erase self-corrects scan-only
// constructions.
static std::mutex sInstanceRegistryMutex;
static std::vector<PluginProcessor*> sInstanceRegistry;
static std::atomic<uint64_t> sNextInstanceId { 1 };

//=============================================================================
static void setPluginMissingNodeProperties (const ValueTree& tree)
{
    if (tree.hasType (types::Node))
    {
        const Node node (tree, true);
        ignoreUnused (node);
    }
    else if (tree.hasType (types::Controller) || tree.hasType (types::Control))
    {
        PLUGIN_DBG ("[element] set missing for: " << tree.getProperty (tags::name).toString());
    }
}

//=============================================================================
struct PluginProcessor::Latency : public juce::Timer
{
    Latency (PluginProcessor& p) : plugin (p) {}

    void timerCallback() override
    {
        plugin.calculateLatencySamples();
    }

    PluginProcessor& plugin;
};

//=============================================================================
#define enginectl context->services().find<EngineService>()
#define guictl context->services().find<GuiService>()
#define sessionctl context->services().find<SessionService>()
#define mapsctl context->services().find<MappingService>()
#define devsctl context->services().find<DeviceService>()

//=============================================================================
PluginProcessor::PluginProcessor (Variant instanceType, int numBuses)
    : AudioProcessor (createDefaultBuses (instanceType, jmax (0, numBuses))),
      variant (instanceType)
{
    EL_LOG_THREAD ("AU", "PluginProcessor ctor variant=" << (int) instanceType
                          << " numBuses=" << numBuses
                          << " this=" << juce::String::toHexString ((juce::pointer_sized_int) this));

    setRateAndBufferSizeDetails (sampleRate, bufferSize);
    numIns = getTotalNumInputChannels();
    numOuts = getTotalNumOutputChannels();

    for (int i = 0; i < 8; ++i)
    {
        auto* param = new PerformanceParameter (i);
        jassert (param->getVersionHint() > 0);
        addParameter (param);
        perfparams.add (param);
    }

    prepared = controllerActive = false;
    shouldProcess.set (false);
    asyncPrepare.reset (new AsyncPrepare (*this));
    asyncStateRestore.reset (new AsyncStateRestore (*this));
    _latency = std::make_unique<Latency> (*this);

    // Do NOT initialize the full Context here. During a host plugin scan,
    // the constructor is called just to query metadata (name, parameters,
    // bus layouts). Creating the entire Context (Lua VM, AudioEngine,
    // DeviceManager, PluginManager) is far too heavy and can crash the host.
    // Initialization is deferred to prepareToPlay() or setStateInformation().

    // U11 — register this live instance (scan-safe: NO Context touched here).
    instanceId = (int) sNextInstanceId.fetch_add (1);
    {
        std::lock_guard<std::mutex> lk (sInstanceRegistryMutex);
        sInstanceRegistry.push_back (this);
    }
}

PluginProcessor::~PluginProcessor()
{
    // U11 — unregister FIRST so no bridge call can observe a half-destructed
    // instance (self-corrects scan-only ctors that never built a Context).
    {
        std::lock_guard<std::mutex> lk (sInstanceRegistryMutex);
        auto it = std::find (sInstanceRegistry.begin(), sInstanceRegistry.end(), this);
        if (it != sInstanceRegistry.end())
            sInstanceRegistry.erase (it);
    }

    EL_LOG_THREAD ("AU", "PluginProcessor dtor begin"
                          << " this=" << juce::String::toHexString ((juce::pointer_sized_int) this)
                          << " controllerActive=" << (int) controllerActive
                          << " prepared=" << (int) prepared);

    asyncPrepare.reset();
    asyncStateRestore.reset();

    for (auto* param : perfparams)
        param->clearNode();
    perfparams.clear();

    if (controllerActive && context)
        context->services().deactivate();

    if (engine)
        engine->releaseExternalResources();

    if (context)
    {
        if (auto session = context->session())
            session->clear();
        context->setEngine (nullptr);
    }

    engine = nullptr;
    context = nullptr;

    EL_LOG ("AU", "PluginProcessor dtor done"
                   << " this=" << juce::String::toHexString ((juce::pointer_sized_int) this));
}

const String PluginProcessor::getName() const
{
    switch (variant)
    {
        case Instrument:
            return "Element";
            break;
        case Effect:
            return "Element FX";
            break;
        case MidiEffect:
            return "Element MFX";
            break;
        default:
            break;
    }

    jassertfalse;
    return "Element";
}

//=============================================================================
// U11 — multi-instance registry accessors (message thread only).
juce::Array<PluginProcessor*> PluginProcessor::snapshotRegistry()
{
    juce::Array<PluginProcessor*> out;
    std::lock_guard<std::mutex> lk (sInstanceRegistryMutex);
    out.ensureStorageAllocated ((int) sInstanceRegistry.size());
    for (auto* p : sInstanceRegistry)
        out.add (p);
    return out;
}

juce::String PluginProcessor::getInstanceDisplayName() const
{
    // Resolve live so the name self-corrects: a scan-only ctor has no Context
    // and falls back honestly rather than ever showing a stale/fake project.
    if (context != nullptr)
    {
        if (auto session = context->session())
        {
            const auto n = session->getName();
            if (n.isNotEmpty() && n != "Invalid Session")
                return n;
        }
        return getName();
    }
    return getName() + " (scanning)";
}

bool PluginProcessor::hasActiveGraph() const
{
    if (context == nullptr)
        return false;
    if (auto session = context->session())
        return session->getCurrentGraph().isGraph();
    return false;
}

bool PluginProcessor::acceptsMidi() const { return true; }
bool PluginProcessor::producesMidi() const { return true; }
bool PluginProcessor::isMidiEffect() const { return variant == MidiEffect; }

double PluginProcessor::getTailLengthSeconds() const { return 0.0; }

int PluginProcessor::getNumPrograms() { return 1; }
int PluginProcessor::getCurrentProgram() { return 0; }
void PluginProcessor::setCurrentProgram (int index) { ignoreUnused (index); }
const String PluginProcessor::getProgramName (int index)
{
    ignoreUnused (index);
    return { "Default" };
}
void PluginProcessor::changeProgramName (int index, const String& newName) { ignoreUnused (index, newName); }

void PluginProcessor::prepareToPlay (double sr, int bs)
{
    EL_LOG_THREAD ("AU", "prepareToPlay sr=" << sr << " bs=" << bs
                          << " ins=" << getTotalNumInputChannels()
                          << " outs=" << getTotalNumOutputChannels()
                          << " prepared=" << (int) prepared);

    if (! MessageManager::getInstance()->isThisTheMessageThread())
    {
        EL_LOG ("AU", "prepareToPlay deferred to message thread via AsyncPrepare");
        asyncPrepare->prepare (sr, bs);
        shouldProcess.set (false);
        return;
    }

    if (! controllerActive)
        initialize();

    PLUGIN_DBG ("[element] prepare to play: prepared=" << (int) prepared << " sampleRate: " << sampleRate << " buff: " << bufferSize << " numIns: " << numIns << " numOuts: " << numOuts);

    const bool channelCountsChanged = numIns != getTotalNumInputChannels()
                                      || numOuts != getTotalNumOutputChannels();
    const bool detailsChanged = sampleRate != sr || bufferSize != bs || channelCountsChanged;

    numIns = getTotalNumInputChannels();
    numOuts = getTotalNumOutputChannels();
    sampleRate = sr;
    bufferSize = bs;

    if (! prepared || detailsChanged)
    {
        prepared = true;

        auto& plugins (context->plugins());
        plugins.setPlayConfig (sampleRate, bufferSize);

        if (detailsChanged)
        {
            PLUGIN_DBG ("[element] details changed: " << sampleRate << " : " << bufferSize << " : " << getTotalNumInputChannels() << "/" << getTotalNumOutputChannels());

            if (channelCountsChanged) // && preparedCount <= 0)
            {
                engine->releaseExternalResources();
                engine->prepareExternalPlayback (sampleRate, bufferSize, getTotalNumInputChannels(), getTotalNumOutputChannels());
                updateLatencySamples();
            }

            triggerAsyncUpdate();
            preparedCount++;
        }
    }

    updateLatencySamples();
    _latency->startTimer (1000);

    engine->sampleLatencyChanged.connect (
        std::bind (&PluginProcessor::updateLatencySamples, this));

    shouldProcess.set (true);
}

void PluginProcessor::releaseResources()
{
    EL_LOG_THREAD ("AU", "releaseResources prepared=" << (int) prepared);
    _latency->stopTimer();

    if (engine)
        engine->sampleLatencyChanged.disconnect_all_slots();
    if (prepared)
    {
        prepared = false;
    }
}

void PluginProcessor::reloadEngine()
{
    jassert (MessageManager::getInstance()->isThisTheMessageThread());

    const bool wasSuspended = isSuspended();
    suspendProcessing (true);

    auto session = context->session();
    session->saveGraphState();
    engine->releaseExternalResources();
    engine->prepareExternalPlayback (sampleRate, bufferSize, getTotalNumInputChannels(), getTotalNumOutputChannels());
    updateLatencySamples();

    session->restoreGraphState();
    enginectl->sessionReloaded();
    enginectl->syncModels();
    guictl->stabilizeContent();
    devsctl->refresh();

    suspendProcessing (wasSuspended);
}

void PluginProcessor::reset()
{
    PLUGIN_DBG ("[element] plugin reset");
}

bool PluginProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    bool supported = false;
    // clang-format off
    switch (variant)
    {
        case Instrument:
            // require at least a main output bus
            supported = layouts.outputBuses.size() > 0 && layouts.getNumChannels (false, 0) > 0;
            break;

        case Effect:
            // require at least a main input and output bus
            supported = layouts.inputBuses.size() > 0 && 
                layouts.getNumChannels (true, 0) > 0 && 
                layouts.outputBuses.size() > 0 && 
                layouts.getNumChannels (false, 0) > 0;
            break;

        case MidiEffect:
            // buses not supported in midi effect mode
        default:
            supported = false;
            break;
    }
    // clang-format on

    return supported;
}

void PluginProcessor::processBlock (AudioSampleBuffer& buffer, MidiBuffer& midi)
{
    ScopedNoDenormals noDenormals;

    if (! shouldProcess.get())
    {
        buffer.clear (0, buffer.getNumSamples());
        midi.clear();
        return;
    }

    if (auto* playhead = getPlayHead())
        if (engine->isUsingExternalClock())
            engine->processExternalPlayhead (playhead, buffer.getNumSamples());

    // clear garbage in extra output channels.
    for (int i = getTotalNumInputChannels(); i < getTotalNumOutputChannels(); ++i)
        buffer.clear (i, 0, buffer.getNumSamples());

    engine->processExternalBuffers (buffer, midi);
}

bool PluginProcessor::hasEditor() const { return true; }

AudioProcessorEditor* PluginProcessor::createEditor()
{
    EL_LOG_THREAD ("AU", "createEditor enter controllerActive=" << (int) controllerActive);

    // createEditor must run on the message thread (PluginEditor builds
    // JUCE Components and touches the GuiService). If a host violates that,
    // refuse to construct an editor rather than crash inside JUCE.
    jassert (MessageManager::getInstance()->isThisTheMessageThread());
    if (! MessageManager::getInstance()->isThisTheMessageThread())
    {
        EL_LOG_ERR ("AU", "createEditor called off message thread - refusing");
        return nullptr;
    }

    if (! controllerActive)
        initialize();

    // initialize() can early-return; a PluginEditor without a valid context
    // dereferences nullptr in its async update. Skip editor creation rather
    // than crash the host.
    if (! context)
    {
        EL_LOG_ERR ("AU", "createEditor: context still null after initialize - returning nullptr");
        return nullptr;
    }

    if (auto* gui = context->services().find<GuiService>())
        gui->stabilizeContent();

    auto* ed = new PluginEditor (*this);
    EL_LOG ("AU", "createEditor done"
                   << " editor=" << juce::String::toHexString ((juce::pointer_sized_int) ed));
    return ed;
}

void PluginProcessor::getStateInformation (MemoryBlock& destData)
{
    EL_LOG_THREAD ("AU", "getStateInformation enter controllerActive=" << (int) controllerActive);
    if (! controllerActive)
    {
        EL_LOG_WARN ("AU", "getStateInformation called before initialise - no state to save");
        return;
    }
    if (auto session = context->session())
    {
        session->saveGraphState();
        session->getValueTree()
            .setProperty ("pluginEditorBounds", editorBounds.toString(), nullptr)
            .setProperty ("editorKeyboardFocus", editorWantsKeyboard, nullptr)
            .setProperty ("forceZeroLatency", isForcingZeroLatency(), nullptr);

        if (auto engine = context->audio())
            if (auto mon = engine->getTransportMonitor())
                session->getValueTree().setProperty (
                    "pluginTransportPlaying", mon->playing.get(), nullptr);

        auto ppData = session->getValueTree().getOrCreateChildWithName ("perfParams", nullptr);
        ppData.removeAllChildren (nullptr);
        for (auto* const pp : perfparams)
        {
            if (! pp->haveNode())
                continue;
            ValueTree data ("perfParam");
            data.setProperty (tags::index, pp->getParameterIndex(), nullptr)
                .setProperty (tags::node, pp->getNode().getUuidString(), nullptr)
                .setProperty (tags::parameter, pp->getBoundParameter(), nullptr);
            ppData.appendChild (data, nullptr);
        }

        if (auto xml = std::unique_ptr<XmlElement> (session->createXml()))
            copyXmlToBinary (*xml, destData);
    }
}

void PluginProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    EL_LOG_THREAD ("AU", "setStateInformation enter sizeInBytes=" << sizeInBytes
                          << " prepared=" << (int) prepared
                          << " controllerActive=" << (int) controllerActive);

    // AU/VST3 hosts may invoke setStateInformation from a non-message thread
    // (Logic Pro's MAAudioEngine fires it from an idle timer). Our Context
    // construction depends on the message thread, so defer off-thread calls
    // back to the message thread before touching anything.
    if (! MessageManager::getInstance()->isThisTheMessageThread())
    {
        EL_LOG ("AU", "setStateInformation off message thread - deferring via AsyncStateRestore");
        if (asyncStateRestore != nullptr)
            asyncStateRestore->restore (data, sizeInBytes);
        else
            EL_LOG_ERR ("AU", "asyncStateRestore is null - state will be lost");
        return;
    }

    if (! controllerActive)
    {
        EL_LOG_WARN ("AU", "initialising during setStateInformation");
        initialize();
    }

    // initialize() can early-return (e.g. re-entrant call); without context
    // every subsequent dereference -- including context->session() -- crashes
    // with KERN_INVALID_ADDRESS at a small offset. Bail out safely instead.
    if (! context)
    {
        EL_LOG_ERR ("AU", "setStateInformation: context still null after initialize - aborting");
        jassertfalse;
        return;
    }

    auto session = context->session();
    auto engine = context->audio();
    if (! session)
        return;

    mapsctl->learn (false);

    String error;
    if (auto e = getXmlFromBinary (data, sizeInBytes))
    {
        ValueTree newData (ValueTree::fromXml (*e));
        if (newData.isValid() && (int) newData.getProperty (tags::version, -1) != EL_SESSION_VERSION)
        {
            std::clog << "[element] migrate session...\n";
            newData = Session::migrate (newData, error);
        }

        if (error.isEmpty() && (! newData.isValid() || ! newData.hasType (types::Session)))
        {
            error = "Not a valid session file or type";
            if (newData.isValid())
                error << ": el." << newData.getType().toString();
        }

        if (error.isEmpty() && ! session->loadData (newData))
            error = "Could not load session data";
    }
    else
    {
        error = "Not a valid session file";
    }

    if (error.isNotEmpty())
    {
        PLUGIN_DBG ("[element] plugin failed restoring state: " << error);
    }
    else
    {
        session->forEach ([&] (const ValueTree& d) {
            if (! d.hasType (types::Node))
                return;
            const Node node (d, true);
            juce::ignoreUnused (node);
        });

        typedef Rectangle<int> RI;
        editorBounds = RI::fromString (session->getProperty (
                                                  "pluginEditorBounds", RI().toString())
                                           .toString());
        editorWantsKeyboard = (bool) session->getProperty ("editorKeyboardFocus", false);
        setForceZeroLatency ((bool) session->getProperty ("forceZeroLatency", isForcingZeroLatency()));
        if (engine && ! engine->isUsingExternalClock())
            engine->setPlaying ((bool) session->getProperty ("pluginTransportPlaying", false));
        session->forEach (setPluginMissingNodeProperties);
        for (auto* const param : perfparams)
            param->clearNode();
    }

    triggerAsyncUpdate();

    if (prepared)
    {
        PLUGIN_DBG ("[element] plugin restored state while already prepared");
    }
    else
    {
        PLUGIN_DBG ("[element] plugin tried to restore state when not prepared");
    }
}

void PluginProcessor::numChannelsChanged()
{
    PLUGIN_DBG ("[element] num channels changed: " << getTotalNumInputChannels() << "/" << getTotalNumOutputChannels());
}

void PluginProcessor::numBusesChanged()
{
    PLUGIN_DBG ("[element] num buses changed: " << getBusCount (true) << "/" << getBusCount (false));
}

void PluginProcessor::processorLayoutsChanged()
{
    PLUGIN_DBG ("[element] layout changed: prepared: " << (int) prepared);
    triggerAsyncUpdate();
}

void PluginProcessor::initialize()
{
    if (controllerActive)
    {
        EL_LOG_V ("AU", "initialize: already active, skipping");
        return;
    }
    if (! MessageManager::getInstance()->isThisTheMessageThread())
    {
        EL_LOG_WARN ("AU", "initialize called off message thread - skipping (context remains null)");
        return;
    }
    EL_LOG ("AU", "initialize begin");
    bool wasProc = shouldProcess.get();
    shouldProcess.set (false);

    context.reset (new Context (RunMode::Plugin));
    context->setEngine (new AudioEngine (*context, RunMode::Plugin));
    engine = context->audio();
    SessionPtr session = context->session();
    Settings& settings (context->settings());
    PluginManager& plugins (context->plugins());

    if (auto scanner = plugins.getBackgroundAudioPluginScanner())
    {
#if JUCE_MAC
        auto scannerExe = File ("/Applications/Element.app/Contents/MacOS/Element");
#elif JUCE_WINDOWS
        auto scannerExe = File ("c:\\Program Files\\Kushview\\Element\\bin\\element.exe");
#else
        auto scannerExe = File ("/usr/local/bin/element");
        if (! scannerExe.existsAsFile())
            scannerExe = File ("/usr/bin/element");
#endif
        scanner->setScannerExe (scannerExe);
    }

    engine->applySettings (settings);

    plugins.restoreUserPlugins (settings);
    plugins.setPropertiesFile (settings.getUserSettings());

    // The hosts WILL release and prepare the plugin frequently at any given
    // time. plugins are handled different by each one, so it's best to keep
    // our engine running at all times to reduce massive plugin unloads and
    // re-loads back to back.
    engine->prepareExternalPlayback (sampleRate, bufferSize, getTotalNumInputChannels(), getTotalNumOutputChannels());
    session->clear();
    session->addGraph (Node::createDefaultGraph ("Graph 1"), true);

    auto& services (context->services());
    services.activate();
    controllerActive = true;

    enginectl->sessionReloaded();
    mapsctl->learn (false);
    devsctl->refresh();

    shouldProcess.set (wasProc);
    EL_LOG ("AU", "initialize done controllerActive=1");
}

void PluginProcessor::handleAsyncUpdate()
{
    PLUGIN_DBG ("[element] handle async update");
    initialize();
    reloadEngine();

    auto session = context->session();
    const auto ppData = session->getValueTree().getChildWithName ("perfParams");

    for (int i = 0; i < ppData.getNumChildren(); ++i)
    {
        const auto data = ppData.getChild (i);
        const int index = (int) data[tags::index];
        if (! isPositiveAndBelow (index, 8))
            continue;
        const int parameter = (int) data[tags::parameter];
        const String uuid = data[tags::node].toString();
        if (uuid.isEmpty())
            continue;
        const Node node = session->findNodeById (Uuid (uuid));
        auto* const param = perfparams[index];
        if (param != nullptr && node.isValid())
            param->bindToNode (node, parameter);
    }

    sessionctl->sigSessionLoaded();
    onPerfParamsChanged();
}

bool PluginProcessor::isNodeBoundToAnyPerformanceParameter (const Node& boundNode, int boundParam) const
{
    if (! boundNode.isValid() || boundParam == Processor::NoParameter)
        return false;
    for (auto* const pp : perfparams)
        if (boundNode == pp->getNode() && boundParam == pp->getBoundParameter())
            return true;
    return false;
}

PopupMenu PluginProcessor::getPerformanceParameterMenu (int perfParam)
{
    auto* const paramObj = perfparams[perfParam];
    if (nullptr == paramObj)
        return PopupMenu();

    auto session = context->session();
    PopupMenu menu;
    int menuIdx = 0;
    menuMap.clearQuick (true);

    for (int i = 0; i < session->getNumGraphs(); ++i)
    {
        auto graph = session->getGraph (i);
        for (int j = 0; j < graph.getNumNodes(); ++j)
        {
            PopupMenu submenu;
            auto node = graph.getNode (j);
            ProcessorPtr ptr = node.getObject();
            if (ptr == nullptr)
                continue;
            auto* proc = ptr->getAudioProcessor();
            if (proc == nullptr)
                continue;

            for (int k = 0; k < proc->getParameters().size(); ++k)
            {
                auto* const param = proc->getParameters()[k];
                if (! param->isAutomatable())
                    continue;

                const bool isMine = paramObj->getNode() == node && k == paramObj->getBoundParameter();
                const bool isBound = isNodeBoundToAnyPerformanceParameter (node, k);
                submenu.addItem (++menuIdx, param->getName (100), ! isBound || isMine, isMine);

                auto* const item = menuMap.add (new PerfParamMenuItem());
                item->node = node;
                item->parameter = k;
            }

            if (submenu.getNumItems() > 0)
                menu.addSubMenu (node.getName(), submenu);
        }
    }

    if (menu.getNumItems() > 0 && isNodeBoundToAnyPerformanceParameter (paramObj->getNode(), paramObj->getBoundParameter()))
    {
        menu.addSeparator();
        menu.addItem (++menuIdx, "Unlink");
        auto* const item = menuMap.add (new PerfParamMenuItem());
        item->node = paramObj->getNode();
        item->parameter = paramObj->getBoundParameter();
        item->unlink = true;
    }

    return menu;
}

void PluginProcessor::handlePerformanceParameterResult (int result, int perfParam)
{
    auto* const param = perfparams[perfParam];
    if (! param)
        return;

    if (auto* item = menuMap[result - 1])
    {
        if (item->unlink)
        {
            param->clearNode();
        }
        else
        {
            const bool wasAlreadyBound = param->haveNode() && param->getNode() == item->node && param->getBoundParameter() == item->parameter;
            param->clearNode();
            if (! wasAlreadyBound)
                param->bindToNode (item->node, item->parameter);
        }

        param->updateValue();
    }

    onPerfParamsChanged();
    menuMap.clearQuick (true);
}

void PluginProcessor::setForceZeroLatency (bool force)
{
    if (force == forceZeroLatency)
        return;
    forceZeroLatency = force;
    if (forceZeroLatency)
        updateLatencySamples();
    else
        calculateLatencySamples();
}

int PluginProcessor::calculateLatencySamples() const
{
    if (forceZeroLatency || engine == nullptr)
        return 0;
    engine->updateExternalLatencySamples();
    return engine->getExternalLatencySamples();
}

void PluginProcessor::updateLatencySamples()
{
    int latency = 0;
    if (! forceZeroLatency && engine != nullptr)
    {
        latency = engine->getExternalLatencySamples();
    }
    setLatencySamples (latency);
}

//=============================================================================
AudioProcessor::BusesProperties PluginProcessor::createDefaultBuses (PluginProcessor::Variant variant, int numAux)
{
    if (variant == PluginProcessor::MidiEffect)
        return {};

    const auto stereo = AudioChannelSet::stereo();

    AudioProcessor::BusesProperties buses;
    buses.addBus (true, "Main", stereo, variant == PluginProcessor::Effect);
    buses.addBus (false, "Main", stereo, true);
    for (int i = 0; i < numAux; ++i)
    {
        String name = "Aux ";
        name << String (i + 1);
        buses.addBus (true, name, stereo, false);
        buses.addBus (false, name, stereo, false);
    }

    return buses;
}

} // namespace element
