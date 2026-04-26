// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/node.h>
#include <element/processor.hpp>

namespace element {

/** Passes CV input to output unchanged while latching the most-recent
    sample value into an atomic float, allowing the UI thread to read
    the current signal level without locking.

    Ports: 1 CV in (channel 0), 1 CV out (channel 0).
    ID: element.readout */
class ReadoutNode : public Processor
{
public:
    ReadoutNode() : Processor (0)
    {
        setName ("Readout");
    }

    ~ReadoutNode() override = default;

    // =========================================================================
    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate, maxBufferSize);
        displayValue.store (0.0f, std::memory_order_relaxed);
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        if (rc.cv.getNumChannels() < 2)
            return;

        const int    n   = rc.cv.getNumSamples();
        const float* in  = rc.cv.getReadPointer (0);
        float*       out = rc.cv.getWritePointer (1);

        float last = 0.0f;
        for (int i = 0; i < n; ++i)
        {
            last   = in[i];
            out[i] = last;
        }

        // Latch the last sample so the UI can poll it without locking.
        displayValue.store (last, std::memory_order_relaxed);
    }

    // =========================================================================
    void getState (juce::MemoryBlock&) override {}
    void setState (const void*, int) override {}

    // =========================================================================
    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier   = "element.readout";
        desc.uniqueId           = 0x656c7264; // 'elrd'
        desc.name               = "Readout";
        desc.descriptiveName    = "Pass-through CV with UI-readable value latch";
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
    /** Returns the most-recently rendered CV sample value (UI-thread safe). */
    float getCurrentDisplayValue() const noexcept
    {
        return displayValue.load (std::memory_order_relaxed);
    }

private:
    std::atomic<float> displayValue { 0.0f };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ReadoutNode)
};

} // namespace element
