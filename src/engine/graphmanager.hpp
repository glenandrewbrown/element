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
    uint32 addExternalPluginAsync (const PluginDescription& desc, double rx, double ry, uint32 nodeId);
    void swapInLoadedProcessor (const String& nodeUuid, uint32 placeholderId, ProcessorPtr realProcessor, const PluginDescription& desc);

    void processorArcsChanged();

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
