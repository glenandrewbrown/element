// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/audioengine.hpp>
#include "engine/graphnode.hpp"
#include <element/node.hpp>

namespace element {

class PluginManager;
class RootGraph;

class GraphManager : public ChangeBroadcaster
{
public:
    static const uint32 invalidNodeId = EL_INVALID_PORT;
    static const int invalidChannel = -1;

    GraphManager (GraphNode&, PluginManager&);
    ~GraphManager();

    /** Returns the controlled graph */
    GraphNode& getGraph() noexcept { return processor; }

    /** Returns true if controlling the given graph model */
    bool isManaging (const Node& model) const { return graph == model.data(); }

    /** Returns the number of nodes on the controlled graph */
    int getNumNodes() const noexcept;

    /** Returns a node by index */
    const ProcessorPtr getNode (const int index) const noexcept;

    /** Returns a node by NodeId */
    const ProcessorPtr getNodeForId (const uint32 uid) const noexcept;

    /** Returns a node model by Node ID */
    const Node getNodeModelForId (const uint32 nodeId) const noexcept;

    /** Find a graph manager (recursive) */
    GraphManager* findGraphManagerForGraph (const Node& graph) const noexcept;

    /** Returns true if this manager contains a node by ID */
    bool contains (const uint32 nodeId) const;

    /** Adds a node for processing */
    uint32 addNode (const Node& node);

    /** Adss a node with a plugin description */
    uint32 addNode (const PluginDescription* desc, double x = 0.0f, double y = 0.0f, uint32 nodeId = 0);

    /** TEST SEAM ONLY — override the sandbox routing decision for a live add.
     *  Production leaves this empty and the decision comes from
     *  Settings::shouldSandboxPlugin (global preference, P4 default = sandbox all
     *  3rd-party). Tests inject a predicate so the out-of-process route is driven
     *  deterministically without mutating shared ApplicationProperties. */
    void setSandboxPolicyForTesting (std::function<bool (const PluginDescription&)> policy)
    {
        sandboxPolicyOverride = std::move (policy);
    }

    /** TEST SEAM ONLY — when true, kickSandboxedInstantiation skips constructing the
     *  SandboxedProcessorNode and calls kickInProcessFallback directly, simulating a
     *  deterministic worker LAUNCH failure. This exercises the fallback code path
     *  (kickInProcessFallback → in-process async → FellBackInProcess badge) without
     *  depending on whether the worker binary is present on the build machine. */
    void setForceWorkerLaunchFailureForTesting (bool force)
    {
        forceWorkerLaunchFailure = force;
    }

    /** TEST SEAM ONLY — inject an N-millisecond stall into the deferred-launch
     *  handshake JOB (runs on the pool thread) so a test can prove the message
     *  thread does NOT block: kickSandboxedInstantiation must return to the message
     *  loop immediately and the placeholder must exist in the ValueTree while the
     *  stall is still elapsing. Production leaves this at 0 (no stall). */
    void setForceSlowWorkerLaunchForTesting (int stallMs)
    {
        forceSlowWorkerLaunchMs = stallMs;
    }

    /** Remove a node by ID */
    void removeNode (const uint32 nodeId);

    /** Disconnect a node from other nodes */
    void disconnectNode (const uint32 nodeId, const bool inputs = true, const bool outputs = true, const bool audio = true, const bool midi = true);

    /** Returns the number of connections on the graph
        DOES NOT include connections tagged as "missing"
     */
    int getNumConnections() const noexcept;
    const GraphNode::Connection* getConnection (const int index) const noexcept;

    const GraphNode::Connection*
        getConnectionBetween (uint32 sourceNode, int sourcePort, uint32 destNode, int destPort) const noexcept;

    bool canConnect (uint32 sourceFilterUID, int sourceFilterChannel, uint32 destFilterUID, int destFilterChannel) const noexcept;

    bool addConnection (uint32 sourceFilterUID, int sourceFilterChannel, uint32 destFilterUID, int destFilterChannel);

    void removeConnection (const int index);

    void removeConnection (uint32 sourceNode, uint32 sourcePort, uint32 destNode, uint32 destPort);

    void removeIllegalConnections();

    void clear();

    void setNodeModel (const Node& node);
    inline Node getGraphModel() const { return Node (graph, false); }

    void savePluginStates();

    /** Rebuilds the arcs model according to the GraphNode */
    inline void syncArcsModel()
    {
        processor.removeIllegalConnections();
        processorArcsChanged();
    }

    inline bool isLoaded() const { return loaded; }

private:
    PluginManager& pluginManager;
    GraphNode& processor;
    ValueTree graph, arcs, nodes;
    bool loaded = false;

    uint32 lastUID;

    class Binding;
    friend class Binding;
    OwnedArray<Binding> bindings;

    uint32 getNextUID() noexcept;
    inline void changed() { sendChangeMessage(); }
    Processor* createFilter (const PluginDescription* desc, double x = 0.0f, double y = 0.0f, uint32 nodeId = 0);
    Processor* createPlaceholder (const Node& node);

    void setupNode (const ValueTree& data, ProcessorPtr object);

    // Wave-3 Phase 4 — async plugin load. addNode(desc,...) routes EXTERNAL
    // (JUCE-format) plugins here: it adds a transient loading placeholder
    // synchronously (stable final uuid, zero connectable ports), kicks
    // createGraphNodeAsync, and on the message-thread callback calls
    // swapInLoadedProcessor to swap the real processor INTO the SAME model
    // ValueTree (uuid preserved) and republish via the engine API. The swap is
    // guarded by a WeakReference so a session reload mid-load is a safe no-op.
    //
    // P1 (2026-06-09): when `sandbox` is true the placeholder is identical, but
    // the instantiation kick constructs a SandboxedProcessorNode (non-blocking —
    // launches the worker + async-loads in a CHILD process, so the host message
    // thread NEVER blocks) and a message-thread poll-timer (SandboxLoadWatcher)
    // calls the SAME swapInLoadedProcessor once the worker reports loaded. If the
    // worker won't launch, it falls back to the in-process createGraphNodeAsync
    // path and emits SandboxEvent::FellBackInProcess.
    uint32 addExternalPluginAsync (const PluginDescription& desc, double rx, double ry, uint32 nodeId, bool sandbox);
    void swapInLoadedProcessor (const String& nodeUuid, uint32 placeholderId, ProcessorPtr realProcessor, const PluginDescription& desc);

    // P1 — kick the OUT-OF-PROCESS instantiation for a placeholder already in the
    // model. Constructs the sandboxed node, falls back in-process on launch
    // failure, and otherwise arms the readiness poll-timer that drives the swap.
    void kickSandboxedInstantiation (const String& finalUuid, uint32 placeholderId, const PluginDescription& desc);

    // P1 — re-kick a placeholder (resolved by uuid) through the in-process async
    // path when the sandbox route is unavailable, emitting FellBackInProcess.
    // Shared by the synchronous launch-failure case and the watcher's deadline/
    // crash fallback. `currentId` is the placeholder's current engine id.
    void kickInProcessFallback (const String& finalUuid, uint32 currentId, const PluginDescription& desc);

    // T2 — install a LOADING PlaceholderProcessor on an EXISTING session node tree
    // (used by setNodeModel for the async session-load sandbox route). Adds the
    // engine placeholder node (keeping nodes.getNumChildren() == numNodes),
    // re-stamps the engine object/updater/id and the transient tags::loading flag,
    // and drops the node's real ports so it is not cable-targetable while loading.
    // The node's uuid/position/state are PRESERVED. Returns false (so the caller
    // falls through to the synchronous createFilter path) if the placeholder add
    // failed for any reason.
    bool installSessionLoadingPlaceholder (Node& node, const PluginDescription& desc);

    void processorArcsChanged();

    // P1 — TEST SEAMS (all empty/false/0 in production).
    std::function<bool (const PluginDescription&)> sandboxPolicyOverride;
    bool forceWorkerLaunchFailure = false; // force kickInProcessFallback, no node ctor
    int forceSlowWorkerLaunchMs = 0;       // inject a stall into the pool launch job

    // T1/T2 — single-thread pool that runs the BLOCKING SandboxedProcessorNode
    // launch handshake OFF the message thread, so kickSandboxedInstantiation /
    // session-load never freezes the UI on the connectToPipe handshake. Scoped to
    // this GraphManager: its destructor (jobs deleted with shouldStopFirst=true)
    // waits for / interrupts a running handshake before the manager dies, so a
    // job never calls into a torn-down manager. The job itself touches ONLY the
    // SandboxedProcessorNode (kept alive via a captured ProcessorPtr) — never the
    // graph/nodes/ValueTrees (the message-thread watcher is the sole graph
    // mutator). Lifetime safety comes from ~GraphManager explicitly draining the
    // pool (removeAllJobs (true, 5000)) as its FIRST statement — jobs are joined
    // before any member (sandboxWatchers / nodes) tears down.
    juce::ThreadPool sandboxLaunchPool { juce::ThreadPoolOptions {}
                                             .withThreadName ("el-sandbox-launch")
                                             .withNumberOfThreads (1) };

    // P1 — message-thread poll-timers watching sandboxed nodes that are still
    // loading in their worker. Each owns the in-flight ProcessorPtr until the
    // swap completes (or the GraphManager dies), so a node dropped mid-load tears
    // its worker down exactly once. SandboxLoadWatcher is defined in the .cpp
    // (where it is a complete type — ~GraphManager is also out-of-line there, so
    // the OwnedArray deletion never sees an incomplete type).
    class SandboxLoadWatcher;
    friend class SandboxLoadWatcher;
    OwnedArray<SandboxLoadWatcher> sandboxWatchers;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (GraphManager)
    JUCE_DECLARE_WEAK_REFERENCEABLE (GraphManager)
};

class RootGraphManager : public GraphManager
{
public:
    RootGraphManager (RootGraph& graph, PluginManager& plugins);
    ~RootGraphManager();

    /** Return the underlying RootGraph processor */
    RootGraph& getRootGraph() const { return root; }

    /** Unload graph nodes without clearing the model */
    void unloadGraph();

private:
    RootGraph& root;
};

} // namespace element
