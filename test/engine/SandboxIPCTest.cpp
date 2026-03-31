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
    auto start = std::chrono::steady_clock::now();
    bool signaled = sem.timedWait (1000); // 1ms timeout
    auto elapsed = std::chrono::steady_clock::now() - start;

    BOOST_CHECK (! signaled);
    // Should have waited at least ~1ms (allow some slack)
    BOOST_CHECK (elapsed >= std::chrono::microseconds (500));
}

BOOST_AUTO_TEST_CASE (PostThenTimedWaitSucceeds)
{
    SandboxSemaphore sem;
    sem.post();
    bool signaled = sem.timedWait (100000); // 100ms generous timeout
    BOOST_CHECK (signaled);
}

BOOST_AUTO_TEST_CASE (PostFromAnotherThread)
{
    SandboxSemaphore sem;
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
    sem.post();
    sem.post();

    BOOST_CHECK (sem.timedWait (1000));
    BOOST_CHECK (sem.timedWait (1000));
    // Third wait should timeout — no more signals queued
    BOOST_CHECK (! sem.timedWait (1000));
}

BOOST_AUTO_TEST_CASE (WaitUnblocksOnPost)
{
    SandboxSemaphore sem;
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
    BOOST_CHECK_EQUAL (header->activeBuffer.load(), 0u);
    BOOST_CHECK_EQUAL (header->numSamples.load(), 0u);
    BOOST_CHECK_EQUAL (header->coordinatorSequence.load(), 0u);
    BOOST_CHECK_EQUAL (header->workerSequence.load(), 0u);
    BOOST_CHECK_EQUAL (header->xrunCount.load(), 0u);
    BOOST_CHECK_EQUAL (header->consecutiveXruns.load(), 0u);
}

BOOST_AUTO_TEST_CASE (SwapBuffersTogglesAtomically)
{
    SharedAudioBuffer buf;
    buf.allocate (2, 512);

    auto* header = buf.getHeader();
    BOOST_CHECK_EQUAL (header->activeBuffer.load(), 0u);

    buf.swapBuffers();
    BOOST_CHECK_EQUAL (header->activeBuffer.load(), 1u);
    BOOST_CHECK_EQUAL (header->coordinatorSequence.load(), 1u);

    buf.swapBuffers();
    BOOST_CHECK_EQUAL (header->activeBuffer.load(), 0u);
    BOOST_CHECK_EQUAL (header->coordinatorSequence.load(), 2u);
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
    BOOST_CHECK_EQUAL (header->xrunCount.load(), 2u);
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
    BOOST_CHECK_EQUAL (header->xrunCount.load(), 3u);
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
    uint32_t activeIdx = header->activeBuffer.load();
    int nSamp = static_cast<int> (header->numSamples.load());
    int nCh = static_cast<int> (header->numInputChannels.load());

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
    BOOST_CHECK_EQUAL (header->numSamples.load(), 128u);
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

BOOST_AUTO_TEST_SUITE_END()

//==============================================================================
// Lock-Free Protocol Integration Tests
//==============================================================================

BOOST_AUTO_TEST_SUITE (SandboxProtocolTests)

BOOST_AUTO_TEST_CASE (FullCycleProtocol)
{
    // Simulates one complete host-worker audio cycle without real processes
    SharedAudioBuffer buf;
    buf.allocate (2, 512);
    SandboxSemaphore triggerSem;
    SandboxSemaphore doneSem;

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
        uint32_t activeIdx = hdr->activeBuffer.load();
        int ns = static_cast<int> (hdr->numSamples.load());
        int nc = static_cast<int> (hdr->numInputChannels.load());

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
    BOOST_CHECK_EQUAL (header->coordinatorSequence.load(), 20u);
    BOOST_CHECK_EQUAL (header->workerSequence.load(), 10u);
    BOOST_CHECK_EQUAL (header->xrunCount.load(), 0u);
}

BOOST_AUTO_TEST_SUITE_END()
