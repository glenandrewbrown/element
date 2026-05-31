// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** EQFilter + EQFilterProcessor tests.
    Covers: shape coefficient calculation, process(), processBlock(),
    reset(), getMagnitudeAtFreq(), and EQFilterProcessor lifecycle. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <cmath>

#include "nodes/eqfilter.hpp"

using namespace element;
using namespace juce;

static constexpr double kSR = 44100.0;
static constexpr float  kEPS = 1e-4f;

BOOST_AUTO_TEST_SUITE (EQFilterTests)

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultConstruct)
{
    EQFilter f;
    // After default construction, processing silence should yield silence (no assertion,
    // just must not crash or produce NaN).
    f.reset (kSR);
    float y = f.process (0.f);
    BOOST_CHECK (std::isfinite (y));
}

// ── Shape: Bell ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (BellBoostAtFrequency)
{
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::Bell);
    f.setFrequency (1000.f);
    f.setQ (1.f);
    f.setGain (6.f); // +6 dB boost

    // Magnitude at centre frequency should be > 1.0 (boosted)
    float mag = f.getMagnitudeAtFreq (1000.f);
    BOOST_CHECK_GT (mag, 1.f);

    // Magnitude far from centre should be close to 1.0 (passthrough)
    float magLow = f.getMagnitudeAtFreq (10.f);
    BOOST_CHECK_CLOSE (magLow, 1.f, 5.f); // within 5%
}

BOOST_AUTO_TEST_CASE (BellCutAtFrequency)
{
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::Bell);
    f.setFrequency (1000.f);
    f.setQ (1.f);
    f.setGain (-6.f); // -6 dB cut

    float mag = f.getMagnitudeAtFreq (1000.f);
    BOOST_CHECK_LT (mag, 1.f);
}

// ── Shape: Notch ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (NotchNullsAtFrequency)
{
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::Notch);
    f.setFrequency (1000.f);
    f.setQ (10.f);

    float mag = f.getMagnitudeAtFreq (1000.f);
    // Notch: magnitude near 0 at centre
    BOOST_CHECK_LT (mag, 0.1f);
}

// ── Shape: LowPass ────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (LowPassAttenuatesHighFreq)
{
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::LowPass);
    f.setFrequency (1000.f);
    f.setQ (0.707f);

    // Below cutoff → near unity
    float magLow = f.getMagnitudeAtFreq (100.f);
    BOOST_CHECK_CLOSE (magLow, 1.f, 5.f);

    // Well above cutoff → heavily attenuated
    float magHigh = f.getMagnitudeAtFreq (10000.f);
    BOOST_CHECK_LT (magHigh, 0.1f);
}

// ── Shape: HighPass ───────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (HighPassAttenuatesLowFreq)
{
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::HighPass);
    f.setFrequency (1000.f);
    f.setQ (0.707f);

    float magLow = f.getMagnitudeAtFreq (10.f);
    BOOST_CHECK_LT (magLow, 0.1f);

    float magHigh = f.getMagnitudeAtFreq (20000.f);
    BOOST_CHECK_GT (magHigh, 0.8f);
}

// ── Shape: LowShelf ───────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (LowShelfBoostsBelowFrequency)
{
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::LowShelf);
    f.setFrequency (500.f);
    f.setQ (0.707f);
    f.setGain (6.f);

    float magLow = f.getMagnitudeAtFreq (20.f);
    BOOST_CHECK_GT (magLow, 1.5f);

    float magHigh = f.getMagnitudeAtFreq (20000.f);
    BOOST_CHECK_CLOSE (magHigh, 1.f, 5.f);
}

// ── Shape: HighShelf ──────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (HighShelfBoostsAboveFrequency)
{
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::HighShelf);
    f.setFrequency (5000.f);
    f.setQ (0.707f);
    f.setGain (6.f);

    float magHigh = f.getMagnitudeAtFreq (20000.f);
    BOOST_CHECK_GT (magHigh, 1.5f);

    float magLow = f.getMagnitudeAtFreq (50.f);
    BOOST_CHECK_CLOSE (magLow, 1.f, 5.f);
}

// ── process() / processBlock() ────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ProcessSingleSampleNoNaN)
{
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::Bell);
    f.setFrequency (1000.f);
    f.setQ (1.f);
    f.setGain (12.f);

    for (int i = 0; i < 512; ++i)
    {
        float y = f.process (std::sin (2.f * float (M_PI) * 1000.f * float (i) / float (kSR)));
        BOOST_REQUIRE (std::isfinite (y));
    }
}

BOOST_AUTO_TEST_CASE (ProcessBlockMatchesSingleSamplePath)
{
    // Both paths must produce identical output for the same input.
    EQFilter f1, f2;
    f1.reset (kSR);
    f2.reset (kSR);
    f1.setShape (EQFilter::Bell); f1.setFrequency (2000.f); f1.setQ (2.f); f1.setGain (4.f);
    f2.setShape (EQFilter::Bell); f2.setFrequency (2000.f); f2.setQ (2.f); f2.setGain (4.f);

    const int N = 64;
    float buf[N];
    for (int i = 0; i < N; ++i)
        buf[i] = float (i) / float (N);

    float expected[N];
    for (int i = 0; i < N; ++i)
        expected[i] = f1.process (buf[i]);

    f2.processBlock (buf, N);

    for (int i = 0; i < N; ++i)
        BOOST_CHECK_CLOSE (buf[i], expected[i], 0.001f);
}

// ── Reset clears state ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ResetClearsFilterMemory)
{
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::Bell);
    f.setFrequency (100.f);
    f.setQ (10.f);
    f.setGain (24.f);

    // Pump a loud signal through to fill filter memory
    for (int i = 0; i < 256; ++i)
        f.process (1.f);

    // After reset, first sample on silence should be near 0
    f.reset (kSR);
    float y = f.process (0.f);
    BOOST_CHECK_CLOSE (y, 0.f, 1.f); // within 1% of 0
}

// ── Edge cases ────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ZeroGainBellIsPassthrough)
{
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::Bell);
    f.setFrequency (1000.f);
    f.setQ (1.f);
    f.setGain (0.f);

    float mag = f.getMagnitudeAtFreq (1000.f);
    BOOST_CHECK_CLOSE (mag, 1.f, 1.f);
}

BOOST_AUTO_TEST_CASE (VeryHighQBell)
{
    // Narrow bell must not produce NaN/Inf
    EQFilter f;
    f.reset (kSR);
    f.setShape (EQFilter::Bell);
    f.setFrequency (1000.f);
    f.setQ (100.f);
    f.setGain (12.f);
    float mag = f.getMagnitudeAtFreq (1000.f);
    BOOST_CHECK (std::isfinite (mag));
}

// ── EQFilterProcessor lifecycle ───────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ProcessorPrepareAndRelease)
{
    EQFilterProcessor proc (2);
    proc.prepareToPlay (kSR, 512);
    BOOST_CHECK_EQUAL (proc.getSampleRate(), kSR);
    proc.releaseResources();
    // Must not crash on second prepare
    proc.prepareToPlay (48000.0, 256);
    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessorProcessBlockSilence)
{
    EQFilterProcessor proc (2);
    proc.prepareToPlay (kSR, 512);

    AudioBuffer<float> buf (2, 512);
    buf.clear();
    MidiBuffer midi;
    proc.processBlock (buf, midi);

    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < 512; ++i)
            BOOST_CHECK (std::isfinite (buf.getSample (ch, i)));

    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessorStateSaveRestore)
{
    EQFilterProcessor proc (2);
    proc.prepareToPlay (kSR, 512);

    juce::MemoryBlock state;
    proc.getStateInformation (state);
    BOOST_CHECK_GT (state.getSize(), 0u);

    EQFilterProcessor proc2 (2);
    proc2.prepareToPlay (kSR, 512);
    proc2.setStateInformation (state.getData(), (int) state.getSize());

    // Both processors should produce same magnitude after restore
    float m1 = proc.getMagnitudeAtFreq (1000.f);
    float m2 = proc2.getMagnitudeAtFreq (1000.f);
    BOOST_CHECK_CLOSE (m1, m2, 0.1f);

    proc.releaseResources();
    proc2.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessorAcceptsAndProducesMidi)
{
    EQFilterProcessor proc (2);
    BOOST_CHECK (! proc.acceptsMidi());
    BOOST_CHECK (! proc.producesMidi());
}

BOOST_AUTO_TEST_SUITE_END()
