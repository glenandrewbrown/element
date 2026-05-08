// SPDX-License-Identifier: GPL-3.0-or-later
//
// Phase D D-5: waitForResponse unblocks on connection loss.
//
// Without this guarantee, a kill -9 of the worker (or any other
// connection-breaking event) while the host is mid-waitForResponse
// blocks the calling thread for the full timeout. The host UI
// freezes for seconds; restart logic cannot kick in until the
// timeout elapses; downstream calls that rely on getPluginState /
// other request-response flows stall.
//
// The fix: SandboxHost::handleConnectionLost flips
// connectionAlive = false and notifies the response condvar before
// firing the listener / attemptRestart. waitForResponse polls the
// flag in its predicate loop and returns false immediately on
// disconnect, even if its own timeout has not yet expired.

#include <boost/test/unit_test.hpp>

#include <atomic>
#include <chrono>
#include <thread>

#include <element/context.hpp>
#include <element/plugins.hpp>
#include <element/services.hpp>

#include "engine/sandboxhost.hpp"
#include "engine/sandboxipc.hpp"

namespace element {
namespace test {
extern Context* context();
} // namespace test
} // namespace element

using namespace element;

namespace {

class TestableSandboxHost : public SandboxHost
{
public:
    using SandboxHost::SandboxHost;
    using SandboxHost::waitForResponse;
    using SandboxHost::handleConnectionLost;
};

} // namespace

BOOST_AUTO_TEST_SUITE (SandboxWaitForResponseTests)

BOOST_AUTO_TEST_CASE (WaitForResponseUnblocksOnConnectionLoss)
{
    auto* ctx = element::test::context();
    BOOST_REQUIRE (ctx != nullptr);

    TestableSandboxHost host (ctx->plugins());
    BOOST_REQUIRE (host.launch());
    host.shutdown();

    std::atomic<int> waitDurationMs { -1 };
    std::atomic<bool> waitResult { true };

    std::thread waitThread ([&] {
        const auto start = std::chrono::steady_clock::now();
        const bool ok = host.waitForResponse (SandboxMessageType::StateData, 5000);
        const auto end = std::chrono::steady_clock::now();
        waitDurationMs.store (static_cast<int> (
            std::chrono::duration_cast<std::chrono::milliseconds> (end - start).count()));
        waitResult.store (ok);
    });

    std::this_thread::sleep_for (std::chrono::milliseconds (100));

    host.handleConnectionLost();

    waitThread.join();

    BOOST_CHECK_EQUAL (waitResult.load(), false);
    BOOST_CHECK_LT (waitDurationMs.load(), 1000);
    BOOST_CHECK_GE (waitDurationMs.load(), 0);

    BOOST_TEST_MESSAGE ("D-5 waitForResponse unblock latency: "
                        << waitDurationMs.load() << " ms (must be < 1000 ms)");
}

BOOST_AUTO_TEST_CASE (WaitForResponseHonoursExplicitTimeout)
{
    auto* ctx = element::test::context();
    BOOST_REQUIRE (ctx != nullptr);

    TestableSandboxHost host (ctx->plugins());
    BOOST_REQUIRE (host.launch());

    std::this_thread::sleep_for (std::chrono::milliseconds (100));

    const auto start = std::chrono::steady_clock::now();
    const bool ok = host.waitForResponse (SandboxMessageType::StateData, 250);
    const auto end = std::chrono::steady_clock::now();

    const int durationMs = static_cast<int> (
        std::chrono::duration_cast<std::chrono::milliseconds> (end - start).count());

    BOOST_CHECK_EQUAL (ok, false);
    BOOST_CHECK_GE (durationMs, 200);
    BOOST_CHECK_LT (durationMs, 600);

    host.shutdown();
}

BOOST_AUTO_TEST_SUITE_END()
