// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/core.hpp>

#include <optional>
#include <vector>

namespace element {

/** Single-producer / single-consumer metering queue using juce::AbstractFifo. */
class WebMeteringFifo final {
public:
    WebMeteringFifo() : fifo (capacity), storage ((size_t) capacity) {}

    /** Realtime-safe when one thread calls this and one calls popLatestPeak(). */
    void pushPacket (float peak) noexcept
    {
        int b1 = 0, z1 = 0, b2 = 0, z2 = 0;
        fifo.prepareToWrite (1, b1, z1, b2, z2);
        if (z1 > 0)
        {
            storage[(size_t) b1] = peak;
            fifo.finishedWrite (1);
        }
        else if (z2 > 0)
        {
            storage[(size_t) b2] = peak;
            fifo.finishedWrite (1);
        }
    }

    std::optional<float> popLatestPeak() noexcept
    {
        float last = 0.f;
        bool any = false;
        for (;;)
        {
            int b1 = 0, z1 = 0, b2 = 0, z2 = 0;
            fifo.prepareToRead (1, b1, z1, b2, z2);
            if (z1 <= 0 && z2 <= 0)
                break;
            if (z1 > 0)
            {
                last = storage[(size_t) b1];
                fifo.finishedRead (1);
            }
            else if (z2 > 0)
            {
                last = storage[(size_t) b2];
                fifo.finishedRead (1);
            }
            any = true;
        }
        if (any)
            return last;
        return std::nullopt;
    }

private:
    static constexpr int capacity = 64;
    juce::AbstractFifo fifo;
    std::vector<float> storage;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (WebMeteringFifo)
};

} // namespace element
