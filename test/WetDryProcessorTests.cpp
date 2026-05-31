// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include "nodes/wetdry.hpp"

using namespace element;

namespace {

static constexpr int kSampleRate = 44100;
static constexpr int kBlockSize  = 512;

/** Fill a 4-channel buffer: ch0/1 = wet, ch2/3 = dry, each with 'value'. */
static juce::AudioBuffer<float> makeBuffer (float wet, float dry, int numSamples = kBlockSize)
{
    juce::AudioBuffer<float> buf (4, numSamples);
    buf.clear();
    buf.setSample (0, 0, wet); // L wet
    buf.setSample (1, 0, wet); // R wet
    buf.setSample (2, 0, dry); // L dry
    buf.setSample (3, 0, dry); // R dry
    return buf;
}

} // namespace

BOOST_AUTO_TEST_SUITE (WetDryProcessorTests)

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ConstructNoCrash)
{
    WetDryProcessor proc;
    BOOST_CHECK (proc.getName().isNotEmpty());
}

// ── Plugin description ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PluginDescriptionPopulated)
{
    WetDryProcessor proc;
    juce::PluginDescription desc;
    proc.fillInPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.isNotEmpty());
    BOOST_CHECK_EQUAL (desc.numInputChannels,  4);
    BOOST_CHECK_EQUAL (desc.numOutputChannels, 2);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PrepareReleaseNoCrash)
{
    WetDryProcessor proc;
    BOOST_CHECK_NO_THROW (proc.prepareToPlay (kSampleRate, kBlockSize));
    BOOST_CHECK_NO_THROW (proc.releaseResources());
}

BOOST_AUTO_TEST_CASE (DoublePrepareNoCrash)
{
    WetDryProcessor proc;
    BOOST_CHECK_NO_THROW (proc.prepareToPlay (kSampleRate, kBlockSize));
    BOOST_CHECK_NO_THROW (proc.prepareToPlay (48000, 256));
    BOOST_CHECK_NO_THROW (proc.releaseResources());
}

// ── acceptsMidi / producesMidi ────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (MidiFlags)
{
    WetDryProcessor proc;
    BOOST_CHECK (! proc.acceptsMidi());
    BOOST_CHECK (! proc.producesMidi());
}

// ── processBlock: silence in → silence out ───────────────────────────────────

BOOST_AUTO_TEST_CASE (SilentInputSilentOutput)
{
    WetDryProcessor proc;
    proc.prepareToPlay (kSampleRate, kBlockSize);

    juce::AudioBuffer<float> buf (4, kBlockSize);
    buf.clear();
    juce::MidiBuffer midi;
    BOOST_CHECK_NO_THROW (proc.processBlock (buf, midi));

    // Channels 0 and 1 are the stereo output
    BOOST_CHECK_SMALL (buf.getMagnitude (0, 0, kBlockSize), 0.001f);
    BOOST_CHECK_SMALL (buf.getMagnitude (1, 0, kBlockSize), 0.001f);
}

// ── processBlock: fewer than 4 channels triggers assertion branch ─────────────

BOOST_AUTO_TEST_CASE (TooFewChannelsNoCrash)
{
    // This exercises the jassertfalse branch — just must not crash.
    WetDryProcessor proc;
    proc.prepareToPlay (kSampleRate, kBlockSize);

    juce::AudioBuffer<float> twoChBuf (2, kBlockSize);
    twoChBuf.clear();
    juce::MidiBuffer midi;
    BOOST_CHECK_NO_THROW (proc.processBlock (twoChBuf, midi));
}

// ── State round-trip ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (StateRoundTrip)
{
    // Basic smoke: getStateInformation / setStateInformation do not crash.
    WetDryProcessor proc;
    proc.prepareToPlay (kSampleRate, kBlockSize);

    juce::MemoryBlock block;
    BOOST_CHECK_NO_THROW (proc.getStateInformation (block));
    BOOST_CHECK_GT ((int) block.getSize(), 0);
    BOOST_CHECK_NO_THROW (proc.setStateInformation (block.getData(), (int) block.getSize()));
}

BOOST_AUTO_TEST_CASE (SetStateEmptyNoCrash)
{
    WetDryProcessor proc;
    BOOST_CHECK_NO_THROW (proc.setStateInformation (nullptr, 0));
}

// ── setLevels updates gain smoothers ─────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SetLevelsNoCrash)
{
    WetDryProcessor proc;
    proc.prepareToPlay (kSampleRate, kBlockSize);
    BOOST_CHECK_NO_THROW (proc.setLevels (0.5f, 0.5f));
    BOOST_CHECK_NO_THROW (proc.setLevels (0.0f, 0.0f));
    BOOST_CHECK_NO_THROW (proc.setLevels (1.0f, 1.0f));
}

// ── BusesLayout ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (TailLength)
{
    WetDryProcessor proc;
    BOOST_CHECK_CLOSE (proc.getTailLengthSeconds(), 0.0, 0.001);
}

BOOST_AUTO_TEST_SUITE_END()
