// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <atomic>
#include <thread>
#include <vector>

// Test the atomic pointer swap pattern in isolation,
// without depending on GraphNode internals.

BOOST_AUTO_TEST_SUITE (AtomicRenderSwapTests)

BOOST_AUTO_TEST_CASE (AtomicPointerSwapIsLockFree)
{
    std::atomic<void*> ptr { nullptr };
    BOOST_CHECK (ptr.is_lock_free());
}

BOOST_AUTO_TEST_CASE (SwapReplacesPointerAtomically)
{
    std::vector<int> seqA = { 1, 2, 3 };
    std::vector<int> seqB = { 4, 5, 6 };

    std::atomic<std::vector<int>*> activeSeq { &seqA };

    std::vector<int>* old = activeSeq.exchange (&seqB, std::memory_order_acq_rel);
    BOOST_CHECK (old == &seqA);
    BOOST_CHECK (activeSeq.load() == &seqB);
}

BOOST_AUTO_TEST_CASE (ReaderSeesConsistentSequence)
{
    struct RenderOps
    {
        int values[4] = { 0, 0, 0, 0 };
    };

    auto opsA = std::make_unique<RenderOps>();
    opsA->values[0] = 1;
    opsA->values[1] = 2;
    opsA->values[2] = 3;
    opsA->values[3] = 4;

    std::atomic<RenderOps*> activeOps { opsA.get() };
    std::atomic<bool> writerDone { false };
    std::atomic<int> readerErrors { 0 };

    std::thread reader ([&] {
        while (! writerDone.load (std::memory_order_acquire))
        {
            const RenderOps* ops = activeOps.load (std::memory_order_acquire);
            if (ops == nullptr)
                continue;

            for (int i = 1; i < 4; ++i)
            {
                int diff = ops->values[i] - ops->values[0];
                if (diff != i)
                    readerErrors.fetch_add (1);
            }
        }
    });

    auto opsB = std::make_unique<RenderOps>();
    opsB->values[0] = 10;
    opsB->values[1] = 11;
    opsB->values[2] = 12;
    opsB->values[3] = 13;

    RenderOps* oldOps = activeOps.exchange (opsB.get(), std::memory_order_acq_rel);
    BOOST_CHECK (oldOps == opsA.get());

    std::this_thread::sleep_for (std::chrono::milliseconds (5));
    writerDone.store (true, std::memory_order_release);

    reader.join();
    BOOST_CHECK_EQUAL (readerErrors.load(), 0);
}

BOOST_AUTO_TEST_SUITE_END()
