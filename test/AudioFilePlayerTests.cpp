// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** AudioFilePlayerNode tests.
    Covers: construction, looping flag, wildcard, host-sync toggle,
    MIDI start/stop response, state save/restore, processBlock safety. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>

#include "nodes/audiofileplayer.hpp"

using namespace element;
using namespace juce;

static constexpr double kSR  = 44100.0;
static constexpr int    kBuf = 512;

BOOST_AUTO_TEST_SUITE (AudioFilePlayerTests)

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultConstruct)
{
    AudioFilePlayerNode node;
    BOOST_CHECK (node.getAudioFile() == juce::File());
    BOOST_CHECK (! node.isLooping());
    BOOST_CHECK (! node.hostSyncEnabled());
    BOOST_CHECK (! node.respondsToStartStopContinue());
}

// ── Looping ───────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (LoopingGetSet)
{
    AudioFilePlayerNode node;
    BOOST_CHECK (! node.isLooping());
    node.setLooping (true);
    BOOST_CHECK (node.isLooping());
    node.setLooping (false);
    BOOST_CHECK (! node.isLooping());
}

// ── Host sync ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (HostSyncGetSet)
{
    AudioFilePlayerNode node;
    node.enableHostSync (true);
    BOOST_CHECK (node.hostSyncEnabled());
    node.enableHostSync (false);
    BOOST_CHECK (! node.hostSyncEnabled());
}

// ── MIDI start/stop response ──────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (MidiStartStopResponseGetSet)
{
    AudioFilePlayerNode node;
    BOOST_CHECK (! node.respondsToStartStopContinue());
    node.setRespondToStartStopContinue (true);
    BOOST_CHECK (node.respondsToStartStopContinue());
    node.setRespondToStartStopContinue (false);
    BOOST_CHECK (! node.respondsToStartStopContinue());
}

// ── File loading ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (OpenNonExistentFileSafe)
{
    AudioFilePlayerNode node;
    node.prepareToPlay (kSR, kBuf);

    juce::File bogus ("/tmp/does_not_exist_element_test_xyz.wav");
    node.openFile (bogus); // must not crash

    node.releaseResources();
}

BOOST_AUTO_TEST_CASE (CanLoadAudioFormats)
{
    AudioFilePlayerNode node;
    // Wildcard covers supported formats — must be non-empty
    String wildcard = node.getWildcard();
    BOOST_CHECK (wildcard.isNotEmpty());
}

BOOST_AUTO_TEST_CASE (CanLoadCheckReturnsFalseForBogus)
{
    AudioFilePlayerNode node;
    juce::File bogus ("/tmp/test.xyz123_unknown_format");
    BOOST_CHECK (! node.canLoad (bogus));
}

// ── ProcessBlock safety ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ProcessBlockSilenceNoFile)
{
    AudioFilePlayerNode node;
    node.prepareToPlay (kSR, kBuf);

    AudioBuffer<float> buf (2, kBuf);
    buf.clear();
    MidiBuffer midi;
    node.processBlock (buf, midi);

    // No file → output must be silence (or at least finite)
    for (int ch = 0; ch < 2; ++ch)
        for (int i = 0; i < kBuf; ++i)
            BOOST_CHECK (std::isfinite (buf.getSample (ch, i)));

    node.releaseResources();
}

BOOST_AUTO_TEST_CASE (ProcessBlockMultipleCallsNoFile)
{
    AudioFilePlayerNode node;
    node.setLooping (true);
    node.prepareToPlay (kSR, kBuf);

    AudioBuffer<float> buf (2, kBuf);
    MidiBuffer midi;

    for (int i = 0; i < 10; ++i)
    {
        buf.clear();
        node.processBlock (buf, midi);
    }

    node.releaseResources();
    BOOST_CHECK (true);
}

// ── State save / restore ──────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (StateSaveNotEmpty)
{
    AudioFilePlayerNode node;
    node.prepareToPlay (kSR, kBuf);
    node.setLooping (true);
    node.enableHostSync (true);

    juce::MemoryBlock state;
    node.getStateInformation (state);
    BOOST_CHECK_GT (state.getSize(), 0u);

    node.releaseResources();
}

BOOST_AUTO_TEST_CASE (StateRoundTripLooping)
{
    AudioFilePlayerNode node;
    node.prepareToPlay (kSR, kBuf);
    node.setLooping (true);
    node.setRespondToStartStopContinue (true);

    juce::MemoryBlock state;
    node.getStateInformation (state);

    AudioFilePlayerNode node2;
    node2.prepareToPlay (kSR, kBuf);
    node2.setStateInformation (state.getData(), (int) state.getSize());

    BOOST_CHECK (node2.isLooping());
    BOOST_CHECK (node2.respondsToStartStopContinue());

    node.releaseResources();
    node2.releaseResources();
}

BOOST_AUTO_TEST_CASE (StateRestoreEmpty)
{
    AudioFilePlayerNode node;
    node.prepareToPlay (kSR, kBuf);
    node.setStateInformation (nullptr, 0); // must not crash
    node.releaseResources();
}

// ── Plugin metadata ────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (GetName)
{
    AudioFilePlayerNode node;
    BOOST_CHECK (node.getName().isNotEmpty());
}

BOOST_AUTO_TEST_CASE (AcceptsMidi)
{
    AudioFilePlayerNode node;
    // AudioFilePlayerNode responds to MIDI start/stop — should accept MIDI
    BOOST_CHECK (node.acceptsMidi());
}

BOOST_AUTO_TEST_CASE (TailLengthSeconds)
{
    AudioFilePlayerNode node;
    BOOST_CHECK_GE (node.getTailLengthSeconds(), 0.0);
}

BOOST_AUTO_TEST_CASE (PrepareReleaseCycle)
{
    AudioFilePlayerNode node;
    node.prepareToPlay (kSR, kBuf);
    node.releaseResources();
    node.prepareToPlay (48000.0, 256);
    node.releaseResources();
}

// ── Watch dir ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (WatchDirGetSet)
{
    AudioFilePlayerNode node;
    juce::File dir = juce::File::getSpecialLocation (juce::File::tempDirectory);
    node.setWatchDir (dir);
    BOOST_CHECK_EQUAL (node.getWatchDir().getFullPathName(), dir.getFullPathName());
}

BOOST_AUTO_TEST_CASE (WatchDirDefaultEmpty)
{
    AudioFilePlayerNode node;
    BOOST_CHECK (! node.getWatchDir().exists() || node.getWatchDir() == juce::File());
}

BOOST_AUTO_TEST_SUITE_END()
