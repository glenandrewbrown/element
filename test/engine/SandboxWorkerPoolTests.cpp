// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// SandboxWorkerPool — bookkeeping/guard tests (T7 warm pool + instance reuse,
// 2026-06-11). These cover the pool's message-thread bookkeeping WITHOUT
// spawning real worker processes: the warm/parked size overrides (test seams)
// keep replenish inert, and park's health gate is exercised with an unlaunched
// SandboxHost (which can never report healthy+loaded). Full end-to-end claim
// flows (real worker, adopted node, watcher swap) are covered live — they need
// the helper binary + GUI session and cannot run headless (AU registry).

#include <boost/test/unit_test.hpp>

#include <element/plugins.hpp>

#include "engine/sandboxworkerpool.hpp"

using namespace element;

namespace {

juce::PluginDescription makeDesc (const juce::String& name)
{
    juce::PluginDescription d;
    d.name = name;
    d.pluginFormatName = "AudioUnit";
    d.fileOrIdentifier = "test://" + name;
    return d;
}

} // namespace

BOOST_AUTO_TEST_SUITE (SandboxWorkerPoolTests)

BOOST_AUTO_TEST_CASE (ClaimOnEmptyPoolReturnsNull)
{
    PluginManager plugins;
    SandboxWorkerPool pool (plugins);
    pool.warmTargetOverride = 0; // keep replenish inert — no process spawns
    pool.parkedMaxOverride = 0;

    bool wasLoaded = true; // must be reset by claim
    auto host = pool.claim (makeDesc ("Kontakt 8"), wasLoaded);
    BOOST_CHECK (host == nullptr);
    BOOST_CHECK (! wasLoaded);
    BOOST_CHECK_EQUAL (pool.numBlank(), 0);
    BOOST_CHECK_EQUAL (pool.numParked(), 0);
}

BOOST_AUTO_TEST_CASE (ParkRejectsUnloadedHost)
{
    PluginManager plugins;
    SandboxWorkerPool pool (plugins);
    pool.warmTargetOverride = 0;
    pool.parkedMaxOverride = 4;

    // Never launched — fails the healthy+loaded gate, must be refused so the
    // caller shuts it down instead of shelving a dead worker.
    auto host = std::make_unique<SandboxHost> (plugins);
    BOOST_CHECK (! pool.park (std::move (host), makeDesc ("Kontakt 8")));
    BOOST_CHECK_EQUAL (pool.numParked(), 0);
}

BOOST_AUTO_TEST_CASE (ParkDisabledRejectsEverything)
{
    PluginManager plugins;
    SandboxWorkerPool pool (plugins);
    pool.warmTargetOverride = 0;
    pool.parkedMaxOverride = 0; // parking off

    auto host = std::make_unique<SandboxHost> (plugins);
    BOOST_CHECK (! pool.park (std::move (host), makeDesc ("EQ")));
    BOOST_CHECK_EQUAL (pool.numParked(), 0);
}

BOOST_AUTO_TEST_CASE (ReplenishHonoursZeroTarget)
{
    PluginManager plugins;
    SandboxWorkerPool pool (plugins);
    pool.warmTargetOverride = 0;

    pool.replenishAsync();
    BOOST_CHECK_EQUAL (pool.numBlank(), 0);
}

// Speculative pre-instantiation gates (2026-06-12). Only the REFUSAL gates are
// unit-testable headless — the accept path spawns a real worker process and is
// covered live. Each case must leave numPreloading() == 0 (no job queued).
BOOST_AUTO_TEST_CASE (PreinstantiateRefusedWhenParkingDisabled)
{
    PluginManager plugins;
    SandboxWorkerPool pool (plugins);
    pool.warmTargetOverride = 0;
    pool.parkedMaxOverride = 0; // parking off ⇒ a spare could never be shelved
    pool.preinstantiateMinMsOverride = 0;

    pool.maybePreinstantiate (makeDesc ("Kontakt 8"), 15000);
    BOOST_CHECK_EQUAL (pool.numPreloading(), 0);
}

BOOST_AUTO_TEST_CASE (PreinstantiateRefusedForCheapLoads)
{
    PluginManager plugins;
    SandboxWorkerPool pool (plugins);
    pool.warmTargetOverride = 0;
    pool.parkedMaxOverride = 3;
    pool.preinstantiateMinMsOverride = 2000;

    // A 100 ms utility load must never earn a speculative worker spawn.
    pool.maybePreinstantiate (makeDesc ("midiDuplicateBlocker"), 100);
    BOOST_CHECK_EQUAL (pool.numPreloading(), 0);
}

BOOST_AUTO_TEST_SUITE_END()
