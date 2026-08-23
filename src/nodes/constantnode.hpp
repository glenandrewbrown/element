// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/node.h>
#include <element/processor.hpp>

namespace element {

/** Outputs a fixed CV value set by a "value" parameter (-1.0 to 1.0).
    0 audio/MIDI ports. 1 CV output channel. ID: element.constant */
class ConstantNode : public Processor
{
public:
    ConstantNode() : Processor (0)
    {
        setName ("Constant");
    }

    ~ConstantNode() override = default;

    // =========================================================================
    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate, maxBufferSize);
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        if (rc.cv.getNumChannels() < 1)
            return;

        const int   n = rc.cv.getNumSamples();
        const float v = currentValue.load (std::memory_order_relaxed);
        auto* w = rc.cv.getWritePointer (0);
        for (int i = 0; i < n; ++i)
            w[i] = v;
    }

    // =========================================================================
    void getState (juce::MemoryBlock& block) override
    {
        const float v = currentValue.load (std::memory_order_relaxed);
        block.append (&v, sizeof (v));
    }

    void setState (const void* data, int sizeInBytes) override
    {
        if (sizeInBytes >= (int) sizeof (float))
            currentValue.store (*static_cast<const float*> (data),
                                std::memory_order_relaxed);
    }

    // =========================================================================
    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier  = "element.constant";
        desc.uniqueId          = 0x636e7374; // 'cnst'
        desc.name              = "Constant";
        desc.descriptiveName   = "Outputs a fixed CV value";
        desc.pluginFormatName  = EL_NODE_FORMAT_NAME;
        desc.manufacturerName  = EL_NODE_FORMAT_AUTHOR;
        desc.version           = "1.0.0";
        desc.hasSharedContainer = false;
        desc.isInstrument      = false;
        desc.numInputChannels  = 0;
        desc.numOutputChannels = 0;
    }

    void refreshPorts() override
    {
        PortList newPorts;
        newPorts.add (PortType::CV, 0, 0, "cv_out", "CV Out", false);
        setPorts (newPorts);
    }

    // =========================================================================
    /** Set the output value (thread-safe). Range: -1.0 to 1.0. */
    void setValue (float v) noexcept
    {
        currentValue.store (juce::jlimit (-1.0f, 1.0f, v),
                            std::memory_order_relaxed);
    }

    /** Get the current output value (thread-safe). */
    float getValue() const noexcept
    {
        return currentValue.load (std::memory_order_relaxed);
    }

private:
    std::atomic<float> currentValue { 0.0f };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ConstantNode)
};

} // namespace element
