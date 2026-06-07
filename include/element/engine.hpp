// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/audio_devices.hpp>
#include <element/services.hpp>
#include <element/node.hpp>

namespace element {

struct ConnectionBuilder;
class GraphManager;
class RootGraphManager;

class EngineService : public Service {
public:
    EngineService();
    ~EngineService();

    /** sync models with engine */
    void syncModels();

    /** activate the controller */
    void activate() override;

    /** deactivate the controller */
    void deactivate() override;

    /** Attempt adding a Node by identifier and format.
     * 
        This should work well for Element internal plugins. Third party
        formats may or may not work.  For VST/AU/LV2 etc etc, avoid using
        this method if possible.

        @param ID The file or identifier
        @param format The format name (default: "Element")
    */
    Node addNode (const String& ID, const String& format = EL_NODE_FORMAT_NAME);

    /** Adds a new node to the current graph. */
    void addNode (const Node& node);

    /** Adds a new node to a specificied graph */
    Node addNode (const Node& node, const Node& target, const ConnectionBuilder&);

    /** Adds a plugin by description to the current graph */
    Node addPlugin (const juce::PluginDescription& desc, const bool verified = true, const float rx = 0.5f, const float ry = 0.5f, bool dontShowUI = false);

    /** Adds a plugin to a specific graph */
    Node addPlugin (const Node& graph, const juce::PluginDescription& desc);

    /** Adds a plugin to a specific graph and adds connections from
        a ConnectionBuilder */
    Node addPlugin (const Node& graph, const juce::PluginDescription& desc, const ConnectionBuilder& builder, const bool verified = true);

    /** Adds a midi device node to the current root graph */
    Node addMidiDeviceNode (const juce::MidiDeviceInfo& device, const bool isInput);

    /** Removes a node from the current graph */
    void removeNode (const uint32);

    /** remove a node by object */
    void removeNode (const Node& node);

    /** remove a node by Uuid */
    void removeNode (const juce::Uuid&);

    /** Adds a new root graph */
    void addGraph();

    /** adds a specific graph */
    void addGraph (const Node& n, bool makeActive);

    /** Remove a root graph by index */
    void removeGraph (int index = -1);

    /** Duplicates the currently active root graph */
    void duplicateGraph();

    /** Ads a specific new graph */
    void duplicateGraph (const Node& graph);

    /** Group a set of sibling Blocks on a parent Board into a new nested
        Container (a Graph Block), moving the selected Blocks inside it and
        re-wiring internal + boundary cables.

        @param parentGraph The Board (graph Node) that currently owns the
                           selected nodes.
        @param nodeIds     The tags::uuid of each Block to absorb.

        @returns the new Container Node on success, or an invalid Node when the
                 operation is refused (see eligibility rules in the .cpp). A CV
                 cable crossing the selection boundary, an IO/graph/Portal node in
                 the selection, or fewer than two resolvable nodes all refuse. */
    Node groupNodes (const Node& parentGraph, const juce::Array<juce::Uuid>& nodeIds);

    /** Wave-1 Item 1 (product-feedback-v4 §2): when the FIRST Block lands in an
        EMPTY Board, provision the surrounding IO to match that Block's real
        capabilities and auto-cable the first drop. Classifies @p addedNode from
        its real ports (NOT the signalOut UI heuristic) → drives the Board's port
        set + IO device child nodes (sampler→{MIDI In, Audio Out}; MIDI fx→{MIDI
        In, MIDI Out}; EQ→{Audio In, Audio Out}) and wires MIDI In→Block→Audio Out
        (type-valid only). No-op on a populated/mixed Board (keeps the all-4
        superset) or a node with no audio/MIDI ports. Message-thread only.

        @param graph     The Board the Block was added to.
        @param addedNode The Block just added (carries a live nodeId). */
    void provisionFirstBlockIO (const Node& graph, const Node& addedNode);

    /** Add a connection on the active root graph */
    void addConnection (const uint32, const uint32, const uint32, const uint32);

    /** Add a connection on a specific graph */
    void addConnection (const uint32 s, const uint32 sp, const uint32 d, const uint32 dp, const Node& graph);

    void connectChannels (const Node& graph, const Node& src, const int sc, const Node& dst, const int dc);

    void connectChannels (const Node& graph, const uint32 s, const int sc, const uint32 d, const int dc);

    /** Connect by channel on the root graph */
    void connectChannels (const uint32, const int, const uint32, const int);

    void connect (PortType type, const Node& src, int sc, const Node& dst, int dc, int nc = 1);

    void testConnectAudio (const Node& src, int sc, const Node& dst, int dc, int nc = 1)
    {
        if (nc < 1)
            nc = 1;
        while (--nc >= 0)
            connectChannels (src.getParentGraph(), src, sc++, dst, dc++);
    }

    /** Remove a connection on the active root graph */
    void removeConnection (const uint32, const uint32, const uint32, const uint32);

    /** Remove a connection on the specified graph */
    void removeConnection (const uint32, const uint32, const uint32, const uint32, const Node& target);

    /** Disconnect the provided node */
    void disconnectNode (const Node& node, const bool inputs = true, const bool outputs = true, const bool audio = true, const bool midi = true);

    /** Clear the root graph */
    void clear();

    /** Change root node */
    void setRootNode (const Node&);

    /** called when the session loads or re-loads */
    void sessionReloaded();

    /** replace a node with a given plugin */
    void replace (const Node&, const juce::PluginDescription&);

    void changeBusesLayout (const Node& node, const juce::AudioProcessor::BusesLayout& layout);

    Signal<void (const Node&)> sigNodeRemoved;

    /** Fired on the message thread whenever the engine graph state changes
        (node added/removed, graph rebuilt, session reloaded).
        P1-11: additive parallel signal path — consumers opt in here;
        EngineService::removeGraph still calls ui->stabilizeContent() directly
        until all consumers have migrated. */
    Signal<void()> sigEngineStateChanged;

private:
    friend struct RootGraphHolder;
    class RootGraphs;
    friend class RootGraphs;
    std::unique_ptr<RootGraphs> graphs;

    friend class ChangeBroadcaster;
    Node addPlugin (GraphManager& controller, const juce::PluginDescription& desc);
};

} // namespace element
