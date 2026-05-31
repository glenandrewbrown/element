// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for MidiPipe — array of MidiBuffers used in graph rendering.
// Gap: used on every audio-processing frame; had zero dedicated tests.

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/midipipe.hpp>

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (MidiPipeTests)

// ── Default construction ──────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultConstructHasZeroBuffers)
{
    MidiPipe pipe;
    BOOST_CHECK_EQUAL (pipe.getNumBuffers(), 0);
}

BOOST_AUTO_TEST_CASE (DefaultConstructGetReadBufferReturnsNull)
{
    // Accessing out-of-range is guarded by jassert; just verify it's 0-sized.
    MidiPipe pipe;
    BOOST_CHECK_EQUAL (pipe.getNumBuffers(), 0);
}

// ── Single-buffer constructor ─────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SingleBufferCtorWrapsOneBuffer)
{
    MidiBuffer buf;
    buf.addEvent (MidiMessage::noteOn (1, 60, (uint8) 100), 0);
    MidiPipe pipe (buf);
    BOOST_CHECK_EQUAL (pipe.getNumBuffers(), 1);
    BOOST_CHECK_EQUAL (pipe.getReadBuffer (0), &buf);
    BOOST_CHECK_EQUAL (pipe.getWriteBuffer (0), &buf);
}

// ── Multi-buffer constructor ──────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (MultiBufferCtorSetsCount)
{
    MidiBuffer a, b, c;
    MidiBuffer* ptrs[3] = { &a, &b, &c };
    MidiPipe pipe (ptrs, 3);
    BOOST_CHECK_EQUAL (pipe.getNumBuffers(), 3);
    BOOST_CHECK_EQUAL (pipe.getReadBuffer (0), &a);
    BOOST_CHECK_EQUAL (pipe.getReadBuffer (1), &b);
    BOOST_CHECK_EQUAL (pipe.getReadBuffer (2), &c);
}

// ── OwnedArray + channels constructor ────────────────────────────────────────

BOOST_AUTO_TEST_CASE (OwnedArrayCtorWithChannelSelection)
{
    OwnedArray<MidiBuffer> owned;
    owned.add (new MidiBuffer()); // index 0
    owned.add (new MidiBuffer()); // index 1
    owned.add (new MidiBuffer()); // index 2

    Array<int> channels;
    channels.add (0);
    channels.add (2); // pick only 0 and 2

    MidiPipe pipe (owned, channels);
    BOOST_CHECK_EQUAL (pipe.getNumBuffers(), 2);
    BOOST_CHECK_EQUAL (pipe.getReadBuffer (0), owned[0]);
    BOOST_CHECK_EQUAL (pipe.getReadBuffer (1), owned[2]);
}

// ── clear() clears all referenced buffers ────────────────────────────────────

BOOST_AUTO_TEST_CASE (ClearEmptiesAllBuffers)
{
    MidiBuffer a, b;
    a.addEvent (MidiMessage::noteOn (1, 60, (uint8) 100), 0);
    b.addEvent (MidiMessage::noteOn (1, 64, (uint8) 100), 0);
    MidiBuffer* ptrs[2] = { &a, &b };
    MidiPipe pipe (ptrs, 2);

    pipe.clear();
    BOOST_CHECK (a.isEmpty());
    BOOST_CHECK (b.isEmpty());
}

BOOST_AUTO_TEST_CASE (ClearWithRangeOnlyClearsThatRange)
{
    MidiBuffer a;
    a.addEvent (MidiMessage::noteOn (1, 60, (uint8) 100), 0);
    a.addEvent (MidiMessage::noteOn (1, 62, (uint8) 100), 512);
    MidiBuffer* ptrs[1] = { &a };
    MidiPipe pipe (ptrs, 1);

    // Clear samples 0..255 only
    pipe.clear (0, 256);
    // The event at sample 512 should remain
    BOOST_CHECK (! a.isEmpty());
}

// ── write buffer is same object as read buffer ───────────────────────────────

BOOST_AUTO_TEST_CASE (WriteBufferSameAsReadBuffer)
{
    MidiBuffer buf;
    MidiPipe pipe (buf);
    BOOST_CHECK_EQUAL (pipe.getReadBuffer (0), pipe.getWriteBuffer (0));
}

BOOST_AUTO_TEST_SUITE_END()
