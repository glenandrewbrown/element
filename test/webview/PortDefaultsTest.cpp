// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Wave-1 Item 1 — "smart port defaults + auto-cabled first drop" END-TO-END.
//
// Two layers, per product-feedback-v4-2026-06-06.md §2 Item 1:
//
//   (1) classifyNodePorts() — a PURE capability classifier (node → needed
//       audio/MIDI IO) read from the REAL instantiated node's ports, NOT the
//       PluginDescription `signalOut` UI heuristic (element_webview_host.cpp:6516,
//       which tags internal MIDI nodes "value"). The internal-MIDI case
//       (element.midiTranspose) is covered explicitly — it MUST classify as MIDI
//       in+out, never "value".
//
//   (2) EngineService::provisionFirstBlockIO() — when the FIRST Block lands in an
//       EMPTY Board, drives BOTH graph-builder sites from the classification:
//         (a) the Board's port set, AND
//         (b) the IO *child nodes* (the node.cpp:182-200 superset is trimmed via
//             IONodeEnforcer to match) — then auto-cables the first drop
//         (MIDI In → Block → Audio Out by type) with real, undoable Arcs.
//       A populated/mixed Board keeps the all-4 superset and is NEVER stripped.
//
// Drives the SAME engine-backed active-graph fixture GroupNodesTest uses
// (prepareExternalPlayback(44100,512,2,2) so the root graph reports real
// channels + IONodeEnforcer installs the IO device child nodes, releaseExternal
// on teardown). Internal nodes are instantiated through EngineService::addPlugin
// (verified descriptions → in-process Internal nodes), exactly as the live host
// adds a Block.
//
// Runs on the message thread (JuceMessageManagerFixture in TestMain.cpp).

#include <boost/test/unit_test.hpp>

#include <element/audioengine.hpp>
#include <element/context.hpp>
#include <element/engine.hpp>
#include <element/graph.hpp>
#include <element/juce.hpp>
#include <element/node.hpp>
#include <element/services.hpp>
#include <element/session.hpp>

#include "engine/portprovisioning.hpp"   // classifyNodePorts / NodePortNeeds
#include "services/sessionservice.hpp"
#include "fixture/ServicesFixture.hpp"
#include "testutil.hpp"

using namespace element;
using namespace juce;

namespace {

// Identical clean-active-graph recipe to GroupNodesTest: a fresh "Board" with
// the engine's 2 audio + MIDI channels, re-attached engine-side (single
// RootGraphManager; IONodeEnforcer installs the four Audio/MIDI IO device child
// nodes), prepared twice so processors are live. Empty of real Blocks.
static Node freshActiveGraph()
{
    auto* ctx = test::context();
    if (ctx == nullptr)
        return Node();

    if (auto engine = ctx->audio())
        engine->prepareExternalPlayback (44100.0, 512, 2, 2);

    auto* es = test::getService<EngineService>();
    if (es == nullptr)
        return Node();

    auto sess = ctx->session();
    if (sess == nullptr)
        return Node();

    sess->clear();
    sess->addGraph (Graph::create ("Board", 2, 2, true, true), /*setActive=*/true);
    es->sessionReloaded();
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    if (auto engine = ctx->audio())
        engine->prepareExternalPlayback (44100.0, 512, 2, 2);
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    const Node active (sess->getActiveGraph());
    return active.isGraph() ? active : Node();
}

// Add a verified internal node by identifier and return its model Node.
static Node addInternal (EngineService& es, const String& identifier)
{
    PluginDescription desc;
    desc.fileOrIdentifier = identifier;
    desc.name = identifier;
    desc.pluginFormatName = EL_NODE_FORMAT_NAME;
    return es.addPlugin (desc, /*verified=*/true, 0.5f, 0.5f, /*dontShowUI=*/true);
}

// Build a bare model Node carrying a custom port set (for the PURE classifier
// tests — no engine instantiation needed). Each (type, isInput) adds one port.
static Node modelNodeWithPorts (std::initializer_list<std::pair<PortType, bool>> spec)
{
    Node n (types::Node);
    ValueTree ports (n.getPortsValueTree());
    uint32 idx = 0;
    for (const auto& s : spec)
    {
        const Identifier flow (s.second ? tags::input : tags::output);
        Port p ("Port", Identifier (s.first.getSlug()), flow, idx++);
        ports.addChild (p.data(), -1, nullptr);
    }
    return n;
}

// Count IO device child nodes of a given identifier on the board.
static bool hasIONode (const Node& g, const String& identifier)
{
    return g.getNodeByFormat ("Internal", identifier).isValid();
}

// Count the REAL Blocks on a Board (children that aren't IO device nodes).
static int realBlockCount (const Node& g)
{
    int n = 0;
    for (int i = 0; i < g.getNumNodes(); ++i)
        if (! g.getNode (i).isIONode())
            ++n;
    return n;
}

// True if any arc on the board touches the given node id (either end).
static bool nodeHasAnyArc (const Node& g, uint32 nodeId)
{
    const ValueTree arcs (g.getArcsValueTree());
    for (int i = 0; i < arcs.getNumChildren(); ++i)
    {
        const ValueTree a (arcs.getChild (i));
        if ((uint32) (int64) a.getProperty (tags::sourceNode) == nodeId
            || (uint32) (int64) a.getProperty (tags::destNode) == nodeId)
            return true;
    }
    return false;
}

// Count arcs from src node → dst node (any ports).
static int arcCountBetween (const Node& g, uint32 src, uint32 dst)
{
    int n = 0;
    const ValueTree arcs (g.getArcsValueTree());
    for (int i = 0; i < arcs.getNumChildren(); ++i)
    {
        const ValueTree a (arcs.getChild (i));
        if ((uint32) (int64) a.getProperty (tags::sourceNode) == src
            && (uint32) (int64) a.getProperty (tags::destNode) == dst)
            ++n;
    }
    return n;
}

// Tears the headless external-playback prepare back down after each case (same
// reason as GroupNodesTest: AudioEngine asserts/double-frees if destroyed while
// still prepared).
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
BOOST_FIXTURE_TEST_SUITE (PortDefaultsTests, PreparedEngineFixture)

// ── (1) PURE classifier: instrument shape {MIDI In, Audio Out} ──────────────
BOOST_AUTO_TEST_CASE (classifier_sampler_needs_midi_in_audio_out)
{
    const Node n (modelNodeWithPorts ({ { PortType::Midi, true },
                                        { PortType::Audio, false },
                                        { PortType::Audio, false } }));
    const NodePortNeeds needs (classifyNodePorts (n));
    BOOST_CHECK (needs.needsMidiIn);
    BOOST_CHECK (needs.needsAudioOut);
    BOOST_CHECK (! needs.needsMidiOut);
    BOOST_CHECK (! needs.needsAudioIn);
}

// ── (1) PURE classifier: EQ / audio-fx shape {Audio In, Audio Out} ──────────
BOOST_AUTO_TEST_CASE (classifier_eq_needs_audio_in_audio_out)
{
    const Node n (modelNodeWithPorts ({ { PortType::Audio, true },
                                        { PortType::Audio, true },
                                        { PortType::Audio, false },
                                        { PortType::Audio, false } }));
    const NodePortNeeds needs (classifyNodePorts (n));
    BOOST_CHECK (needs.needsAudioIn);
    BOOST_CHECK (needs.needsAudioOut);
    BOOST_CHECK (! needs.needsMidiIn);
    BOOST_CHECK (! needs.needsMidiOut);
}

// ── (1) THE BUG CASE: an internal MIDI node classifies as MIDI, not "value" ─
// element.midiTranspose has only MIDI in+out ports. The signalOut UI heuristic
// (no MIDI category, not an instrument, no audio out) would tag it "value" and
// provision the WRONG board IO. The capability classifier reads its real ports.
BOOST_AUTO_TEST_CASE (classifier_internal_midi_node_is_midi_not_value)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());
    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    const Node midiFx (addInternal (*es, "element.midiTranspose"));
    BOOST_REQUIRE_MESSAGE (midiFx.isValid(), "could not instantiate element.midiTranspose");

    const NodePortNeeds needs (classifyNodePorts (midiFx));
    BOOST_CHECK_MESSAGE (needs.needsMidiIn, "internal MIDI node mis-read: no MIDI in");
    BOOST_CHECK_MESSAGE (needs.needsMidiOut, "internal MIDI node mis-read: no MIDI out");
    BOOST_CHECK_MESSAGE (! needs.needsAudioIn && ! needs.needsAudioOut,
                         "internal MIDI node should need no audio IO");
}

// ── (2) Empty board + MIDI fx → IO trimmed to {MIDI In, MIDI Out} + cabled ──
BOOST_AUTO_TEST_CASE (first_midi_fx_provisions_midi_io_and_cables)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());
    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    // Sanity: a fresh board starts with the all-4 IO superset.
    BOOST_REQUIRE (hasIONode (active, "midi.input"));
    BOOST_REQUIRE (hasIONode (active, "audio.input"));

    const Node block (addInternal (*es, "element.midiTranspose"));
    BOOST_REQUIRE (block.isValid());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    // Site (b): IO child nodes reflect MIDI-fx capability — MIDI In + MIDI Out
    // only; the audio IO device nodes are gone (NOT a stripped populated board —
    // this is the first-drop provisioning).
    BOOST_CHECK_MESSAGE (hasIONode (active, "midi.input"), "MIDI In IO node missing");
    BOOST_CHECK_MESSAGE (hasIONode (active, "midi.output"), "MIDI Out IO node missing");
    BOOST_CHECK_MESSAGE (! hasIONode (active, "audio.input"), "Audio In IO node should be removed");
    BOOST_CHECK_MESSAGE (! hasIONode (active, "audio.output"), "Audio Out IO node should be removed");

    // Site (c): the dropped block is cabled MIDI In → block → MIDI Out.
    const Node midiIn (active.getIONode (PortType::Midi, true));
    const Node midiOut (active.getIONode (PortType::Midi, false));
    BOOST_REQUIRE (midiIn.isValid() && midiOut.isValid());
    BOOST_CHECK_MESSAGE (arcCountBetween (active, midiIn.getNodeId(), block.getNodeId()) >= 1,
                         "no MIDI In → block cable");
    BOOST_CHECK_MESSAGE (arcCountBetween (active, block.getNodeId(), midiOut.getNodeId()) >= 1,
                         "no block → MIDI Out cable");
}

// ── (2) Empty board + audio fx → IO trimmed to {Audio In, Audio Out} + cabled ─
BOOST_AUTO_TEST_CASE (first_audio_fx_provisions_audio_io_and_cables)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());
    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    const Node block (addInternal (*es, "element.volume.stereo"));
    BOOST_REQUIRE (block.isValid());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    // Site (b): audio IO only; MIDI IO device nodes removed.
    BOOST_CHECK_MESSAGE (hasIONode (active, "audio.input"), "Audio In IO node missing");
    BOOST_CHECK_MESSAGE (hasIONode (active, "audio.output"), "Audio Out IO node missing");
    BOOST_CHECK_MESSAGE (! hasIONode (active, "midi.input"), "MIDI In IO node should be removed");
    BOOST_CHECK_MESSAGE (! hasIONode (active, "midi.output"), "MIDI Out IO node should be removed");

    // Site (c): Audio In → block → Audio Out (stereo — 2 cables each direction).
    const Node audioIn (active.getIONode (PortType::Audio, true));
    const Node audioOut (active.getIONode (PortType::Audio, false));
    BOOST_REQUIRE (audioIn.isValid() && audioOut.isValid());
    BOOST_CHECK_MESSAGE (arcCountBetween (active, audioIn.getNodeId(), block.getNodeId()) >= 1,
                         "no Audio In → block cable");
    BOOST_CHECK_MESSAGE (arcCountBetween (active, block.getNodeId(), audioOut.getNodeId()) >= 1,
                         "no block → Audio Out cable");
}

// ── (2) Populated board keeps the all-4 superset (NEVER stripped) ───────────
BOOST_AUTO_TEST_CASE (second_block_does_not_strip_populated_board)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());
    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    // First drop = a MIDI fx → board provisions to {MIDI In, MIDI Out}.
    const Node first (addInternal (*es, "element.midiTranspose"));
    BOOST_REQUIRE (first.isValid());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);
    BOOST_REQUIRE (! hasIONode (active, "audio.output"));

    // Second drop = an audio fx into the NOW-populated board → must NOT re-trim
    // or re-provision. The board keeps whatever IO it has (MIDI-only here); the
    // audio block simply isn't auto-provisioned/cabled (no first-drop trigger).
    const bool audioOutBefore = hasIONode (active, "audio.output");
    const Node second (addInternal (*es, "element.volume.stereo"));
    BOOST_REQUIRE (second.isValid());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    // The board's IO set is unchanged by the second add (no stripping, no add).
    BOOST_CHECK_EQUAL (hasIONode (active, "audio.output"), audioOutBefore);
    BOOST_CHECK_MESSAGE (hasIONode (active, "midi.input"), "populated board lost its MIDI In IO");
    // The second block was NOT auto-cabled (no first-drop provisioning fired).
    BOOST_CHECK_MESSAGE (! nodeHasAnyArc (active, second.getNodeId()),
                         "second block into a populated board must not be auto-cabled");
}

// ── (2) Removing the first drop tears it back down (cables + block gone) ────
// The first-drop is a normal add: removing the block (the undo of an add, via
// the proven RemoveNodeAction path EngineService::removeNode drives) clears the
// block and its auto-cables, returning the board to zero real Blocks. This is
// the reversible invariant the undoable AddPluginAction relies on.
BOOST_AUTO_TEST_CASE (removing_first_drop_clears_block_and_cables)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());
    auto* es = test::getService<EngineService>();
    BOOST_REQUIRE (es != nullptr);

    const Node block (addInternal (*es, "element.midiTranspose"));
    BOOST_REQUIRE (block.isValid());
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    // First-drop provisioned + cabled.
    BOOST_REQUIRE_EQUAL (realBlockCount (active), 1);
    BOOST_REQUIRE (nodeHasAnyArc (active, block.getNodeId()));

    const uint32 blockId = block.getNodeId();
    es->removeNode (block);
    juce::MessageManager::getInstance()->runDispatchLoopUntil (10);

    BOOST_CHECK_EQUAL (realBlockCount (active), 0);
    BOOST_CHECK_MESSAGE (! nodeHasAnyArc (active, blockId),
                         "auto-cables survived removal of the block");
}

// ── N1 addendum: IO device child nodes carry a rendered display name ────────
// buildActiveGraphJson (element_webview_host.cpp:6150) + the SessionTree outline
// (:932) both render Node::getName() (= tags::name). IONodeEnforcer used to add
// the IO device nodes with an empty desc.name → they rendered "(unnamed)". Each
// IO device node must now carry "Audio In"/"Audio Out"/"MIDI In"/"MIDI Out".
BOOST_AUTO_TEST_CASE (io_device_nodes_have_display_names)
{
    const Node active (freshActiveGraph());
    BOOST_REQUIRE (active.isGraph());

    struct Expect { PortType type; bool isInput; const char* name; };
    const Expect expects[] = {
        { PortType::Audio, true,  "Audio In" },
        { PortType::Audio, false, "Audio Out" },
        { PortType::Midi,  true,  "MIDI In" },
        { PortType::Midi,  false, "MIDI Out" },
    };

    for (const auto& e : expects)
    {
        const Node io (active.getIONode (e.type, e.isInput));
        BOOST_REQUIRE_MESSAGE (io.isValid(), String ("missing IO node: ") + e.name);
        // getName() is exactly what the snapshot + tree push to the webview.
        BOOST_CHECK_MESSAGE (io.getName() == String (e.name),
                             String ("IO node name was '") + io.getName()
                                 + "', expected '" + e.name + "'");
        BOOST_CHECK_MESSAGE (io.getName().isNotEmpty(), "IO node renders empty/(unnamed)");
    }
}

BOOST_AUTO_TEST_SUITE_END()
