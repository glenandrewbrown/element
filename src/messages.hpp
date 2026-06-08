// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/core.hpp>
#include <element/juce/data_structures.hpp>

#include <element/controller.hpp>
#include <element/node.hpp>

namespace element {

class Services;
class ContentView;
class Context;

class Action : public juce::UndoableAction
{
public:
    virtual ~Action() {}

protected:
    Action() {}
};

struct AppMessage : public juce::Message
{
    enum ID
    {

    };

    inline virtual void createActions (Services&, juce::OwnedArray<juce::UndoableAction>&) const {}
};

struct AddMidiDeviceMessage : public AppMessage
{
    AddMidiDeviceMessage (const juce::MidiDeviceInfo& dev, const bool isInput)
        : device (dev), inputDevice (isInput) {}
    const juce::MidiDeviceInfo device;
    const bool inputDevice;
};

/** Send this to add a preset for a node */
struct AddPresetMessage : public AppMessage
{
    AddPresetMessage (const Node& n, const juce::String& name_ = String())
        : node (n), name (name_) {}
    ~AddPresetMessage() noexcept {}
    const Node node;
    const juce::String name;
};

/** Send this to add a preset for a node */
struct SaveDefaultNodeMessage : public AppMessage
{
    SaveDefaultNodeMessage (const Node& n) : node (n) {}
    ~SaveDefaultNodeMessage() noexcept {}
    const Node node;
};

/** Send this to remove a node from the current graph */
struct RemoveNodeMessage : public AppMessage
{
    RemoveNodeMessage (const Node& n) : nodeId (n.getNodeId()), node (n) {}
    RemoveNodeMessage (const NodeArray& n) : nodeId (EL_INVALID_NODE) { nodes.addArray (n); }
    RemoveNodeMessage (const uint32 _nodeId) : nodeId (_nodeId) {}
    const uint32_t nodeId;
    const Node node;
    NodeArray nodes;

    virtual void createActions (Services& app, juce::OwnedArray<juce::UndoableAction>& actions) const;
};

/** Send this to add a new connection */
struct AddConnectionMessage : public AppMessage
{
    AddConnectionMessage (uint32_t s, int sc, uint32_t d, int dc, const Node& tgt = Node())
        : target (tgt)
    {
        sourceNode = s;
        destNode = d;
        sourceChannel = sc;
        destChannel = dc;
        sourcePort = destPort = EL_INVALID_PORT;
        jassert (useChannels());
    }

    AddConnectionMessage (uint32_t s, uint32_t sp, uint32_t d, uint32_t dp, const Node& tgt = Node())
        : target (tgt)
    {
        sourceNode = s;
        destNode = d;
        sourcePort = sp;
        destPort = dp;
        sourceChannel = destChannel = -1;
        jassert (usePorts());
    }

    uint32_t sourceNode, sourcePort, destNode, destPort;
    int sourceChannel, destChannel;

    const Node target;

    inline bool useChannels() const { return sourceChannel >= 0 && destChannel >= 0; }
    inline bool usePorts() const { return ! useChannels(); }
    void createActions (Services& app, juce::OwnedArray<juce::UndoableAction>& actions) const override;
};

/** Send this to remove a connection from the graph */
class RemoveConnectionMessage : public AppMessage
{
public:
    RemoveConnectionMessage (uint32 s, int sc, uint32 d, int dc, const Node& t = Node())
        : target (t)
    {
        sourceNode = s;
        destNode = d;
        sourceChannel = sc;
        destChannel = dc;
        sourcePort = destPort = EL_INVALID_PORT;
        jassert (useChannels());
    }

    RemoveConnectionMessage (uint32 s, uint32 sp, uint32 d, uint32 dp, const Node& t = Node())
        : target (t)
    {
        sourceNode = s;
        destNode = d;
        sourcePort = sp;
        destPort = dp;
        sourceChannel = destChannel = -1;
        jassert (usePorts());
    }

    uint32_t sourceNode, sourcePort, destNode, destPort;
    int sourceChannel, destChannel;
    const Node target;

    inline bool useChannels() const { return sourceChannel >= 0 && destChannel >= 0; }
    inline bool usePorts() const { return ! useChannels(); }
    void createActions (Services& app, juce::OwnedArray<juce::UndoableAction>& actions) const override;
};

/** Splice a node INTO an existing connection as a SINGLE undoable operation.
    Removes the original A→B cable and adds A→new and new→B. Because
    GuiService::handleMessage performs ALL of one message's actions inside a
    single UndoManager::beginNewTransaction(), a single undo restores the
    original A→B cable (task #23 — "adding blocks into existing chains must be
    seamless"). Ports are graph port indices (the same units AddConnectionMessage
    uses): aPort/newOutPort are outputs, newInPort/bPort are inputs. */
class SpliceConnectionMessage : public AppMessage
{
public:
    SpliceConnectionMessage (uint32_t aNode_, uint32_t aPort_,
                             uint32_t newNode_, uint32_t newInPort_, uint32_t newOutPort_,
                             uint32_t bNode_, uint32_t bPort_,
                             const Node& t = Node())
        : aNode (aNode_), aPort (aPort_),
          newNode (newNode_), newInPort (newInPort_), newOutPort (newOutPort_),
          bNode (bNode_), bPort (bPort_), target (t)
    {
    }

    const uint32_t aNode, aPort;
    const uint32_t newNode, newInPort, newOutPort;
    const uint32_t bNode, bPort;
    const Node target;

    void createActions (Services& app, juce::OwnedArray<juce::UndoableAction>& actions) const override;
};

/** Wave-3 Task 5.1 — insert a brand-new Reroute "knot" INTO an existing cable
    A→B as a SINGLE undoable operation (double-click a Cable). Unlike
    SpliceConnectionMessage (which splices an EXISTING node, resolved by id at
    construction time), the reroute node does not exist yet — so this carries the
    reroute's PluginDescription and the single action ADDS it server-side, then
    removes A→B and wires A→reroute→B. Because the whole thing is ONE
    UndoableAction, a single undo removes the reroute and restores the original
    A→B cable.

    The reroute's in/out ports are resolved by PortType at perform() time (the
    node's real ports only exist after the add), choosing the first input + first
    output of `signalType` ("audio" | "midi" | "value"). aPort is the source
    side's output graph port index; bPort is the target side's input graph port
    index (same units AddConnectionMessage uses). */
class InsertRerouteMessage : public AppMessage
{
public:
    InsertRerouteMessage (const Node& graph_,
                          const juce::PluginDescription& reroute_,
                          uint32_t aNode_, uint32_t aPort_,
                          uint32_t bNode_, uint32_t bPort_,
                          const juce::String& signalType_,
                          double x_, double y_)
        : graph (graph_), reroute (reroute_),
          aNode (aNode_), aPort (aPort_),
          bNode (bNode_), bPort (bPort_),
          signalType (signalType_), x (x_), y (y_)
    {
    }

    const Node graph;
    const juce::PluginDescription reroute;
    const uint32_t aNode, aPort;
    const uint32_t bNode, bPort;
    const juce::String signalType;
    const double x, y;

    void createActions (Services& app, juce::OwnedArray<juce::UndoableAction>& actions) const override;
};

class AddNodeMessage : public juce::Message
{
public:
    AddNodeMessage (const Node& n, const Node& t = Node(), const File& f = File())
        : node (Node::resetIds (n.data().createCopy()), false),
          target (t),
          sourceFile (f)
    {
    }

    const Node node;
    const Node target;
    ConnectionBuilder builder;
    const File sourceFile;
};

/** Send this when a plugin needs loaded into the graph */
class LoadPluginMessage : public juce::Message
{
public:
    LoadPluginMessage (const juce::PluginDescription& pluginDescription, const bool pluginVerified)
        : Message(), description (pluginDescription), verified (pluginVerified) {}
    LoadPluginMessage (const juce::PluginDescription& d, const bool v, const float rx, const float ry)
        : Message(), description (d), relativeX (rx), relativeY (ry), verified (v) {}
    ~LoadPluginMessage() {}

    /** Descriptoin of the plugin to load */
    const juce::PluginDescription description;

    /** Relative X of the node UI in a graph editor */
    const float relativeX = 0.5f;

    /** Relative X of the node UI in a graph editor */
    const float relativeY = 0.5f;

    /** Whether or not this plugin has been vetted yet */
    const bool verified;
};

struct AddPluginMessage : public AppMessage
{
    AddPluginMessage (const Node& g, const juce::PluginDescription& d, const bool v = true)
        : graph (g), description (d), verified (v)
    {
    }

    const Node graph;
    const juce::PluginDescription description;
    const bool verified;
    ConnectionBuilder builder;
    void createActions (Services& app, juce::OwnedArray<juce::UndoableAction>& actions) const override;
};

struct ReplaceNodeMessage : public AppMessage
{
    ReplaceNodeMessage (const Node& n, const juce::PluginDescription& d, const bool v = true)
        : graph (n.getParentGraph()), node (n), description (d), verified (v) {}
    const Node graph;
    const Node node;
    const juce::PluginDescription description;
    const bool verified;
    boost::signals2::signal<void()> success;
};

class DuplicateNodeMessage : public juce::Message
{
public:
    DuplicateNodeMessage (const Node& n)
        : Message(), node (n) {}
    DuplicateNodeMessage() {}
    const Node node;
};

class DisconnectNodeMessage : public juce::Message
{
public:
    DisconnectNodeMessage (const Node& n, const bool i = true, const bool o = true, const bool a = true, const bool m = true)
        : Message(), node (n), inputs (i), outputs (o), audio (a), midi (m) {}
    DisconnectNodeMessage()
        : Message(), inputs (true), outputs (true), audio (true), midi (true) {}
    const Node node;
    const bool inputs, outputs;
    const bool audio, midi;
};

struct FinishedLaunchingMessage : public AppMessage
{
    FinishedLaunchingMessage() {}
    ~FinishedLaunchingMessage() {}
};

struct ChangeBusesLayout : public AppMessage
{
    ChangeBusesLayout (const Node& n, const juce::AudioProcessor::BusesLayout& l)
        : node (n), layout (l) {}
    const Node node;
    const juce::AudioProcessor::BusesLayout layout;
    std::function<void()> onFinished;
};

struct OpenSessionMessage : public AppMessage
{
    OpenSessionMessage (const File& f) : file (f) {}
    ~OpenSessionMessage() {}
    const File file;
};

//=============================================================================
struct RefreshControllerMessage : public AppMessage
{
    RefreshControllerMessage (const Controller& d)
        : device (d) {}
    ~RefreshControllerMessage() {}
    const Controller device;
};

struct AddControllerMessage : public AppMessage
{
    AddControllerMessage (const Controller& d)
        : device (d) {}
    AddControllerMessage (const File& f)
        : file (f) {}
    ~AddControllerMessage() noexcept {}
    const Controller device;
    const File file;
};

struct RemoveControllerMessage : public AppMessage
{
    RemoveControllerMessage (const Controller& d)
        : device (d) {}
    ~RemoveControllerMessage() noexcept {}
    const Controller device;
};

struct AddControlMessage : public AppMessage
{
    AddControlMessage (const Controller& d, const Control& c)
        : device (d), control (c) {}
    ~AddControlMessage() noexcept {}
    const Controller device;
    const Control control;
};

struct RemoveControlMessage : public AppMessage
{
    RemoveControlMessage (const Controller& d, const Control& c)
        : device (d), control (c) {}
    ~RemoveControlMessage() noexcept {}
    const Controller device;
    const Control control;
};

struct RemoveControllerMapMessage : public AppMessage
{
    RemoveControllerMapMessage (const ControllerMap& mapp)
        : controllerMap (mapp) {}
    ~RemoveControllerMapMessage() noexcept {}
    const ControllerMap controllerMap;
};

//=============================================================================
struct WorkspaceOpenFileMessage : public AppMessage
{
    WorkspaceOpenFileMessage (const File& f) : file (f) {}
    ~WorkspaceOpenFileMessage() noexcept {}
    const File file;
};

struct ReloadMainContentMessage : public AppMessage
{
    explicit ReloadMainContentMessage (const String& t = String()) : type (t) {}
    ~ReloadMainContentMessage() noexcept {}
    const String type;
};

} // namespace element
