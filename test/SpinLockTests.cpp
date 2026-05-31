// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** SpinLock tests.
    Covers: default state, lock/unlock, tryLock, locked() predicate,
    and basic two-thread mutual exclusion.
    Priority: realtime-safety — SpinLock used in audio-thread paths. */

#include <boost/test/unit_test.hpp>
#include <atomic>
#include <thread>
#include <chrono>

#include <element/spinlock.hpp>

using namespace element;

BOOST_AUTO_TEST_SUITE (SpinLockTests)

// ── Initial state ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (UnlockedOnConstruction)
{
    SpinLock sl;
    BOOST_CHECK (! sl.locked());
}

// ── lock / unlock ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (LockSetsLockedFlag)
{
    SpinLock sl;
    sl.lock();
    BOOST_CHECK (sl.locked());
    sl.unlock();
}

BOOST_AUTO_TEST_CASE (UnlockClearsLockedFlag)
{
    SpinLock sl;
    sl.lock();
    sl.unlock();
    BOOST_CHECK (! sl.locked());
}

BOOST_AUTO_TEST_CASE (LockUnlockRoundTrip)
{
    SpinLock sl;
    for (int i = 0; i < 100; ++i)
    {
        sl.lock();
        BOOST_CHECK (sl.locked());
        sl.unlock();
        BOOST_CHECK (! sl.locked());
    }
}

// ── tryLock ───────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (TryLockSucceedsWhenFree)
{
    SpinLock sl;
    bool acquired = sl.tryLock();
    BOOST_CHECK (acquired);
    if (acquired) sl.unlock();
}

BOOST_AUTO_TEST_CASE (TryLockFailsWhenHeld)
{
    SpinLock sl;
    sl.lock(); // hold the lock
    bool second = sl.tryLock(); // must fail immediately
    BOOST_CHECK (! second);
    sl.unlock();
}

BOOST_AUTO_TEST_CASE (TryLockSucceedsAfterUnlock)
{
    SpinLock sl;
    sl.lock();
    sl.unlock();
    bool acquired = sl.tryLock();
    BOOST_CHECK (acquired);
    if (acquired) sl.unlock();
}

// ── RAII pattern compatibility ─────────────────────────────────────────────────
// SpinLock matches the BasicLockable concept used by std::lock_guard.

BOOST_AUTO_TEST_CASE (CompatibleWithStdLockGuard)
{
    SpinLock sl;
    {
        std::lock_guard<SpinLock> guard (sl);
        BOOST_CHECK (sl.locked());
    }
    BOOST_CHECK (! sl.locked());
}

// ── Two-thread mutual exclusion ──────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (MutualExclusionBetweenThreads)
{
    SpinLock sl;
    std::atomic<int> counter { 0 };
    std::atomic<bool> overlap { false };
    std::atomic<bool> inside { false };

    constexpr int kIterations = 1000;

    auto worker = [&]() {
        for (int i = 0; i < kIterations; ++i)
        {
            sl.lock();
            // If two threads are inside simultaneously, 'inside' will be true
            // when the second thread arrives.
            if (inside.exchange (true))
                overlap = true;
            ++counter;
            inside = false;
            sl.unlock();
        }
    };

    std::thread t1 (worker);
    std::thread t2 (worker);
    t1.join();
    t2.join();

    BOOST_CHECK_EQUAL (counter.load(), kIterations * 2);
    BOOST_CHECK (! overlap.load()); // no concurrent access detected
}

BOOST_AUTO_TEST_SUITE_END()
