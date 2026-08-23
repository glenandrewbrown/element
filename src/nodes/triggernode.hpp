// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/node.h>
#include <element/processor.hpp>

namespace element {

/** Emits a 1.0 pulse on the rising edge of the input CV crossing a threshold,
    then 0.0 otherwise.  The threshold is configurable at runtime (thread-safe).

    Ports: 1 CV in (channel 0), 1 CV out (channel 0).
    ID: element.trigger */
class TriggerNode : public Processor
{
public:
    TriggerNode() : Processor (0)
    {
        setName ("Trigger");
    }

    ~TriggerNode() override = default;

    // =========================================================================
    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate, maxBufferSize);
        prevSample.store (0.0f, std::memory_order_relaxed);
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        if (rc.cv.getNumChannels() < 2)
            return;

        const int    n      = rc.cv.getNumSamples();
        const float  thresh = threshold.load (std::memory_order_relaxed);
        const float* in     = rc.cv.getReadPointer (0);
        float*       out    = rc.cv.getWritePointer (1);
        float        prev   = prevSample.load (std::memory_order_relaxed);

        for (int i = 0; i < n; ++i)
        {
            const float cur = in[i];
            // Rising edge: previous sample below threshold, current at or above.
            out[i] = (prev < thresh && cur >= thresh) ? 1.0f : 0.0f;
            prev = cur;
        }

        prevSample.store (prev, std::memory_order_relaxed);
    }

    // =========================================================================
    void getState (juce::MemoryBlock& block) override
    {
        const float t = threshold.load (std::memory_order_relaxed);
        block.append (&t, sizeof (t));
    }

    void setState (const void* data, int sizeInBytes) override
    {
        if (sizeInBytes >= (int) sizeof (float))
            threshold.store (
                juce::jlimit (0.0f, 1.0f, *static_cast<const float*> (data)),
                std::memory_order_relaxed);
    }

    // =========================================================================
    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier   = "element.trigger";
        desc.uniqueId           = 0x656c7472; // 'eltr'
        desc.name               = "Trigger";
        desc.descriptiveName    = "Emits a pulse on rising edge above threshold";
        desc.pluginFormatName   = EL_NODE_FORMAT_NAME;
        desc.manufacturerName   = EL_NODE_FORMAT_AUTHOR;
        desc.version            = "1.0.0";
        desc.hasSharedContainer = false;
        desc.isInstrument       = false;
        desc.numInputChannels   = 0;
        desc.numOutputChannels  = 0;
    }

    void refreshPorts() override
    {
        PortList newPorts;
        newPorts.add (PortType::CV, 0, 0, "cv_in",  "CV In",  true);
        newPorts.add (PortType::CV, 1, 0, "cv_out", "CV Out", false);
        setPorts (newPorts);
    }

    // =========================================================================
    /** Set the detection threshold (thread-safe). Range: 0.0 – 1.0. */
    void setThreshold (float t) noexcept
    {
        threshold.store (juce::jlimit (0.0f, 1.0f, t), std::memory_order_relaxed);
    }

    /** Get the current threshold (thread-safe). */
    float getThreshold() const noexcept
    {
        return threshold.load (std::memory_order_relaxed);
    }

private:
    std::atomic<float> threshold  { 0.5f };
    std::atomic<float> prevSample { 0.0f };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TriggerNode)
};

} // namespace element
