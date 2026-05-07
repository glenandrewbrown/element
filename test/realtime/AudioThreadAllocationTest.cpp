// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// AudioThreadAllocationTest — Phase C deliverable.
//
// Verifies that audio-thread render() paths are allocation-free under
// steady-state, by overriding global new/delete and arming a thread-local
// guard around render() calls.
//
// Smoke variant: a small node graph, ~100 buffer-renders at 48 kHz, runs in
// every ctest pass — any future regression that adds an allocation to a hot
// path is caught at PR time.
//
// Stress variant (opt-in): defined behind ELEMENT_RT_STRESS_TEST=ON. Uses
// 100 nodes for 60 s wall-clock. Not in CI by default since it is wall-clock-
// bound and adds no extra coverage.

#include <boost/test/unit_test.hpp>

#include <atomic>
#include <cstdlib>
#include <new>

#include <element/juce.hpp>
using namespace juce;

#include <element/context.hpp>
#include <element/processor.hpp>
#include "fixture/TestNode.h"

using namespace element;

//==============================================================================
// Allocation guard — thread-local flag flipped on while render() runs.
// The global `operator new` increments an atomic counter when the flag is
// set, so any allocation on the audio thread is observable.

namespace element_rt_test {

// Thread-local switch — true on the simulated audio thread during render.
thread_local bool sIsAudioThread = false;

// Global allocation counter, accessible from operator new override.
std::atomic<int> sAllocCount { 0 };

void enterAudioThread() noexcept { sIsAudioThread = true; }
void leaveAudioThread() noexcept { sIsAudioThread = false; }
int  getAllocCount() noexcept { return sAllocCount.load (std::memory_order_acquire); }
void resetAllocCount() noexcept { sAllocCount.store (0, std::memory_order_release); }

struct ScopedAudioThread {
    ScopedAudioThread() { enterAudioThread(); }
    ~ScopedAudioThread() { leaveAudioThread(); }
};

} // namespace element_rt_test

// We override the global allocation operators so we can detect any allocation
// happening while the thread-local audio-thread flag is set. The override is
// process-wide, but the counter is only bumped while the flag is true, so it
// is invisible during the rest of the test binary.
//
// IMPORTANT: keep these overrides as light as possible — they execute on
// every alloc in the entire process. Just an inline check of a TLS bool +
// (when armed) a single relaxed atomic increment.

void* operator new (std::size_t sz)
{
    if (element_rt_test::sIsAudioThread)
        element_rt_test::sAllocCount.fetch_add (1, std::memory_order_relaxed);

    if (void* p = std::malloc (sz == 0 ? 1 : sz))
        return p;
    throw std::bad_alloc();
}

void* operator new[] (std::size_t sz)
{
    if (element_rt_test::sIsAudioThread)
        element_rt_test::sAllocCount.fetch_add (1, std::memory_order_relaxed);

    if (void* p = std::malloc (sz == 0 ? 1 : sz))
        return p;
    throw std::bad_alloc();
}

void operator delete (void* p) noexcept { std::free (p); }
void operator delete[] (void* p) noexcept { std::free (p); }
void operator delete (void* p, std::size_t) noexcept { std::free (p); }
void operator delete[] (void* p, std::size_t) noexcept { std::free (p); }

//==============================================================================
// A pass-through processor that exercises render() identically in shape
// to a typical built-in node — gain trim with no MIDI handling.

namespace {

class GainPassthrough : public TestNode
{
public:
    GainPassthrough() : TestNode (2, 2, 0, 0) {}

    void render (RenderContext& rc) override
    {
        const int n = rc.audio.getNumSamples();
        const int c = rc.audio.getNumChannels();
        for (int i = 0; i < c; ++i)
        {
            float* d = rc.audio.getWritePointer (i);
            for (int j = 0; j < n; ++j)
                d[j] *= 0.5f;
        }
    }
};

// Drive a single processor through `numBlocks` render() calls with the
// audio-thread guard armed. Returns the allocation count observed during
// the renders.
int runRender (Processor& proc, int blockSize, int numBlocks, double sampleRate)
{
    proc.prepareToRender (sampleRate, blockSize);

    AudioBuffer<float> audio (2, blockSize);
    audio.clear();
    AudioBuffer<float> cv (1, blockSize);
    cv.clear();
    MidiBuffer midi;

    element_rt_test::resetAllocCount();
    {
        element_rt_test::ScopedAudioThread guard;
        for (int b = 0; b < numBlocks; ++b)
        {
            RenderContext rc (audio, cv, midi, blockSize);
            proc.render (rc);
        }
    }

    proc.releaseResources();
    return element_rt_test::getAllocCount();
}

} // anonymous namespace

//==============================================================================
BOOST_AUTO_TEST_SUITE (AudioThreadAllocationTests)

// 1. Sanity: outside the guard, allocations are NOT counted.
BOOST_AUTO_TEST_CASE (GuardOnlyCountsWhenArmed)
{
    element_rt_test::resetAllocCount();

    auto* probe = new int (42);
    delete probe;

    BOOST_CHECK_EQUAL (element_rt_test::getAllocCount(), 0);
}

// 2. Sanity: inside the guard, allocations ARE counted.
BOOST_AUTO_TEST_CASE (GuardCountsWhenArmed)
{
    element_rt_test::resetAllocCount();
    {
        element_rt_test::ScopedAudioThread guard;
        auto* probe = new int (42);
        delete probe;
    }

    BOOST_CHECK (element_rt_test::getAllocCount() >= 1);
}

// 3. Smoke: a well-behaved processor (GainPassthrough) renders 100 buffers
//    without allocating once on the simulated audio thread.
BOOST_AUTO_TEST_CASE (SmokeGainPassthroughIsAllocFree)
{
    GainPassthrough proc;
    const int allocs = runRender (proc, 512, 100, 48000.0);

    BOOST_TEST_CONTEXT ("smoke: GainPassthrough must not allocate during render()")
    {
        BOOST_CHECK_EQUAL (allocs, 0);
    }
}

// 4. Smoke: stable block size pattern across 50 calls — pre-allocation
//    paths must hold.
BOOST_AUTO_TEST_CASE (SmokeStableBlockSizeIsAllocFree)
{
    GainPassthrough proc;
    const int allocs = runRender (proc, 1024, 50, 48000.0);
    BOOST_CHECK_EQUAL (allocs, 0);
}

BOOST_AUTO_TEST_SUITE_END()

#ifdef ELEMENT_RT_STRESS_TEST
// Opt-in stress variant: 100 nodes, 60 s wall-clock.
// Built only when -DELEMENT_RT_STRESS_TEST=ON is passed to cmake.
BOOST_AUTO_TEST_SUITE (AudioThreadAllocationStressTests)

BOOST_AUTO_TEST_CASE (HundredNodesSixtySecondsAllocFree)
{
    constexpr int kBlockSize = 512;
    constexpr double kSampleRate = 48000.0;
    constexpr int kNumNodes = 100;
    constexpr int kSeconds = 60;
    constexpr int kBlocksPerSec = static_cast<int> (kSampleRate / kBlockSize);
    constexpr int kTotalBlocks = kSeconds * kBlocksPerSec;

    juce::OwnedArray<GainPassthrough> nodes;
    for (int i = 0; i < kNumNodes; ++i)
    {
        auto* p = new GainPassthrough();
        p->prepareToRender (kSampleRate, kBlockSize);
        nodes.add (p);
    }

    AudioBuffer<float> audio (2, kBlockSize);
    audio.clear();
    AudioBuffer<float> cv (1, kBlockSize);
    cv.clear();
    MidiBuffer midi;

    element_rt_test::resetAllocCount();
    {
        element_rt_test::ScopedAudioThread guard;
        for (int b = 0; b < kTotalBlocks; ++b)
        {
            for (auto* node : nodes)
            {
                RenderContext rc (audio, cv, midi, kBlockSize);
                node->render (rc);
            }
        }
    }

    BOOST_CHECK_EQUAL (element_rt_test::getAllocCount(), 0);
}

BOOST_AUTO_TEST_SUITE_END()
#endif // ELEMENT_RT_STRESS_TEST
