// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// T1/T2 — kill the message-thread freeze on the sandbox instantiation path.
//
// Root cause (pre-fix): GraphManager::kickSandboxedInstantiation constructed a
// SandboxedProcessorNode SYNCHRONOUSLY on the message thread; its ctor →
// initializeSandbox() → SandboxHost::launch() does the BLOCKING connectToPipe
// handshake (bounded by EL_SANDBOX_TIMEOUT_MS). A live add (T1) or a session load
// (T2) of a heavy/sandboxed plugin therefore froze the UI / could hang boot.
//
// The fix splits the launch across threads:
//   - the node is built WITHOUT launching (DeferLaunch ctor),
//   - the watcher is armed FIRST,
//   - the BLOCKING handshake runs on a background ThreadPool job, posting
//     finishLaunch() back to the message thread,
//   - the message-thread watcher (Timer) is the SOLE graph mutator.
//
// These tests PROVE the non-blocking contract using the forceSlowWorkerLaunch test
// seam (injects an N-second stall into the pool handshake job): addNode must return
// to the message loop in << the stall, and the placeholder node must already be in
// the ValueTree while the stall is still elapsing. A CI-safe internal/reroute-style
// payload is NOT usable here (the sandbox route requires an EXTERNAL format), so we
// use the same file-less TestEcho format AsyncPluginLoadTest registers — but we
// never let a real worker load (the stall seam dominates the timing assertion).

#include <boost/test/unit_test.hpp>

#include <atomic>

#include <element/context.hpp>
#include <element/node.hpp>
#include <element/plugins.hpp>
#include <element/settings.hpp>
#include <element/tags.hpp>

#include "engine/graphmanager.hpp"
#include "engine/graphnode.hpp"
#include "engine/sandboxhost.hpp"
#include "engine/test_echo_plugin.hpp"
#include "nodes/placeholder.hpp"
#include "nodes/sandboxedprocessor.hpp"
#include "testutil.hpp"

using namespace element;

namespace {

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

// A real, prepared GraphManager driving a root-graph model. Mirrors the
// AsyncPluginLoadTest fixture: heap GraphNode held via ProcessorPtr so the
// NodeModelUpdater's back-reference stays valid through teardown.
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
        mgr.clear();
        if (auto* g = dynamic_cast<GraphNode*> (graph.get()))
        {
            g->releaseResources();
            g->clear();
        }
    }

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

template <typename Pred>
bool pumpUntil (Pred pred, int timeoutMs = 5000)
{
    const auto deadline = juce::Time::getMillisecondCounter() + (juce::uint32) timeoutMs;
    while (! pred() && juce::Time::getMillisecondCounter() < deadline)
        juce::MessageManager::getInstance()->runDispatchLoopUntil (20);
    return pred();
}

} // namespace

BOOST_AUTO_TEST_SUITE (SandboxAsyncInstantiationTests)

// THE FREEZE TEST: with a multi-second stall injected into the worker handshake
// JOB (pool thread), addNode() must return to the message loop in well under that
// stall, and the placeholder must already be present in the model ValueTree before
// the stall has elapsed. Pre-fix this call blocked for the whole handshake.
BOOST_AUTO_TEST_CASE (kick_returns_immediately_while_launch_stalls)
{
    ensureTestFormatRegistered();
    ManagedGraph g;

    // Route through the sandbox + inject a 3s stall into the pool handshake job.
    g.mgr.setSandboxPolicyForTesting ([] (const PluginDescription&) { return true; });
    constexpr int kStallMs = 3000;
    g.mgr.setForceSlowWorkerLaunchForTesting (kStallMs);

    const auto desc = testEchoDescription();

    // Measure the message-thread time spent inside addNode. The blocking handshake
    // is now on the pool thread, so this must be tiny (<< kStallMs).
    const auto t0 = juce::Time::getMillisecondCounterHiRes();
    const uint32 nodeId = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    const auto elapsedMs = juce::Time::getMillisecondCounterHiRes() - t0;

    BOOST_REQUIRE (nodeId != EL_INVALID_NODE);

    // (1) The message thread returned in <50ms despite the 3s handshake stall.
    BOOST_CHECK_MESSAGE (elapsedMs < 50.0,
                         "addNode blocked the message thread for "
                             << elapsedMs << "ms (expected <50ms; the handshake "
                             "must run on the pool thread)");

    // (2) The placeholder node exists in the ValueTree SYNCHRONOUSLY — before the
    //     pool stall could possibly have elapsed.
    const Node loading = g.mgr.getNodeModelForId (nodeId);
    BOOST_REQUIRE (loading.isValid());
    BOOST_CHECK (loading.getUuidString().isNotEmpty());
    BOOST_CHECK ((bool) loading.getProperty (tags::loading, false));
    BOOST_CHECK_EQUAL (g.model.getNumNodes(), g.baseNodeCount + 1);

    // We do NOT wait out the full stall + real worker load here (AU/worker can't run
    // headless deterministically); the timing + placeholder invariants above are the
    // contract. Tear down promptly — the GraphManager dtor drains the pool job.
}

// While the launch is still in flight (NotStarted/InFlight), the watcher must NOT
// interpret the host's Idle/Starting state as a crash and prematurely fall back —
// the loading flag must persist through the stall window.
BOOST_AUTO_TEST_CASE (loading_flag_persists_during_launch_window)
{
    ensureTestFormatRegistered();
    ManagedGraph g;
    g.mgr.setSandboxPolicyForTesting ([] (const PluginDescription&) { return true; });
    g.mgr.setForceSlowWorkerLaunchForTesting (1500);

    const auto desc = testEchoDescription();
    const uint32 nodeId = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    BOOST_REQUIRE (nodeId != EL_INVALID_NODE);

    const Node loading = g.mgr.getNodeModelForId (nodeId);
    BOOST_REQUIRE (loading.isValid());
    const String uuid = loading.getUuidString();

    // Pump the loop briefly (300ms) — well inside the 1500ms launch stall. The
    // watcher ticks (~30Hz) but must keep waiting, NOT fall back: the node stays
    // loading and is never resurrected/duplicated.
    juce::MessageManager::getInstance()->runDispatchLoopUntil (300);

    const Node still (g.modelNodeByUuid (uuid));
    BOOST_REQUIRE (still.isValid());
    BOOST_CHECK ((bool) still.getProperty (tags::loading, false));
    BOOST_CHECK_EQUAL (g.model.getNumNodes(), g.baseNodeCount + 1);
}

// Deleting the loading node mid-stall is safe: no crash, no resurrection, and the
// GraphManager teardown drains the in-flight handshake job.
BOOST_AUTO_TEST_CASE (delete_during_launch_stall_is_safe)
{
    ensureTestFormatRegistered();
    ManagedGraph g;
    g.mgr.setSandboxPolicyForTesting ([] (const PluginDescription&) { return true; });
    g.mgr.setForceSlowWorkerLaunchForTesting (2000);

    const auto desc = testEchoDescription();
    const uint32 nodeId = g.mgr.addNode (&desc, 0.5, 0.5, 0);
    BOOST_REQUIRE (nodeId != EL_INVALID_NODE);
    BOOST_CHECK_EQUAL (g.mgr.getNumNodes(), g.baseNodeCount + 1);

    // Remove while the handshake job is still stalling on the pool thread.
    g.mgr.removeNode (nodeId);
    BOOST_CHECK_EQUAL (g.mgr.getNumNodes(), g.baseNodeCount);

    // Pump a little; the late finishLaunch callback resolves-by-uuid, finds nothing.
    juce::MessageManager::getInstance()->runDispatchLoopUntil (300);
    BOOST_CHECK_EQUAL (g.mgr.getNumNodes(), g.baseNodeCount);
}

BOOST_AUTO_TEST_SUITE_END()
