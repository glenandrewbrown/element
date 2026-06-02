// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <juce_dsp/juce_dsp.h>

#include <array>
#include <atomic>
#include <cstring>
#include <optional>
#include <vector>

namespace element {

/** Per-node spectrum analyser for the Block / Inspector FFT view (G3-B item 1).
 *
 *  RT-SAFETY CONTRACT (the audio thread does the absolute minimum):
 *  ──────────────────────────────────────────────────────────────────────────
 *  - The AUDIO THREAD only ever calls `pushSamples(const float*, int)`, which
 *    does nothing but copy the supplied samples into a lock-free single-
 *    producer / single-consumer raw-sample FIFO (`juce::AbstractFifo` + a
 *    pre-allocated `std::vector<float>` ring). No allocation, no locks, no
 *    logging, NO FFT, no windowing — just a bounded memcpy and two atomic
 *    index updates. This mirrors `WebMeteringFifo::pushPacket`
 *    (include/element/web_metering_fifo.hpp), the proven RT meter transport.
 *  - The MESSAGE THREAD calls `computeLatestFrame()` (driven by the host's
 *    60Hz `timerCallback`). THAT is where the FFT actually runs: it drains the
 *    sample FIFO into a hop accumulator, and once a full window of samples has
 *    accumulated it windows + runs `juce::dsp::FFT::performFrequencyOnlyForward
 *    Transform` into a PRE-ALLOCATED scratch buffer and returns one magnitude
 *    frame. The FFT object, window, scratch and bin buffers are all allocated
 *    ONCE in the constructor — none of the FFT machinery is ever touched on the
 *    audio thread.
 *
 *  All buffers are sized in the constructor; `pushSamples` performs zero
 *  allocation. The analyser is only constructed (in `Processor::prepare`) when
 *  there is audio to analyse, and the audio-thread tap is additionally gated by
 *  an atomic `spectrumWanted` flag on the Processor so the idle cost is zero
 *  (the producer is not even called unless a UI consumer has subscribed).
 */
class SpectrumAnalyser final {
public:
    /** FFT order; 11 => 2048-point FFT => 1024 magnitude bins. */
    static constexpr int kFftOrder = 11;
    static constexpr int kFftSize = 1 << kFftOrder; // 2048
    static constexpr int kNumBins = kFftSize / 2;   // 1024

    /** One magnitude frame: kNumBins normalised 0..1 magnitudes. */
    using Frame = std::array<float, (size_t) kNumBins>;

    explicit SpectrumAnalyser (double sampleRateHz)
        : sampleRate (sampleRateHz),
          fft (kFftOrder),
          window ((size_t) kFftSize, juce::dsp::WindowingFunction<float>::hann),
          sampleFifo (kSampleFifoCapacity),
          sampleRing ((size_t) kSampleFifoCapacity, 0.0f)
    {
        // Pre-size every buffer the message-thread compute path touches so that
        // `computeLatestFrame()` is also allocation-free after construction.
        fftScratch.fill (0.0f);
        accumulator.fill (0.0f);
    }

    /** [AUDIO THREAD] Copy `numSamples` of mono input into the SPSC FIFO.
     *  Lock-free, allocation-free, bounded. Drops the overflow tail if the FIFO
     *  is full (the consumer keeps only the latest window anyway). */
    void pushSamples (const float* mono, int numSamples) noexcept
    {
        if (mono == nullptr || numSamples <= 0)
            return;

        int start1 = 0, size1 = 0, start2 = 0, size2 = 0;
        sampleFifo.prepareToWrite (numSamples, start1, size1, start2, size2);
        if (size1 > 0)
            std::memcpy (sampleRing.data() + start1, mono, (size_t) size1 * sizeof (float));
        if (size2 > 0)
            std::memcpy (sampleRing.data() + start2, mono + size1, (size_t) size2 * sizeof (float));
        sampleFifo.finishedWrite (size1 + size2);
    }

    /** [MESSAGE THREAD] Drain the FIFO into the hop accumulator and, if a full
     *  window has accumulated, run the FFT and return one magnitude frame.
     *  Returns std::nullopt when not enough samples have arrived yet (honest:
     *  no fabricated frame). The FFT runs HERE, never on the audio thread. */
    std::optional<Frame> computeLatestFrame() noexcept
    {
        // Drain everything currently readable into the accumulator ring. Keep
        // only the most recent kFftSize samples (older audio is irrelevant to
        // the latest spectrum — "latest wins", like popLatestPeak()).
        for (;;)
        {
            int start1 = 0, size1 = 0, start2 = 0, size2 = 0;
            sampleFifo.prepareToRead (kFftSize, start1, size1, start2, size2);
            const int total = size1 + size2;
            if (total <= 0)
                break;

            if (size1 > 0)
                appendToAccumulator (sampleRing.data() + start1, size1);
            if (size2 > 0)
                appendToAccumulator (sampleRing.data() + start2, size2);

            sampleFifo.finishedRead (total);
            framedSinceLastWindow += total;
        }

        // Need a full window of fresh-ish data before emitting a frame.
        if (accumulatedTotal < kFftSize || framedSinceLastWindow <= 0)
            return std::nullopt;
        framedSinceLastWindow = 0;

        // Copy the newest kFftSize samples out of the ring (oldest→newest) into
        // the real half of the pre-allocated interleaved scratch; zero the rest.
        fftScratch.fill (0.0f);
        const int head = accumulatorWrite; // points one past the newest sample
        for (int i = 0; i < kFftSize; ++i)
        {
            int idx = head - kFftSize + i;
            idx %= kFftSize;
            if (idx < 0)
                idx += kFftSize;
            fftScratch[(size_t) i] = accumulator[(size_t) idx];
        }

        // Window in place, then magnitude-only forward FFT into the same buffer
        // (juce writes kFftSize magnitudes; we expose the lower kNumBins).
        window.multiplyWithWindowingTable (fftScratch.data(), (size_t) kFftSize);
        fft.performFrequencyOnlyForwardTransform (fftScratch.data());

        Frame frame {};
        // Normalise to 0..1. JUCE's magnitude output is unnormalised; divide by
        // kFftSize/2 (the coherent gain of an N-point real FFT bin for a full-
        // scale sinusoid is ~N/2). Clamp so a transient cannot exceed 1.0.
        constexpr float kNorm = 2.0f / (float) kFftSize;
        for (int i = 0; i < kNumBins; ++i)
        {
            const float mag = fftScratch[(size_t) i] * kNorm;
            frame[(size_t) i] = mag > 1.0f ? 1.0f : (mag < 0.0f ? 0.0f : mag);
        }
        return frame;
    }

    double getSampleRate() const noexcept { return sampleRate; }
    static constexpr int getFftSize() noexcept { return kFftSize; }
    static constexpr int getNumBins() noexcept { return kNumBins; }

private:
    // Append samples into the circular accumulator; keeps a running count
    // (capped at kFftSize once full) so we know when a window is ready.
    void appendToAccumulator (const float* src, int n) noexcept
    {
        for (int i = 0; i < n; ++i)
        {
            accumulator[(size_t) accumulatorWrite] = src[i];
            accumulatorWrite = (accumulatorWrite + 1) % kFftSize;
        }
        accumulatedTotal += n;
        if (accumulatedTotal > kFftSize)
            accumulatedTotal = kFftSize;
    }

    // Raw-sample SPSC FIFO sized for several audio blocks of headroom so a
    // larger-than-typical render still fits without the producer blocking.
    static constexpr int kSampleFifoCapacity = kFftSize * 4; // 8192

    double sampleRate { 44100.0 };

    juce::dsp::FFT fft;                               // ctor-allocated
    juce::dsp::WindowingFunction<float> window;       // ctor-allocated

    juce::AbstractFifo sampleFifo;                    // SPSC index arbiter
    std::vector<float> sampleRing;                    // ctor-allocated ring

    // Message-thread-only state (never touched by the audio thread).
    std::array<float, (size_t) kFftSize * 2> fftScratch {}; // interleaved scratch
    std::array<float, (size_t) kFftSize> accumulator {};    // hop accumulator ring
    int accumulatorWrite { 0 };
    int accumulatedTotal { 0 };
    int framedSinceLastWindow { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SpectrumAnalyser)
};

} // namespace element
