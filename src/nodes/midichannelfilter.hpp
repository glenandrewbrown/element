// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <atomic>

#include <element/node.h>
#include <element/processor.hpp>

namespace element {

/** Passes or blocks MIDI messages based on a 16-bit channel mask.
    Bit 0 = channel 1, bit 15 = channel 16. Default: all channels enabled (0xFFFF). */
class MidiChannelFilterNode : public Processor
{
public:
    MidiChannelFilterNode() : Processor (0)
    {
        setName ("MIDI Channel Filter");
    }

    ~MidiChannelFilterNode() override = default;

    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate);
        scratch.ensureSize (static_cast<size_t> (maxBufferSize) * 3);
    }

    void releaseResources() override
    {
        scratch.clear();
    }

    void render (RenderContext& rc) override
    {
        auto* const buf = rc.midi.getWriteBuffer (0);
        if (buf == nullptr)
            return;

        const auto mask = channelMask.load (std::memory_order_relaxed);
        if (mask == 0xFFFF)
            return; // all channels pass — nothing to filter

        scratch.clear();
        for (const auto meta : *buf)
        {
            const auto msg = meta.getMessage();
            const int ch = msg.getChannel(); // 1–16, or 0 for non-channel msgs
            if (ch <= 0)
            {
                scratch.addEvent (msg, meta.samplePosition);
            }
            else
            {
                const auto bit = static_cast<uint16_t> (1u << (ch - 1));
                if (mask & bit)
                    scratch.addEvent (msg, meta.samplePosition);
            }
        }

        buf->swapWith (scratch);
    }

    void getState (juce::MemoryBlock& block) override
    {
        const uint16_t v = channelMask.load (std::memory_order_relaxed);
        block.append (&v, sizeof (v));
    }

    void setState (const void* data, int size) override
    {
        if (size >= (int) sizeof (uint16_t))
            channelMask.store (*static_cast<const uint16_t*> (data),
                               std::memory_order_relaxed);
    }

    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier  = "element.midiChannelFilter";
        desc.uniqueId          = 0x6d636866; // 'mchf'
        desc.name              = "MIDI Channel Filter";
        desc.descriptiveName   = "Pass or block specific MIDI channels";
        desc.numInputChannels  = 0;
        desc.numOutputChannels = 0;
        desc.hasSharedContainer = false;
        desc.isInstrument      = false;
        desc.manufacturerName  = EL_NODE_FORMAT_AUTHOR;
        desc.pluginFormatName  = EL_NODE_FORMAT_NAME;
        desc.version           = "1.0.0";
    }

    void refreshPorts() override
    {
        if (getNumPorts() > 0)
            return;
        PortList newPorts;
        int index = 0;
        newPorts.add (PortType::Midi, index++, 0, "midi_in",  "MIDI In",  true);
        newPorts.add (PortType::Midi, index++, 0, "midi_out", "MIDI Out", false);
        setPorts (newPorts);
    }

    /** Get/set the 16-bit channel mask (bit 0 = ch 1). RT-safe via atomic relaxed. */
    void setChannelMask (uint16_t mask) noexcept
    {
        channelMask.store (mask, std::memory_order_relaxed);
    }
    uint16_t getChannelMask() const noexcept
    {
        return channelMask.load (std::memory_order_relaxed);
    }

private:
    /** Bits 0-15 correspond to MIDI channels 1-16. Atomic so the audio thread
        cannot see torn writes from the message thread. */
    std::atomic<uint16_t> channelMask { 0xFFFF };
    juce::MidiBuffer scratch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MidiChannelFilterNode)
};

} // namespace element
