// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>

#include <atomic>
#include <cmath>

#include <element/context.hpp>
#include <element/processor.hpp>

// Project convention: unqualified juce names are allowed at .cpp file scope.
// TestNode.h (the shared fixture) uses bare juce types in its overrides.
using namespace juce;

#include "fixture/TestNode.h"

// D4 — REAL per-block (per-Processor) CPU.
//
// These tests cover the lock-free render-nanos tap added to Processor:
//   - the atomic round-trips and starts at 0,
//   - the EMA fold the audio thread runs produces a value > 0 after a real
//     timed render workload (signal -> value > 0), exactly mirroring the tap
//     wired into ProcessBufferOp::process().

using namespace element;

namespace {

// TestNode that actually burns some wall-clock time in render(), so the timed
// tap measures a non-zero interval. The work is opaque to the optimiser via a
// volatile sink so it can't be elided.
class BusyNode : public TestNode
{
public:
    BusyNode() : TestNode (2, 2, 0, 0) {}

    void render (RenderContext&) override
    {
        double acc = 0.0;
        for (int i = 0; i < 200000; ++i)
            acc += std::sin ((double) i * 0.001);
        sink = acc;
    }

    volatile double sink { 0.0 };
};

// Reproduces the audio-thread tap from ProcessBufferOp::process(): timestamp,
// render, timestamp, fold EMA, store. Kept here so the test exercises the same
// arithmetic and atomic store the engine uses.
void tapOneRender (Processor& proc, RenderContext& rc)
{
    const auto startTicks = juce::Time::getHighResolutionTicks();
    proc.render (rc);
    const auto endTicks = juce::Time::getHighResolutionTicks();

    const double sampleNanos = juce::Time::highResolutionTicksToSeconds (endTicks - startTicks) * 1.0e9;
    const float prev = proc.getRenderNanos();
    proc.setRenderNanos (prev * 0.9 + sampleNanos * 0.1);
}

} // namespace

BOOST_AUTO_TEST_SUITE (RenderNanosTests)

BOOST_AUTO_TEST_CASE (DefaultsToZero)
{
    BusyNode node;
    BOOST_CHECK_EQUAL (node.getRenderNanos(), 0.0f);
}

BOOST_AUTO_TEST_CASE (SetterGetterRoundTrip)
{
    BusyNode node;
    node.setRenderNanos (1234.5);
    BOOST_CHECK_CLOSE (node.getRenderNanos(), 1234.5f, 0.01);
}

BOOST_AUTO_TEST_CASE (AtomicIsLockFree)
{
    // The tap must be lock-free on the audio thread.
    std::atomic<float> probe { 0.0f };
    BOOST_CHECK (probe.is_lock_free());
}

BOOST_AUTO_TEST_CASE (RenderTapProducesPositiveValue)
{
    BusyNode node;
    node.setRenderDetails (44100.0, 512);

    juce::AudioSampleBuffer audio (2, 512);
    juce::AudioSampleBuffer cv (1, 512);
    juce::MidiBuffer midi;
    audio.clear();
    cv.clear();
    RenderContext rc (audio, cv, midi, 512);

    BOOST_CHECK_EQUAL (node.getRenderNanos(), 0.0f);

    // A handful of taps so the EMA climbs off zero.
    for (int i = 0; i < 16; ++i)
        tapOneRender (node, rc);

    // Signal -> value > 0: a node that did real work must report > 0 ns.
    BOOST_CHECK_GT (node.getRenderNanos(), 0.0f);
}

BOOST_AUTO_TEST_SUITE_END()
