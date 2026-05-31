// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <cmath>

#include "nodes/allpassfilter.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (AllPassFilterTests)

// ── AllPassFilter (DSP primitive) ─────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultConstruct)
{
    AllPassFilter f;
    // setSize must be called before use; just verify no crash constructing.
    BOOST_CHECK_NO_THROW (f.free());
}

BOOST_AUTO_TEST_CASE (SetSizeAllocatesAndClears)
{
    AllPassFilter f;
    f.setSize (64);
    // Immediately after setSize, buffer is zeroed; first process() returns 0.
    float out = f.process (0.0f);
    BOOST_CHECK_SMALL (out, 1e-6f);
}

BOOST_AUTO_TEST_CASE (SetSizeSameSizeAlwaysClears)
{
    // If size == bufferSize, setSize skips realloc but still calls clear().
    AllPassFilter f;
    f.setSize (16);
    f.process (1.0f); // write non-zero into buffer

    f.setSize (16);   // same size → skip malloc, but clear() resets contents
    float out = f.process (0.0f);
    // After clear the buffered value is 0, so out == 0 - 0 = 0.
    BOOST_CHECK_SMALL (out, 1e-6f);
}

BOOST_AUTO_TEST_CASE (ProcessOutputEqualsBufferedMinusInput)
{
    // AllPassFilter output formula: bufferedValue - input
    // On first call bufferedValue == 0, so out == -input.
    AllPassFilter f;
    f.setSize (4);
    float out = f.process (3.0f); // buffered[0]=0, returns 0-3 = -3
    BOOST_CHECK_CLOSE (out, -3.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (ClearZerosOutput)
{
    AllPassFilter f;
    f.setSize (8);
    for (int i = 0; i < 8; ++i)
        f.process (1.0f); // fill buffer

    f.clear();
    float out = f.process (0.0f);
    BOOST_CHECK_SMALL (out, 1e-6f);
}

BOOST_AUTO_TEST_CASE (FreeAllowsReuse)
{
    AllPassFilter f;
    f.setSize (16);
    f.process (1.0f);
    f.free();
    // After free, setSize should work again cleanly.
    f.setSize (16);
    float out = f.process (0.0f);
    BOOST_CHECK_SMALL (out, 1e-6f);
}

BOOST_AUTO_TEST_CASE (OutputIsFinite)
{
    AllPassFilter f;
    f.setSize (64);
    for (int i = 0; i < 256; ++i)
    {
        float out = f.process (0.7f);
        BOOST_CHECK (std::isfinite (out));
    }
}

// ── AllPassFilterProcessor (AudioProcessor wrapper) ───────────────────────────

BOOST_AUTO_TEST_CASE (MonoConstruct)
{
    AllPassFilterProcessor proc (false); // mono
    BOOST_CHECK_EQUAL (proc.getTotalNumInputChannels(), 1);
    BOOST_CHECK_EQUAL (proc.getTotalNumOutputChannels(), 1);
    BOOST_CHECK (! proc.acceptsMidi());
    BOOST_CHECK (! proc.producesMidi());
}

BOOST_AUTO_TEST_CASE (StereoConstruct)
{
    AllPassFilterProcessor proc (true); // stereo
    BOOST_CHECK_EQUAL (proc.getTotalNumInputChannels(), 2);
    BOOST_CHECK_EQUAL (proc.getTotalNumOutputChannels(), 2);
}

BOOST_AUTO_TEST_CASE (PrepareReleaseCycle)
{
    AllPassFilterProcessor proc (true);
    BOOST_CHECK_NO_THROW (proc.prepareToPlay (44100.0, 512));
    BOOST_CHECK_NO_THROW (proc.releaseResources());
}

BOOST_AUTO_TEST_CASE (PrepareReleaseTwice)
{
    AllPassFilterProcessor proc (false);
    proc.prepareToPlay (44100.0, 512);
    proc.releaseResources();
    proc.prepareToPlay (48000.0, 256);
    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessBlockMonoOutputIsFinite)
{
    AllPassFilterProcessor proc (false);
    proc.prepareToPlay (44100.0, 512);

    AudioBuffer<float> buf (1, 512);
    MidiBuffer midi;
    buf.clear();
    for (int i = 0; i < 512; ++i)
        buf.setSample (0, i, 0.5f);

    proc.processBlock (buf, midi);

    for (int i = 0; i < 512; ++i)
        BOOST_CHECK (std::isfinite (buf.getSample (0, i)));

    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessBlockStereoOutputIsFinite)
{
    AllPassFilterProcessor proc (true);
    proc.prepareToPlay (44100.0, 512);

    AudioBuffer<float> buf (2, 512);
    MidiBuffer midi;
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < 512; ++i)
            buf.setSample (ch, i, 0.3f);

    proc.processBlock (buf, midi);

    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < 512; ++i)
            BOOST_CHECK (std::isfinite (buf.getSample (ch, i)));

    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (SilenceInSilenceOut)
{
    AllPassFilterProcessor proc (false);
    proc.prepareToPlay (44100.0, 512);

    AudioBuffer<float> buf (1, 512);
    MidiBuffer midi;
    buf.clear();
    proc.processBlock (buf, midi);

    // After processing silence the filter buffer is still 0 — output is 0.
    for (int i = 0; i < 512; ++i)
        BOOST_CHECK_SMALL (buf.getSample (0, i), 1e-6f);

    proc.releaseResources();
}

BOOST_AUTO_TEST_CASE (StateSaveRestoreRoundTrip)
{
    AllPassFilterProcessor src (false);
    src.prepareToPlay (44100.0, 512);

    MemoryBlock state;
    src.getStateInformation (state);
    BOOST_CHECK_GT (state.getSize(), 0u);

    AllPassFilterProcessor dst (false);
    dst.prepareToPlay (44100.0, 512);
    BOOST_CHECK_NO_THROW (dst.setStateInformation (state.getData(), (int) state.getSize()));

    src.releaseResources();
    dst.releaseResources();
}

BOOST_AUTO_TEST_CASE (PluginDescriptionMono)
{
    AllPassFilterProcessor proc (false);
    PluginDescription desc;
    proc.fillInPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.contains ("mono"));
    BOOST_CHECK_EQUAL (desc.numInputChannels, 1);
}

BOOST_AUTO_TEST_CASE (PluginDescriptionStereo)
{
    AllPassFilterProcessor proc (true);
    PluginDescription desc;
    proc.fillInPluginDescription (desc);
    BOOST_CHECK (desc.fileOrIdentifier.contains ("stereo"));
    BOOST_CHECK_EQUAL (desc.numInputChannels, 2);
}

BOOST_AUTO_TEST_SUITE_END()
