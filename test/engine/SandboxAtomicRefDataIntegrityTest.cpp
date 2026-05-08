// SPDX-License-Identifier: GPL-3.0-or-later
//
// Cross-process atomic readback integrity test (Phase D D-1).
//
// Verifies that __atomic_store_n / __atomic_load_n on a SharedAudioBuffer::Header
// field produces a value visible to a separate process attached to the same
// mmap region. Validates the post-D-3 + post-D-1 invariant: cross-process
// atomic access is observable without semaphore signalling (passive memory
// coherence on MAP_SHARED).

#include <boost/test/unit_test.hpp>

#include "engine/sandboxipc.hpp"
#include "engine/sandboxsharedmemory.hpp"

#include <cstdint>

namespace element {

BOOST_AUTO_TEST_SUITE (SandboxAtomicRefDataIntegrityTests)

BOOST_AUTO_TEST_CASE (CrossProcessAtomicWrite_VisibleInChildEcho)
{
    // 1. Allocate cross-process shared memory.
    const int numChannels = 2;
    const int numSamples = 256;
    const size_t total = SharedAudioBuffer::calculateRequiredSize (numChannels, numSamples);

    SandboxSharedMemory shm;
    const auto shmName = SandboxSharedMemory::generateName();
    BOOST_REQUIRE (shm.create (shmName, total));

    // 2. Attach as owner — initialises Header (zeros + magic).
    SharedAudioBuffer parent;
    parent.attachToMemoryAsOwner (
        static_cast<uint8_t*> (shm.getData()),
        total, numChannels, numSamples);

    auto* hdr = parent.getHeader();
    BOOST_REQUIRE (hdr != nullptr);

    // 3. Write a known sentinel via __atomic_store_n.
    constexpr uint32_t kSentinel = 0xDEADBEEFu;
    __atomic_store_n (&hdr->coordinatorSequence, kSentinel, __ATOMIC_RELEASE);

    // 4. Reset workerSequence so we can assert it gets the sentinel back.
    __atomic_store_n (&hdr->workerSequence, 0u, __ATOMIC_RELEASE);

    // 5. Spawn child: re-exec test_element with --d1-readback-test <shmName>.
    const auto exePath = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
    juce::ChildProcess child;
    BOOST_REQUIRE (child.start (juce::StringArray {
        exePath.getFullPathName(),
        "--d1-readback-test",
        juce::String (shmName)
    }));

    // 6. Wait up to 5 s for child exit.
    BOOST_REQUIRE (child.waitForProcessToFinish (5000));
    BOOST_CHECK_EQUAL (child.getExitCode(), 0);

    // 7. Read echoed value from workerSequence (the child wrote it via __atomic_store_n).
    const uint32_t echoed = __atomic_load_n (&hdr->workerSequence, __ATOMIC_ACQUIRE);
    BOOST_CHECK_EQUAL (echoed, kSentinel);

    // 8. Cleanup — shm.close() unlinks since shm is owner.
    shm.close();
}

BOOST_AUTO_TEST_SUITE_END()

} // namespace element
