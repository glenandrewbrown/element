// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// T10 — "Group selection into a Container" END-TO-END test.
//
// Drives the REAL EngineService::groupNodes path against an engine-backed active
// graph (the default session from test::context() already attaches a
// RootGraphManager, so findGraphManagerFor resolves — unlike the model-only
// ContainerDiveTest fixture). Internal nodes are instantiated through
// EngineService::addPlugin (verified descriptions → in-process Internal nodes),
// then wired with EngineService::addConnection, exactly as the live host does.
//
// Asserts:
//   (a) grouping 2 audio Blocks yields a Container; the originals are gone and
//       the Container reports the expected nested node count;
//   (b) an internal CV arc INSIDE the selection is recreated inside the
//       Container;
//   (c) a boundary AUDIO arc from an unselected Block is re-routed end-to-end
//       (parent → Container port; IO node → inner Block);
//   (d) a ComparatorNode operator set BEFORE grouping survives (state restored
//       on the moved copy);
//   (e) elementEnterContainer dives into the freshly created Container;
//   (f) a boundary CV cable refuses the group (no Block change);
//   (g) an IO node in the selection refuses the group.
//
// Runs on the message thread (JuceMessageManagerFixture in TestMain.cpp). The
// host is built with skipBrowser=true. Reuses the BridgeContractTest friend
// wrapper for invokeForTest.

#include <boost/test/unit_test.hpp>

#include <element/audioengine.hpp>
#include <element/context.hpp>
#include <element/engine.hpp>
#include <element/graph.hpp>
#include <element/juce.hpp>
#include <element/node.hpp>
#include <element/services.hpp>
#include <element/session.hpp>
#include <element/ui.hpp> // GuiService (handleMessage / performUndo / performRedo)
#include <element/ui/element_webview_host.hpp>

#include "messages.hpp" // GroupNodesMessage / GroupNodesAction (P2-T16 undo)
#include "nodes/logicnodes.hpp" // ComparatorNode (Op enum, getOperator)
#include "services/sessionservice.hpp" // newSession / resetChanges (clean graph)
#include "fixture/ServicesFixture.hpp" // test::getService<T>()
#include "testutil.hpp"

using namespace element;
using namespace juce;

// ---------------------------------------------------------------------------
// Test-only friend wrapper (same one BridgeContractTest / ContainerDiveTest use).
class BridgeContractTest
{
public:
    static var invoke (ElementWebViewHost& host,
                       const String& name,
                       const Array<var>& args = {})
    {
        return host.invokeForTest (name, args);
    }
};

namespace {

// Reset to a clean active graph for each case. newSession() clears the session
// and installs a fresh "Board" root graph, then refreshOtherControllers() calls
// EngineService::sessionReloaded() which re-attaches a RootGraphManager — giving
// an engine-backed empty graph with no node leakage between cases. resetChanges()
// first so newSession() never raises the (blocking) save-changes dialog.
static Node freshActiveGraph()
{
    auto* ctx = test::context();
    if (ctx == nullptr)
        return Node();

    // The test Context never opens a real audio device, so by default the engine
    // reports 0 channels and never prepares its processors. Drive the headless
    // "external playback" prepare path so the engine reports 2 audio in/out
    // channels (the fresh Board below is then created with real audio ports, so
    // IONodeEnforcer installs the Audio/MIDI IO device child nodes — case g) and
    // so processors get prepared (addConnection's canConnect() sees live ports —
    // cases a/c — and Node::savePluginState() serialises processor state — case d).
    if (auto engine = ctx->audio())
        engine->prepareExternalPlayback (44100.0, 512, 2, 2);

    auto* es = test::getService<EngineService>();
    if (es == nullptr)
        return Node();

    auto sess = ctx->session();
    if (sess == nullptr)
        return Node();

    // Build a clean single-graph session deterministically (do NOT use
    // newSession(), which may load the user's configured default-session file —
    // arbitrary plugins + a port-less root graph). A fresh "Board" with the
    // engine's 2 audio + MIDI channels, installed as the active model graph, then
    // re-attached engine-side via sessionReloaded(): that clears prior holders
    // (no per-case leakage / double-attach), attaches a single RootGraphManager so
    // findGraphManagerFor resolves, and runs IONodeEnforcer — which installs the
    // Audio/MIDI IO device child nodes the test needs (case g).
    sess->clear();
    sess->addGraph (Graph::create ("Board", 2, 2, true, true), /*setActive=*/true);
    es->sessionReloaded();
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    // Re-prepare so the freshly-attached root graph (and its IO device nodes) are
    // prepared before the test adds and wires its blocks: addConnection's
    // canConnect() then sees live ports (cases a/c) and Node::savePluginState()
    // serialises processor state (case d).
    if (auto engine = ctx->audio())
        engine->prepareExternalPlayback (44100.0, 512, 2, 2);
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    const Node active (sess->getActiveGraph());
    return active.isGraph() ? active : Node();
}

// Add a verified internal node by identifier and return its model Node (carries
// a live nodeId + a fresh uuid). Empty on failure.
static Node addInternal (EngineService& es, const String& identifier)
{
    PluginDescription desc;
    desc.fileOrIdentifier = identifier;
    desc.name = identifier;
    desc.pluginFormatName = EL_NODE_FORMAT_NAME;
    return es.addPlugin (desc, /*verified=*/true, 0.5f, 0.5f, /*dontShowUI=*/true);
}

// Count direct children of a graph Node.
static int nodeCount (const Node& g) { return g.getNumNodes(); }

// True if a node with the given uuid is a DIRECT child of g.
static bool hasDirectChild (const Node& g, const String& uuid)
{
    return g.getNodeByUuid (Uuid (uuid), false).isValid();
}

// Find the first nested Container (graph Node) direct-child of g; empty if none.
static Node firstContainer (const Node& g)
{
    for (int i = 0; i < g.getNumNodes(); ++i)
    {
        const Node n (g.getNode (i));
        if (n.isGraph())
            return n;
    }
    return Node();
}

// Per-case fixture: tears the headless "external playback" prepare back down
// after every case. freshActiveGraph() drives prepareExternalPlayback() to give
// the engine live channels + prepared processors; AudioEngine::~Private asserts
// (and, in this teardown order, double-frees) if it is destroyed while still
// prepared. Releasing here keeps isPrepared=false at the global Context teardown.
struct PreparedEngineFixture
{
    ~PreparedEngineFixture()
    {
        if (auto* ctx = test::context())
            if (auto engine = ctx->audio())
                engine->releaseExternalResources();
    }
};

} // namespace

// ---------------------------------------------------------------------------
BOOST_FIXTURE_TEST_SUITE (GroupNodesTests, PreparedEngineFixture)

// ── (a) + (c) audio chain: group, originals gone, boundary audio re-routed ──
BOOST_AUTO_TEST_CASE (group_two_audio_nodes_creates_container_and_reroutes_boundary)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());

    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    // ext → [a → b] chain: ext is the unselected boundary source; a,b selected.
    const Node ext (addInternal (*es, "element.volume.stereo"));
    const Node a   (addInternal (*es, "element.volume.stereo"));
    const Node b   (addInternal (*es, "element.volume.stereo"));
    BOOST_REQUIRE (ext.isValid() && a.isValid() && b.isValid());

    // Wire ext.out0 → a.in0 (boundary audio), a.out0 → b.in0 (internal audio).
    // A stereo volume Block's port list is [0,1]=audio in, [2,3]=audio out, so the
    // first audio OUTPUT is port index 2 (port 0 is an INPUT — connecting from it
    // is rejected by GraphNode::canConnect's isPortOutput check).
    constexpr int kAudioOut0 = 2, kAudioIn0 = 0;
    es->addConnection (ext.getNodeId(), kAudioOut0, a.getNodeId(), kAudioIn0, active);
    es->addConnection (a.getNodeId(),   kAudioOut0, b.getNodeId(), kAudioIn0, active);
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    const int before = nodeCount (active);
    const String aUuid (a.getUuidString());
    const String bUuid (b.getUuidString());

    Array<Uuid> sel { a.getUuid(), b.getUuid() };
    const Node container (es->groupNodes (active, sel));
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    BOOST_REQUIRE_MESSAGE (container.isValid(), "groupNodes refused a valid 2-audio-node selection");
    BOOST_CHECK (container.isGraph());

    // Originals gone from the parent; container present.
    BOOST_CHECK (! hasDirectChild (active, aUuid));
    BOOST_CHECK (! hasDirectChild (active, bUuid));
    BOOST_CHECK (hasDirectChild (active, container.getUuidString()));

    // Parent lost 2 absorbed nodes but gained 1 container = before - 1.
    BOOST_CHECK_EQUAL (nodeCount (active), before - 1);

    // (c) Container holds the 2 moved Blocks + its 4 IO children = 6.
    BOOST_CHECK_EQUAL (container.getNumNodes(), 6);

    // Boundary audio re-route: a parent arc now targets the container, and an
    // inner arc leaves the Audio-In IO node toward a moved block.
    const ValueTree parentArcs (active.getArcsValueTree());
    bool parentToContainer = false;
    for (int i = 0; i < parentArcs.getNumChildren(); ++i)
        if ((uint32) (int64) parentArcs.getChild (i).getProperty (tags::destNode) == container.getNodeId())
            parentToContainer = true;
    BOOST_CHECK_MESSAGE (parentToContainer, "no parent arc re-routed into the container input port");

    const Node audioInIO (container.getIONode (PortType::Audio, true));
    BOOST_REQUIRE (audioInIO.isValid());
    const ValueTree innerArcs (container.getArcsValueTree());
    bool ioToInner = false;
    for (int i = 0; i < innerArcs.getNumChildren(); ++i)
        if ((uint32) (int64) innerArcs.getChild (i).getProperty (tags::sourceNode) == audioInIO.getNodeId())
            ioToInner = true;
    BOOST_CHECK_MESSAGE (ioToInner, "no inner arc from the Audio-In IO node to a moved block");
}

// ── (b) + (d) internal CV arc preserved + comparator op-state survives ──────
BOOST_AUTO_TEST_CASE (group_preserves_internal_cv_arc_and_comparator_state)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());

    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    // Two CV comparators, both selected, wired src.out(2) → dst.inA(0): the CV
    // arc lives ENTIRELY inside the selection (recreated inside the container).
    const Node src (addInternal (*es, "element.compare"));
    const Node dst (addInternal (*es, "element.compare"));
    BOOST_REQUIRE (src.isValid() && dst.isValid());

    // (d) set a NON-default operator on the source comparator before grouping.
    auto* srcProc = dynamic_cast<ComparatorNode*> (src.getObject());
    BOOST_REQUIRE (srcProc != nullptr);
    const int newOp = (int) ComparatorNode::Op::notEqual; // 5 (default = greater 0)
    srcProc->setOperator ((ComparatorNode::Op) newOp);
    BOOST_REQUIRE_EQUAL ((int) srcProc->getOperator(), newOp);

    es->addConnection (src.getNodeId(), 2, dst.getNodeId(), 0, active); // CV out → CV inA
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    Array<Uuid> sel { src.getUuid(), dst.getUuid() };
    const Node container (es->groupNodes (active, sel));
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    BOOST_REQUIRE_MESSAGE (container.isValid(), "groupNodes refused an internal-CV-only selection");

    // (b) the internal CV arc was recreated inside the container: exactly one
    // arc whose endpoints are BOTH moved (non-IO) blocks.
    const ValueTree innerArcs (container.getArcsValueTree());
    const Node audioInIO  (container.getIONode (PortType::Audio, true));
    const Node audioOutIO (container.getIONode (PortType::Audio, false));
    const Node midiInIO   (container.getIONode (PortType::Midi, true));
    const Node midiOutIO  (container.getIONode (PortType::Midi, false));
    auto isIO = [&] (uint32 id) {
        return id == audioInIO.getNodeId() || id == audioOutIO.getNodeId()
            || id == midiInIO.getNodeId() || id == midiOutIO.getNodeId();
    };
    bool internalCvFound = false;
    for (int i = 0; i < innerArcs.getNumChildren(); ++i)
    {
        const ValueTree a (innerArcs.getChild (i));
        const uint32 s = (uint32) (int64) a.getProperty (tags::sourceNode);
        const uint32 d = (uint32) (int64) a.getProperty (tags::destNode);
        if (! isIO (s) && ! isIO (d))
            internalCvFound = true;
    }
    BOOST_CHECK_MESSAGE (internalCvFound, "internal CV arc was not recreated inside the container");

    // (d) locate the moved comparator inside the container (the one with a CV
    // out arc) and assert its operator survived the move (state round-trip).
    bool stateSurvived = false;
    for (int i = 0; i < container.getNumNodes(); ++i)
    {
        const Node inner (container.getNode (i));
        if (auto* cp = dynamic_cast<ComparatorNode*> (inner.getObject()))
            if ((int) cp->getOperator() == newOp)
                stateSurvived = true;
    }
    BOOST_CHECK_MESSAGE (stateSurvived, "comparator operator did not survive grouping");
}

// ── (e) elementEnterContainer dives into the newly created container ─────────
BOOST_AUTO_TEST_CASE (enterContainer_dives_into_grouped_container)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());

    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    const Node a (addInternal (*es, "element.volume.stereo"));
    const Node b (addInternal (*es, "element.volume.stereo"));
    BOOST_REQUIRE (a.isValid() && b.isValid());

    Array<Uuid> sel { a.getUuid(), b.getUuid() };
    const Node container (es->groupNodes (active, sel));
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
    BOOST_REQUIRE (container.isValid());

    auto* ctx = test::context();
    ElementWebViewHost host (*ctx, /*skipBrowser=*/true);

    const var enterResult (BridgeContractTest::invoke (
        host, "elementEnterContainer", Array<var> { var (container.getUuidString()) }));
    BOOST_REQUIRE_MESSAGE (! enterResult.isVoid(), "elementEnterContainer returned void");
    BOOST_CHECK_MESSAGE ((bool) enterResult == true,
                         "elementEnterContainer did not dive into the grouped container");
}

// ── (f) boundary CV cable refuses the group (no Block change) ────────────────
BOOST_AUTO_TEST_CASE (boundary_cv_cable_refuses_group)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());

    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    // ext (unselected, CV out) → sel (selected, CV in). The CV cable crosses the
    // selection boundary → groupNodes must refuse (default containers have no CV
    // ports). A second selected node makes the selection otherwise eligible.
    const Node ext  (addInternal (*es, "element.compare"));
    const Node sel0 (addInternal (*es, "element.compare"));
    const Node sel1 (addInternal (*es, "element.compare"));
    BOOST_REQUIRE (ext.isValid() && sel0.isValid() && sel1.isValid());

    es->addConnection (ext.getNodeId(), 2, sel0.getNodeId(), 0, active); // CV boundary
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    const int before = nodeCount (active);
    Array<Uuid> sel { sel0.getUuid(), sel1.getUuid() };
    const Node container (es->groupNodes (active, sel));

    BOOST_CHECK_MESSAGE (! container.isValid(), "groupNodes accepted a boundary CV cable");
    // Graph unchanged: no container added, originals still present.
    BOOST_CHECK_EQUAL (nodeCount (active), before);
    BOOST_CHECK (hasDirectChild (active, sel0.getUuidString()));
    BOOST_CHECK (hasDirectChild (active, sel1.getUuidString()));
    BOOST_CHECK (! firstContainer (active).isValid());
}

// ── (g) an IO node in the selection refuses the group ───────────────────────
BOOST_AUTO_TEST_CASE (io_node_in_selection_refuses_group)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());

    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    // The active root graph already owns audio/midi IO device nodes. Select one
    // IO node + one real Block → ineligible (IO can't be absorbed).
    const Node ioNode (active.getIONode (PortType::Audio, true));
    BOOST_REQUIRE_MESSAGE (ioNode.isValid(), "active graph has no Audio-In IO node");

    const Node a (addInternal (*es, "element.volume.stereo"));
    BOOST_REQUIRE (a.isValid());

    const int before = nodeCount (active);
    Array<Uuid> sel { ioNode.getUuid(), a.getUuid() };
    const Node container (es->groupNodes (active, sel));

    BOOST_CHECK_MESSAGE (! container.isValid(), "groupNodes accepted an IO node in the selection");
    BOOST_CHECK_EQUAL (nodeCount (active), before);
    BOOST_CHECK (! firstContainer (active).isValid());
}

// ── (h) P2-T16 — group is ONE undoable transaction: undo removes the Container
//        and restores the originals at top level (+ their cables); redo re-applies ──
//
// Drives the SAME GroupNodesAction the production undo pipeline uses (the host's
// elementGroupNodes now dispatches GroupNodesMessage through
// GuiService::handleMessage, which performs the action inside one
// UndoManager::beginNewTransaction()). Exercising the action's perform()/undo()/
// perform() directly is exactly what UndoManager drives on Cmd-Z / redo — without
// depending on UI plumbing.
BOOST_AUTO_TEST_CASE (group_is_a_single_undoable_transaction)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());

    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    // ext → [a → b]: ext unselected boundary source; a,b selected. a→b is an
    // internal cable; ext→a is a boundary cable. Both must come back on undo.
    const Node ext (addInternal (*es, "element.volume.stereo"));
    const Node a   (addInternal (*es, "element.volume.stereo"));
    const Node b   (addInternal (*es, "element.volume.stereo"));
    BOOST_REQUIRE (ext.isValid() && a.isValid() && b.isValid());

    constexpr int kAudioOut0 = 2, kAudioIn0 = 0;
    es->addConnection (ext.getNodeId(), kAudioOut0, a.getNodeId(), kAudioIn0, active);
    es->addConnection (a.getNodeId(),   kAudioOut0, b.getNodeId(), kAudioIn0, active);
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    const int before = nodeCount (active);
    const String aUuid (a.getUuidString());
    const String bUuid (b.getUuidString());

    // Count parent arcs that touch a OR b before grouping (the cables that must
    // be restored on undo: ext→a boundary + a→b internal = 2).
    auto arcsTouching = [] (const Node& g, const String& u0, const String& u1) {
        const Node n0 (g.getNodeByUuid (Uuid (u0), false));
        const Node n1 (g.getNodeByUuid (Uuid (u1), false));
        const uint32 id0 = n0.isValid() ? n0.getNodeId() : 0;
        const uint32 id1 = n1.isValid() ? n1.getNodeId() : 0;
        const ValueTree arcs (g.getArcsValueTree());
        int count = 0;
        for (int i = 0; i < arcs.getNumChildren(); ++i)
        {
            const ValueTree arc (arcs.getChild (i));
            const uint32 s = (uint32) (int64) arc.getProperty (tags::sourceNode);
            const uint32 d = (uint32) (int64) arc.getProperty (tags::destNode);
            if (s == id0 || d == id0 || s == id1 || d == id1)
                ++count;
        }
        return count;
    };
    const int arcsBefore = arcsTouching (active, aUuid, bUuid);
    BOOST_REQUIRE_EQUAL (arcsBefore, 2);

    auto* gui = test::getService<GuiService>();
    BOOST_REQUIRE (gui != nullptr);

    // PERFORM via the real undoable message pipeline (handleMessage wraps it in a
    // single UndoManager transaction). The action writes the Container uuid back
    // through msg.result.
    Array<Uuid> sel { a.getUuid(), b.getUuid() };
    GroupNodesMessage msg (active, sel);
    BOOST_REQUIRE (gui->handleMessage (msg));
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    BOOST_REQUIRE_MESSAGE (msg.result != nullptr && ! msg.result->isNull(),
                           "GroupNodesMessage produced no Container uuid");
    const String containerUuid (msg.result->toString());

    // Grouped: originals gone, container present, count = before - 1.
    BOOST_CHECK (! hasDirectChild (active, aUuid));
    BOOST_CHECK (! hasDirectChild (active, bUuid));
    BOOST_CHECK (hasDirectChild (active, containerUuid));
    BOOST_CHECK_EQUAL (nodeCount (active), before - 1);

    // UNDO (Cmd-Z): container gone, the 2 originals back at top level (by uuid),
    // node count restored, and their 2 cables (boundary + internal) restored.
    gui->performUndo();
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    BOOST_CHECK_MESSAGE (! hasDirectChild (active, containerUuid),
                         "undo did not remove the Container");
    BOOST_CHECK_MESSAGE (hasDirectChild (active, aUuid), "undo did not restore node a");
    BOOST_CHECK_MESSAGE (hasDirectChild (active, bUuid), "undo did not restore node b");
    BOOST_CHECK_EQUAL (nodeCount (active), before);
    BOOST_CHECK_MESSAGE (arcsTouching (active, aUuid, bUuid) == 2,
                         "undo did not restore both cables (boundary + internal)");

    // REDO: the group re-applies — originals absorbed again, a container present.
    gui->performRedo();
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    BOOST_CHECK_MESSAGE (! hasDirectChild (active, aUuid), "redo did not re-absorb node a");
    BOOST_CHECK_MESSAGE (! hasDirectChild (active, bUuid), "redo did not re-absorb node b");
    BOOST_CHECK_MESSAGE (firstContainer (active).isValid(), "redo did not recreate a Container");
    BOOST_CHECK_EQUAL (nodeCount (active), before - 1);
}

BOOST_AUTO_TEST_SUITE_END()
