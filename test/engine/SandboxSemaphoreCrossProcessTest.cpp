// SPDX-License-Identifier: GPL-3.0-or-later
//
// Cross-process semaphore signalling test (Phase D D-2).
//
// Verifies that a named POSIX semaphore (sem_open) created in one process
// signals a child process that has opened the same name. The previous
// SandboxSemaphore implementation used Mach task_self() / sem_init(pshared=0) /
// anonymous Win32 events — all process-local — and "passed" the existing
// SandboxSemaphoreTests by virtue of those tests running entirely in one
// process. This test forks a real child via juce::ChildProcess and proves
// the kernel object is shared across the process boundary.

#include <boost/test/unit_test.hpp>

#include <element/juce.hpp>

#include "engine/sandboxsemaphore.hpp"

#include <chrono>
#include <thread>

namespace element {

BOOST_AUTO_TEST_SUITE (SandboxSemaphoreCrossProcessTests)

BOOST_AUTO_TEST_CASE (HostPostsTriggerWorkerWakesAndPostsBack)
{
    const auto trigName = SandboxSemaphore::generateName ('t');
    const auto doneName = SandboxSemaphore::generateName ('d');

    SandboxSemaphore trig;
    SandboxSemaphore done;
    BOOST_REQUIRE (trig.open (trigName, SandboxSemaphore::Mode::Owner));
    BOOST_REQUIRE (done.open (doneName, SandboxSemaphore::Mode::Owner));

    const auto exePath = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
    juce::ChildProcess child;
    BOOST_REQUIRE (child.start (juce::StringArray {
        exePath.getFullPathName(),
        "--d2-sem-test",
        juce::String (trigName),
        juce::String (doneName)
    }));

    // The child opens both semaphores as Attacher, then sem_wait()s on trig.
    // Give it a moment to reach the wait before we post — this avoids a
    // false negative where the child hasn't opened yet.
    std::this_thread::sleep_for (std::chrono::milliseconds (50));

    trig.post();

    // Child should observe the trigger, post done, then exit 0.
    BOOST_CHECK (done.timedWait (2000000)); // 2 s budget
    BOOST_REQUIRE (child.waitForProcessToFinish (3000));
    BOOST_CHECK_EQUAL (child.getExitCode(), 0);
}

BOOST_AUTO_TEST_CASE (HostTimeoutWhenChildNeverPosts)
{
    // Owner posts NO trigger. Child opens trig as Attacher, waits 100 ms,
    // times out, exits 13. Host's timedWait on done also times out.
    const auto trigName = SandboxSemaphore::generateName ('t');
    const auto doneName = SandboxSemaphore::generateName ('d');

    SandboxSemaphore trig;
    SandboxSemaphore done;
    BOOST_REQUIRE (trig.open (trigName, SandboxSemaphore::Mode::Owner));
    BOOST_REQUIRE (done.open (doneName, SandboxSemaphore::Mode::Owner));

    const auto exePath = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
    juce::ChildProcess child;
    BOOST_REQUIRE (child.start (juce::StringArray {
        exePath.getFullPathName(),
        "--d2-sem-test",
        juce::String (trigName),
        juce::String (doneName)
    }));

    auto start = std::chrono::steady_clock::now();
    bool gotDone = done.timedWait (50000); // 50 ms budget — child waits 100 ms before timing out
    auto elapsed = std::chrono::steady_clock::now() - start;

    BOOST_CHECK (! gotDone);
    BOOST_CHECK (elapsed >= std::chrono::microseconds (40000));

    // Child eventually exits with code 13 (its trig.timedWait returned false).
    BOOST_REQUIRE (child.waitForProcessToFinish (3000));
    BOOST_CHECK_EQUAL (child.getExitCode(), 13);
}

BOOST_AUTO_TEST_SUITE_END()

} // namespace element
