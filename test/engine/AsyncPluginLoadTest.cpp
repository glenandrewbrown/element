// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Wave-3 Phase 4 — async plugin load + UUID-preserving in-place swap.
//
// These tests prove the HARD invariants of the loading-node contract
// (.omo/plans/phase0-loading-node-contract.md) at the ENGINE level:
//   (a) the placeholder→real swap PRESERVES the model node UUID (uuid_before == uuid_after);
//   (b) the swap writes into the SAME ValueTree (the model node is NOT removed+re-added —
//       the nodes-tree child identity is stable across the swap);
//   (c) a LOADING node exposes NO connectable SIGNAL ports until ready: it carries the
//       transient tags::loading flag and has ZERO audio ports (the real plugin's signal
//       ports appear only on ready). NB: Processor::setPorts (processor.cpp:718-724)
//       auto-provisions one implicit "element_midi_input" port on EVERY non-IO node, so
//       the engine-level "no connectable ports" is expressed as "no audio ports while
//       loading" + the host snapshot emitting an EMPTY ports array (host gate, verified
//       separately by the webview build);
//   (d) the desc-overload add MINTS A NEW uuid each time (anti-regression: this is exactly
//       why routing a loading→ready swap through EngineService::replace would detach the
//       React Block — DO NOT use replace);
//   (e) the swap drives the op-republish via the engine API (the real processor is live on
//       the engine graph after the swap — addNode/removeNode were called, which trigger
//       buildRenderingSequence → activeRenderingOps.exchange(acq_rel)).
//
// Mechanism: a real juce::AudioPluginFormat (TestEchoPluginFormat, available only in
// test_element via EL_SANDBOX_INCLUDE_TEST_FORMATS) is registered into the test
// PluginManager so GraphManager::addNode takes the EXTERNAL-plugin async path. JUCE
// posts the createPluginInstanceAsync completion to the MESSAGE THREAD, so each test
// pumps the dispatch loop to let the swap complete deterministically.
//
// NB: setNodeModel on a root graph enforces the 4 default IO nodes (Audio/MIDI In/Out)
// into the model + engine, so the plugin under test is NOT the only node. The helper
// resolves it by UUID and asserts node-count DELTAS off the post-setup baseline.

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/node.hpp>
#include <element/plugins.hpp>
#include <element/tags.hpp>

#include "engine/graphmanager.hpp"
#include "engine/graphnode.hpp"
#include "engine/test_echo_plugin.hpp"
#include "nodes/placeholder.hpp"
#include "testutil.hpp"

using namespace element;

namespace {

// Register the file-less test format into the shared test PluginManager exactly
// once. After this, a PluginDescription with pluginFormatName == "Test" /
// fileOrIdentifier == "ElementTestEcho" resolves to a real AudioPluginFormat, so
// GraphManager::addNode takes the async external-plugin path.
void ensureTestFormatRegistered()
{
    auto& pm = test::context()->plugins();
    if (pm.getAudioPluginFormat (kTestEchoFormatName) != nullptr)
        return;
    pm.getAudioPluginFormats().addFormat (std::make_unique<TestEchoPluginFormat>());
}

PluginDescription testEchoDescription()
{
    PluginDescription d;
    d.name = kTestEchoIdentifier;
    d.pluginFormatName = kTestEchoFormatName;
    d.fileOrIdentifier = kTestEchoIdentifier;
    d.uniqueId = kTestEchoUniqueId;
    d.deprecatedUid = kTestEchoUniqueId;
    d.numInputChannels = 0;
    d.numOutputChannels = 2;
    return d;
}

// A description with an EMPTY catalog name (a plugin scanned with name=="") — the
// format still resolves on fileOrIdentifier == kTestEchoIdentifier, so the async add
// proceeds and the loaded instance's real getName() is kTestEchoIdentifier. Used to
// prove the UltraQA naming contract: the placeholder is never blank, and the swap
// re-affirms the real plugin name (not "Node"/blank). NB: leaving descriptiveName
// empty too forces the data layer to fall back to the loaded instance name.
PluginDescription testEchoDescriptionNoName()
{
    PluginDescription d (testEchoDescription());
    d.name = String();
    d.descriptiveName = String();
    return d;
}

// A real, prepared GraphManager driving a root-graph model. setNodeModel enforces
// the 4 default IO nodes, recorded as `baseNodeCount` so tests assert DELTAS and
// resolve the plugin under test by UUID (not by index).
//
// The GraphNode is HEAP-allocated and held via a ProcessorPtr (Processor is a
// juce::ReferenceCountedObject). This matters: setNodeModel installs a
// NodeModelUpdater that holds a ProcessorPtr back to the graph, and the graph
// model tree references node processors. Heap + ref-counting makes those
// references valid through teardown (a stack/member GraphNode would be
// double-freed by the updater's ProcessorPtr at destruction — the same teardown
// SIGABRT that quarantines the legacy GraphManagerTests). Teardown order:
// `mgr` (declared after `graph`) destructs first and releases its references,
// then the graph's last reference drops and frees it exactly once.
struct ManagedGraph
{
    ProcessorPtr graph;
    GraphManager mgr;
    Node model;
    int baseNodeCount = 0;

    ManagedGraph (double sampleRate = 44100.0, int blockSize = 512)
        : graph (new GraphNode (*test::context())),
          mgr (*dynamic_cast<GraphNode*> (graph.get()), test::context()->plugins()),
          model (types::Graph)
    {
        dynamic_cast<GraphNode*> (graph.get())->prepareToRender (sampleRate, blockSize);
        mgr.setNodeModel (model);
        baseNodeCount = model.getNumNodes(); // 4 enforced IO nodes
    }

    ~ManagedGraph()
    {
        // Tear the engine graph down explicitly before the ProcessorPtr drops, so
        // node processors release while the graph is still alive.
        mgr.clear();
        if (auto* g = dynamic_cast<GraphNode*> (graph.get()))
        {
            g->releaseResources();
            g->clear();
        }
    }

    // Resolve a node in the MODEL tree by uuid (mirrors how the webview resolves a
    // Block back to its node — the identity that must be stable across the swap).
    Node modelNodeByUuid (const String& uuid) const
    {
        const auto nodes = model.getNodesValueTree();
        for (int i = 0; i < nodes.getNumChildren(); ++i)
        {
            const Node n (nodes.getChild (i), false);
            if (n.getUuidString() == uuid)
                return n;
        }
        return {};
    }
};

// Audio-port count on a model node (the real-plugin SIGNAL ports). 0 while
// loading; > 0 once the real processor (TestEcho: 2 audio outs) has swapped in.
int audioPortCount (const Node& n)
{
    PortArray ins, outs;
    n.getPorts (ins, outs, PortType::Audio);
    return ins.size() + outs.size();
}

// Is this engine node a PlaceholderProcessor? The engine wraps every plugin in an
// AudioProcessorNode, so getNodeForId returns the WRAPPER (a dynamic_cast to
// PlaceholderProcessor on the wrapper fails). Look through to the inner
// AudioProcessor; fall back to the surfaced name ("Placeholder").
bool isPlaceholder (const ProcessorPtr& proc)
{
    if (proc == nullptr)
        return false;
    if (auto* inner = proc->getAudioProcessor())
        if (dynamic_cast<PlaceholderProcessor*> (inner) != nullptr)
            return true;
    return proc->getName() == "Placeholder";
}

// Pump the JUCE message loop until `pred` is true or the timeout elapses. The
// createPluginInstanceAsync completion (and therefore the swap) is delivered as a
// posted message, so the swap only happens while the dispatch loop runs.
template <typename Pred>
bool pumpUntil (Pred pred, int timeoutMs = 2000)
{
    const auto deadline = juce::Time::getMillisecondCounter() + (juce::uint32) timeoutMs;
    while (! pred() && juce::Time::getMillisecondCounter() < deadline)
        juce::MessageManager::getInstance()->runDispatchLoopUntil (20);
    return pred();
}

} // namespace

// ─────────────────────────────────────────────────────────────────────────────
BOOST_AUTO_TEST_SUITE (AsyncPluginLoadTests)

// (c) — A freshly added external plugin is LOADING: the model node exists with a
// stable uuid, carries tags::loading, and exposes NO audio (signal) ports.
BOOST_AUTO_TEST_CASE (loading_node_has_no_audio_ports_and_loading_flag)
{
    ensureTestFormatRegistered();
    ManagedGraph g;

    const auto desc = testEchoDescription();
    const uint32 nodeId = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    BOOST_REQUIRE (nodeId != EL_INVALID_NODE);

    // Synchronously (BEFORE pumping the loop) the placeholder is in the model.
    const Node loading = g.mgr.getNodeModelForId (nodeId);
    BOOST_REQUIRE (loading.isValid());
    BOOST_CHECK (loading.getUuidString().isNotEmpty());        // final uuid stamped at creation
    BOOST_CHECK ((bool) loading.getProperty (tags::loading, false)); // transient marker set
    BOOST_CHECK_EQUAL (audioPortCount (loading), 0);           // NO connectable signal ports while loading
    BOOST_CHECK_EQUAL (g.model.getNumNodes(), g.baseNodeCount + 1); // exactly one node added
}

// (a)+(b)+(e) — On the message-thread callback the placeholder swaps to the real
// processor: the UUID is PRESERVED, the SAME ValueTree is reused (not remove+add),
// real audio ports appear, the loading flag clears, and the real processor is live
// on the engine graph (proving the engine addNode path ran → op-republish triggered).
BOOST_AUTO_TEST_CASE (swap_preserves_uuid_same_tree_and_republishes)
{
    ensureTestFormatRegistered();
    ManagedGraph g;

    const auto desc = testEchoDescription();
    const uint32 placeholderId = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    BOOST_REQUIRE (placeholderId != EL_INVALID_NODE);

    const Node before = g.mgr.getNodeModelForId (placeholderId);
    BOOST_REQUIRE (before.isValid());
    const String uuidBefore = before.getUuidString();
    // Capture the identity of the model ValueTree child so we can prove it is the
    // SAME object after the swap (an in-place write, not a remove+re-add).
    const juce::ValueTree treeBefore = before.data();
    BOOST_REQUIRE_EQUAL (g.model.getNumNodes(), g.baseNodeCount + 1);

    // Let the async completion fire on the message thread → swap runs.
    const bool ready = pumpUntil ([&] {
        const Node n (g.modelNodeByUuid (uuidBefore));
        return n.isValid() && ! (bool) n.getProperty (tags::loading, false);
    });
    BOOST_REQUIRE (ready);

    // The node count is unchanged — the model node was NOT removed and re-added.
    BOOST_CHECK_EQUAL (g.model.getNumNodes(), g.baseNodeCount + 1);

    const Node after (g.modelNodeByUuid (uuidBefore));
    BOOST_REQUIRE (after.isValid());

    // (a) UUID preserved across the swap (it was found by that uuid, and re-assert).
    BOOST_CHECK_EQUAL (after.getUuidString().toStdString(), uuidBefore.toStdString());

    // (b) SAME ValueTree object (juce::ValueTree::operator== is identity for the
    //     shared underlying object) → the swap wrote in place.
    BOOST_CHECK (after.data() == treeBefore);

    // loading flag cleared on ready.
    BOOST_CHECK (! (bool) after.getProperty (tags::loading, false));

    // Real audio ports now present (TestEcho is 0-in / 2-out → 2 audio outs).
    BOOST_CHECK_GT (audioPortCount (after), 0);

    // (e) The REAL processor is live on the engine graph under the (possibly new)
    //     engine nodeId — proving processor.addNode(real) ran, which triggers the
    //     lock-free op-republish (buildRenderingSequence → exchange(acq_rel)).
    const uint32 readyEngineId = after.getNodeId();
    const ProcessorPtr engineProc = g.mgr.getNodeForId (readyEngineId);
    BOOST_REQUIRE (engineProc != nullptr);
    BOOST_CHECK (! isPlaceholder (engineProc)); // NOT the placeholder anymore
}

// (e) — Engine-truth: a freshly added external plugin is a PlaceholderProcessor on
// the engine graph (synchronously, before the loop is pumped), and is REPLACED by
// a non-placeholder real processor after the swap. This is the engine side of the
// republish (removeNode(placeholder) → addNode(real)).
BOOST_AUTO_TEST_CASE (engine_processor_swaps_from_placeholder_to_real)
{
    ensureTestFormatRegistered();
    ManagedGraph g;

    const auto desc = testEchoDescription();
    const uint32 placeholderId = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    BOOST_REQUIRE (placeholderId != EL_INVALID_NODE);
    const Node justAdded = g.mgr.getNodeModelForId (placeholderId);
    BOOST_REQUIRE (justAdded.isValid());
    const String uuid = justAdded.getUuidString();

    // Synchronously the model node is still LOADING and its engine processor is a
    // PlaceholderProcessor (the swap runs only when the message loop is pumped).
    BOOST_CHECK ((bool) justAdded.getProperty (tags::loading, false));
    const ProcessorPtr phProc = g.mgr.getNodeForId (placeholderId);
    BOOST_REQUIRE (phProc != nullptr);
    BOOST_CHECK (isPlaceholder (phProc));

    const bool ready = pumpUntil ([&] {
        const Node n (g.modelNodeByUuid (uuid));
        return n.isValid() && ! (bool) n.getProperty (tags::loading, false);
    });
    BOOST_REQUIRE (ready);

    // After swap: node count unchanged, and the engine node (under its current id)
    // is NOT a placeholder.
    BOOST_CHECK_EQUAL (g.mgr.getNumNodes(), g.baseNodeCount + 1);
    const Node after (g.modelNodeByUuid (uuid));
    BOOST_REQUIRE (after.isValid());
    const ProcessorPtr realProc = g.mgr.getNodeForId (after.getNodeId());
    BOOST_REQUIRE (realProc != nullptr);
    BOOST_CHECK (! isPlaceholder (realProc));
}

// (d) — ANTI-REGRESSION: the desc-overload add MINTS A NEW uuid each time. This is
// exactly why routing the loading→ready swap through EngineService::replace (which
// add-news then removes-old) would detach the React Block — DO NOT use replace.
BOOST_AUTO_TEST_CASE (desc_overload_add_mints_new_uuid_anti_pattern)
{
    ensureTestFormatRegistered();
    ManagedGraph g;

    const auto desc = testEchoDescription();

    const uint32 id1 = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    BOOST_REQUIRE (id1 != EL_INVALID_NODE);
    const String uuid1 = g.mgr.getNodeModelForId (id1).getUuidString();

    const uint32 id2 = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    BOOST_REQUIRE (id2 != EL_INVALID_NODE);
    const String uuid2 = g.mgr.getNodeModelForId (id2).getUuidString();

    BOOST_CHECK (uuid1.isNotEmpty());
    BOOST_CHECK (uuid2.isNotEmpty());
    // Two desc-overload adds → two DISTINCT uuids. A replace-based swap reuses this
    // mint path → the new node carries a different uuid than the one being replaced.
    BOOST_CHECK (uuid1 != uuid2);
}

// Deleting the node WHILE it is loading must not crash and the late async callback
// must be a safe no-op (resolve-by-uuid fails → instance dropped).
BOOST_AUTO_TEST_CASE (delete_while_loading_then_callback_is_safe)
{
    ensureTestFormatRegistered();
    ManagedGraph g;

    const auto desc = testEchoDescription();
    const uint32 nodeId = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    BOOST_REQUIRE (nodeId != EL_INVALID_NODE);
    BOOST_CHECK_EQUAL (g.mgr.getNumNodes(), g.baseNodeCount + 1);

    // Remove the loading node BEFORE pumping the loop (callback not yet delivered).
    g.mgr.removeNode (nodeId);
    BOOST_CHECK_EQUAL (g.mgr.getNumNodes(), g.baseNodeCount);

    // Pump: the late completion resolves-by-uuid, finds nothing, drops the instance.
    juce::MessageManager::getInstance()->runDispatchLoopUntil (300);

    // No node resurrected; no crash.
    BOOST_CHECK_EQUAL (g.mgr.getNumNodes(), g.baseNodeCount);
}

// ── UltraQA naming (CONTRACT 2) ──────────────────────────────────────────────
// A plugin added with a non-empty catalog name keeps it on the loading placeholder
// AND after the swap (the real instance name matches, so no spurious rewrite).
BOOST_AUTO_TEST_CASE (loaded_block_name_is_plugin_name_not_node)
{
    ensureTestFormatRegistered();
    ManagedGraph g;

    const auto desc = testEchoDescription();
    const uint32 nodeId = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    BOOST_REQUIRE (nodeId != EL_INVALID_NODE);

    const Node loading = g.mgr.getNodeModelForId (nodeId);
    BOOST_REQUIRE (loading.isValid());
    const String uuid = loading.getUuidString();
    // Placeholder carries the catalog name immediately — never blank, never "Node".
    BOOST_CHECK_EQUAL (loading.getName().toStdString(), String (kTestEchoIdentifier).toStdString());

    const bool ready = pumpUntil ([&] {
        const Node n (g.modelNodeByUuid (uuid));
        return n.isValid() && ! (bool) n.getProperty (tags::loading, false);
    });
    BOOST_REQUIRE (ready);

    const Node after (g.modelNodeByUuid (uuid));
    BOOST_REQUIRE (after.isValid());
    // After swap the name is the loaded instance's real name (still not "Node"/blank).
    BOOST_CHECK (after.getName().isNotEmpty());
    BOOST_CHECK (! after.getName().equalsIgnoreCase ("Node"));
    BOOST_CHECK_EQUAL (after.getName().toStdString(), String (kTestEchoIdentifier).toStdString());
}

// An EMPTY catalog name must NOT produce a blank/"(unnamed)"/"Node" block: the
// placeholder stamp is guarded to a non-empty sentinel, and the swap re-affirms the
// LOADED instance's real name (INV-naming §(a)/(b) — the historical async-load bug).
BOOST_AUTO_TEST_CASE (empty_catalog_name_heals_to_real_plugin_name_on_swap)
{
    ensureTestFormatRegistered();
    ManagedGraph g;

    const auto desc = testEchoDescriptionNoName();
    BOOST_REQUIRE (desc.name.isEmpty()); // precondition: scanned with no name
    const uint32 nodeId = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    BOOST_REQUIRE (nodeId != EL_INVALID_NODE);

    const Node loading = g.mgr.getNodeModelForId (nodeId);
    BOOST_REQUIRE (loading.isValid());
    const String uuid = loading.getUuidString();
    // CONTRACT 2: the placeholder name is never empty even when desc.name was empty.
    BOOST_CHECK (loading.getName().isNotEmpty());

    const bool ready = pumpUntil ([&] {
        const Node n (g.modelNodeByUuid (uuid));
        return n.isValid() && ! (bool) n.getProperty (tags::loading, false);
    });
    BOOST_REQUIRE (ready);

    const Node after (g.modelNodeByUuid (uuid));
    BOOST_REQUIRE (after.isValid());
    // Healed to the loaded instance's real name — not blank, not "Node", not the
    // "Plugin" sentinel the empty placeholder fell back to.
    BOOST_CHECK (after.getName().isNotEmpty());
    BOOST_CHECK (! after.getName().equalsIgnoreCase ("Node"));
    BOOST_CHECK (after.getName() != "Plugin");
    BOOST_CHECK_EQUAL (after.getName().toStdString(), String (kTestEchoIdentifier).toStdString());
}

BOOST_AUTO_TEST_SUITE_END()
