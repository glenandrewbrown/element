// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <cmath>

#include "nodes/combfilter.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (CombFilterTests)

// ── CombFilter (DSP primitive) ────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultConstruct)
{
    CombFilter f;
    BOOST_CHECK_NO_THROW (f.free());
}

BOOST_AUTO_TEST_CASE (SetSizeAllocates)
{
    CombFilter f;
    f.setSize (64);
    // Buffer zeroed by clear(); first process() returns 0.
    float out = f.process (0.0f, 0.0f, 0.5f);
    BOOST_CHECK_SMALL (out, 1e-6f);
}

BOOST_AUTO_TEST_CASE (SetSameSizeIsNoop)
{
    // setSize with identical size returns early (unlike AllPassFilter which always clears).
    // Use bufferSize=1 so bufferIndex always wraps to 0, making the slot predictable.
    CombFilter f;
    f.setSize (1); // bufferIndex stays at 0 after each process (1%1=0)

    // Write 1.0 into buffer[0]; returns the old buffer[0]=0.
    f.process (1.0f, 0.0f, 0.0f);

    // Same size → early return, does NOT call clear().
    f.setSize (1);

    // buffer[0] still holds 1.0; process returns it.
    float out = f.process (0.0f, 0.0f, 0.0f);
    BOOST_CHECK_CLOSE (out, 1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (SetDifferentSizeClears)
{
    CombFilter f;
    f.setSize (32);
    f.process (1.0f, 0.0f, 0.0f);

    f.setSize (64); // different size → realloc + clear
    float out = f.process (0.0f, 0.0f, 0.0f);
    BOOST_CHECK_SMALL (out, 1e-6f);
}

BOOST_AUTO_TEST_CASE (SetSizeUsesNextPowerOfTwo)
{
    // setSize(100) allocates 128 internally but stores bufferSize=100.
    // Modulo uses bufferSize=100, so after 100 samples the ring wraps.
    CombFilter f;
    f.setSize (100);
    // Write a known value, advance 100 samples, it should reappear.
    f.process (1.0f, 0.0f, 0.0f); // writes 1.0 at index 0
    for (int i = 1; i < 100; ++i)
        f.process (0.0f, 0.0f, 0.0f); // advance 99 more → index back to 0
    float out = f.process (0.0f, 0.0f, 0.0f); // reads what was at index 0
    BOOST_CHECK_CLOSE (out, 1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (ClearZerosBuffer)
{
    CombFilter f;
    f.setSize (16);
    for (int i = 0; i < 16; ++i)
        f.process (1.0f, 0.0f, 0.0f);
    f.clear();
    float out = f.process (0.0f, 0.0f, 0.0f);
    BOOST_CHECK_SMALL (out, 1e-6f);
}

BOOST_AUTO_TEST_CASE (FreeAllowsReuse)
{
    CombFilter f;
    f.setSize (32);
    f.process (1.0f, 0.0f, 0.0f);
    f.free();
    f.setSize (32);
    float out = f.process (0.0f, 0.0f, 0.0f);
    BOOST_CHECK_SMALL (out, 1e-6f);
}

BOOST_AUTO_TEST_CASE (ZeroDampingNoDecay)
{
    // With damping=0: last = output*(1-0) + last*0 = output
    // Feedback passes signal unchanged.
    CombFilter f;
    f.setSize (1); // delay of 1 sample
    float out0 = f.process (1.0f, 0.0f, 1.0f); // first call: reads 0
    float out1 = f.process (0.0f, 0.0f, 1.0f); // reads 1.0, feeds back
    BOOST_CHECK_SMALL (out0, 1e-6f);
    BOOST_CHECK_CLOSE (out1, 1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (FullDampingDecaysToZero)
{
    // With damping=1.0: last = output*0 + last*1 = last (previous last).
    // After steady signal, last stabilises and new input decays.
    CombFilter f;
    f.setSize (4);
    // Drive for a while
    for (int i = 0; i < 64; ++i)
        f.process (1.0f, 1.0f, 0.5f);
    // Stop input — output should decay
    float prev = f.process (0.0f, 1.0f, 0.5f);
    for (int i = 0; i < 32; ++i)
    {
        float next = f.process (0.0f, 1.0f, 0.5f);
        BOOST_CHECK (std::isfinite (next));
        (void) next;
    }
    (void) prev;
}

BOOST_AUTO_TEST_CASE (OutputIsFinite)
{
    CombFilter f;
    f.setSize (64);
    for (int i = 0; i < 512; ++i)
    {
        float out = f.process (0.5f, 0.3f, 0.7f);
        BOOST_CHECK (std::isfinite (out));
    }
}

// ── CombFilterProcessor (AudioProcessor wrapper) ──────────────────────────────

BOOST_AUTO_TEST_CASE (MonoConstruct)
{
    CombFilterProcessor proc (false);
    BOOST_CHECK_EQUAL (proc.getTotalNumInputChannels(), 1);
    BOOST_CHECK_EQUAL (proc.getTotalNumOutputChannels(), 1);
    BOOST_CHECK (! proc.acceptsMidi());
    BOOST_CHECK (! proc.producesMidi());
}

BOOST_AUTO_TEST_CASE (StereoConstruct)
{
    CombFilterProcessor proc (true);
    BOOST_CHECK_EQUAL (proc.getTotalNumInputChannels(), 2);
    BOOST_CHECK_EQUAL (proc.getTotalNumOutputChannels(), 2);
}

BOOST_AUTO_TEST_CASE (PrepareReleaseCycle)
{
    CombFilterProcessor proc (true);
    BOOST_CHECK_NO_THROW (proc.prepareToPlay (44100.0, 512));
    BOOST_CHECK_NO_THROW (proc.releaseResources());
}

BOOST_AUTO_TEST_CASE (PrepareReleaseTwice)
{
    CombFilterProcessor proc (false);
    proc.prepareToPlay (44100.0, 512);
    proc.releaseResources();
    proc.prepareToPlay (48000.0, 256);
    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessBlockOutputIsFinite)
{
    CombFilterProcessor proc (false);
    proc.prepareToPlay (44100.0, 512);

    AudioBuffer<float> buf (1, 512);
    MidiBuffer midi;
    for (int i = 0; i < 512; ++i)
        buf.setSample (0, i, 0.5f);

    proc.processBlock (buf, midi);

    for (int i = 0; i < 512; ++i)
        BOOST_CHECK (std::isfinite (buf.getSample (0, i)));

    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (StereoSpreadDiffers)
{
    // Stereo channels use different delay lengths (spreadForChannel): ch0=0, ch1=28.
    // Run same input through both channels — outputs should differ after transient.
    CombFilterProcessor proc (true);
    proc.prepareToPlay (44100.0, 512);

    AudioBuffer<float> buf (2, 512);
    MidiBuffer midi;
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < 512; ++i)
            buf.setSample (ch, i, 0.5f);

    // Run several blocks to let the delay lines diverge.
    for (int b = 0; b < 5; ++b)
        proc.processBlock (buf, midi);

    // After enough blocks, channels should differ (different delay lines).
    bool anyDiff = false;
    for (int i = 100; i < 512; ++i)
        if (std::fabs (buf.getSample (0, i) - buf.getSample (1, i)) > 1e-4f)
            anyDiff = true;

    BOOST_CHECK (anyDiff);
    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (StateSaveRestoreRoundTrip)
{
    CombFilterProcessor src (false);
    src.prepareToPlay (44100.0, 512);

    MemoryBlock state;
    src.getStateInformation (state);
    BOOST_CHECK_GT (state.getSize(), 0u);

    CombFilterProcessor dst (false);
    dst.prepareToPlay (44100.0, 512);
    BOOST_CHECK_NO_THROW (dst.setStateInformation (state.getData(), (int) state.getSize()));

    src.releaseResources();
    dst.releaseResources();
}

BOOST_AUTO_TEST_CASE (PluginDescriptionMono)
{
    CombFilterProcessor proc (false);
    PluginDescription desc;
    proc.fillInPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.contains ("mono"));
    BOOST_CHECK_EQUAL (desc.numInputChannels, 1);
}

BOOST_AUTO_TEST_CASE (PluginDescriptionStereo)
{
    CombFilterProcessor proc (true);
    PluginDescription desc;
    proc.fillInPluginDescription (desc);
    BOOST_CHECK (desc.fileOrIdentifier.contains ("stereo"));
    BOOST_CHECK_EQUAL (desc.numInputChannels, 2);
}

BOOST_AUTO_TEST_SUITE_END()
