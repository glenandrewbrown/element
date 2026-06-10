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

// P2-T16 — atomic, undoable "group a selection of Blocks into a Container".
//
// ONE UndoableAction so a single Cmd-Z removes the Container AND restores the
// previous board state (the original Blocks back at top level with their
// cables), and redo re-applies the whole group.
//
// perform(): snapshot every selected node (serialised data WITH plugin state,
// relative position, uuid, original node-id) and its arcs BEFORE grouping, then
// run EngineService::groupNodes — which absorbs the selection into a new
// Container and rewires every internal + boundary cable. The created Container's
// uuid is captured (and written back through the message's `result` holder so
// the host can answer the webview synchronously).
//
// undo(): remove the Container, then re-add each snapshotted original (preserving
// its uuid, exactly like RemoveNodeAction::undo) and restore its position. Node
// re-adds mint FRESH runtime node-ids, so the captured arcs (which reference the
// ORIGINAL ids) are remapped through an old-id→new-id table built by resolving
// each restored node by its stable uuid; arc endpoints OUTSIDE the selection keep
// their ids (those external nodes were never touched). Each unique arc is added
// once.
class GroupNodesAction : public juce::UndoableAction
{
public:
    GroupNodesAction (Services& a, const GroupNodesMessage& msg)
        : app (a), board (msg.board), nodeIds (msg.nodeIds), result (msg.result)
    {
    }

    bool perform() override
    {
        auto* ec = app.find<EngineService>();
        if (ec == nullptr || ! board.isGraph())
            return false;

        // --- Snapshot the originals BEFORE grouping (RemoveNodeAction recipe) ---
        captured.clear();
        for (const auto& uuid : nodeIds)
        {
            Node n (board.getNodeByUuid (uuid, false));
            if (! n.isValid())
                continue;

            auto* c = new Captured();
            c->uuid = n.getUuid();
            c->oldId = n.getNodeId();
            n.getRelativePosition (c->x, c->y);
            n.savePluginState();
            c->data = n.data().createCopy();
            Node::sanitizeRuntimeProperties (c->data);
            n.getArcs (c->arcs);
            captured.add (c);
        }

        const Node container (ec->groupNodes (board, nodeIds));
        if (! container.isValid())
        {
            captured.clear();
            if (result != nullptr)
                *result = juce::Uuid::null();
            return false;
        }

        containerUuid = container.getUuid();
        if (result != nullptr)
            *result = containerUuid;
        return true;
    }

    bool undo() override
    {
        auto* ec = app.find<EngineService>();
        if (ec == nullptr || ! board.isGraph() || containerUuid.isNull())
            return false;

        // Remove the Container first (frees the absorbed children + their wiring).
        const Node container (board.getNodeByUuid (containerUuid, false));
        if (container.isValid())
            ec->removeNode (container);

        // Re-add each original (uuid preserved → stable identity) + restore pos.
        juce::HashMap<juce::int64, juce::int64> oldToNew; // original node-id → restored node-id
        for (const auto* c : captured)
        {
            const Node newNode (c->data, false);
            Node created (ec->addNode (newNode, board, builder));
            if (! created.isValid())
                continue;
            created.setRelativePosition (c->x, c->y);
            oldToNew.set ((juce::int64) c->oldId, (juce::int64) created.getNodeId());
        }

        // Remap + restore each captured arc once. Endpoints inside the selection
        // map old→new; external endpoints (untouched) keep their original ids.
        auto remap = [&oldToNew] (uint32 id) -> uint32 {
            const juce::int64 key = (juce::int64) id;
            return oldToNew.contains (key) ? (uint32) (int) oldToNew[key] : id;
        };

        ValueTree boardArcs (board.getArcsValueTree());
        for (const auto* c : captured)
        {
            for (const auto* arc : c->arcs)
            {
                const uint32 s  = remap (arc->sourceNode);
                const uint32 sp = arc->sourcePort;
                const uint32 d  = remap (arc->destNode);
                const uint32 dp = arc->destPort;
                if (Node::connectionExists (boardArcs, s, sp, d, dp))
                    continue; // already restored (shared internal arc captured twice)
                ec->addConnection (s, sp, d, dp, board);
            }
        }

        return true;
    }

private:
    struct Captured
    {
        juce::ValueTree data;
        juce::Uuid uuid;
        uint32 oldId = 0;
        double x = 0.5, y = 0.5;
        juce::OwnedArray<Arc> arcs;
    };

    Services& app;
    const Node board;
    const juce::Array<juce::Uuid> nodeIds;
    const std::shared_ptr<juce::Uuid> result;
    ConnectionBuilder builder;

    juce::Uuid containerUuid;          // set on perform(), used by undo()
    juce::OwnedArray<Captured> captured; // snapshot of the originals (perform→undo)
};

//=============================================================================

void GroupNodesMessage::createActions (Services& app, OwnedArray<UndoableAction>& actions) const
{
    actions.add (new GroupNodesAction (app, *this));
}

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
