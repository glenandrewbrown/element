// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for Transport and Transport::Monitor.
// Gap: Transport is the central audio-thread state machine; zero prior tests.
// Tests focus on Monitor atomic fields (safe to call without audio thread)
// and Transport request API with a single preProcess/postProcess cycle.

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/transport.hpp>

using namespace element;

static constexpr double kSampleRate  = 44100.0;
static constexpr int    kBlockSize   = 512;

BOOST_AUTO_TEST_SUITE (TransportMonitorTests)

// ── Monitor default construction ─────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (MonitorDefaultsToStopped)
{
    Transport::Monitor mon;
    BOOST_CHECK (! mon.playing.get());
    BOOST_CHECK (! mon.recording.get());
}

BOOST_AUTO_TEST_CASE (MonitorDefaultTempoIsNonZero)
{
    Transport::Monitor mon;
    // Default tempo should be a sensible value (typically 120.0 BPM)
    BOOST_CHECK_GT (mon.tempo.get(), 0.0f);
}

BOOST_AUTO_TEST_CASE (MonitorAtomicsCanBeWrittenAndRead)
{
    Transport::Monitor mon;
    mon.tempo.set (130.0f);
    BOOST_CHECK_CLOSE (mon.tempo.get(), 130.0f, 1e-4f);

    mon.beatsPerBar.set (3);
    BOOST_CHECK_EQUAL (mon.beatsPerBar.get(), 3);

    mon.playing.set (true);
    BOOST_CHECK (mon.playing.get());
}

// ── beatRatio ────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (BeatRatioQuarterNoteOverQuarterNote)
{
    Transport::Monitor mon;
    mon.beatType.set (4);      // quarter note
    mon.beatDivisor.set (4);   // quarter note subdivision
    double ratio = mon.beatRatio();
    BOOST_CHECK_CLOSE (ratio, 1.0, 1e-6);
}

// ── Transport request API ─────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (TransportConstructsWithStoppedState)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    BOOST_CHECK (! t.isPlaying());
    BOOST_CHECK (! t.isRecording());
}

BOOST_AUTO_TEST_CASE (RequestPlayStateSetsPlayingAfterPreProcess)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    t.requestPlayState (true);
    t.preProcess (kBlockSize);
    BOOST_CHECK (t.isPlaying());
}

BOOST_AUTO_TEST_CASE (RequestStopClearsPlayingAfterPreProcess)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    t.requestPlayState (true);
    t.preProcess (kBlockSize);
    t.requestPlayState (false);
    t.preProcess (kBlockSize);
    BOOST_CHECK (! t.isPlaying());
}

BOOST_AUTO_TEST_CASE (RequestRecordStateSetsRecording)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    t.requestRecordState (true);
    t.preProcess (kBlockSize);
    BOOST_CHECK (t.isRecording());
}

BOOST_AUTO_TEST_CASE (RequestTempoIsApplied)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    t.requestTempo (140.0);
    t.preProcess (kBlockSize);
    BOOST_CHECK_CLOSE (t.getTempo(), 140.0f, 0.1f);
}

BOOST_AUTO_TEST_CASE (PostProcessAdvancesPositionWhenPlaying)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    t.requestPlayState (true);
    t.preProcess (kBlockSize);

    int64_t before = t.getPositionFrames();
    t.postProcess (kBlockSize);
    t.preProcess (kBlockSize);

    int64_t after = t.getPositionFrames();
    BOOST_CHECK_GT (after, before);
}

BOOST_AUTO_TEST_CASE (PostProcessDoesNotAdvanceWhenStopped)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    // leave stopped
    t.preProcess (kBlockSize);

    int64_t before = t.getPositionFrames();
    t.postProcess (kBlockSize);
    t.preProcess (kBlockSize);

    int64_t after = t.getPositionFrames();
    BOOST_CHECK_EQUAL (after, before);
}

BOOST_AUTO_TEST_CASE (RequestSeekMovesPosition)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    t.requestAudioFrame (kSampleRate * 2); // seek to 2 seconds
    t.preProcess (kBlockSize);
    // position should be at or near 2 * 44100
    BOOST_CHECK_GE (t.getPositionFrames(), static_cast<int64_t> (kSampleRate * 2 - kBlockSize));
}

// ── getMonitor() returns valid MonitorPtr ─────────────────────────────────────

BOOST_AUTO_TEST_CASE (GetMonitorReturnsNonNull)
{
    Transport t;
    auto mon = t.getMonitor();
    BOOST_CHECK (mon != nullptr);
}

BOOST_AUTO_TEST_CASE (MonitorUpdatedAfterPostProcess)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    t.requestPlayState (true);
    t.requestTempo (125.0);
    t.preProcess (kBlockSize);
    t.postProcess (kBlockSize);

    auto mon = t.getMonitor();
    BOOST_CHECK (mon->playing.get());
    BOOST_CHECK_CLOSE (mon->tempo.get(), 125.0f, 0.5f);
}

// ── requestMeter ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (RequestMeterChangesTimeSig)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    t.requestMeter (3, 8); // 3/8 time
    t.preProcess (kBlockSize);
    BOOST_CHECK_EQUAL (t.getBeatsPerBar(), 3);
    BOOST_CHECK_EQUAL (t.getBeatType(), 8);
}

// ── applyTempo (called outside audio thread in tests) ────────────────────────

BOOST_AUTO_TEST_CASE (ApplyTempoWithoutAudioThread)
{
    Transport t;
    t.setSampleRate (kSampleRate);
    t.requestTempo (160.0);
    t.applyTempo(); // safe when engine is not running
    BOOST_CHECK_CLOSE (t.getTempo(), 160.0f, 0.5f);
}

BOOST_AUTO_TEST_SUITE_END()
