// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

/** TimeScale tests.
    Covers: frame/tick/beat/bar conversion accuracy, tempo map nodes,
    marker operations, cursor seeking, copy/sync, snap helpers. */

#include <boost/test/unit_test.hpp>
#include <element/timescale.hpp>

using namespace element;

static constexpr unsigned int kSR   = 44100;
static constexpr unsigned short kPPQ = 480; // ticks per beat

/** Returns a freshly cleared TimeScale at 44100 Hz, 480 PPQN, 120 BPM. */
static TimeScale makeScale (float bpm = 120.0f)
{
    TimeScale ts;
    ts.setSampleRate (kSR);
    ts.setTicksPerBeat (kPPQ);
    ts.setTempo (bpm);
    ts.updateScale();
    return ts;
}

BOOST_AUTO_TEST_SUITE (TimeScaleTests)

// ── Construction & defaults ───────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultTempoIs120)
{
    TimeScale ts;
    BOOST_CHECK_CLOSE (ts.getTempo(), 120.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (DefaultBeatsPerBar4)
{
    TimeScale ts;
    BOOST_CHECK_EQUAL (ts.beatsPerBar(), 4);
}

BOOST_AUTO_TEST_CASE (DefaultBeatDivisor2)
{
    TimeScale ts;
    BOOST_CHECK_EQUAL (ts.beatDivisor(), 2);
}

BOOST_AUTO_TEST_CASE (SetGetSampleRate)
{
    TimeScale ts;
    ts.setSampleRate (48000);
    BOOST_CHECK_EQUAL (ts.getSampleRate(), 48000u);
}

BOOST_AUTO_TEST_CASE (SetGetTicksPerBeat)
{
    TimeScale ts;
    ts.setTicksPerBeat (960);
    BOOST_CHECK_EQUAL (ts.ticksPerBeat(), 960);
    BOOST_CHECK_EQUAL (ts.ppq(), 960);
}

BOOST_AUTO_TEST_CASE (SetGetTempo)
{
    TimeScale ts;
    ts.setTempo (140.0f);
    BOOST_CHECK_CLOSE (ts.getTempo(), 140.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (SetGetBeatsPerBar)
{
    TimeScale ts;
    ts.setBeatsPerBar (3);
    BOOST_CHECK_EQUAL (ts.beatsPerBar(), 3);
}

// ── Copy / sync ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (CopyConstructPreservesSettings)
{
    TimeScale src = makeScale (140.0f);
    src.setBeatsPerBar (3);
    src.updateScale();

    TimeScale dst (src);
    BOOST_CHECK_CLOSE (dst.getTempo(), 140.0f, 0.001f);
    BOOST_CHECK_EQUAL (dst.beatsPerBar(), 3);
    BOOST_CHECK_EQUAL (dst.getSampleRate(), kSR);
}

BOOST_AUTO_TEST_CASE (AssignmentPreservesSettings)
{
    TimeScale src = makeScale (90.0f);
    TimeScale dst;
    dst = src;
    BOOST_CHECK_CLOSE (dst.getTempo(), 90.0f, 0.001f);
    BOOST_CHECK_EQUAL (dst.getSampleRate(), kSR);
}

// ── Frame / tick conversions ──────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (FrameFromTickRoundTrip)
{
    TimeScale ts = makeScale (120.0f);
    // At 120 BPM, 44100 SR, 480 PPQN:
    // tickRate = (480 * 120) / 60 = 960 ticks/sec
    // 1 tick = 44100/960 ≈ 45.9375 frames
    const uint64_t tick = 480; // 1 beat
    uint64_t frame = ts.frameFromTick (tick);
    uint64_t back  = ts.tickFromFrame (frame);
    // Round-trip should be within 1 tick of precision.
    BOOST_CHECK_LE (std::abs ((int64_t) back - (int64_t) tick), 1);
}

BOOST_AUTO_TEST_CASE (OneBeatFrameCount)
{
    TimeScale ts = makeScale (120.0f);
    // At 120 BPM: 1 beat = 0.5 s = 22050 frames at 44100 Hz.
    uint64_t beatFrame = ts.frameFromBeat (1);
    BOOST_CHECK_LE (std::abs ((int64_t) beatFrame - 22050), 2);
}

BOOST_AUTO_TEST_CASE (OneBeatFrameCount90BPM)
{
    TimeScale ts = makeScale (90.0f);
    // At 90 BPM: 1 beat = 60/90 s ≈ 0.6667 s ≈ 29400 frames.
    uint64_t beatFrame = ts.frameFromBeat (1);
    BOOST_CHECK_LE (std::abs ((int64_t) beatFrame - 29400), 2);
}

BOOST_AUTO_TEST_CASE (FrameZeroIsBeginning)
{
    TimeScale ts = makeScale();
    BOOST_CHECK_EQUAL (ts.beatFromFrame (0), 0u);
    BOOST_CHECK_EQUAL (ts.tickFromFrame (0), 0u);
    BOOST_CHECK_EQUAL (ts.barFromFrame (0), 0);
}

BOOST_AUTO_TEST_CASE (TickFromFrameRoundTrip120BPM)
{
    TimeScale ts = makeScale (120.0f);
    const uint64_t testFrame = 44100; // 1 second
    uint64_t tick  = ts.tickFromFrame (testFrame);
    uint64_t back  = ts.frameFromTick (tick);
    BOOST_CHECK_LE (std::abs ((int64_t) back - (int64_t) testFrame), 50);
}

// ── Beat / bar conversions ────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (FourBeatsMakeOneBar)
{
    TimeScale ts = makeScale();
    // In 4/4 time, beat 4 (0-indexed from 0) should be bar 1.
    BOOST_CHECK_EQUAL (ts.beatsPerBar(), 4);
    // At beat index 4 we cross into bar 1.
    uint64_t barFrame = ts.frameFromBar (1);
    uint64_t beatFrame = ts.frameFromBeat (4);
    // They should be the same frame.
    BOOST_CHECK_LE (std::abs ((int64_t) barFrame - (int64_t) beatFrame), 2);
}

BOOST_AUTO_TEST_CASE (BeatIsBarAtMultiplesOf4)
{
    TimeScale ts = makeScale();
    BOOST_CHECK (ts.beatIsBar (0));  // beat 0 is bar 0
    BOOST_CHECK (ts.beatIsBar (4));  // beat 4 is bar 1
    BOOST_CHECK (ts.beatIsBar (8));  // beat 8 is bar 2
    BOOST_CHECK (! ts.beatIsBar (1));
    BOOST_CHECK (! ts.beatIsBar (3));
    BOOST_CHECK (! ts.beatIsBar (5));
}

BOOST_AUTO_TEST_CASE (BeatIsBarIn3_4)
{
    TimeScale ts = makeScale();
    ts.setBeatsPerBar (3);
    ts.updateScale();
    BOOST_CHECK (ts.beatIsBar (0));
    BOOST_CHECK (ts.beatIsBar (3));
    BOOST_CHECK (! ts.beatIsBar (1));
    BOOST_CHECK (! ts.beatIsBar (2));
}

// ── Node list: multiple tempo events ─────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AddNodePreservesFirstTempo)
{
    TimeScale ts = makeScale (120.0f);
    BOOST_CHECK_CLOSE (ts.getTempo(), 120.0f, 0.001f);
    // Add a second node at frame 44100 with 140 BPM.
    ts.addNode (44100, 140.0f);
    ts.updateScale();
    // First node tempo unchanged.
    BOOST_CHECK_CLOSE (ts.getTempo(), 120.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (AddNodeSanity)
{
    TimeScale ts = makeScale (120.0f);
    auto* n = ts.addNode (44100, 140.0f);
    BOOST_CHECK (n != nullptr);
    BOOST_CHECK_EQUAL (n->frame, 44100u);
    BOOST_CHECK_CLOSE (n->tempo, 140.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (RemoveNodeNoCrash)
{
    TimeScale ts = makeScale (120.0f);
    auto* n = ts.addNode (44100, 140.0f);
    ts.updateScale();
    BOOST_CHECK_NO_THROW (ts.removeNode (n));
    ts.updateScale();
    BOOST_CHECK_CLOSE (ts.getTempo(), 120.0f, 0.001f);
}

// ── Markers ───────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AddMarkerReturnsNonNull)
{
    TimeScale ts = makeScale();
    auto* m = ts.addMarker (44100, "Intro", "#FF0000");
    BOOST_CHECK (m != nullptr);
    BOOST_CHECK_EQUAL (m->frame, 44100u);
    BOOST_CHECK_EQUAL (m->text, "Intro");
    BOOST_CHECK_EQUAL (m->color, "#FF0000");
}

BOOST_AUTO_TEST_CASE (RemoveMarkerNoCrash)
{
    TimeScale ts = makeScale();
    auto* m = ts.addMarker (22050, "Bridge");
    BOOST_CHECK_NO_THROW (ts.removeMarker (m));
}

BOOST_AUTO_TEST_CASE (MarkerCursorFirstLast)
{
    TimeScale ts = makeScale();
    ts.addMarker (0,     "Start");
    ts.addMarker (44100, "Verse");
    ts.addMarker (88200, "Chorus");
    auto* first = ts.markers().first();
    auto* last  = ts.markers().last();
    BOOST_CHECK (first != nullptr);
    BOOST_CHECK (last  != nullptr);
    BOOST_CHECK_EQUAL (first->text, "Start");
    BOOST_CHECK_EQUAL (last->text,  "Chorus");
}

// ── Pixel rate (display) ──────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SetPixelsPerBeat)
{
    TimeScale ts = makeScale();
    ts.setPixelsPerBeat (64);
    BOOST_CHECK_EQUAL (ts.pixelsPerBeat(), 64);
}

// ── Static helpers ────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (UroundfPositive)
{
    BOOST_CHECK_EQUAL (TimeScale::uroundf (1.4f), 1u);
    BOOST_CHECK_EQUAL (TimeScale::uroundf (1.5f), 2u);
    BOOST_CHECK_EQUAL (TimeScale::uroundf (2.9f), 3u);
}

BOOST_AUTO_TEST_CASE (RoundfPositive)
{
    BOOST_CHECK_EQUAL (TimeScale::roundf (1.4f), 1);
    BOOST_CHECK_EQUAL (TimeScale::roundf (1.5f), 2);
}

BOOST_AUTO_TEST_CASE (SnapIndexRoundTrip)
{
    for (int idx = 0; idx < 8; ++idx)
    {
        unsigned short snap = TimeScale::snapFromIndex (idx);
        int back = TimeScale::indexFromSnap (snap);
        BOOST_CHECK_EQUAL (back, idx);
    }
}

// ── Reset / clear ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ResetNoCrash)
{
    TimeScale ts = makeScale();
    BOOST_CHECK_NO_THROW (ts.reset());
}

BOOST_AUTO_TEST_CASE (ClearNoCrash)
{
    TimeScale ts = makeScale();
    BOOST_CHECK_NO_THROW (ts.clear());
}

BOOST_AUTO_TEST_CASE (SyncNoCrash)
{
    TimeScale src = makeScale (120.0f);
    TimeScale dst;
    BOOST_CHECK_NO_THROW (dst.sync (src));
    BOOST_CHECK_CLOSE (dst.getTempo(), 120.0f, 0.001f);
}

BOOST_AUTO_TEST_SUITE_END()
