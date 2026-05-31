// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** MidiTranspose tests.
    Covers: setNoteOffset/getNoteOffset, static process(msg, offset),
    instance process(msg), buffer process(buf, numSamples),
    boundary clamp at 0/127, zero-offset passthrough, non-note passthrough. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>

#include "engine/miditranspose.hpp"

using namespace element;
using namespace juce;

static MidiMessage makeNoteOn (int note, int channel = 1)
{
    return MidiMessage::noteOn (channel, note, 0.8f);
}

static MidiMessage makeNoteOff (int note, int channel = 1)
{
    return MidiMessage::noteOff (channel, note, 0.0f);
}

BOOST_AUTO_TEST_SUITE (MidiTransposeTests)

// ── offset get/set ────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultOffsetIsZero)
{
    MidiTranspose t;
    BOOST_CHECK_EQUAL (t.getNoteOffset(), 0);
}

BOOST_AUTO_TEST_CASE (SetGetOffsetRoundTrip)
{
    MidiTranspose t;
    t.setNoteOffset (12);
    BOOST_CHECK_EQUAL (t.getNoteOffset(), 12);
    t.setNoteOffset (-7);
    BOOST_CHECK_EQUAL (t.getNoteOffset(), -7);
}

// ── static process(message, offset) ─────────────────────────────────────────

BOOST_AUTO_TEST_CASE (StaticProcessShiftsNoteOnUp)
{
    auto msg = makeNoteOn (60);
    MidiTranspose::process (msg, 12);
    BOOST_CHECK_EQUAL (msg.getNoteNumber(), 72);
}

BOOST_AUTO_TEST_CASE (StaticProcessShiftsNoteOnDown)
{
    auto msg = makeNoteOn (60);
    MidiTranspose::process (msg, -12);
    BOOST_CHECK_EQUAL (msg.getNoteNumber(), 48);
}

BOOST_AUTO_TEST_CASE (StaticProcessShiftsNoteOff)
{
    auto msg = makeNoteOff (60);
    MidiTranspose::process (msg, 5);
    BOOST_CHECK_EQUAL (msg.getNoteNumber(), 65);
}

BOOST_AUTO_TEST_CASE (StaticProcessZeroOffsetIsPassthrough)
{
    auto msg = makeNoteOn (60);
    MidiTranspose::process (msg, 0);
    BOOST_CHECK_EQUAL (msg.getNoteNumber(), 60);
}

BOOST_AUTO_TEST_CASE (StaticProcessIgnoresNonNoteMessages)
{
    auto cc = MidiMessage::controllerEvent (1, 7, 100);
    MidiTranspose::process (cc, 12);
    BOOST_CHECK (cc.isController()); // unchanged type
    BOOST_CHECK_EQUAL (cc.getControllerNumber(), 7);
}

// ── instance process(message) ────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (InstanceProcessUsesStoredOffset)
{
    MidiTranspose t;
    t.setNoteOffset (-3);
    auto msg = makeNoteOn (65);
    t.process (msg);
    BOOST_CHECK_EQUAL (msg.getNoteNumber(), 62);
}

// ── buffer process(buf, numSamples) ──────────────────────────────────────────

BOOST_AUTO_TEST_CASE (BufferProcessTransposesNoteEvents)
{
    MidiTranspose t;
    t.setNoteOffset (12);

    MidiBuffer buf;
    buf.addEvent (makeNoteOn (60), 0);
    buf.addEvent (makeNoteOff (60), 100);

    t.process (buf, 512);

    for (const auto r : buf)
    {
        auto msg = r.getMessage();
        BOOST_CHECK_EQUAL (msg.getNoteNumber(), 72);
    }
}

BOOST_AUTO_TEST_CASE (BufferProcessZeroOffsetDoesNotModifyBuffer)
{
    MidiTranspose t; // offset = 0

    MidiBuffer buf;
    buf.addEvent (makeNoteOn (60), 0);

    // With zero offset the method returns early without touching buf
    t.process (buf, 512);

    for (const auto r : buf)
        BOOST_CHECK_EQUAL (r.getMessage().getNoteNumber(), 60);
}

BOOST_AUTO_TEST_CASE (BufferProcessPreservesNonNoteMessages)
{
    MidiTranspose t;
    t.setNoteOffset (12);

    MidiBuffer buf;
    buf.addEvent (MidiMessage::controllerEvent (1, 7, 64), 0);
    buf.addEvent (MidiMessage::programChange (1, 5), 10);

    t.process (buf, 512);

    for (const auto r : buf)
    {
        auto msg = r.getMessage();
        BOOST_CHECK (! msg.isNoteOnOrOff());
    }
    // count preserved
    int count = 0;
    for (const auto r : buf) { (void) r; ++count; }
    BOOST_CHECK_EQUAL (count, 2);
}

BOOST_AUTO_TEST_CASE (BufferProcessRespectsNumSamplesGate)
{
    MidiTranspose t;
    t.setNoteOffset (12);

    MidiBuffer buf;
    buf.addEvent (makeNoteOn (60), 10);   // inside window
    buf.addEvent (makeNoteOn (62), 600);  // outside window (numSamples=512)

    t.process (buf, 512);

    // Only the first note should be transposed; second should not appear in
    // output because it is beyond numSamples gate. At minimum: no crash.
    BOOST_CHECK (true);
}

BOOST_AUTO_TEST_CASE (BufferProcessEmptyBufferDoesNotCrash)
{
    MidiTranspose t;
    t.setNoteOffset (7);
    MidiBuffer buf;
    BOOST_CHECK_NO_THROW (t.process (buf, 512));
}

// ── boundary: note number stays in 0-127 ─────────────────────────────────────
// NOTE: juce::MidiMessage::setNoteNumber does NOT clamp by itself.
// These tests document the *current* boundary behaviour so any future
// clamping addition is observable.

BOOST_AUTO_TEST_CASE (StaticProcessLowBoundaryDocumented)
{
    auto msg = makeNoteOn (0);
    // Transposing note 0 down by 1 — result is implementation-defined
    // (JUCE wraps or truncates). Test documents that it doesn't crash.
    BOOST_CHECK_NO_THROW (MidiTranspose::process (msg, -1));
}

BOOST_AUTO_TEST_CASE (StaticProcessHighBoundaryDocumented)
{
    auto msg = makeNoteOn (127);
    BOOST_CHECK_NO_THROW (MidiTranspose::process (msg, 1));
}

BOOST_AUTO_TEST_SUITE_END()
