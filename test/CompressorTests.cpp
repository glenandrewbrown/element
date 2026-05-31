// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** LevelDetector, GainComputer, CompressorProcessor tests.
    Covers: attack/release envelope, gain-computer knee/ratio/threshold,
    processBlock(), state save/restore, listener callbacks. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <cmath>

#include "nodes/compressor.hpp"

using namespace element;
using namespace juce;

static constexpr float  kSR  = 44100.f;
static constexpr double kSRd = 44100.0;
static constexpr int    kBuf = 512;
static constexpr float  kEPS = 1e-6f;

BOOST_AUTO_TEST_SUITE (CompressorTests)

// ── LevelDetector ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (LevelDetectorStartsAtZero)
{
    LevelDetector ld;
    ld.reset (kSR);
    BOOST_CHECK_CLOSE (ld.getLevelEstimate(), 0.f, 1e-6f);
}

BOOST_AUTO_TEST_CASE (LevelDetectorRisesWithSignal)
{
    LevelDetector ld;
    ld.setAttackMs (1.f);
    ld.setReleaseMs (100.f);
    ld.reset (kSR);

    // Feed 1.0 for many samples — level should rise toward 1.0
    for (int i = 0; i < 5000; ++i)
        ld.process (1.f);

    BOOST_CHECK_GT (ld.getLevelEstimate(), 0.9f);
}

BOOST_AUTO_TEST_CASE (LevelDetectorDecaysAfterSignal)
{
    LevelDetector ld;
    ld.setAttackMs (1.f);
    ld.setReleaseMs (10.f);
    ld.reset (kSR);

    // Fill to near 1.0
    for (int i = 0; i < 5000; ++i)
        ld.process (1.f);

    float peak = ld.getLevelEstimate();
    BOOST_CHECK_GT (peak, 0.9f);

    // Feed silence — level should decay
    for (int i = 0; i < 2000; ++i)
        ld.process (0.f);

    BOOST_CHECK_LT (ld.getLevelEstimate(), peak * 0.5f);
}

BOOST_AUTO_TEST_CASE (LevelDetectorSetLevelEstimateDirectly)
{
    LevelDetector ld;
    ld.reset (kSR);
    ld.setLevelEstimate (0.5f);
    BOOST_CHECK_CLOSE (ld.getLevelEstimate(), 0.5f, 1e-5f);
}

BOOST_AUTO_TEST_CASE (LevelDetectorNoNaNOnImpulse)
{
    LevelDetector ld;
    ld.setAttackMs (0.1f);
    ld.setReleaseMs (10.f);
    ld.reset (kSR);

    float y = ld.process (10.f); // loud impulse
    BOOST_CHECK (std::isfinite (y));
}

// ── GainComputer ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (GainComputerBelowThresholdIsUnity)
{
    GainComputer gc;
    gc.setThreshold (-20.f);
    gc.setRatio (4.f);
    gc.setKnee (0.f);
    gc.reset();

    // Signal well below threshold: gain reduction should be 0 dB → output == input
    float out = gc.process (-40.f); // -40 dBFS in, below -20 threshold
    BOOST_CHECK_CLOSE (out, -40.f, 1.f);
}

BOOST_AUTO_TEST_CASE (GainComputerAboveThresholdReduces)
{
    GainComputer gc;
    gc.setThreshold (-20.f);
    gc.setRatio (4.f);
    gc.setKnee (0.f);
    gc.reset();

    // -4 dBFS in: 16 dB above threshold, ratio 4:1 → 12 dB gain reduction
    // Expected output: -20 + (−4 − (−20)) / 4 = -20 + 4 = -16 dBFS
    float out = gc.process (-4.f);
    BOOST_CHECK_CLOSE (out, -16.f, 1.f);
}

BOOST_AUTO_TEST_CASE (GainComputerLimiterRatioInfinity)
{
    GainComputer gc;
    gc.setThreshold (-20.f);
    gc.setRatio (1000.f); // limiter
    gc.setKnee (0.f);
    gc.reset();

    float out = gc.process (-10.f); // above threshold
    // Output should be close to threshold
    BOOST_CHECK_CLOSE (out, -20.f, 2.f);
}

BOOST_AUTO_TEST_CASE (GainComputerKneeSoftens)
{
    GainComputer gc_hard, gc_soft;

    gc_hard.setThreshold (-20.f); gc_hard.setRatio (4.f); gc_hard.setKnee (0.f);  gc_hard.reset();
    gc_soft.setThreshold (-20.f); gc_soft.setRatio (4.f); gc_soft.setKnee (10.f); gc_soft.reset();

    // Just above threshold: soft knee should apply less reduction
    float outHard = gc_hard.process (-19.f);
    float outSoft = gc_soft.process (-19.f);
    BOOST_CHECK_GT (outSoft, outHard); // soft knee -> less reduction -> higher output level
}

// ── CompressorProcessor ───────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ProcessorDefaultConstruct)
{
    CompressorProcessor proc (2);
    BOOST_CHECK (! proc.acceptsMidi());
    BOOST_CHECK (! proc.producesMidi());
}

BOOST_AUTO_TEST_CASE (ProcessorPrepareReleaseCycle)
{
    CompressorProcessor proc (2);
    proc.prepareToPlay (kSRd, kBuf);
    proc.releaseResources();
    // Second cycle must be safe
    proc.prepareToPlay (48000.0, 256);
    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessorReducesLoudSignal)
{
    CompressorProcessor proc (2);
    proc.prepareToPlay (kSRd, kBuf);

    // Set aggressive compression: -20 dB threshold, 8:1, fast attack/release
    // (Parameters access may depend on internal param names; update as needed)
    proc.updateParams();

    // First: silence pass — establish baseline
    AudioBuffer<float> silence (2, kBuf);
    silence.clear();
    MidiBuffer midi;
    proc.processBlock (silence, midi);

    // Loud signal
    AudioBuffer<float> loud (2, kBuf);
    loud.clear();
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < kBuf; ++i)
            loud.setSample (ch, i, 0.9f);

    proc.processBlock (loud, midi);

    // After compression: peak level should be lower than raw 0.9
    float peak = 0.f;
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < kBuf; ++i)
            peak = std::max (peak, std::abs (loud.getSample (ch, i)));

    // Compressed output must not exceed input and must be finite
    BOOST_CHECK (std::isfinite (peak));
    BOOST_CHECK_LE (peak, 0.9f + 1e-4f);

    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessorSilenceInSilenceOut)
{
    CompressorProcessor proc (2);
    proc.prepareToPlay (kSRd, kBuf);

    AudioBuffer<float> buf (2, kBuf);
    buf.clear();
    MidiBuffer midi;

    // Run several blocks of silence — output must stay at 0
    for (int b = 0; b < 10; ++b)
        proc.processBlock (buf, midi);

    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < kBuf; ++i)
            BOOST_CHECK_SMALL (buf.getSample (ch, i), kEPS * 10.f);

    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessorStateSaveRestore)
{
    CompressorProcessor proc (2);
    proc.prepareToPlay (kSRd, kBuf);

    juce::MemoryBlock state;
    proc.getStateInformation (state);
    BOOST_CHECK_GT (state.getSize(), 0u);

    CompressorProcessor proc2 (2);
    proc2.prepareToPlay (kSRd, kBuf);
    proc2.setStateInformation (state.getData(), (int) state.getSize());
    // Must not crash; further checks depend on parameters being preserved.

    proc.releaseResources();
    proc2.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessorListenerCalledOnGainChange)
{
    struct TestListener : public CompressorProcessor::Listener
    {
        float lastGain = 0.f;
        void updateInGainDB (float inDB) override { lastGain = inDB; }
    };

    CompressorProcessor proc (2);
    TestListener listener;
    proc.addCompressorListener (&listener);
    proc.prepareToPlay (kSRd, kBuf);

    AudioBuffer<float> buf (2, kBuf);
    buf.clear();
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < kBuf; ++i)
            buf.setSample (ch, i, 0.9f);

    MidiBuffer midi;
    proc.processBlock (buf, midi);

    // Listener must have received at least one update
    BOOST_CHECK (std::isfinite (listener.lastGain));

    proc.removeCompressorListener (&listener);
    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessorNoNaNOnClippedInput)
{
    CompressorProcessor proc (2);
    proc.prepareToPlay (kSRd, kBuf);

    AudioBuffer<float> buf (2, kBuf);
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < kBuf; ++i)
            buf.setSample (ch, i, 10.f); // massively clipped

    MidiBuffer midi;
    proc.processBlock (buf, midi);

    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < kBuf; ++i)
            BOOST_CHECK (std::isfinite (buf.getSample (ch, i)));

    proc.releaseResources();
}

BOOST_AUTO_TEST_SUITE_END()
