// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for WebMeteringFifo — SPSC lock-free metering queue.
// Gap: brand-new class (2026), zero prior coverage.

#include <boost/test/unit_test.hpp>
#include <element/web_metering_fifo.hpp>

using namespace element;

BOOST_AUTO_TEST_SUITE (WebMeteringFifoTests)

// ── Empty pop ────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PopOnEmptyFifoReturnsNullopt)
{
    WebMeteringFifo fifo;
    auto result = fifo.popLatestPeak();
    BOOST_CHECK (! result.has_value());
}

// ── Single push/pop ──────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PushThenPopReturnsPushedValue)
{
    WebMeteringFifo fifo;
    fifo.pushPacket (0.5f);
    auto result = fifo.popLatestPeak();
    BOOST_REQUIRE (result.has_value());
    BOOST_CHECK_CLOSE (*result, 0.5f, 1e-5f);
}

// ── Pop returns LATEST when multiple packets queued ──────────────────────────

BOOST_AUTO_TEST_CASE (PopReturnsLatestOfMultiplePushes)
{
    WebMeteringFifo fifo;
    fifo.pushPacket (0.1f);
    fifo.pushPacket (0.2f);
    fifo.pushPacket (0.9f); // latest
    auto result = fifo.popLatestPeak();
    BOOST_REQUIRE (result.has_value());
    BOOST_CHECK_CLOSE (*result, 0.9f, 1e-5f);
}

// ── Second pop after drain returns nullopt ───────────────────────────────────

BOOST_AUTO_TEST_CASE (SecondPopAfterDrainReturnsNullopt)
{
    WebMeteringFifo fifo;
    fifo.pushPacket (0.7f);
    fifo.popLatestPeak(); // drain
    auto second = fifo.popLatestPeak();
    BOOST_CHECK (! second.has_value());
}

// ── Zero peak round-trips cleanly ────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ZeroPeakRoundTrip)
{
    WebMeteringFifo fifo;
    fifo.pushPacket (0.0f);
    auto result = fifo.popLatestPeak();
    BOOST_REQUIRE (result.has_value());
    BOOST_CHECK_CLOSE (*result, 0.0f, 1e-5f);
}

// ── Negative peak (headroom representation) ──────────────────────────────────

BOOST_AUTO_TEST_CASE (NegativePeakRoundTrip)
{
    WebMeteringFifo fifo;
    fifo.pushPacket (-6.0f);
    auto result = fifo.popLatestPeak();
    BOOST_REQUIRE (result.has_value());
    BOOST_CHECK_CLOSE (*result, -6.0f, 1e-4f);
}

// ── Fill beyond capacity — overflow doesn't crash ────────────────────────────

BOOST_AUTO_TEST_CASE (OverflowDoesNotCrash)
{
    WebMeteringFifo fifo;
    // Capacity is 64 internally; push 128 without reading
    for (int i = 0; i < 128; ++i)
        fifo.pushPacket (static_cast<float> (i) / 128.f);
    // Should still return some value without crashing
    auto result = fifo.popLatestPeak();
    // Either has_value or not — both are valid; we just must not crash.
    (void) result;
    BOOST_CHECK (true);
}

// ── Interleaved push/pop sequence ────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (InterleavedPushPopSequence)
{
    WebMeteringFifo fifo;
    for (int i = 0; i < 8; ++i)
    {
        fifo.pushPacket (float (i));
        auto v = fifo.popLatestPeak();
        BOOST_REQUIRE (v.has_value());
        BOOST_CHECK_CLOSE (*v, float (i), 1e-5f);
    }
}

BOOST_AUTO_TEST_SUITE_END()
