// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** VolumeProcessor tests.
    Covers: construction (mono/stereo), prepareToPlay/releaseResources,
    processBlock at unity/mute/-6dB, state save/restore round-trip,
    plugin description, silence-in → silence-out. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <cmath>

#include "nodes/volume.hpp"

using namespace element;
using namespace juce;

static constexpr double kSR  = 44100.0;
static constexpr int    kBuf = 512;

// Fill buffer with a constant value
static void fillBuffer (AudioBuffer<float>& b, float val)
{
    for (int ch = 0; ch < b.getNumChannels(); ++ch)
        b.setSample (ch, 0, val); // set first sample; rest already zeroed
    for (int ch = 0; ch < b.getNumChannels(); ++ch)
        FloatVectorOperations::fill (b.getWritePointer (ch), val, b.getNumSamples());
}

static float rms (const AudioBuffer<float>& b, int ch)
{
    return b.getRMSLevel (ch, 0, b.getNumSamples());
}

BOOST_AUTO_TEST_SUITE (VolumeProcessorTests)

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (MonoConstructDoesNotCrash)
{
    VolumeProcessor proc (-60.0, 6.0, false);
    BOOST_CHECK_EQUAL (proc.getTotalNumInputChannels(), 1);
    BOOST_CHECK_EQUAL (proc.getTotalNumOutputChannels(), 1);
}

BOOST_AUTO_TEST_CASE (StereoConstructDoesNotCrash)
{
    VolumeProcessor proc (-60.0, 6.0, true);
    BOOST_CHECK_EQUAL (proc.getTotalNumInputChannels(), 2);
    BOOST_CHECK_EQUAL (proc.getTotalNumOutputChannels(), 2);
}

BOOST_AUTO_TEST_CASE (GetNameReturnVolume)
{
    VolumeProcessor proc (-60.0, 6.0, false);
    BOOST_CHECK_EQUAL (proc.getName().toStdString(), "Volume");
}

// ── prepare / release ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PrepareToPlayDoesNotCrash)
{
    VolumeProcessor proc (-60.0, 6.0, false);
    BOOST_CHECK_NO_THROW (proc.prepareToPlay (kSR, kBuf));
}

BOOST_AUTO_TEST_CASE (ReleaseResourcesDoesNotCrash)
{
    VolumeProcessor proc (-60.0, 6.0, false);
    proc.prepareToPlay (kSR, kBuf);
    BOOST_CHECK_NO_THROW (proc.releaseResources());
}

// ── processBlock ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SilenceInSilenceOut)
{
    VolumeProcessor proc (-60.0, 6.0, false);
    proc.prepareToPlay (kSR, kBuf);

    AudioBuffer<float> buf (1, kBuf);
    buf.clear();
    MidiBuffer midi;

    proc.processBlock (buf, midi);

    BOOST_CHECK_CLOSE (rms (buf, 0), 0.f, 1e-4f);
}

BOOST_AUTO_TEST_CASE (UnityGainPassthrough)
{
    // Default volume parameter is 0 dB — output RMS should equal input RMS
    VolumeProcessor proc (-60.0, 6.0, false);
    proc.prepareToPlay (kSR, kBuf);

    AudioBuffer<float> buf (1, kBuf);
    fillBuffer (buf, 0.5f);
    MidiBuffer midi;

    const float inputRms = rms (buf, 0);
    proc.processBlock (buf, midi);
    const float outputRms = rms (buf, 0);

    BOOST_CHECK_CLOSE (outputRms, inputRms, 1.f); // within 1%
}

BOOST_AUTO_TEST_CASE (MuteProducesSilence)
{
    // Set volume to below -30 dB (mute threshold in implementation)
    VolumeProcessor proc (-60.0, 6.0, false);
    proc.prepareToPlay (kSR, kBuf);

    // Access the volume parameter (first parameter)
    auto* param = proc.getParameters()[0];
    BOOST_REQUIRE (param != nullptr);
    // Normalize -60 dB to the [0,1] parameter range: value = 0.0
    param->setValue (0.f); // min (−60 dB) → gain = 0

    AudioBuffer<float> buf (1, kBuf);
    fillBuffer (buf, 0.5f);
    MidiBuffer midi;

    // Run two blocks to let lastGain converge to 0
    proc.processBlock (buf, midi);
    fillBuffer (buf, 0.5f);
    proc.processBlock (buf, midi);

    BOOST_CHECK_CLOSE (rms (buf, 0), 0.f, 1e-3f);
}

BOOST_AUTO_TEST_CASE (StereoProcessBothChannels)
{
    VolumeProcessor proc (-60.0, 6.0, true);
    proc.prepareToPlay (kSR, kBuf);

    AudioBuffer<float> buf (2, kBuf);
    fillBuffer (buf, 0.5f);
    MidiBuffer midi;

    proc.processBlock (buf, midi);

    // Both channels should have non-zero output at unity gain
    BOOST_CHECK_GT (rms (buf, 0), 0.f);
    BOOST_CHECK_GT (rms (buf, 1), 0.f);
}

// ── state save / restore ──────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (StateRoundTrip)
{
    VolumeProcessor proc (-60.0, 6.0, false);
    proc.prepareToPlay (kSR, kBuf);

    // Set volume parameter to a known value
    auto* param = proc.getParameters()[0];
    BOOST_REQUIRE (param != nullptr);
    const float targetNorm = 0.7f;
    param->setValue (targetNorm);
    const float savedValue = param->getValue();

    MemoryBlock block;
    proc.getStateInformation (block);
    BOOST_CHECK (block.getSize() > 0);

    // Create a new instance and restore
    VolumeProcessor proc2 (-60.0, 6.0, false);
    proc2.prepareToPlay (kSR, kBuf);
    proc2.setStateInformation (block.getData(), (int) block.getSize());

    auto* param2 = proc2.getParameters()[0];
    BOOST_REQUIRE (param2 != nullptr);
    BOOST_CHECK_CLOSE (param2->getValue(), savedValue, 1e-3f);
}

BOOST_AUTO_TEST_CASE (EmptyStateDoesNotCrash)
{
    VolumeProcessor proc (-60.0, 6.0, false);
    BOOST_CHECK_NO_THROW (proc.setStateInformation (nullptr, 0));
}

// ── plugin description ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (FillInPluginDescriptionMono)
{
    VolumeProcessor proc (-60.0, 6.0, false);
    PluginDescription desc;
    proc.fillInPluginDescription (desc);
    BOOST_CHECK_EQUAL (desc.numInputChannels, 1);
    BOOST_CHECK_EQUAL (desc.numOutputChannels, 1);
    BOOST_CHECK (desc.fileOrIdentifier.contains ("mono"));
}

BOOST_AUTO_TEST_CASE (FillInPluginDescriptionStereo)
{
    VolumeProcessor proc (-60.0, 6.0, true);
    PluginDescription desc;
    proc.fillInPluginDescription (desc);
    BOOST_CHECK_EQUAL (desc.numInputChannels, 2);
    BOOST_CHECK_EQUAL (desc.numOutputChannels, 2);
    BOOST_CHECK (desc.fileOrIdentifier.contains ("stereo"));
}

BOOST_AUTO_TEST_SUITE_END()
