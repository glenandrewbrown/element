// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include "engine/sandboxsemaphore.hpp"
#include "engine/sandboxipc.hpp"

#include <thread>
#include <chrono>
#include <atomic>

using namespace element;

//==============================================================================
// SandboxSemaphore Tests
//==============================================================================

BOOST_AUTO_TEST_SUITE (SandboxSemaphoreTests)

BOOST_AUTO_TEST_CASE (TimedWaitTimesOutWhenNotSignaled)
{
    SandboxSemaphore sem;
    BOOST_REQUIRE (sem.open (SandboxSemaphore::generateName ('t'), SandboxSemaphore::Mode::Owner));
    auto start = std::chrono::steady_clock::now();
    bool signaled = sem.timedWait (1000); // 1ms timeout
    auto elapsed = std::chrono::steady_clock::now() - start;

    BOOST_CHECK (! signaled);
    BOOST_CHECK (elapsed >= std::chrono::microseconds (500));
}

BOOST_AUTO_TEST_CASE (PostThenTimedWaitSucceeds)
{
    SandboxSemaphore sem;
    BOOST_REQUIRE (sem.open (SandboxSemaphore::generateName ('t'), SandboxSemaphore::Mode::Owner));
    sem.post();
    bool signaled = sem.timedWait (100000); // 100ms generous timeout
    BOOST_CHECK (signaled);
}

BOOST_AUTO_TEST_CASE (PostFromAnotherThread)
{
    SandboxSemaphore sem;
    BOOST_REQUIRE (sem.open (SandboxSemaphore::generateName ('t'), SandboxSemaphore::Mode::Owner));
    std::atomic<bool> posted { false };

    std::thread poster ([&] {
        std::this_thread::sleep_for (std::chrono::milliseconds (5));
        sem.post();
        posted.store (true);
    });

    bool signaled = sem.timedWait (500000); // 500ms timeout
    BOOST_CHECK (signaled);
    poster.join();
    BOOST_CHECK (posted.load());
}

BOOST_AUTO_TEST_CASE (MultiplePostsConsumedIndividually)
{
    SandboxSemaphore sem;
    BOOST_REQUIRE (sem.open (SandboxSemaphore::generateName ('t'), SandboxSemaphore::Mode::Owner));
    sem.post();
    sem.post();

    BOOST_CHECK (sem.timedWait (1000));
    BOOST_CHECK (sem.timedWait (1000));
    // Third wait should timeout — no more signals queued
    BOOST_CHECK (! sem.timedWait (1000));
}

//==============================================================================
// Adaptive idle back-off (P1-T9): the COLD wait uses a coarse poll granularity
// (5 ms vs the HOT 50 µs) so an idle worker stops burning ~9% CPU. These cases
// prove the new pollGranularityMicroseconds arg preserves correctness — wakes on
// post, times out without one, and a pre-queued signal returns immediately even
// under a coarse poll. (Syscall-rate reduction is exercised live: see the
// rtProcessingLoop top-comment + the report's `top -pid` procedure.)

BOOST_AUTO_TEST_CASE (CoarsePollTimedWaitTimesOut)
{
    // COLD-style wait: 250 ms budget, 5 ms poll. With no signal it must time out
    // (and not return early). This is the idle steady state.
    SandboxSemaphore sem;
    BOOST_REQUIRE (sem.open (SandboxSemaphore::generateName ('t'), SandboxSemaphore::Mode::Owner));

    auto start = std::chrono::steady_clock::now();
    bool signaled = sem.timedWait (250000, 5000); // 250 ms timeout, 5 ms poll
    auto elapsed = std::chrono::steady_clock::now() - start;

    BOOST_CHECK (! signaled);
    // Should have waited roughly the full budget (allow slack for poll granularity).
    BOOST_CHECK (elapsed >= std::chrono::milliseconds (200));
}

BOOST_AUTO_TEST_CASE (CoarsePollTimedWaitWakesOnPost)
{
    // A signal posted from another thread must still wake a COLD (coarse-poll)
    // waiter — this is the cold->hot transition that resets back to the tight loop.
    SandboxSemaphore sem;
    BOOST_REQUIRE (sem.open (SandboxSemaphore::generateName ('t'), SandboxSemaphore::Mode::Owner));
    std::atomic<bool> posted { false };

    std::thread poster ([&] {
        std::this_thread::sleep_for (std::chrono::milliseconds (10));
        sem.post();
        posted.store (true);
    });

    bool signaled = sem.timedWait (500000, 5000); // 500 ms timeout, 5 ms coarse poll
    BOOST_CHECK (signaled);
    poster.join();
    BOOST_CHECK (posted.load());
}

BOOST_AUTO_TEST_CASE (CoarsePollReturnsImmediatelyWhenAlreadySignaled)
{
    // A pre-queued signal must be consumed on the first poll iteration even under a
    // coarse granularity — i.e. the coarse poll never adds latency to an already-hot
    // semaphore (guards against sleeping before the first sem_trywait).
    SandboxSemaphore sem;
    BOOST_REQUIRE (sem.open (SandboxSemaphore::generateName ('t'), SandboxSemaphore::Mode::Owner));
    sem.post();

    auto start = std::chrono::steady_clock::now();
    bool signaled = sem.timedWait (500000, 5000); // coarse poll, but signal is ready
    auto elapsed = std::chrono::steady_clock::now() - start;

    BOOST_CHECK (signaled);
    BOOST_CHECK (elapsed < std::chrono::milliseconds (5)); // no coarse-poll sleep incurred
}

BOOST_AUTO_TEST_CASE (DefaultPollGranularityPreservesHotBehaviour)
{
    // The default (HOT) overload must behave exactly as before: post then wait wakes.
    SandboxSemaphore sem;
    BOOST_REQUIRE (sem.open (SandboxSemaphore::generateName ('t'), SandboxSemaphore::Mode::Owner));
    sem.post();
    BOOST_CHECK (sem.timedWait (100000)); // default 50 µs poll
}

BOOST_AUTO_TEST_CASE (WaitUnblocksOnPost)
{
    SandboxSemaphore sem;
    BOOST_REQUIRE (sem.open (SandboxSemaphore::generateName ('t'), SandboxSemaphore::Mode::Owner));
    std::atomic<bool> waited { false };

    std::thread waiter ([&] {
        sem.wait(); // blocking wait
        waited.store (true);
    });

    std::this_thread::sleep_for (std::chrono::milliseconds (5));
    BOOST_CHECK (! waited.load()); // should still be waiting
    sem.post();
    waiter.join();
    BOOST_CHECK (waited.load());
}

BOOST_AUTO_TEST_CASE (OwnerAttacherSeparateProcessesShareSignal)
{
    // Same-process simulation of Owner+Attacher pairing: Owner creates the
    // named semaphore, Attacher opens it by name in the same process.
    // The kernel object is shared via the OS namespace — both FDs operate
    // on the same primitive. Cross-process variant is in
    // SandboxSemaphoreCrossProcessTest (separate test binary spawn).
    const auto name = SandboxSemaphore::generateName ('t');

    SandboxSemaphore owner;
    BOOST_REQUIRE (owner.open (name, SandboxSemaphore::Mode::Owner));

    SandboxSemaphore attacher;
    BOOST_REQUIRE (attacher.open (name, SandboxSemaphore::Mode::Attacher));

    owner.post();
    BOOST_CHECK (attacher.timedWait (100000));

    attacher.post();
    BOOST_CHECK (owner.timedWait (100000));
}

BOOST_AUTO_TEST_CASE (OwnerExclusiveCreateFailsOnDuplicateName)
{
    const auto name = SandboxSemaphore::generateName ('t');

    SandboxSemaphore first;
    BOOST_REQUIRE (first.open (name, SandboxSemaphore::Mode::Owner));

    SandboxSemaphore second;
    BOOST_CHECK (! second.open (name, SandboxSemaphore::Mode::Owner));
}

BOOST_AUTO_TEST_CASE (AttacherFailsWhenNameDoesNotExist)
{
    SandboxSemaphore attacher;
    BOOST_CHECK (! attacher.open ("/els_does_not_exist", SandboxSemaphore::Mode::Attacher));
}

BOOST_AUTO_TEST_SUITE_END()

//==============================================================================
// SharedAudioBuffer Tests
//==============================================================================

BOOST_AUTO_TEST_SUITE (SharedAudioBufferTests)

BOOST_AUTO_TEST_CASE (AllocateInitializesHeader)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 512);

    auto* header = buf.getHeader();
    BOOST_REQUIRE (header != nullptr);
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->activeBuffer, __ATOMIC_ACQUIRE), 0u);
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->numSamples, __ATOMIC_ACQUIRE), 0u);
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->coordinatorSequence, __ATOMIC_ACQUIRE), 0u);
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->workerSequence, __ATOMIC_ACQUIRE), 0u);
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->xrunCount, __ATOMIC_ACQUIRE), 0u);
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->consecutiveXruns, __ATOMIC_ACQUIRE), 0u);
}

BOOST_AUTO_TEST_CASE (SwapBuffersTogglesAtomically)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 512);

    auto* header = buf.getHeader();
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->activeBuffer, __ATOMIC_ACQUIRE), 0u);

    buf.swapBuffers();
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->activeBuffer, __ATOMIC_ACQUIRE), 1u);
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->coordinatorSequence, __ATOMIC_ACQUIRE), 1u);

    buf.swapBuffers();
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->activeBuffer, __ATOMIC_ACQUIRE), 0u);
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->coordinatorSequence, __ATOMIC_ACQUIRE), 2u);
}

BOOST_AUTO_TEST_CASE (SignalHostReadyIncrementsSequence)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 512);

    BOOST_CHECK_EQUAL (buf.getHostSequence(), 0u);
    buf.signalHostReady();
    BOOST_CHECK_EQUAL (buf.getHostSequence(), 1u);
    buf.signalHostReady();
    BOOST_CHECK_EQUAL (buf.getHostSequence(), 2u);
}

BOOST_AUTO_TEST_CASE (IsWorkerDoneChecksSequence)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 512);

    // Worker hasn't done anything yet
    BOOST_CHECK (! buf.isWorkerDone (1));

    // Simulate worker completing one cycle
    buf.signalWorkerDone();
    BOOST_CHECK (buf.isWorkerDone (1));
    BOOST_CHECK (! buf.isWorkerDone (2));

    buf.signalWorkerDone();
    BOOST_CHECK (buf.isWorkerDone (2));
    // Also true for earlier sequences (>=)
    BOOST_CHECK (buf.isWorkerDone (1));
}

BOOST_AUTO_TEST_CASE (XrunTrackingIncrements)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 512);

    BOOST_CHECK_EQUAL (buf.getConsecutiveXruns(), 0u);

    buf.recordXrun();
    BOOST_CHECK_EQUAL (buf.getConsecutiveXruns(), 1u);

    buf.recordXrun();
    BOOST_CHECK_EQUAL (buf.getConsecutiveXruns(), 2u);

    auto* header = buf.getHeader();
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->xrunCount, __ATOMIC_ACQUIRE), 2u);
}

BOOST_AUTO_TEST_CASE (ClearConsecutiveXrunsResets)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 512);

    buf.recordXrun();
    buf.recordXrun();
    buf.recordXrun();
    BOOST_CHECK_EQUAL (buf.getConsecutiveXruns(), 3u);

    buf.clearConsecutiveXruns();
    BOOST_CHECK_EQUAL (buf.getConsecutiveXruns(), 0u);

    // Total xrun count should still be 3
    auto* header = buf.getHeader();
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->xrunCount, __ATOMIC_ACQUIRE), 3u);
}

BOOST_AUTO_TEST_CASE (WriteAndReadAudioRoundTrips)
{
    const int numChannels = 2;
    const int numSamples = 256;

    SharedAudioBuffer buf;
    buf.allocate (numChannels, numSamples);

    // Create test audio: channel 0 = 0.5, channel 1 = -0.25
    juce::AudioSampleBuffer input (numChannels, numSamples);
    for (int ch = 0; ch < numChannels; ++ch)
    {
        float val = (ch == 0) ? 0.5f : -0.25f;
        for (int i = 0; i < numSamples; ++i)
            input.setSample (ch, i, val);
    }

    // Write input
    buf.writeInputAudio (input, numSamples);

    // Swap so worker can read from active buffer
    buf.swapBuffers();

    // Simulate worker: read input from active buffer, write to output
    auto* header = buf.getHeader();
    uint32_t activeIdx = __atomic_load_n (&header->activeBuffer, __ATOMIC_ACQUIRE);
    int nSamp = static_cast<int> (__atomic_load_n (&header->numSamples, __ATOMIC_ACQUIRE));
    int nCh = static_cast<int> (__atomic_load_n (&header->numInputChannels, __ATOMIC_ACQUIRE));

    BOOST_CHECK_EQUAL (nSamp, numSamples);
    BOOST_CHECK_EQUAL (nCh, numChannels);

    // Copy input -> output (simulating passthrough plugin)
    for (int ch = 0; ch < nCh; ++ch)
    {
        const float* src = buf.getInputBuffer (ch, activeIdx);
        float* dst = buf.getOutputBuffer (ch, activeIdx);
        std::memcpy (dst, src, static_cast<size_t> (nSamp) * sizeof (float));
    }

    // Read output on host side
    juce::AudioSampleBuffer output (numChannels, numSamples);
    output.clear();
    buf.readOutputAudio (output, numSamples);

    // Verify round-trip
    for (int ch = 0; ch < numChannels; ++ch)
    {
        float expected = (ch == 0) ? 0.5f : -0.25f;
        for (int i = 0; i < numSamples; ++i)
        {
            BOOST_CHECK_CLOSE (output.getSample (ch, i), expected, 0.001f);
        }
    }
}

BOOST_AUTO_TEST_CASE (WriteClampsSamplesToMax)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 128);

    // Try to write 256 samples into a buffer allocated for 128
    juce::AudioSampleBuffer input (2, 256);
    input.clear();
    for (int i = 0; i < 256; ++i)
        input.setSample (0, i, 1.0f);

    buf.writeInputAudio (input, 256);

    // Should have clamped to 128
    auto* header = buf.getHeader();
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->numSamples, __ATOMIC_ACQUIRE), 128u);
}

BOOST_AUTO_TEST_CASE (HasNewDataDetectsSequenceChange)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 512);

    // Initially no new data
    BOOST_CHECK (! buf.hasNewData());

    // Host signals
    buf.swapBuffers(); // increments coordinatorSequence
    BOOST_CHECK (buf.hasNewData());

    // Worker marks processed
    buf.markProcessed();
    BOOST_CHECK (! buf.hasNewData());
}

BOOST_AUTO_TEST_CASE (CalculateRequiredSizeIsReasonable)
{
    // 2 channels, 512 samples
    size_t size = SharedAudioBuffer::calculateRequiredSize (2, 512);

    // At minimum: header + 4 audio buffers (2ch * 512samp * float * 4) + 2 MIDI (4096 * 2)
    size_t headerSize = sizeof (SharedAudioBuffer::Header);
    size_t audioBytes = 2 * 512 * sizeof (float) * 4;
    size_t midiBytes = 4096 * 2;
    size_t expected = headerSize + audioBytes + midiBytes;

    BOOST_CHECK_EQUAL (size, expected);
}

BOOST_AUTO_TEST_CASE (NullHeaderSafetyChecks)
{
    SharedAudioBuffer buf; // not allocated

    // All operations on unallocated buffer should be safe (no crash)
    buf.signalHostReady();
    buf.signalWorkerDone();
    buf.recordXrun();
    buf.clearConsecutiveXruns();
    buf.swapBuffers();

    BOOST_CHECK (! buf.isWorkerDone (1));
    BOOST_CHECK (! buf.hasNewData());
    BOOST_CHECK_EQUAL (buf.getConsecutiveXruns(), 0u);
    BOOST_CHECK_EQUAL (buf.getHostSequence(), 0u);
}

BOOST_AUTO_TEST_CASE (WorkerAttachDoesNotClobberHostInit)
{
    const int numChannels = 2;
    const int numSamples = 256;
    const size_t total = SharedAudioBuffer::calculateRequiredSize (numChannels, numSamples);
    std::vector<uint8_t> backing (total, 0xFF);

    SharedAudioBuffer host;
    host.attachToMemoryAsOwner (backing.data(), total, numChannels, numSamples);

    __atomic_store_n (&host.getHeader()->coordinatorSequence, 0xDEADBEEFu, __ATOMIC_RELEASE);

    SharedAudioBuffer worker;
    BOOST_REQUIRE (worker.attachToMemoryAsAttacher (backing.data(), total, numChannels, numSamples));

    BOOST_CHECK_EQUAL (__atomic_load_n (&worker.getHeader()->coordinatorSequence, __ATOMIC_ACQUIRE), 0xDEADBEEFu);
    BOOST_CHECK_EQUAL (worker.getHeader()->magic, SharedAudioBuffer::Header::kMagic);
}

BOOST_AUTO_TEST_CASE (AttacherTimesOutOnUninitialisedMemory)
{
    const int numChannels = 2;
    const int numSamples = 256;
    const size_t total = SharedAudioBuffer::calculateRequiredSize (numChannels, numSamples);
    std::vector<uint8_t> backing (total, 0u);

    SharedAudioBuffer worker;
    auto start = std::chrono::steady_clock::now();
    bool ok = worker.attachToMemoryAsAttacher (backing.data(), total, numChannels, numSamples,
                                               std::chrono::milliseconds { 50 });
    auto elapsed = std::chrono::steady_clock::now() - start;

    BOOST_CHECK (! ok);
    BOOST_CHECK (elapsed >= std::chrono::milliseconds { 45 });
    BOOST_CHECK (elapsed <= std::chrono::milliseconds { 200 });
}

BOOST_AUTO_TEST_SUITE_END()

//==============================================================================
// Lock-Free Protocol Integration Tests
//==============================================================================

BOOST_AUTO_TEST_SUITE (SandboxProtocolTests)

BOOST_AUTO_TEST_CASE (FullCycleProtocol)
{
    // Simulates one complete host-worker audio cycle without real processes.
    // Same-process simulation: opens both semaphores as Owner since the "worker"
    // is a thread in this process, not a separate process. The cross-process
    // variant lives in SandboxSemaphoreCrossProcessTest.cpp.
    SharedAudioBuffer buf;
    buf.allocate (2, 512);
    SandboxSemaphore triggerSem;
    SandboxSemaphore doneSem;
    BOOST_REQUIRE (triggerSem.open (SandboxSemaphore::generateName ('t'), SandboxSemaphore::Mode::Owner));
    BOOST_REQUIRE (doneSem.open (SandboxSemaphore::generateName ('d'), SandboxSemaphore::Mode::Owner));

    const int numSamples = 512;
    juce::AudioSampleBuffer audio (2, numSamples);

    // Fill with test signal
    for (int i = 0; i < numSamples; ++i)
    {
        audio.setSample (0, i, std::sin (static_cast<float> (i) * 0.1f));
        audio.setSample (1, i, std::cos (static_cast<float> (i) * 0.1f));
    }

    uint32_t expectedSeq = 1;

    // --- HOST SIDE ---
    buf.writeInputAudio (audio, numSamples);
    buf.swapBuffers();
    buf.signalHostReady();
    triggerSem.post();

    // --- WORKER SIDE (simulated in another thread) ---
    std::thread worker ([&] {
        // Wait for trigger
        BOOST_CHECK (triggerSem.timedWait (100000));

        // Read input, write to output (passthrough)
        auto* hdr = buf.getHeader();
        uint32_t activeIdx = __atomic_load_n (&hdr->activeBuffer, __ATOMIC_ACQUIRE);
        int ns = static_cast<int> (__atomic_load_n (&hdr->numSamples, __ATOMIC_ACQUIRE));
        int nc = static_cast<int> (__atomic_load_n (&hdr->numInputChannels, __ATOMIC_ACQUIRE));

        for (int ch = 0; ch < nc; ++ch)
        {
            const float* in = buf.getInputBuffer (ch, activeIdx);
            float* out = buf.getOutputBuffer (ch, activeIdx);
            std::memcpy (out, in, static_cast<size_t> (ns) * sizeof (float));
        }

        buf.signalWorkerDone();
        doneSem.post();
    });

    // --- HOST SIDE: wait for worker ---
    // Spin-wait first
    bool done = false;
    for (int i = 0; i < 10000; ++i)
    {
        if (buf.isWorkerDone (expectedSeq))
        {
            done = true;
            break;
        }
    }

    // Fallback to semaphore
    if (! done)
    {
        doneSem.timedWait (100000);
        done = buf.isWorkerDone (expectedSeq);
    }

    worker.join();
    BOOST_CHECK (done);

    // Read output
    juce::AudioSampleBuffer output (2, numSamples);
    output.clear();
    buf.readOutputAudio (output, numSamples);

    // Verify signal integrity
    for (int i = 0; i < numSamples; ++i)
    {
        float expectedCh0 = std::sin (static_cast<float> (i) * 0.1f);
        float expectedCh1 = std::cos (static_cast<float> (i) * 0.1f);
        BOOST_CHECK_CLOSE (output.getSample (0, i), expectedCh0, 0.001f);
        BOOST_CHECK_CLOSE (output.getSample (1, i), expectedCh1, 0.001f);
    }
}

BOOST_AUTO_TEST_CASE (XrunOnWorkerTimeout)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 512);
    SandboxSemaphore doneSem;

    // Host sends, but worker never responds
    buf.signalHostReady();
    uint32_t expectedSeq = 1;

    // Spin a few times
    bool done = false;
    for (int i = 0; i < 100; ++i)
    {
        if (buf.isWorkerDone (expectedSeq))
        {
            done = true;
            break;
        }
    }

    // Semaphore timeout (very short)
    if (! done)
    {
        doneSem.timedWait (1000); // 1ms
        done = buf.isWorkerDone (expectedSeq);
    }

    BOOST_CHECK (! done);

    // Record xrun
    buf.recordXrun();
    BOOST_CHECK_EQUAL (buf.getConsecutiveXruns(), 1u);
}

BOOST_AUTO_TEST_CASE (MultipleCyclesSequenceProgresses)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 256);

    // Each cycle: swapBuffers() increments coordinatorSequence by 1,
    // signalHostReady() increments by 1 more. So +2 per cycle.
    for (uint32_t cycle = 1; cycle <= 10; ++cycle)
    {
        buf.swapBuffers();
        buf.signalHostReady();
        BOOST_CHECK_EQUAL (buf.getHostSequence(), cycle * 2);

        // Simulate worker completing
        buf.signalWorkerDone();
        BOOST_CHECK (buf.isWorkerDone (cycle));
        buf.clearConsecutiveXruns();
    }

    auto* header = buf.getHeader();
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->coordinatorSequence, __ATOMIC_ACQUIRE), 20u);
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->workerSequence, __ATOMIC_ACQUIRE), 10u);
    BOOST_CHECK_EQUAL (__atomic_load_n (&header->xrunCount, __ATOMIC_ACQUIRE), 0u);
}

BOOST_AUTO_TEST_SUITE_END()
