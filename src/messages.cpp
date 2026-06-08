// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/context.hpp>
#include <element/engine.hpp>
#include <element/plugins.hpp>
#include <element/signals.hpp>

#include "messages.hpp"

using namespace juce;

namespace element {

class AddPluginAction : public juce::UndoableAction
{
public:
    AddPluginAction (Services& _app, const AddPluginMessage& msg)
        : app (_app), graph (msg.graph), description (msg.description), builder (msg.builder), verified (msg.verified) {}
    ~AddPluginAction() noexcept {}

    bool perform() override
    {
        addedNode = Node();
        if (auto* ec = app.find<EngineService>())
            if (graph.isGraph())
                addedNode = addPlugin (*ec);
        return addedNode.isValid();
    }

    bool undo() override
    {
        if (! addedNode.isValid())
            return false;
        if (! havePosition)
            addedNode.getRelativePosition (x, y);
        havePosition = true;
        if (auto* ec = app.find<EngineService>())
            ec->removeNode (addedNode);
        addedNode = Node();
        return true;
    }

private:
    Services& app;
    const Node graph;
    const PluginDescription description;
    const ConnectionBuilder builder;
    const bool verified = true;
    double x, y;
    bool havePosition = false;
    Node addedNode;

    Node addPlugin (EngineService& ec)
    {
        auto node = app.context().plugins().getDefaultNode (description);
        if (! node.isValid())
            return ec.addPlugin (graph, description, builder, verified);
        return ec.addNode (node, graph, builder);
    }
};

class RemoveNodeAction : public juce::UndoableAction
{
public:
    explicit RemoveNodeAction (Services& a, const Node& node)
        : app (a), targetGraph (node.getParentGraph()), nodeUuid (node.getUuid())
    {
        node.getArcs (arcs);
        Node mutableNode (node);
        mutableNode.savePluginState();
        node.getRelativePosition (x, y);
        nodeData = node.data().createCopy();
        Node::sanitizeRuntimeProperties (nodeData);
    }

    bool perform() override
    {
        auto& ec = *app.find<EngineService>();
        ec.removeNode (nodeUuid);
        return true;
    }

    bool undo() override
    {
        auto& ec = *app.find<EngineService>();
        bool handled = true;

        const Node newNode (nodeData, false);
        auto createdNode (ec.addNode (newNode, targetGraph, builder));
        createdNode.setRelativePosition (x, y); // TODO: GraphManager should handle this

        for (const auto* arc : arcs)
            ec.addConnection (arc->sourceNode, arc->sourcePort, arc->destNode, arc->destPort, targetGraph);

        return handled;
    }

private:
    Services& app;
    juce::ValueTree nodeData;
    const Node targetGraph;
    const juce::Uuid nodeUuid;
    ConnectionBuilder builder;
    juce::OwnedArray<Arc> arcs;
    double x = 0.5;
    double y = 0.5;
    bool isDataValid() const
    {
        return targetGraph.isGraph() && ! nodeUuid.isNull() && nodeData.isValid();
    }
};

class AddConnectionAction : public juce::UndoableAction
{
public:
    AddConnectionAction (Services& a, const Node& targetGraph, const uint32 sn, const uint32 sp, const uint32 dn, const uint32 dp)
        : app (a), graph (targetGraph), arc (sn, sp, dn, dp)
    {
    }

    bool perform() override
    {
        auto& ec = *app.find<EngineService>();
        if (! graph.isValid())
            ec.addConnection (arc.sourceNode, arc.sourcePort, arc.destNode, arc.destPort);
        else
            ec.addConnection (arc.sourceNode, arc.sourcePort, arc.destNode, arc.destPort, graph);
        return true;
    }

    bool undo() override
    {
        auto& ec = *app.find<EngineService>();
        if (! graph.isValid())
            ec.removeConnection (arc.sourceNode, arc.sourcePort, arc.destNode, arc.destPort);
        else
            ec.removeConnection (arc.sourceNode, arc.sourcePort, arc.destNode, arc.destPort, graph);
        return true;
    }

private:
    Services& app;
    const Node graph;
    const Arc arc;
};

class RemoveConnectionAction : public juce::UndoableAction
{
public:
    RemoveConnectionAction (Services& a, const Node& targetGraph, const uint32 sn, const uint32 sp, const uint32 dn, const uint32 dp)
        : app (a), graph (targetGraph), arc (sn, sp, dn, dp)
    {
    }

    bool perform() override
    {
        auto& ec = *app.find<EngineService>();
        if (! graph.isValid())
            ec.removeConnection (arc.sourceNode, arc.sourcePort, arc.destNode, arc.destPort);
        else
            ec.removeConnection (arc.sourceNode, arc.sourcePort, arc.destNode, arc.destPort, graph);
        return true;
    }

    bool undo() override
    {
        auto& ec = *app.find<EngineService>();
        if (! graph.isValid())
            ec.addConnection (arc.sourceNode, arc.sourcePort, arc.destNode, arc.destPort);
        else
            ec.addConnection (arc.sourceNode, arc.sourcePort, arc.destNode, arc.destPort, graph);
        return true;
    }

private:
    Services& app;
    const Node graph;
    const Arc arc;
};

// Wave-3 Task 5.1 — atomic "insert a new Reroute knot into cable A→B".
//
// ONE UndoableAction so a single undo removes the reroute AND restores the
// original A→B cable. perform(): add the reroute node, position it at the drop,
// resolve its first in/out ports of the cable's signal type, remove A→B, wire
// A→reroute→B. undo(): tear down the two new cables, remove the reroute, restore
// A→B. The reroute uuid is not known until the add, so this cannot be expressed
// as the three independent actions SpliceConnectionMessage uses (those take
// node ids at construction) — hence a single self-contained action.
class InsertRerouteAction : public juce::UndoableAction
{
public:
    InsertRerouteAction (Services& a, const InsertRerouteMessage& msg)
        : app (a), graph (msg.graph), description (msg.reroute),
          aNode (msg.aNode), aPort (msg.aPort),
          bNode (msg.bNode), bPort (msg.bPort),
          signalType (msg.signalType), x (msg.x), y (msg.y)
    {
    }

    bool perform() override
    {
        auto* ec = app.find<EngineService>();
        if (ec == nullptr || ! graph.isGraph())
            return false;

        ConnectionBuilder emptyBuilder;
        Node node = ec->addPlugin (graph, description, emptyBuilder, true);
        if (! node.isValid())
            return false;

        // Resolve the reroute's first input + first output port of the cable's
        // signal type (its real ports only exist now, post-add).
        const PortType wanted (portTypeForSignal (signalType));
        int inPort = -1, outPort = -1;
        for (int i = 0; i < node.getNumPorts(); ++i)
        {
            const Port p (node.getPort (i));
            if (p.getType() != wanted)
                continue;
            if (p.isInput() && inPort < 0)
                inPort = (int) p.index();
            else if (p.isOutput() && outPort < 0)
                outPort = (int) p.index();
        }

        if (inPort < 0 || outPort < 0)
        {
            // No usable port pair (should not happen for a type-matched reroute)
            // — roll back the add so perform() is a clean no-op.
            ec->removeNode (node);
            return false;
        }

        // NOTE: absolute placement at the drop point is owned by the host's
        // deferred pendingConnectedAdd apply (setPosition(flowX,flowY) on a later
        // timer tick), exactly like the ⌥+drop add — so this action does NOT
        // setPosition here (x/y are kept only so a future direct caller could).
        juce::ignoreUnused (x, y);
        rerouteUuid = node.getUuid();
        rerouteInPort = (uint32) inPort;
        rerouteOutPort = (uint32) outPort;
        const uint32 rerouteId = node.getNodeId();

        // Remove the original A→B FIRST so the engine never momentarily sees B's
        // input contested, then wire A→reroute and reroute→B.
        ec->removeConnection (aNode, aPort, bNode, bPort, graph);
        ec->addConnection (aNode, aPort, rerouteId, rerouteInPort, graph);
        ec->addConnection (rerouteId, rerouteOutPort, bNode, bPort, graph);
        return true;
    }

    bool undo() override
    {
        auto* ec = app.find<EngineService>();
        if (ec == nullptr || rerouteUuid.isNull() || ! graph.isGraph())
            return false;

        // Find the reroute by uuid (its graph node-id is stable across this
        // transaction, but resolve fresh to be safe).
        const Node reroute (findNodeByUuid (graph, rerouteUuid));
        if (reroute.isValid())
        {
            const uint32 rerouteId = reroute.getNodeId();
            ec->removeConnection (aNode, aPort, rerouteId, rerouteInPort, graph);
            ec->removeConnection (rerouteId, rerouteOutPort, bNode, bPort, graph);
            ec->removeNode (reroute);
        }
        // Restore the original A→B cable.
        ec->addConnection (aNode, aPort, bNode, bPort, graph);
        return true;
    }

private:
    Services& app;
    const Node graph;
    const PluginDescription description;
    const uint32 aNode, aPort;
    const uint32 bNode, bPort;
    const String signalType;
    const double x, y;

    juce::Uuid rerouteUuid;        // set on perform(), used by undo()
    uint32 rerouteInPort = 0;
    uint32 rerouteOutPort = 0;

    static PortType portTypeForSignal (const String& sig)
    {
        if (sig == "midi")
            return PortType::Midi;
        if (sig == "value")
            return PortType::CV;
        return PortType::Audio;
    }

    static Node findNodeByUuid (const Node& graph, const juce::Uuid& uuid)
    {
        for (int i = 0; i < graph.getNumNodes(); ++i)
        {
            const Node n (graph.getNode (i));
            if (n.getUuid() == uuid)
                return n;
        }
        return Node();
    }
};

//=============================================================================

void AddPluginMessage::createActions (Services& app, OwnedArray<UndoableAction>& actions) const
{
    actions.add (new AddPluginAction (app, *this));
}

void RemoveNodeMessage::createActions (Services& app, OwnedArray<UndoableAction>& actions) const
{
    if (node.isValid())
        actions.add (new RemoveNodeAction (app, node));
    for (const auto& n : nodes)
        actions.add (new RemoveNodeAction (app, n));
}

void AddConnectionMessage::createActions (Services& app, OwnedArray<UndoableAction>& actions) const
{
    jassert (usePorts()); // channel-ports not yet supported
    actions.add (new AddConnectionAction (app, target, sourceNode, sourcePort, destNode, destPort));
}

void RemoveConnectionMessage::createActions (Services& app, OwnedArray<UndoableAction>& actions) const
{
    jassert (usePorts()); // channel-ports not yet supported
    actions.add (new RemoveConnectionAction (app, target, sourceNode, sourcePort, destNode, destPort));
}

void SpliceConnectionMessage::createActions (Services& app, OwnedArray<UndoableAction>& actions) const
{
    // Remove the original A→B first so the engine never momentarily sees B's
    // input contested, then wire A→new and new→B. All three actions are
    // performed inside ONE GuiService::handleMessage transaction, so a single
    // undo restores the original A→B cable (task #23).
    actions.add (new RemoveConnectionAction (app, target, aNode, aPort, bNode, bPort));
    actions.add (new AddConnectionAction (app, target, aNode, aPort, newNode, newInPort));
    actions.add (new AddConnectionAction (app, target, newNode, newOutPort, bNode, bPort));
}

void InsertRerouteMessage::createActions (Services& app, OwnedArray<UndoableAction>& actions) const
{
    actions.add (new InsertRerouteAction (app, *this));
}

} // namespace element
