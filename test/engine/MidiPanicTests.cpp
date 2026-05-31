// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** MidiPanic tests.
    Covers: write(ch), write(all), messages(ch), messages(), processCC.
    Priority: SAFETY-CRITICAL — all-notes-off path used in live performance. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>

#include "engine/midipanic.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (MidiPanicTests)

// ── write(buffer, ch, frame) ──────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (WriteSingleChannelAddsExactlyTwoEvents)
{
    MidiBuffer buf;
    MidiPanic::write (buf, 1, 0);

    int count = 0;
    for (const auto r : buf)
    {
        auto msg = r.getMessage();
        BOOST_CHECK (msg.isAllNotesOff() || msg.isAllSoundOff());
        ++count;
    }
    BOOST_CHECK_EQUAL (count, 2);
}

BOOST_AUTO_TEST_CASE (WriteSingleChannelEventsAtCorrectFrame)
{
    MidiBuffer buf;
    const int frame = 42;
    MidiPanic::write (buf, 1, frame);

    for (const auto r : buf)
        BOOST_CHECK_EQUAL (r.samplePosition, frame);
}

BOOST_AUTO_TEST_CASE (WriteSingleChannelHasCorrectChannel)
{
    MidiBuffer buf;
    MidiPanic::write (buf, 5, 0);

    for (const auto r : buf)
        BOOST_CHECK_EQUAL (r.getMessage().getChannel(), 5);
}

// ── write(buffer, frame) — all 16 channels ────────────────────────────────────

BOOST_AUTO_TEST_CASE (WriteAllChannelsAddsThirtyTwoEvents)
{
    MidiBuffer buf;
    MidiPanic::write (buf, 0); // frame = 0

    int count = 0;
    for (const auto& r : buf)
    {
        auto msg = r.getMessage();
        BOOST_CHECK (msg.isAllNotesOff() || msg.isAllSoundOff());
        (void) r;
        ++count;
    }
    BOOST_CHECK_EQUAL (count, 32); // 2 messages × 16 channels
}

BOOST_AUTO_TEST_CASE (WriteAllChannelsAppendsToExistingBuffer)
{
    MidiBuffer buf;
    buf.addEvent (MidiMessage::noteOn (1, 60, 0.5f), 0);

    MidiPanic::write (buf, 0);

    int total = 0;
    for (const auto& r : buf) { (void) r; ++total; }
    BOOST_CHECK_EQUAL (total, 33); // 1 existing + 32 panic
}

// ── messages(ch) ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (MessagesForChannelReturnsTwoMessages)
{
    auto msgs = MidiPanic::messages (3);
    BOOST_CHECK_EQUAL (msgs.size(), 2u);
    BOOST_CHECK (msgs[0].isAllNotesOff());
    BOOST_CHECK (msgs[1].isAllSoundOff());
}

BOOST_AUTO_TEST_CASE (MessagesForChannelHaveNonZeroTimestamp)
{
    auto msgs = MidiPanic::messages (1);
    for (const auto& m : msgs)
        BOOST_CHECK_GT (m.getTimeStamp(), 0.0);
}

BOOST_AUTO_TEST_CASE (MessagesAllChannelsReturnsThirtyTwo)
{
    auto msgs = MidiPanic::messages();
    BOOST_CHECK_EQUAL (msgs.size(), 32u);
}

// ── processCC ────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ProcessCCRejectsNegativeCcNumber)
{
    MidiBuffer in, out;
    BOOST_CHECK (! MidiPanic::processCC (in, out, -1, 0));
}

BOOST_AUTO_TEST_CASE (ProcessCCRejectsCcNumberAbove127)
{
    MidiBuffer in, out;
    BOOST_CHECK (! MidiPanic::processCC (in, out, 128, 0));
}

BOOST_AUTO_TEST_CASE (ProcessCCReturnsFalseOnEmptyBuffer)
{
    MidiBuffer in, out;
    BOOST_CHECK (! MidiPanic::processCC (in, out, 64, 0));
}

BOOST_AUTO_TEST_CASE (ProcessCCDetectsTriggerCCAndReplaceWithPanic)
{
    MidiBuffer in, out;
    in.addEvent (MidiMessage::controllerEvent (1, 64, 127), 0);

    bool processed = MidiPanic::processCC (in, out, 64, 0); // channel 0 = omni
    BOOST_CHECK (processed);

    // out should contain panic messages (allNotesOff + allSoundOff × 16 channels)
    // NOT the original CC
    bool foundCC = false;
    bool foundPanic = false;
    for (const auto r : out)
    {
        auto msg = r.getMessage();
        if (msg.isController() && msg.getControllerNumber() == 64)
            foundCC = true;
        if (msg.isAllNotesOff() || msg.isAllSoundOff())
            foundPanic = true;
    }
    BOOST_CHECK (! foundCC);
    BOOST_CHECK (foundPanic);
}

BOOST_AUTO_TEST_CASE (ProcessCCChannelFilterIgnoresOtherChannels)
{
    MidiBuffer in, out;
    // CC 64 on channel 2 — listening on channel 1 only
    in.addEvent (MidiMessage::controllerEvent (2, 64, 127), 0);

    bool processed = MidiPanic::processCC (in, out, 64, 1);
    BOOST_CHECK (! processed);

    // Original CC should pass through unchanged
    int count = 0;
    for (const auto r : out)
    {
        (void) r;
        ++count;
    }
    BOOST_CHECK_EQUAL (count, 1);
}

BOOST_AUTO_TEST_CASE (ProcessCCOmniChannelMatchesAny)
{
    MidiBuffer in, out;
    in.addEvent (MidiMessage::controllerEvent (7, 64, 127), 0); // any channel

    bool processed = MidiPanic::processCC (in, out, 64, 0); // omni
    BOOST_CHECK (processed);
}

BOOST_AUTO_TEST_CASE (ProcessCCNonMatchingMessagesPassThrough)
{
    MidiBuffer in, out;
    in.addEvent (MidiMessage::noteOn (1, 60, 0.5f), 0);
    in.addEvent (MidiMessage::controllerEvent (1, 7, 100), 0); // different CC

    MidiPanic::processCC (in, out, 64, 0); // looking for CC64, not present

    int count = 0;
    for (const auto r : out) { (void) r; ++count; }
    BOOST_CHECK_EQUAL (count, 2); // both pass through
}

BOOST_AUTO_TEST_CASE (ProcessCCFiresOnlyOnceForMultipleTriggers)
{
    MidiBuffer in, out;
    // Two panic-CC events in same buffer — should write panic only once
    in.addEvent (MidiMessage::controllerEvent (1, 64, 127), 0);
    in.addEvent (MidiMessage::controllerEvent (1, 64, 127), 1);

    bool processed = MidiPanic::processCC (in, out, 64, 0);
    BOOST_CHECK (processed);

    int panicCount = 0;
    for (const auto r : out)
    {
        auto msg = r.getMessage();
        if (msg.isAllNotesOff()) ++panicCount;
    }
    // Only one set of 16 allNotesOff messages
    BOOST_CHECK_EQUAL (panicCount, 16);
}

BOOST_AUTO_TEST_SUITE_END()
