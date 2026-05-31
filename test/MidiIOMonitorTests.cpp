// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for MidiIOMonitor — atomic MIDI activity counter + signal emitter.
// Gap: used by audio engine for UI meter updates; zero prior coverage.

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/midiiomonitor.hpp>

using namespace element;

BOOST_AUTO_TEST_SUITE (MidiIOMonitorTests)

// ── Clear on construction (via clear()) ──────────────────────────────────────

BOOST_AUTO_TEST_CASE (ClearResetsCounters)
{
    MidiIOMonitor monitor;
    monitor.received();
    monitor.sent();
    monitor.clear();
    // After clear, notify should NOT fire signals
    int rxCount = 0, txCount = 0;
    monitor.sigReceived.connect ([&] { ++rxCount; });
    monitor.sigSent.connect     ([&] { ++txCount; });
    monitor.notify();
    BOOST_CHECK_EQUAL (rxCount, 0);
    BOOST_CHECK_EQUAL (txCount, 0);
}

// ── received() increments + notify fires sigReceived ─────────────────────────

BOOST_AUTO_TEST_CASE (ReceivedCountedAndSignalFiredOnNotify)
{
    MidiIOMonitor monitor;
    int fired = 0;
    monitor.sigReceived.connect ([&] { ++fired; });

    monitor.received();
    monitor.notify();

    BOOST_CHECK_EQUAL (fired, 1);
}

// ── sent() increments + notify fires sigSent ─────────────────────────────────

BOOST_AUTO_TEST_CASE (SentCountedAndSignalFiredOnNotify)
{
    MidiIOMonitor monitor;
    int fired = 0;
    monitor.sigSent.connect ([&] { ++fired; });

    monitor.sent();
    monitor.notify();

    BOOST_CHECK_EQUAL (fired, 1);
}

// ── notify() clears after firing so second notify is silent ──────────────────

BOOST_AUTO_TEST_CASE (NotifyAutoClears)
{
    MidiIOMonitor monitor;
    int rxFired = 0;
    monitor.sigReceived.connect ([&] { ++rxFired; });

    monitor.received();
    monitor.notify(); // fires + clears
    monitor.notify(); // should not fire again

    BOOST_CHECK_EQUAL (rxFired, 1);
}

// ── Multiple received() calls still result in one notify ─────────────────────

BOOST_AUTO_TEST_CASE (MultipleReceivedBeforeNotifyFiresOnce)
{
    MidiIOMonitor monitor;
    int fired = 0;
    monitor.sigReceived.connect ([&] { ++fired; });

    monitor.received();
    monitor.received();
    monitor.received();
    monitor.notify();

    BOOST_CHECK_EQUAL (fired, 1); // one signal per notify() call
}

// ── No signals when neither received nor sent ────────────────────────────────

BOOST_AUTO_TEST_CASE (NotifyWithNoActivityIsQuiet)
{
    MidiIOMonitor monitor;
    int rxFired = 0, txFired = 0;
    monitor.sigReceived.connect ([&] { ++rxFired; });
    monitor.sigSent.connect     ([&] { ++txFired; });

    monitor.notify();

    BOOST_CHECK_EQUAL (rxFired, 0);
    BOOST_CHECK_EQUAL (txFired, 0);
}

// ── Both channels independent ─────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (RxAndTxFireIndependently)
{
    MidiIOMonitor monitor;
    int rxFired = 0, txFired = 0;
    monitor.sigReceived.connect ([&] { ++rxFired; });
    monitor.sigSent.connect     ([&] { ++txFired; });

    monitor.received(); // only rx
    monitor.notify();

    BOOST_CHECK_EQUAL (rxFired, 1);
    BOOST_CHECK_EQUAL (txFired, 0);

    monitor.sent();    // only tx
    monitor.notify();

    BOOST_CHECK_EQUAL (rxFired, 1);
    BOOST_CHECK_EQUAL (txFired, 1);
}

// ── Reference-counted pointer stays alive ────────────────────────────────────

BOOST_AUTO_TEST_CASE (RefCountedPtrStaysAlive)
{
    MidiIOMonitorPtr ptr = new MidiIOMonitor();
    BOOST_REQUIRE (ptr != nullptr);
    ptr->received();
    // ptr goes out of scope — destructor must run cleanly
}

BOOST_AUTO_TEST_SUITE_END()
