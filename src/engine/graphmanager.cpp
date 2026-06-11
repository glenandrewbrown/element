// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/context.hpp>
#include <element/plugins.hpp>
#include <element/settings.hpp>

#include "engine/graphmanager.hpp"
#include "nodes/audioprocessor.hpp"
#include "nodes/audiorouter.hpp"
#include "nodes/midichannelsplitter.hpp"
#include "nodes/midiprogrammap.hpp"
#include "nodes/placeholder.hpp"
#include "nodes/sandboxedprocessor.hpp" // P1: live UI adds route through the sandbox
#include "engine/rootgraph.hpp"

#include "utils.hpp"

namespace element {

static void showFailedInstantiationAlert (const PluginDescription& desc, const bool async = false)
{
    String header = "Plugin Instantiation Failed";
    String message = desc.name;
    message << " could not be instantiated";

    if (async)
        AlertWindow::showMessageBoxAsync (AlertWindow::WarningIcon, header, message);
    else
        AlertWindow::showMessageBox (AlertWindow::WarningIcon, header, message);
}

//==============================================================================
static void removeCoordinatesProperties (ValueTree data)
{
    data.removeProperty (tags::relativeX, nullptr);
    data.removeProperty (tags::relativeY, nullptr);
}

static void removeWindowProperties (ValueTree data)
{
    data.removeProperty (tags::windowX, nullptr);
    data.removeProperty (tags::windowY, nullptr);
    data.removeProperty (tags::windowVisible, nullptr);
}

//==============================================================================
/** This enforces correct IO nodes based on the graph processor's settings
    in virtual methods like 'acceptsMidi' and 'getTotalNumInputChannels'
    It uses the controller for all node operations so the model will
    stay in sync.
  */
struct IONodeEnforcer
{
    IONodeEnforcer (GraphManager& m)
        : manager (m)
    {
        addMissingIONodes();
    }

private:
    GraphManager& manager;
    void addMissingIONodes()
    {
        auto& graph (manager.getGraph());
        Node model (manager.getGraphModel());

        const bool wantsAudioIn = graph.getNumPorts (PortType::Audio, true) > 0;
        const bool wantsAudioOut = graph.getNumPorts (PortType::Audio, false) > 0;
        const bool wantsMidiIn = graph.getNumPorts (PortType::Midi, true) > 0;
        const bool wantsMidiOut = graph.getNumPorts (PortType::Midi, false) > 0;

        ProcessorPtr ioNodes[IONode::numDeviceTypes];
        for (int i = 0; i < manager.getNumNodes(); ++i)
        {
            ProcessorPtr node = manager.getNode (i);
            if (auto* ioProc = dynamic_cast<IONode*> (node.get()))
                ioNodes[ioProc->getType()] = node;
        }

        Array<uint32> nodesToRemove;

        for (int t = 0; t < IONode::numDeviceTypes; ++t)
        {
            if (nullptr != ioNodes[t])
            {
                if (t == IONode::audioInputNode && ! wantsAudioIn)
                    nodesToRemove.add (ioNodes[t]->nodeId);
                if (t == IONode::audioOutputNode && ! wantsAudioOut)
                    nodesToRemove.add (ioNodes[t]->nodeId);
                ;
                if (t == IONode::midiInputNode && ! wantsMidiIn)
                    nodesToRemove.add (ioNodes[t]->nodeId);
                ;
                if (t == IONode::midiOutputNode && ! wantsMidiOut)
                    nodesToRemove.add (ioNodes[t]->nodeId);
                ;
                continue;
            }

            if (t == IONode::audioInputNode && ! wantsAudioIn)
                continue;
            if (t == IONode::audioOutputNode && ! wantsAudioOut)
                continue;
            if (t == IONode::midiInputNode && ! wantsMidiIn)
                continue;
            if (t == IONode::midiOutputNode && ! wantsMidiOut)
                continue;

            PluginDescription desc;
            desc.pluginFormatName = "Internal";
            double rx = 0.5f, ry = 0.5f;
            switch (t)
            {
                case IONode::audioInputNode:
                    desc.fileOrIdentifier = "audio.input";
                    // N1: GraphManager::addNode stamps tags::name from desc.name
                    // (graphmanager.cpp:449), which the snapshot + SessionTree
                    // render. IONodeEnforcer left it empty → IO blocks showed
                    // "(unnamed)". Give each IO device node the friendly label
                    // (matches Node::createDefaultGraph — node.cpp:195).
                    desc.name = "Audio In";
                    rx = .25;
                    ry = .25;
                    break;
                case IONode::audioOutputNode:
                    desc.fileOrIdentifier = "audio.output";
                    desc.name = "Audio Out";
                    rx = .25;
                    ry = .75;
                    break;
                case IONode::midiInputNode:
                    desc.fileOrIdentifier = "midi.input";
                    desc.name = "MIDI In";
                    rx = .75;
                    ry = .25;
                    break;
                case IONode::midiOutputNode:
                    desc.fileOrIdentifier = "midi.output";
                    desc.name = "MIDI Out";
                    rx = .75;
                    ry = .75;
                    break;
            }

            auto nodeId = manager.addNode (&desc, rx, ry);
            ioNodes[t] = manager.getNodeForId (nodeId);
            jassert (ioNodes[t] != nullptr);
        }

        for (const auto& nodeId : nodesToRemove)
            manager.removeNode (nodeId);

        model.resetPorts();
    }
};

//==============================================================================
class NodeModelUpdater : public ReferenceCountedObject
{
public:
    NodeModelUpdater (GraphManager& m, const ValueTree& d, Processor* o)
        : manager (m), data (d), object (o)
    {
        jassert (object != nullptr);
        if (object)
            portsChangedConnection = object->portsChanged.connect (
                std::bind (&NodeModelUpdater::onPortsChanged, this));
    }

    ~NodeModelUpdater()
    {
        portsChangedConnection.disconnect();
    }

private:
    GraphManager& manager;
    ValueTree data;
    ProcessorPtr object;
    SignalConnection portsChangedConnection;

    void onPortsChanged()
    {
        const auto newPorts = object->createPortsData();
        int index = data.indexOf (data.getChildWithName (tags::ports));
        if (newPorts.isValid())
        {
            if (index >= 0)
                data.removeChild (index, nullptr);
            else
                index = -1;

            data.addChild (newPorts, index, nullptr);
            manager.removeIllegalConnections();
        }
        if (object->isGraph())
        {
            IONodeEnforcer enforce (manager);
        }
        manager.syncArcsModel();
    }

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (NodeModelUpdater)
};

//==============================================================================
class GraphManager::Binding
{
public:
    Binding() = delete;
    Binding (GraphManager& g, ProcessorPtr o, const Node& n)
        : owner (g),
          object (o),
          node (n)
    {
        data = node.data();
        setDataProperties();

        if (node.getNodeType() == types::Graph && object && object->isGraph())
        {
            auto sub = dynamic_cast<GraphNode*> (object.get());
            jassert (sub);
            manager = std::make_unique<GraphManager> (*sub, owner.pluginManager);
            manager->setNodeModel (node);
            IONodeEnforcer addIO (*manager);
        }
        else
        {
            if (node.getNodeType() != types::Graph)
            {
                DBG ("[element] data type is not a graph");
            }
            if (object && ! object->isGraph())
            {
                DBG ("[element] object is not a graph type");
            }
        }
    }

    ~Binding()
    {
        if (manager != nullptr)
        {
            manager.reset();
        }

        node = Node();
        Node::sanitizeRuntimeProperties (data);
        data = ValueTree();
        object = nullptr;
    }

    GraphManager* getSubGraphManager() const { return manager.get(); }

    void setDataProperties()
    {
        if (! data.isValid() || object == nullptr)
            return;
        data.setProperty (tags::id, static_cast<int64> (object->nodeId), nullptr)
            .setProperty (tags::object, object.get(), nullptr);

        // Task 3.A (name single-source): tags::name is the node's display name and
        // the SINGLE field the webview snapshot emits (element_webview_host.cpp
        // → n.getName()), shown identically on the canvas Block title AND the
        // inspector header. The authoritative source is the catalog
        // PluginDescription.name stamped by GraphManager::addNode
        // (graphmanager.cpp:458, desc->name) and any later user rename (Cmd+R).
        // Binding fires for sub-graphs/Containers and on session load; only SEED
        // the name from object->getName() when none is present yet, NEVER clobber
        // an existing catalog/user name with the Processor's reported name — that
        // would be a SECOND emit source and could diverge the two surfaces.
        if (! data.hasProperty (tags::name) || data.getProperty (tags::name).toString().isEmpty())
        {
            // BUG C: a SandboxedProcessorNode reports "<plugin> (Sandboxed)" — strip
            // that internal suffix and path/extension noise so the seeded display
            // name is the clean catalog name ("Kontakt 8"), never the wrapper label.
            const String seeded (cleanPluginDisplayName (
                object->getName().upToLastOccurrenceOf (" (Sandboxed)", false, false).trim()));
            if (seeded.isNotEmpty())
                data.setProperty (tags::name, seeded, nullptr);
        }
    }

private:
    friend class GraphManager;
    GraphManager& owner;
    ProcessorPtr object;
    Node node;
    ValueTree data;
    std::unique_ptr<GraphManager> manager;
    [[maybe_unused]] UndoManager* undo = nullptr;
};

//==============================================================================
GraphManager::GraphManager (GraphNode& pg, PluginManager& pm)
    : pluginManager (pm), processor (pg), lastUID (0)
{
    // NOTE: the warm worker pool (T7) is deliberately NOT primed here — a
    // GraphManager exists in many headless/unit-test contexts where spawning
    // helpers is noise. The pool self-primes on first sandboxed use:
    // SandboxWorkerPool::claim() triggers replenishAsync() on every claim
    // (hit or miss), so a session load containing sandboxed nodes leaves a
    // warm worker ready for the next live add.
}

GraphManager::~GraphManager()
{
    // Drain the deferred-launch pool FIRST: interrupt + join any in-flight worker
    // handshake job so it cannot run against torn-down members. The job captures a
    // WeakReference<GraphManager> + a node ProcessorPtr, so a job that already
    // posted its finishLaunch callAsync is still safe (the WeakReference nulls),
    // but joining here keeps the running handshake from racing teardown.
    sandboxLaunchPool.removeAllJobs (true, 5000);

    // Make sure to dereference Processor's so we don't leak memory
    // If you get warnings by juce's leak detector about graph related
    // objects, then there's probably "object" properties lingering that
    // are referenced in the model;
    Node::sanitizeRuntimeProperties (graph, true);
    graph = arcs = nodes = ValueTree();
}

uint32 GraphManager::getNextUID() noexcept
{
    return ++lastUID;
}

int GraphManager::getNumNodes() const noexcept { return processor.getNumNodes(); }
const ProcessorPtr GraphManager::getNode (const int index) const noexcept { return processor.getNode (index); }

const ProcessorPtr GraphManager::getNodeForId (const uint32 uid) const noexcept
{
    return processor.getNodeForId (uid);
}

const Node GraphManager::getNodeModelForId (const uint32 nodeId) const noexcept
{
    return Node (nodes.getChildWithProperty (tags::id, static_cast<int64> (nodeId)), false);
}

GraphManager* GraphManager::findGraphManagerForGraph (const Node& graph) const noexcept
{
    if (isManaging (graph))
        return const_cast<GraphManager*> (this);

    for (auto* binding : bindings)
    {
        if (auto* m1 = binding->getSubGraphManager())
            if (auto* m2 = m1->findGraphManagerForGraph (graph))
                return m2;
    }

    return nullptr;
}

bool GraphManager::contains (const uint32 nodeId) const
{
    return processor.getNodeForId (nodeId) != nullptr;
}

Processor* GraphManager::createFilter (const PluginDescription* desc, double x, double y, uint32 nodeId)
{
    String errorMessage;
    std::unique_ptr<Processor> node;

    // True when sandboxing was REQUESTED but the worker failed to launch/load and
    // we fell back to the in-process path. We surface this to the UI after the node
    // is added (when its final nodeId — the id the webview resolves to a Block UUID —
    // is known), so the user learns they are NOT crash-protected.
    bool sandboxFellBackInProcess = false;

    // R1 — out-of-process sandbox route. Gated by Settings::shouldSandboxPlugin()
    // which DEFAULTS TO 0/Disabled (in-process). When the user opts in via
    // Preferences → Plugins → Sandbox Mode, the plugin instantiates inside a
    // SandboxWorker child process for crash isolation. Sandboxing is best-effort
    // here: if the worker fails to launch/load, we fall back to the normal
    // in-process path so the plugin still loads (default-on hardening is R6).
    {
        const Settings settings;
        if (settings.shouldSandboxPlugin (*desc))
        {
            String sandboxError;
            node.reset (pluginManager.createSandboxedGraphNode (*desc, sandboxError));
            if (node == nullptr)
            {
                sandboxFellBackInProcess = true;
                std::cerr << "[element] sandbox node creation failed for "
                          << desc->name.toStdString() << ": "
                          << sandboxError.toStdString()
                          << " — falling back to in-process" << std::endl;
            }
        }
    }

    if (node == nullptr)
        node.reset (pluginManager.createGraphNode (*desc, errorMessage));

    if (errorMessage.isNotEmpty())
    {
        std::cerr << "[element] error creating audio plugin: " << errorMessage.toStdString() << std::endl;
        jassert (node == nullptr);
    }

    if (node == nullptr && errorMessage.isEmpty())
    {
        jassertfalse;
        errorMessage = "Could not find node";
    }

    auto* added = node != nullptr ? processor.addNode (node.release(), nodeId) : nullptr;

    // Honesty signal: the user asked for sandbox isolation but the worker failed
    // and the plugin is running in-process (unprotected). Emit on the real,
    // post-add nodeId (addNode assigns it when the incoming id is 0/auto) so the
    // webview can resolve it to a Block and show the "in-process — unprotected"
    // badge. Message-thread node creation — safe to signal here (not the audio thread).
    if (sandboxFellBackInProcess && added != nullptr)
        pluginManager.emitSandboxEvent (added->nodeId,
                                        PluginManager::SandboxEvent::FellBackInProcess,
                                        desc->name + " running in-process — sandbox unavailable");

    return added;
}

Processor* GraphManager::createPlaceholder (const Node& node)
{
    auto* ph = new PlaceholderProcessor();
    ph->setupFor (node, processor.getSampleRate(), processor.getBlockSize());
    return processor.addNode (new AudioProcessorNode (node.getNodeId(), ph), node.getNodeId());
}

//==============================================================================
uint32 GraphManager::addNode (const Node& newNode)
{
    if (! newNode.isValid())
    {
        AlertWindow::showMessageBox (AlertWindow::WarningIcon,
                                     TRANS ("Couldn't create Node"),
                                     "Cannot instantiate node without a description");
        return EL_INVALID_NODE;
    }

    uint32 nodeId = EL_INVALID_NODE;
    const PluginDescription desc (pluginManager.findDescriptionFor (newNode));
    if (auto* node = createFilter (&desc, 0, 0, newNode.hasProperty (tags::id) ? newNode.getNodeId() : 0))
    {
        nodeId = node->nodeId;
        ValueTree data = newNode.data().createCopy();
        removeCoordinatesProperties (data);
        removeWindowProperties (data);

        data.setProperty (tags::id, static_cast<int64> (nodeId), nullptr)
            .setProperty (tags::object, node, nullptr)
            .setProperty (tags::type, node->getTypeString(), nullptr)
            .setProperty (tags::pluginIdentifierString, desc.createIdentifierString(), nullptr);

        setupNode (data, node);

        nodes.addChild (data, -1, nullptr);
        changed();
    }
    else
    {
        nodeId = EL_INVALID_NODE;
        AlertWindow::showMessageBox (AlertWindow::WarningIcon, "Couldn't create filter", "The plugin could not be instantiated");
    }

    return nodeId;
}

// Wave-3 Phase 4: apply the real-processor-specific node setup that historically
// ran synchronously in addNode(desc,...) AFTER the plugin instance existed:
// stereo-by-default bus negotiation + hiding the Control/CV/Video/Event ports on
// the Block. Factored out so BOTH the synchronous (internal/IO/Container) add and
// the async loading→ready swap share ONE implementation (no divergence).
static void applyAddedNodeProcessorSetup (GraphNode& processor, Processor* object, Node& node)
{
    PortArray pins, pouts;
    std::vector<PortType> toHide = {
        PortType::Control, PortType::CV, PortType::Video, PortType::Event
    };

    for (const auto& pt : toHide)
        node.getPorts (pins, pouts, pt);

    for (auto& c : pins)
        c.setHiddenOnBlock (true);
    for (auto& c : pouts)
        c.setHiddenOnBlock (true);

    if (auto* const proc = object->getAudioProcessor())
    {
        // try to use stereo by default on newly added plugins
        AudioProcessor::BusesLayout stereoInOut;
        stereoInOut.inputBuses.add (AudioChannelSet::stereo());
        stereoInOut.outputBuses.add (AudioChannelSet::stereo());
        AudioProcessor::BusesLayout stereoOut;
        stereoOut.outputBuses.add (AudioChannelSet::stereo());
        AudioProcessor::BusesLayout* tryStereo = nullptr;
        const auto oldLayout = proc->getBusesLayout();

        if (proc->getTotalNumInputChannels() == 1 && proc->getTotalNumOutputChannels() == 1 && proc->checkBusesLayoutSupported (stereoInOut))
        {
            tryStereo = &stereoInOut;
        }
        else if (proc->getTotalNumInputChannels() == 0 && proc->getTotalNumOutputChannels() == 1 && proc->checkBusesLayoutSupported (stereoOut))
        {
            tryStereo = &stereoOut;
        }

        if (tryStereo != nullptr && proc->checkBusesLayoutSupported (*tryStereo))
        {
            proc->suspendProcessing (true);
            proc->releaseResources();

            if (! proc->setBusesLayout (*tryStereo))
                proc->setBusesLayout (oldLayout);

            proc->prepareToPlay (processor.getSampleRate(), processor.getBlockSize());
            proc->suspendProcessing (false);
        }
    }
}

uint32 GraphManager::addNode (const PluginDescription* desc, double rx, double ry, uint32 nodeId)
{
    if (! desc)
    {
        AlertWindow::showMessageBox (AlertWindow::WarningIcon,
                                     TRANS ("Couldn't create filter"),
                                     TRANS ("Cannot instantiate plugin without a description"));
        return EL_INVALID_NODE;
    }

    // Wave-3 Phase 4 — ASYNC LOAD path for EXTERNAL JUCE-format plugins only.
    // pluginManager.getAudioPluginFormat() returns non-null exactly for real
    // formats (VST3/AU/LV2/CLAP/VST) and null for "Internal"/NodeProvider/IO
    // nodes — which stay on the unchanged synchronous path below (they are cheap
    // to build, never blocked the message thread, and a placeholder would be
    // pointless). For an external plugin we add a transient LOADING placeholder
    // synchronously (stable FINAL uuid, zero connectable ports — placeholder.hpp
    // §setupFor derives 0 ports from the empty node), then kick the async
    // instantiation. The loading→ready swap (swapInLoadedProcessor) runs on the
    // JUCE message-thread callback and preserves the uuid (CRITICAL-1).
    //
    // P1 (2026-06-09): decide the sandbox route HERE, BEFORE the gate, so a live
    // UI add can go out-of-process (the historical collision: the gate used to
    // short-circuit to the in-process async path before shouldSandboxPlugin —
    // which lived only in createFilter/session-load — was ever consulted, so a
    // live-added plugin could NEVER be sandboxed). Both routes share the same
    // instant placeholder + uuid-preserving swap; only the instantiation kick
    // differs (in-process JUCE async vs out-of-process worker). Internal/IO nodes
    // (format == nullptr) are never sandboxed and stay on the synchronous path.
    if (pluginManager.getAudioPluginFormat (desc->pluginFormatName) != nullptr)
    {
        const bool sandbox = sandboxPolicyOverride ? sandboxPolicyOverride (*desc)
                                                   : Settings().shouldSandboxPlugin (*desc);
        return addExternalPluginAsync (*desc, rx, ry, nodeId, sandbox);
    }

    if (auto* object = createFilter (desc, rx, ry, nodeId))
    {
        nodeId = object->nodeId;
        ValueTree data = ! object->isGraph() ? ValueTree (types::Node)
                                             : Node::createDefaultGraph (desc->name).data();

        // UltraQA naming (CONTRACT 2): never stamp an EMPTY name. Internal/IO catalog
        // names are curated non-empty (InternalNodeNamingTests), but guard for defence
        // in depth so a blank desc->name can't land here as "" (which stabilizeProperty
        // would NOT heal to "Node" since the prop is already present — INV-naming §(b)).
        // Fall back desc->name → object name → descriptiveName, leaving node.cpp:495's
        // "Node" as the genuine last resort (only when no name is present at all).
        // cleanPluginName() strips path+extension from names like
        // "/Library/.../RX 10 De-reverb.vst3" that some scanners emit when the
        // PluginDescription.name field is empty (INV-naming §(c)).
        String syncName (resolvePluginDisplayName (*desc));
        if (syncName.isEmpty())
            syncName = cleanPluginDisplayName (object->getName());

        data.setProperty (tags::id, static_cast<int64> (nodeId), nullptr)
            .setProperty (tags::format, desc->pluginFormatName, nullptr)
            .setProperty (tags::identifier, desc->fileOrIdentifier, nullptr)
            .setProperty (tags::type, object->getTypeString(), nullptr);
        if (syncName.isNotEmpty())
            data.setProperty (tags::name, syncName, nullptr);
        data.setProperty (tags::object, object, nullptr)
            .setProperty (tags::updater, new NodeModelUpdater (*this, data, object), nullptr)
            .setProperty (tags::relativeX, rx, nullptr)
            .setProperty (tags::relativeY, ry, nullptr)
            .setProperty (tags::pluginIdentifierString,
                          desc->createIdentifierString(),
                          nullptr);

        Node node (data, true);
        jassert (node.getFormat().toString().isNotEmpty());
        jassert (node.getIdentifier().toString().isNotEmpty());
        node.resetPorts();

        if (node.isIONode())
        {
            node.getBlockValueTree().setProperty (tags::displayMode, "compact", nullptr);
        }

        applyAddedNodeProcessorSetup (processor, object, node);

        if (object->isSubGraph())
        {
            bindings.add (new Binding (*this, object, node));
        }

        // Seed a sensible ABSOLUTE position so webview-added nodes don't all
        // pile at the origin. addNode only receives relative coords (rx=ry=0.5
        // for webview adds), and buildActiveGraphJson reads getPosition()
        // (tags::x/tags::y); without an absolute seed every fresh add reports
        // (0,0). Spread by current node count in a grid. Message-thread only —
        // no audio-thread alloc/lock touched. Guard so an explicit position
        // already on `data` is never clobbered.
        if (! data.hasProperty (tags::x) && ! data.hasProperty (tags::y))
        {
            constexpr int columns = 4;
            const int slot = nodes.getNumChildren(); // 0-based: this child not added yet
            const double seedX = 80.0 + static_cast<double> (slot % columns) * 220.0;
            const double seedY = 80.0 + static_cast<double> (slot / columns) * 180.0;
            data.setProperty (tags::x, seedX, nullptr)
                .setProperty (tags::y, seedY, nullptr);
        }

        nodes.addChild (data, -1, nullptr);
        changed();
    }
    else
    {
        nodeId = EL_INVALID_NODE;
        showFailedInstantiationAlert (*desc, true);
    }

    return nodeId;
}

//==============================================================================
// P1 — message-thread poll-timer that watches ONE sandboxed node loading in its
// worker. JUCE Timers fire on the MESSAGE THREAD, so calling swapInLoadedProcessor
// from tick() is RT-correct by construction (no MessageManager::callAsync needed —
// the timer IS already on the thread the engine op-republish must run on).
//
// Ownership: the watcher holds the in-flight node as a ProcessorPtr. If the swap
// succeeds, swapInLoadedProcessor's engine addNode retains the node and the watcher
// removes itself (dropping its extra ref). If the GraphManager dies first, the
// OwnedArray<SandboxLoadWatcher> member destructs → the ProcessorPtr drops → the
// SandboxedProcessorNode dtor shuts the worker down exactly once. If the user
// deletes/undoes the loading node, swapInLoadedProcessor's resolve-by-uuid fails
// and the node is simply dropped (no resurrection) — same WeakReference + uuid
// guard the in-process path uses.
class GraphManager::SandboxLoadWatcher : private juce::Timer
{
public:
    SandboxLoadWatcher (GraphManager& owner,
                        ProcessorPtr node,
                        String finalUuid,
                        uint32 placeholderId,
                        PluginDescription desc)
        : manager (&owner),
          sandboxNode (std::move (node)),
          uuid (std::move (finalUuid)),
          phId (placeholderId),
          description (std::move (desc)),
          deadlineMs (juce::Time::getMillisecondCounter() + kLoadTimeoutMs)
    {
        // ~30Hz poll — well under the worker load time; cheap (3 atomic reads).
        startTimer (33);
    }

    ~SandboxLoadWatcher() override { stopTimer(); }

private:
    // Bounded so a worker that never reports loaded (stuck child) degrades to the
    // in-process fallback instead of leaving the Block "loading" forever. Generous
    // — heavy instruments (Kontakt ~20s) load well inside this; the worker does the
    // heavy work in its own process so the host is responsive throughout the wait.
    static constexpr int kLoadTimeoutMs = 60000;

    void finishAndRemove()
    {
        // Remove self from the owner's array → this object is deleted. Capture the
        // owner first; `this` is dead after the erase. Stop the timer immediately
        // so no re-entrant tick can fire during teardown.
        stopTimer();
        if (auto* m = manager.get())
        {
            for (int i = m->sandboxWatchers.size(); --i >= 0;)
            {
                if (m->sandboxWatchers.getUnchecked (i) == this)
                {
                    m->sandboxWatchers.remove (i); // deletes `this`
                    return;
                }
            }
        }
    }

    void fallbackInProcess (const juce::String& reason)
    {
        // Worker route failed AFTER the placeholder was shown (launch ok but load
        // crashed/failed, or the bounded deadline elapsed). Re-kick the SAME
        // placeholder uuid through the in-process async path so the plugin still
        // loads, and emit the honesty badge so the user knows they are unprotected.
        juce::Logger::writeToLog ("[sandbox-load] FALLBACK in-process \"" + description.name
                                  + "\" +" + juce::String (juce::Time::getMillisecondCounter()
                                                           - (deadlineMs - (juce::uint32) kLoadTimeoutMs))
                                  + "ms — " + reason);
        auto* m = manager.get();
        if (m == nullptr)
        {
            finishAndRemove();
            return;
        }

        // Resolve the placeholder's CURRENT engine id by uuid (the user may not
        // have touched it; phId is still valid unless the node was deleted).
        const ValueTree nodeData (m->nodes.getChildWithProperty (tags::uuid, uuid));
        if (! nodeData.isValid())
        {
            // Node was deleted/undone while loading — nothing to fall back to.
            finishAndRemove();
            return;
        }

        const uint32 currentId = (uint32) (int64) nodeData.getProperty (tags::id, (int64) phId);

        // Drop our worker reference BEFORE kicking the in-process load so the dead
        // worker tears down promptly (the node dtor shuts it down).
        sandboxNode = nullptr;

        m->kickInProcessFallback (uuid, currentId, description);
        finishAndRemove();
    }

    void timerCallback() override
    {
        // GraphManager gone (session reload/shutdown) — drop everything. The
        // ProcessorPtr release in our dtor shuts the worker down once.
        if (manager == nullptr)
        {
            finishAndRemove();
            return;
        }

        auto* node = dynamic_cast<SandboxedProcessorNode*> (sandboxNode.get());
        if (node == nullptr)
        {
            finishAndRemove();
            return;
        }

        // DEFERRED LAUNCH (T1/T2): the blocking worker handshake runs on a pool
        // thread; until it completes the node sits in NotStarted/InFlight. The host
        // State is Idle/Starting during that window — which must NOT be read as a
        // crash. Gate the fallback on the launch PHASE: only a definitively Failed
        // launch (handshake returned false) falls back; while it is still in flight
        // we keep waiting (bounded by the deadline below).
        const auto phase = node->getLaunchPhase();
        if (phase == SandboxedProcessorNode::LaunchPhase::Failed)
        {
            fallbackInProcess ("launch handshake failed");
            return;
        }
        if (phase == SandboxedProcessorNode::LaunchPhase::NotStarted
            || phase == SandboxedProcessorNode::LaunchPhase::InFlight)
        {
            // Worker not yet connected. Do not interpret Idle/Starting as a crash.
            // Bound the wait so a wedged handshake still degrades to in-process.
            if (juce::Time::getMillisecondCounter() > deadlineMs)
                fallbackInProcess ("launch deadline elapsed before handshake completed");
            return;
        }

        // Launch SUCCEEDED — the worker is connected and loading the plugin. From
        // here the host State transitions drive the outcome as before.
        const auto state = node->getSandboxState();

        // Worker died, or a launch that briefly looked ok went Error → fall back.
        if (state == SandboxHost::State::Crashed
            || state == SandboxHost::State::Idle
            || state == SandboxHost::State::Error)
        {
            fallbackInProcess ("worker state "
                               + juce::String (static_cast<int> (state))
                               + " (crashed/idle/error) after launch");
            return;
        }

        // READY: the worker reported PluginLoaded (state Active, isPluginLoaded
        // true). PluginInfo (real ports) follows immediately on the wire; the
        // NodeModelUpdater installed by the swap's setupNode re-syncs the model
        // ports when it lands, so cables become attachable a tick later even if
        // the swap runs before PluginInfo. Run the IDENTICAL uuid-preserving swap.
        //
        // Belt-and-suspenders (T1 item 5): require the Loaded/Active observation to
        // be STABLE across >=2 consecutive polls before swapping. State::Active
        // already implies the host's single post-launch prepare ran (handleWorker
        // Message::PluginLoaded gates pluginLoaded/Active on preparedSinceLaunch),
        // so this only guards against a transient first-observation glitch.
        // Gate the swap on the node's message-thread ports rebuild having
        // COMPLETED (arePortsSynced) — PluginInfo's params/ports work is
        // deferred to the message thread, and a swap that wins that race runs
        // setupNode/resetPorts against an EMPTY port list (live 2026-06-11:
        // "0 IN · 0 OUT" + tags::loading stuck forever). PluginInfo follows
        // PluginLoaded on the wire within ms, so this typically costs one
        // extra 33ms poll; a worker that never sends PluginInfo degrades to
        // the in-process fallback at the deadline like any other stall.
        if (node->isPluginLoaded() && state == SandboxHost::State::Active
            && node->arePortsSynced())
        {
            if (++stableLoadedPolls < 2)
                return; // wait one more poll to confirm a stable Loaded state

            juce::Logger::writeToLog ("[sandbox-load] swap \"" + description.name
                                      + "\" — block ready +"
                                      + juce::String (juce::Time::getMillisecondCounter()
                                                      - (deadlineMs - (juce::uint32) kLoadTimeoutMs))
                                      + "ms after kick");
            if (auto* m = manager.get())
            {
                // Re-resolve the placeholder's CURRENT engine id by uuid (stable
                // across the swap; the int id changes but the uuid does not).
                const ValueTree nodeData (m->nodes.getChildWithProperty (tags::uuid, uuid));
                const uint32 currentId = nodeData.isValid()
                    ? (uint32) (int64) nodeData.getProperty (tags::id, (int64) phId)
                    : phId;
                ProcessorPtr toSwap (sandboxNode); // keep alive across the swap
                m->swapInLoadedProcessor (uuid, currentId, toSwap, description);
            }
            finishAndRemove();
            return;
        }

        // Still launching/loading. Bound the wait so a stuck worker can't pin the
        // Block in "loading" forever — degrade to the in-process fallback. EXCEPT
        // while the worker REPORTS a load demonstrably in flight (LoadInProgress,
        // bounded host-side by EL_SANDBOX_LOAD_CEILING_MS): a heavy library
        // (Kontakt, cold cache) can legitimately take 60-120s, and killing it here
        // would degrade to an in-process load of the same heavy plugin = the
        // message-thread freeze again (RT-verifier finding 9, 2026-06-10). A worker
        // that stops reporting (hung) loses the grace at the ceiling and falls back.
        if (juce::Time::getMillisecondCounter() > deadlineMs
            && ! node->isWorkerLoadInProgress())
            fallbackInProcess ("load deadline elapsed with no worker load in progress");
    }

    juce::WeakReference<GraphManager> manager;
    ProcessorPtr sandboxNode;
    String uuid;
    uint32 phId;
    PluginDescription description;
    const juce::uint32 deadlineMs;
    int stableLoadedPolls = 0; // T1 item 5: require >=2 consecutive Loaded polls

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SandboxLoadWatcher)
};

bool GraphManager::installSessionLoadingPlaceholder (Node& node, const PluginDescription& desc)
{
    juce::ignoreUnused (desc);

    // Build a PlaceholderProcessor from the node's SAVED port topology so the saved
    // cables connect to it immediately during setNodeModel's arc loop (they then
    // survive the swap, which preserves the engine id + re-resolves arcs). Add it
    // under the node's existing (saved) engine id so arcs resolve to the right node.
    auto* ph = new PlaceholderProcessor();
    ph->setupFor (node, processor.getSampleRate(), processor.getBlockSize());
    auto* added = processor.addNode (new AudioProcessorNode (node.getNodeId(), ph), node.getNodeId());
    if (added == nullptr)
        return false; // caller falls through to the synchronous createFilter path

    // Stamp the engine object + a fresh updater for the placeholder, keep the saved
    // id, and mark the node transiently LOADING (stripped on save by
    // sanitizeProperties). uuid / position / persisted state are left untouched.
    ValueTree data (node.data());
    data.setProperty (tags::id, static_cast<int64> (added->nodeId), nullptr)
        .setProperty (tags::type, added->getTypeString(), nullptr)
        .setProperty (tags::object, added, nullptr)
        .setProperty (tags::updater, new NodeModelUpdater (*this, data, added), nullptr)
        .setProperty (tags::loading, true, nullptr);

    return true;
}

void GraphManager::kickSandboxedInstantiation (const String& finalUuid, uint32 placeholderId, const PluginDescription& desc)
{
    // TEST SEAM: deterministically simulate a worker launch failure so tests can
    // exercise kickInProcessFallback without depending on whether the helper binary
    // is present. Production always has forceWorkerLaunchFailure == false.
    if (forceWorkerLaunchFailure)
    {
        kickInProcessFallback (finalUuid, placeholderId, desc);
        return;
    }

    juce::Logger::writeToLog ("[sandbox-load] kick \"" + desc.name + "\" uuid=" + finalUuid);

    // Parked-instance ordering fix (2026-06-11): a node deleted shortly before
    // this add may still be alive inside RETIRED render ops (GraphNode defers
    // freeing swapped-out op arrays until a later rebuild — the C1 lifetime
    // rule). That node's destructor is what PARKS its loaded worker, so
    // reclaim now: otherwise claim() below runs one message-pump before the
    // park and a delete→re-add of the same plugin always misses the parked
    // instance (observed live: park logged 88 ms AFTER claim).
    processor.reclaimRetiredRenderOps();

    // ── Worker pool fast paths (2026-06-11) ──────────────────────────────────
    // Try the process-wide pool before any cold launch: a PARKED instance of
    // this very plugin (skips the entire load — instant ready) or a BLANK warm
    // worker (skips spawn + handshake, ~1.5-2.5 s). The watcher below drives
    // the identical uuid-preserving swap in every case; an adopted node starts
    // at LaunchPhase::Succeeded so the watcher goes straight to state checks.
    {
        bool wasLoaded = false;
        if (auto claimed = pluginManager.workerPool().claim (desc, wasLoaded))
        {
            auto* rawNode = new SandboxedProcessorNode (desc, pluginManager,
                                                        SandboxedProcessorNode::AdoptHost {},
                                                        std::move (claimed));
            ProcessorPtr sandboxNode (rawNode);
            sandboxWatchers.add (new SandboxLoadWatcher (*this, sandboxNode, finalUuid, placeholderId, desc));
            juce::ignoreUnused (wasLoaded);
            return;
        }
    }

    // Construct the sandboxed node WITHOUT launching (DeferLaunch) — the ctor is now
    // free of the blocking connectToPipe handshake. THE FREEZE FIX (T1): the
    // handshake (SandboxedProcessorNode::runLaunchHandshake →
    // ChildProcessCoordinator::launchWorkerProcess, bounded by EL_SANDBOX_TIMEOUT_MS)
    // is dispatched to sandboxLaunchPool (a background thread). The message thread
    // therefore returns to its loop immediately, no matter how slow the handshake is.
    auto* rawNode = new SandboxedProcessorNode (desc, pluginManager,
                                                SandboxedProcessorNode::DeferLaunch {});
    ProcessorPtr sandboxNode (rawNode);

    // Arm the launch on the MESSAGE THREAD (atomic state → Starting + LaunchPhase
    // InFlight). This is a non-blocking atomic arm, NOT the handshake. If the host
    // refuses (already launching — should not happen for a fresh node), fall back
    // immediately (no watcher armed yet → no double fallback).
    if (! rawNode->beginLaunch())
    {
        kickInProcessFallback (finalUuid, placeholderId, desc);
        return;
    }

    // Arm the watcher BEFORE dispatching the handshake job, so the readiness/
    // fallback poll is already running when the handshake completes. The watcher
    // gates on the node's LaunchPhase (InFlight → keep waiting; Failed → fall back),
    // so observing it during the launch window is safe.
    sandboxWatchers.add (new SandboxLoadWatcher (*this, sandboxNode, finalUuid, placeholderId, desc));

    // Dispatch the BLOCKING handshake to the pool. The job keeps the node alive via
    // a captured ProcessorPtr and NEVER touches the graph/nodes/ValueTrees — the
    // RT-threading contract (the message-thread watcher is the sole graph mutator).
    // The optional test stall proves the message thread did not block. On
    // completion it posts finishLaunch() back to the MESSAGE THREAD (loadPlugin's
    // non-atomic write must run there). A WeakReference makes a teardown-mid-launch
    // post a safe no-op; the captured node ProcessorPtr keeps the node alive for the
    // callAsync regardless.
    const int stallMs = forceSlowWorkerLaunchMs;
    juce::WeakReference<GraphManager> weakThis (this);
    ProcessorPtr nodeRef (sandboxNode);
    sandboxLaunchPool.addJob ([weakThis, nodeRef, stallMs]
    {
        if (stallMs > 0)
            juce::Thread::sleep (stallMs);

        auto* node = dynamic_cast<SandboxedProcessorNode*> (nodeRef.get());
        const bool ok = node != nullptr && node->runLaunchHandshake();

        juce::MessageManager::callAsync ([weakThis, nodeRef, ok]
        {
            if (weakThis == nullptr)
                return; // GraphManager gone — node released with nodeRef on scope exit.
            if (auto* n = dynamic_cast<SandboxedProcessorNode*> (nodeRef.get()))
                n->finishLaunch (ok);
        });
    });
}

void GraphManager::kickInProcessFallback (const String& finalUuid, uint32 currentId, const PluginDescription& desc)
{
    // Sandbox was requested but unavailable (worker won't launch, crashed on load,
    // or timed out). Re-kick the SAME placeholder uuid through the in-process async
    // path so the plugin still loads, then emit SandboxEvent::FellBackInProcess so
    // the webview shows the "in-process — unprotected" honesty badge. Mirrors the
    // synchronous fallback already in createFilter (session-load path).
    juce::WeakReference<GraphManager> weakThis (this);
    const String uuidCopy (finalUuid);
    const PluginDescription descCopy (desc);
    pluginManager.createGraphNodeAsync (descCopy,
        [weakThis, uuidCopy, currentId, descCopy] (Processor* realProcessor, const String& error) {
            ProcessorPtr real (realProcessor);
            juce::ignoreUnused (error);
            if (weakThis == nullptr)
                return; // GraphManager gone — instance released on scope exit.
            weakThis->swapInLoadedProcessor (uuidCopy, currentId, real, descCopy);
            if (real == nullptr)
                return;
            // Re-resolve the post-swap engine id by uuid (swapInLoadedProcessor
            // reassigns the integer id) so the badge lands on the right Block.
            const ValueTree nd (weakThis->nodes.getChildWithProperty (tags::uuid, uuidCopy));
            const uint32 badgeId = nd.isValid()
                ? (uint32) (int64) nd.getProperty (tags::id, (int64) currentId)
                : currentId;
            weakThis->pluginManager.emitSandboxEvent (
                badgeId, PluginManager::SandboxEvent::FellBackInProcess,
                descCopy.name + " running in-process — sandbox unavailable");
        });
}

juce::String GraphManager::resolvePluginDisplayName (const PluginDescription& desc) const
{
    // Fast path: the catalog desc usually carries the real name already.
    String name (cleanPluginDisplayName (desc.name));
    if (name.isNotEmpty())
        return name;

    // Name-less desc (identifier-only / programmatic / session-load placeholder):
    // re-resolve the FULL catalog entry from the KnownPluginList. Try the precise
    // createIdentifierString() key first, then the looser fileOrIdentifier file
    // key (covers callers that only had the file path / a legacy identifier form).
    const auto& known = pluginManager.getKnownPlugins();
    if (desc.fileOrIdentifier.isNotEmpty())
    {
        if (const auto type = known.getTypeForIdentifierString (desc.createIdentifierString()))
            name = cleanPluginDisplayName (type->name);
        if (name.isEmpty())
            if (const auto type = known.getTypeForFile (desc.fileOrIdentifier))
                name = cleanPluginDisplayName (type->name);
    }
    if (name.isEmpty())
        name = cleanPluginDisplayName (desc.descriptiveName);
    return name;
}

uint32 GraphManager::addExternalPluginAsync (const PluginDescription& desc, double rx, double ry, uint32 nodeId, bool sandbox)
{
    // ── 1. Build + add the LOADING placeholder SYNCHRONOUSLY (instant, message
    //       thread). A fresh empty Node has no ports child, so
    //       PlaceholderProcessor::setupFor derives ZERO audio/MIDI ports — the
    //       node is not cable-targetable until ready (loading contract §3/§4). ──
    ValueTree data (types::Node);

    // Stamp the FINAL uuid NOW (not lazily) so the very first snapshot frame
    // carries the stable id and the React Block mounts once and never re-keys
    // across the loading→ready swap (CRITICAL-1 / contract §2.2).
    const String finalUuid (Uuid().toString());
    // UltraQA naming (CONTRACT 2): never stamp an EMPTY name onto the placeholder —
    // a plugin scanned with PluginDescription.name=="" would otherwise show as
    // "(unnamed)"/blank (INV-naming §(b)) and, pre-fix, the swap never corrected it.
    // Fall back desc.name → descriptiveName → "Plugin". swapInLoadedProcessor still
    // re-affirms from the real loaded name on ready.
    // cleanPluginName() additionally handles the path-like fallback (INV-naming §(c)).
    // resolvePluginDisplayName re-resolves the real catalog name ("Kontakt 8")
    // from the KnownPluginList when desc.name is empty (identifier-only adds), so
    // the loading Block shows the real name immediately and the swap re-affirm
    // below never has to fall back to the "Plugin"/"Node" sentinel.
    String placeholderName (resolvePluginDisplayName (desc));
    if (placeholderName.isEmpty())
        placeholderName = "Plugin";
    data.setProperty (tags::uuid, finalUuid, nullptr)
        .setProperty (tags::format, desc.pluginFormatName, nullptr)
        .setProperty (tags::identifier, desc.fileOrIdentifier, nullptr)
        .setProperty (tags::name, placeholderName, nullptr)
        .setProperty (tags::relativeX, rx, nullptr)
        .setProperty (tags::relativeY, ry, nullptr)
        .setProperty (tags::pluginIdentifierString, desc.createIdentifierString(), nullptr)
        // Transient runtime-only marker → host emits loadState:"loading" and the
        // Block renders the honest loading face. Stripped on save (sanitizeProperties).
        .setProperty (tags::loading, true, nullptr);

    Node placeholderNode (data, false);

    auto* ph = new PlaceholderProcessor();
    ph->setupFor (placeholderNode, processor.getSampleRate(), processor.getBlockSize());
    auto* added = processor.addNode (new AudioProcessorNode (0, ph), nodeId);
    if (added == nullptr)
    {
        showFailedInstantiationAlert (desc, true);
        return EL_INVALID_NODE;
    }

    nodeId = added->nodeId;
    data.setProperty (tags::id, static_cast<int64> (nodeId), nullptr)
        .setProperty (tags::type, added->getTypeString(), nullptr)
        .setProperty (tags::object, added, nullptr)
        .setProperty (tags::updater, new NodeModelUpdater (*this, data, added), nullptr);

    placeholderNode.resetPorts();

    // Absolute-position seed (same grid as the synchronous path) so the loading
    // Block appears where it should, not at the origin.
    if (! data.hasProperty (tags::x) && ! data.hasProperty (tags::y))
    {
        constexpr int columns = 4;
        const int slot = nodes.getNumChildren();
        const double seedX = 80.0 + static_cast<double> (slot % columns) * 220.0;
        const double seedY = 80.0 + static_cast<double> (slot / columns) * 180.0;
        data.setProperty (tags::x, seedX, nullptr)
            .setProperty (tags::y, seedY, nullptr);
    }

    nodes.addChild (data, -1, nullptr);
    changed();

    // ── 2. Kick the instantiation. Two routes share this SAME placeholder + the
    //       SAME uuid-preserving swapInLoadedProcessor; only the kick differs. ──
    if (sandbox)
    {
        // OUT-OF-PROCESS. The SandboxedProcessorNode ctor is non-blocking — it
        // launches the worker + fires an async loadPlugin that runs ENTIRELY in
        // the child process (P0 moved the worker's load onto the worker's own
        // message thread). The host message thread is therefore NEVER blocked by
        // the plugin's load — the freeze (#1) cannot happen on this route. We
        // keep the loading placeholder until the worker reports loaded, then run
        // the identical swap (preserving the visual loading→ready transition).
        kickSandboxedInstantiation (finalUuid, nodeId, desc);
        return nodeId;
    }

    // IN-PROCESS (Phase-4). The callback runs on the MESSAGE THREAD (JUCE
    // contract) → the swap is RT-safe. Guard with a WeakReference so a session
    // reload that destroys this GraphManager mid-load is a safe no-op (the real
    // instance is just dropped). NB: this path still funnels through JUCE's
    // message-thread createPluginInstance, so a heavy plugin DOES freeze the UI
    // here — that is why the P4 default routes all 3rd-party plugins to sandbox.
    juce::WeakReference<GraphManager> weakThis (this);
    const PluginDescription descCopy (desc);
    pluginManager.createGraphNodeAsync (descCopy, [weakThis, finalUuid, nodeId, descCopy] (Processor* realProcessor, const String& error) {
        // Adopt the raw Processor* into a ref-counted ProcessorPtr IMMEDIATELY so
        // ownership is safe on every path: if the GraphManager is gone (session
        // reload/shutdown) the ptr drops here and the instance is released exactly
        // once (no raw delete / no double-free); if it lives, addNode inside the
        // swap retains it and this local reference drops to the array's count.
        ProcessorPtr real (realProcessor);
        juce::ignoreUnused (error);
        if (weakThis == nullptr)
            return; // GraphManager gone — `real` releases the instance on scope exit.
        weakThis->swapInLoadedProcessor (finalUuid, nodeId, real, descCopy);
    });

    return nodeId;
}

void GraphManager::swapInLoadedProcessor (const String& nodeUuid, uint32 placeholderId, ProcessorPtr realProcessor, const PluginDescription& desc)
{
    // Resolve the model node by its STABLE uuid (NOT the engine nodeId — the
    // integer id is about to change). If the user deleted/undid the node while it
    // was loading, the lookup fails → drop the instance, no-op (contract §2.3).
    // `realProcessor` is a ProcessorPtr, so returning here releases it safely.
    ValueTree nodeData (nodes.getChildWithProperty (tags::uuid, nodeUuid));
    if (! nodeData.isValid())
        return;

    if (realProcessor == nullptr)
    {
        // Instantiation failed. Leave the node as a terminal placeholder but
        // clear the transient loading flag so it stops claiming to be loading
        // (it becomes an honest missing/placeholder block) and surface the error.
        nodeData.removeProperty (tags::loading, nullptr);

        // BUG D (crash/fallback naming): re-affirm tags::name from the stored
        // PluginDescription before the next snapshot push. This is the terminal
        // crash/fallback-failure path (e.g. the worker died, the in-process fallback
        // also failed). The live processor here is a bare PlaceholderProcessor whose
        // getName() is generic, so getDisplayName() would fall through to it and the
        // Block would show "Node"/"Placeholder" under the PLUGIN CRASHED banner — the
        // exact "node"-titled crash card Glen saw with Kontakt 8. Stamping the clean
        // catalog name keeps the Block identity ("Kontakt 8") readable while crashed.
        // Only fill when the current name is weak so a user rename is preserved.
        {
            const String current (nodeData.getProperty (tags::name).toString().trim());
            const bool weak = current.isEmpty()
                              || current.equalsIgnoreCase ("Node")
                              || current.equalsIgnoreCase ("Placeholder")
                              || current == "Plugin";
            if (weak)
            {
                // resolvePluginDisplayName re-derives the catalog name from the
                // KnownPluginList when desc.name is empty (keeps "Kontakt 8"
                // readable under the crash banner instead of "Node").
                const String resolved (resolvePluginDisplayName (desc));
                if (resolved.isNotEmpty())
                    nodeData.setProperty (tags::name, resolved, nullptr);
            }
        }

        changed();
        showFailedInstantiationAlert (desc, true);
        return;
    }

    Node node (nodeData, false);

    // ── Engine swap — DRIVES the lock-free op-republish via the existing engine
    //    API (graphnode.cpp). A loading node has ZERO cables, so removeNode
    //    disconnects nothing (no lossy port remap). removeNode → handleAsyncUpdate
    //    (sync rebuild); addNode → triggerAsyncUpdate (async rebuild) →
    //    buildRenderingSequence → activeRenderingOps.exchange(acq_rel). The audio
    //    thread reads load(acquire). NEVER touches activeRenderingOps directly.
    //    addNode adopts the processor into the GraphNode's ReferenceCountedArray;
    //    the local ProcessorPtr then just holds an extra reference. ──
    processor.removeNode (placeholderId);
    // Reuse the SAME engine id the placeholder held (it is now free). This keeps
    // tags::id stable across the swap so SESSION-LOAD cables — which were wired to
    // the placeholder under this id during setNodeModel — stay valid (T2). For the
    // live-add path the loading node has zero cables, so reusing vs. minting a new
    // id is behaviourally identical there; the uuid (not the int id) is what the
    // React Block keys on, and it is preserved either way.
    auto* added = processor.addNode (realProcessor.get(), placeholderId);
    if (added == nullptr)
    {
        // Engine refused the add (should not happen) — treat as failure.
        nodeData.removeProperty (tags::loading, nullptr);
        // BUG D (crash/fallback naming): same re-affirm as the realProcessor==nullptr
        // branch so a terminal failure never strands a weak "Node" title.
        {
            const String current (nodeData.getProperty (tags::name).toString().trim());
            const bool weak = current.isEmpty()
                              || current.equalsIgnoreCase ("Node")
                              || current.equalsIgnoreCase ("Placeholder")
                              || current == "Plugin";
            if (weak)
            {
                // resolvePluginDisplayName re-derives the catalog name from the
                // KnownPluginList when desc.name is empty (keeps "Kontakt 8"
                // readable under the crash banner instead of "Node").
                const String resolved (resolvePluginDisplayName (desc));
                if (resolved.isNotEmpty())
                    nodeData.setProperty (tags::name, resolved, nullptr);
            }
        }
        changed();
        showFailedInstantiationAlert (desc, true);
        return;
    }

    // ── Model update on the SAME ValueTree — uuid PRESERVED (never written).
    //    setupNode rewrites tags::type/object/updater (the old updater referenced
    //    the dead placeholder) and matches the real processor's bus layout. ──
    nodeData.setProperty (tags::id, static_cast<int64> (added->nodeId), nullptr);
    setupNode (nodeData, added);
    node.resetPorts();

    // UltraQA naming (CONTRACT 2): re-affirm tags::name from the LOADED instance's
    // real plugin name when the placeholder stamp was weak — empty, the literal
    // "Node"/"node", or our own "Plugin" sentinel (stamped at the async placeholder
    // when desc.name was empty at scan time). Pre-fix the swap never rewrote the name,
    // so an instrument added with an empty catalog name showed "Node"/blank forever
    // (INV-naming §(a)). A user-supplied rename (or a real catalog name like "Serum")
    // is a meaningful non-sentinel string and is preserved untouched. uuid is NOT
    // written, so the React Block does not re-key.
    {
        const String current (nodeData.getProperty (tags::name).toString().trim());
        const bool weak = current.isEmpty()
                          || current.equalsIgnoreCase ("Node")
                          || current == "Plugin";
        if (weak)
        {
            // BUG C (fallback/crash naming): for the OUT-OF-PROCESS route `added` is
            // the SandboxedProcessorNode, whose getName() is "<plugin> (Sandboxed)".
            // Prefer the clean catalog name first so the Block shows "Kontakt 8"
            // rather than "Kontakt 8 (Sandboxed)". resolvePluginDisplayName re-derives
            // the catalog name from the KnownPluginList when the passed desc.name is
            // empty (the Kontakt "Node" bug: an identifier-only add carried no name,
            // and the sandboxed wrapper's getName() is just " (Sandboxed)" → cleaned
            // to empty → the Block stayed "Node"). The processor-name strip remains as
            // the last in-process source (kickInProcessFallback) before descriptiveName.
            String resolved (resolvePluginDisplayName (desc));
            if (resolved.isEmpty())
                resolved = cleanPluginDisplayName (added->getName())
                               .upToLastOccurrenceOf (" (Sandboxed)", false, false).trim();
            if (resolved.isNotEmpty())
                nodeData.setProperty (tags::name, resolved, nullptr);
        }
    }

    applyAddedNodeProcessorSetup (processor, added, node);

    if (node.isIONode())
        node.getBlockValueTree().setProperty (tags::displayMode, "compact", nullptr);

    if (added->isSubGraph())
        bindings.add (new Binding (*this, added, node));

    // Re-resolve any cables that were parked as "missing" while this node loaded
    // (T2 session-load: a saved arc to/from a port topology that only fully matched
    // once the real plugin's ports replaced the placeholder's). processorArcsChanged
    // retries every tags::missing arc against the now-real ports. Harmless on the
    // live-add path (a loading node has zero cables → the missing loop is a no-op).
    processorArcsChanged();

    // Clear the transient loading flag LAST → the next buildActiveGraphJson push
    // emits real ports + loadState:"ready" and the Block re-renders to its normal
    // tier with connectable handles. UUID never changed → Block never detaches.
    nodeData.removeProperty (tags::loading, nullptr);
    juce::Logger::writeToLog ("[sandbox-load] swap model updated \"" + desc.name
                              + "\" — loading flag cleared, ports="
                              + juce::String (node.getNumPorts()));
    changed();
}

void GraphManager::removeNode (const uint32 uid)
{
    if (! processor.removeNode (uid))
        return;
    for (int i = 0; i < nodes.getNumChildren(); ++i)
    {
        const Node node (nodes.getChild (i), false);
        if (node.getNodeId() == uid)
        {
            // the model was probably referencing the node ptr
            ProcessorPtr obj = node.getObject();
            if (obj)
            {
                obj->willBeRemoved();
                obj->releaseResources();
            }

            for (int i = bindings.size(); --i >= 0;)
            {
                auto binding = bindings.getUnchecked (i);
                if (binding->object == obj)
                    bindings.remove (i, true);
            }

            auto data = node.data();
            nodes.removeChild (data, nullptr);
            // clear all referecnce counted objects
            Node::sanitizeProperties (data, true);
            // finally delete the node + plugin instance.
            obj = nullptr;
        }
    }

    jassert (nodes.getNumChildren() == getNumNodes());
    processorArcsChanged();
}

//==============================================================================
void GraphManager::disconnectNode (const uint32 nodeId, const bool inputs, const bool outputs, const bool audio, const bool midi)
{
    jassert (inputs || outputs);
    bool doneAnything = false;

    for (int i = getNumConnections(); --i >= 0;)
    {
        const auto* const c = processor.getConnection (i);
        if ((outputs && c->sourceNode == nodeId) || (inputs && c->destNode == nodeId))
        {
            ProcessorPtr src = processor.getNodeForId (c->sourceNode);
            ProcessorPtr dst = processor.getNodeForId (c->destNode);

            if ((audio && src->getPortType (c->sourcePort) == PortType::Audio && dst->getPortType (c->destPort) == PortType::Audio) || (midi && src->getPortType (c->sourcePort) == PortType::Midi && dst->getPortType (c->destPort) == PortType::Midi))
            {
                removeConnection (i);
                doneAnything = true;
            }
        }
    }

    if (doneAnything)
        processorArcsChanged();
}

void GraphManager::removeIllegalConnections()
{
    if (processor.removeIllegalConnections())
        processorArcsChanged();
}

int GraphManager::getNumConnections() const noexcept
{
    jassert (arcs.getNumChildren() == processor.getNumConnections());
    return processor.getNumConnections();
}

const GraphNode::Connection* GraphManager::getConnection (const int index) const noexcept
{
    return processor.getConnection (index);
}

const GraphNode::Connection* GraphManager::getConnectionBetween (uint32 sourceFilterUID, int sourceFilterChannel, uint32 destFilterUID, int destFilterChannel) const noexcept
{
    return processor.getConnectionBetween (sourceFilterUID, sourceFilterChannel, destFilterUID, destFilterChannel);
}

bool GraphManager::canConnect (uint32 sourceFilterUID, int sourceFilterChannel, uint32 destFilterUID, int destFilterChannel) const noexcept
{
    return processor.canConnect (sourceFilterUID, sourceFilterChannel, destFilterUID, destFilterChannel);
}

bool GraphManager::addConnection (uint32 sourceFilterUID, int sourcePort, uint32 destFilterUID, int destPort)
{
    const bool result = processor.addConnection (sourceFilterUID, (uint32) sourcePort, destFilterUID, (uint32) destPort);
    if (result)
        processorArcsChanged();

    return result;
}

void GraphManager::removeConnection (const int index)
{
    processor.removeConnection (index);
    processorArcsChanged();
}

void GraphManager::removeConnection (uint32 sourceNode, uint32 sourcePort, uint32 destNode, uint32 destPort)
{
    if (processor.removeConnection (sourceNode, sourcePort, destNode, destPort))
        processorArcsChanged();
}

void GraphManager::setNodeModel (const Node& node)
{
    loaded = false;

    processor.clear();
    graph = node.data();
    arcs = node.getArcsValueTree();
    nodes = node.getNodesValueTree();

    if (graph.hasProperty (tags::updater))
    {
        graph.setProperty (tags::updater, (NodeModelUpdater*) nullptr, nullptr);
        graph.removeProperty (tags::updater, nullptr);
    }

    graph.setProperty (tags::updater, new NodeModelUpdater (*this, graph, &processor), nullptr);

    Array<ValueTree> failed;
    for (int i = 0; i < nodes.getNumChildren(); ++i)
    {
        Node node (nodes.getChild (i), false);
        const PluginDescription desc (pluginManager.findDescriptionFor (node));

        // T2 — SESSION-LOAD async + crash-tolerant sandbox route. A heavy AU in a
        // saved session must NOT freeze boot: route external sandboxed nodes through
        // the SAME deferred-launch + watcher machinery as a live add (T1), so the
        // message thread never blocks on createSandboxedGraphNode's handshake. The
        // node keeps a LOADING placeholder (zero connectable ports) until the worker
        // reports loaded; the uuid-preserving swap then restores its real ports and
        // re-resolves any cables that were parked as "missing" during load. If the
        // worker won't load, it degrades to the in-process path + FellBackInProcess
        // badge — exactly the live-add behaviour. Internal/IO nodes (format ==
        // nullptr) and non-sandboxed plugins stay on the unchanged synchronous path.
        const bool externalFormat =
            pluginManager.getAudioPluginFormat (desc.pluginFormatName) != nullptr;
        const bool sandboxThisNode = externalFormat
            && (sandboxPolicyOverride ? sandboxPolicyOverride (desc)
                                      : Settings().shouldSandboxPlugin (desc));

        if (sandboxThisNode && installSessionLoadingPlaceholder (node, desc))
        {
            // Placeholder installed in-place (uuid preserved). Kick the deferred
            // out-of-process load; the watcher drives the swap on the message thread.
            kickSandboxedInstantiation (node.getUuidString(), node.getNodeId(), desc);
            continue;
        }

        if (ProcessorPtr obj = createFilter (&desc, 0, 0, node.getNodeId()))
        {
            setupNode (node.data(), obj);
            obj->setEnabled (node.isEnabled());
            node.setProperty (tags::enabled, obj->isEnabled());
        }
        else if (ProcessorPtr ph = createPlaceholder (node))
        {
            DBG ("[element] couldn't create node: " << node.getName() << ". Creating offline placeholder");
            node.data().setProperty (tags::object, ph.get(), nullptr);
            node.data().setProperty (tags::missing, true, nullptr);
        }
        else
        {
            DBG ("[element] couldn't create node: " << node.getName());
            failed.add (node.data());
        }
    }

    for (const auto& n : failed)
    {
        nodes.removeChild (n, nullptr);
        Node::sanitizeRuntimeProperties (n);
    }
    failed.clearQuick();

    // If you hit this, then failed nodes didn't get handled properly
    jassert (nodes.getNumChildren() == processor.getNumNodes());

    // Cheap way to refresh engine-side nodes
    processor.triggerAsyncUpdate();
    processor.handleUpdateNowIfNeeded();

    for (int i = 0; i < arcs.getNumChildren(); ++i)
    {
        ValueTree arc (arcs.getChild (i));
        const auto sourceNode = (uint32) (int) arc.getProperty (tags::sourceNode);
        const auto destNode = (uint32) (int) arc.getProperty (tags::destNode);

#if 0
        auto src = processor.getNodeForId (sourceNode);
        auto dst = processor.getNodeForId (destNode);
        if (src && dst) {
            DBG("connection " << src->getName() << " to " << dst->getName());
        }
#endif
        bool worked = processor.addConnection (sourceNode, (uint32) (int) arc.getProperty (tags::sourcePort), destNode, (uint32) (int) arc.getProperty (tags::destPort));

        if (worked)
        {
            arc.removeProperty (tags::missing, 0);
        }
        else
        {
            DBG ("[element] failed creating connection: ");
            const Node graphObject (graph, false);

            if (graphObject.getNodeById (sourceNode).isValid() && graphObject.getNodeById (destNode).isValid())
            {
                DBG ("[element] set missing connection");
                // if the nodes are valid then preserve it
                arc.setProperty (tags::missing, true, 0);
            }
            else
            {
                DBG ("[element] purge failed arc");
                failed.add (arc);
            }
        }
    }

    const bool discardFailedConnections = true;
    if (discardFailedConnections)
        for (const auto& n : failed)
            arcs.removeChild (n, nullptr);

    loaded = true;
    jassert (arcs.getNumChildren() == processor.getNumConnections());
    failed.clearQuick();

    IONodeEnforcer enforceIONodes (*this);
    processorArcsChanged();
}

void GraphManager::savePluginStates()
{
    for (int i = 0; i < nodes.getNumChildren(); ++i)
    {
        Node node (nodes.getChild (i), false);
        node.savePluginState();
    }
}

void GraphManager::clear()
{
    loaded = false;

    if (graph.isValid())
    {
        Node::sanitizeRuntimeProperties (graph);
        graph.removeChild (arcs, nullptr);
        graph.removeChild (nodes, nullptr);
        nodes.removeAllChildren (nullptr);
        arcs.removeAllChildren (nullptr);
        graph.addChild (nodes, -1, nullptr);
        graph.addChild (arcs, -1, nullptr);
    }

    processor.clear();
    changed();
}

void GraphManager::processorArcsChanged()
{
    ValueTree newArcs = ValueTree (tags::arcs);
    for (int i = 0; i < processor.getNumConnections(); ++i)
        newArcs.addChild (Node::makeArc (*processor.getConnection (i)), -1, nullptr);

    for (int i = 0; i < arcs.getNumChildren(); ++i)
    {
        const ValueTree arc (arcs.getChild (i));
        if (true == (bool) arc[tags::missing])
        {
            ValueTree missingArc = arc.createCopy();
            if (processor.addConnection (
                    (uint32) (int) missingArc[tags::sourceNode],
                    (uint32) (int) missingArc[tags::sourcePort],
                    (uint32) (int) missingArc[tags::destNode],
                    (uint32) (int) missingArc[tags::destPort]))
            {
                missingArc.removeProperty (tags::missing, 0);
            }

            newArcs.addChild (missingArc, -1, 0);
        }
    }

    const auto index = graph.indexOf (arcs);
    graph.removeChild (arcs, nullptr);
    graph.addChild (newArcs, index, nullptr);
    arcs = graph.getChildWithName (tags::arcs);
    changed();
}

void GraphManager::setupNode (const ValueTree& data, ProcessorPtr obj)
{
    jassert (obj && data.hasType (types::Node));
    Node node (data, false);
    node.setProperty (tags::type, obj->getTypeString())
        .setProperty (tags::object, obj.get())
        .setProperty (tags::updater, new NodeModelUpdater (*this, data, obj.get()));

    PortArray ins, outs;
    node.getPorts (ins, outs, PortType::Audio);
    bool resetPorts = false;
    juce::ignoreUnused (resetPorts);
    if (auto* const proc = obj->getAudioProcessor())
    {
        bool busesConfigured = false;
        {
            // try to load buses layout.
            const auto buses = node.data().getChildWithName (tags::buses);
            if (buses.isValid() && buses.getNumChildren() >= 2)
            {
                AudioProcessor::BusesLayout layout;
                busesConfigured = false;
                for (const auto& data : buses.getChildWithName (tags::inputs))
                {
                    const auto str = data.getProperty (tags::arrangement).toString();
                    const auto acs = AudioChannelSet::fromAbbreviatedString (str);
                    layout.inputBuses.add (acs);
                }

                for (const auto& data : buses.getChildWithName (tags::outputs))
                {
                    const auto str = data.getProperty (tags::arrangement).toString();
                    const auto acs = AudioChannelSet::fromAbbreviatedString (str);
                    layout.outputBuses.add (acs);
                }

                if (proc->checkBusesLayoutSupported (layout))
                {
                    proc->suspendProcessing (true);
                    proc->releaseResources();
                    busesConfigured = proc->setBusesLayoutWithoutEnabling (layout);
                    proc->prepareToPlay (processor.getSampleRate(), processor.getBlockSize());
                    proc->suspendProcessing (false);
                }
            }
        }

        // try to match ports if needed
        if (! busesConfigured && (proc->getTotalNumInputChannels() != ins.size() || proc->getTotalNumOutputChannels() != outs.size()))
        {
            AudioProcessor::BusesLayout layout;

            layout.inputBuses.add (AudioChannelSet::namedChannelSet (ins.size()));
            layout.outputBuses.add (AudioChannelSet::namedChannelSet (outs.size()));

            if (proc->checkBusesLayoutSupported (layout))
            {
                proc->suspendProcessing (true);
                proc->releaseResources();
                proc->setBusesLayoutWithoutEnabling (layout);
                proc->prepareToPlay (processor.getSampleRate(), processor.getBlockSize());
                proc->suspendProcessing (false);
            }

            resetPorts = true;
        }
    }

    if (obj->isSubGraph())
    {
        bindings.add (new Binding (*this, obj, node));
        resetPorts = true;
    }

    node.restorePluginState();
    node.resetPorts();
    if (node.isA ("Element", EL_NODE_ID_MIDI_INPUT_DEVICE) || node.isA ("Element", EL_NODE_ID_MIDI_OUTPUT_DEVICE))
    {
        jassert (node.getNumPorts() == 1);
    }

    jassert (node.getNumPorts() == static_cast<int> (obj->getNumPorts()));
}

// MARK: Root Graph Controller
RootGraphManager::RootGraphManager (RootGraph& graph, PluginManager& plugins)
    : GraphManager (graph, plugins),
      root (graph)
{
}

RootGraphManager::~RootGraphManager() {}

void RootGraphManager::unloadGraph()
{
    getRootGraph().clear();
}

} // namespace element
