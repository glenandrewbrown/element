// SPDX-License-Identifier: GPL-3.0-or-later
//
// G3-B item 1 — unit tests for the lock-free per-node FFT analyser.
// Verifies: (1) a known sine produces a magnitude frame whose dominant bin is
// at the sine's frequency; (2) an idle analyser (no samples pushed) yields no
// frame (honest — never a fabricated frame); (3) pure silence yields a frame of
// honest near-zero bins (no fabricated energy).
//
// NOTE on allocation-free RT-safety: the audio-thread push path
// (SpectrumAnalyser::pushSamples) is allocation-free by construction — it only
// memcpy's into a ctor-allocated ring via juce::AbstractFifo (same proven
// transport as WebMeteringFifo). We do NOT add a global operator-new interposer
// here because test/realtime/AudioThreadAllocationTest.cpp already defines one
// for the whole test_element binary; a second definition would be an ODR
// violation. The alloc-free guarantee is enforced by code review of the hot
// path + the AbstractFifo transport contract.

#include <boost/test/unit_test.hpp>

#include "engine/spectrumanalyser.hpp"

#include <cmath>
#include <vector>

using namespace element;

namespace {

void pushSine (SpectrumAnalyser& a, double sampleRate, double freqHz, int totalSamples, int block)
{
    std::vector<float> buf ((size_t) block, 0.0f);
    double phase = 0.0;
    const double inc = 2.0 * juce::MathConstants<double>::pi * freqHz / sampleRate;
    int written = 0;
    while (written < totalSamples)
    {
        const int n = std::min (block, totalSamples - written);
        for (int i = 0; i < n; ++i)
        {
            buf[(size_t) i] = (float) std::sin (phase);
            phase += inc;
            if (phase > 2.0 * juce::MathConstants<double>::pi)
                phase -= 2.0 * juce::MathConstants<double>::pi;
        }
        a.pushSamples (buf.data(), n);
        written += n;
    }
}

} // namespace

BOOST_AUTO_TEST_SUITE (SpectrumAnalyserTests)

BOOST_AUTO_TEST_CASE (DominantBinMatchesSineFrequency)
{
    constexpr double sampleRate = 48000.0;
    constexpr double freqHz = 3000.0;
    SpectrumAnalyser analyser (sampleRate);

    // Push several windows' worth so a full hop accumulates.
    pushSine (analyser, sampleRate, freqHz, SpectrumAnalyser::kFftSize * 3, 256);

    auto frame = analyser.computeLatestFrame();
    BOOST_REQUIRE (frame.has_value());

    // Find the dominant bin.
    int peakBin = 0;
    float peakMag = 0.0f;
    for (int i = 1; i < SpectrumAnalyser::kNumBins; ++i)
    {
        if ((*frame)[(size_t) i] > peakMag)
        {
            peakMag = (*frame)[(size_t) i];
            peakBin = i;
        }
    }

    BOOST_CHECK (peakMag > 0.0f);

    // Expected bin = freq / (sampleRate / fftSize).
    const double binHz = sampleRate / (double) SpectrumAnalyser::kFftSize;
    const int expectedBin = (int) std::round (freqHz / binHz);

    // Allow a couple of bins of leakage tolerance (Hann window main lobe).
    BOOST_CHECK_MESSAGE (std::abs (peakBin - expectedBin) <= 2,
                         "peakBin=" << peakBin << " expectedBin=" << expectedBin);
}

BOOST_AUTO_TEST_CASE (IdleAnalyserYieldsNoFrame)
{
    SpectrumAnalyser analyser (48000.0);
    // Nothing pushed → no full window → honest nullopt (never a fabricated frame).
    BOOST_CHECK (! analyser.computeLatestFrame().has_value());

    // A trickle below one window also yields nothing.
    std::vector<float> few ((size_t) 64, 0.5f);
    analyser.pushSamples (few.data(), 64);
    BOOST_CHECK (! analyser.computeLatestFrame().has_value());
}

BOOST_AUTO_TEST_CASE (SilenceYieldsNearZeroBins)
{
    SpectrumAnalyser analyser (48000.0);
    std::vector<float> silence ((size_t) SpectrumAnalyser::kFftSize, 0.0f);
    // Push a couple of windows of pure silence.
    for (int i = 0; i < 3; ++i)
        analyser.pushSamples (silence.data(), SpectrumAnalyser::kFftSize);

    auto frame = analyser.computeLatestFrame();
    BOOST_REQUIRE (frame.has_value()); // a frame IS produced (data arrived)…
    float maxMag = 0.0f;
    for (float m : *frame)
        maxMag = std::max (maxMag, m);
    BOOST_CHECK_SMALL (maxMag, 1.0e-4f); // …but it is honest zeros, no fake energy.
}

BOOST_AUTO_TEST_SUITE_END()
