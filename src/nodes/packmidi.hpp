// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <atomic>
#include <cstring>

#include <element/node.h>
#include <element/processor.hpp>

namespace element {

/** Converts 3 control-rate CV values into a MIDI CC message.
    Port layout:
      CV in 0 — gate:  when this rises above 0.5 a CC is emitted at that sample position
      CV in 1 — value: CC value, 0..1 mapped to 0..127
      CV in 2 — aux:   reserved / unused (present to match the 3-CV-in spec)
    Parameters: cc number (0–127), MIDI channel (1–16). */
class PackMidiNode : public Processor
{
public:
    PackMidiNode() : Processor (0)
    {
        setName ("Pack MIDI");
    }

    ~PackMidiNode() override = default;

    bool wantsContext() const noexcept override { return true; }

    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate, maxBufferSize);
        lastGateHigh = false;
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        auto* const outBuf = rc.midi.getWriteBuffer (0);
        if (outBuf == nullptr)
            return;

        const int numSamples = rc.cv.getNumSamples();
        const int numCvCh    = rc.cv.getNumChannels();
        if (numCvCh < 2 || numSamples <= 0)
            return;

        const float* const gateCh  = rc.cv.getReadPointer (0);
        const float* const valueCh = rc.cv.getReadPointer (1);

        const int cc = juce::jlimit (0, 127, ccNumber.load (std::memory_order_relaxed));
        const int ch = juce::jlimit (1, 16,  midiChannel.load (std::memory_order_relaxed));

        for (int i = 0; i < numSamples; ++i)
        {
            const bool gateHigh = gateCh[i] > 0.5f;
            if (gateHigh && ! lastGateHigh)
            {
                const int ccVal = juce::jlimit (0, 127,
                    static_cast<int> (valueCh[i] * 127.0f + 0.5f));
                outBuf->addEvent (juce::MidiMessage::controllerEvent (ch, cc, ccVal), i);
            }
            lastGateHigh = gateHigh;
        }
    }

    void getState (juce::MemoryBlock& block) override
    {
        const int cc = ccNumber.load    (std::memory_order_relaxed);
        const int ch = midiChannel.load (std::memory_order_relaxed);
        block.append (&cc, sizeof (cc));
        block.append (&ch, sizeof (ch));
    }

    void setState (const void* data, int size) override
    {
        if (size >= (int) (2 * sizeof (int)))
        {
            int cc = 0, ch = 1;
            std::memcpy (&cc, data, sizeof (cc));
            std::memcpy (&ch, static_cast<const char*> (data) + sizeof (cc), sizeof (ch));
            ccNumber.store    (juce::jlimit (0, 127, cc), std::memory_order_relaxed);
            midiChannel.store (juce::jlimit (1, 16, ch),  std::memory_order_relaxed);
        }
    }

    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier  = "element.packMidi";
        desc.uniqueId          = 0x706b6d69; // 'pkmi'
        desc.name              = "Pack MIDI";
        desc.descriptiveName   = "Convert CV values into a MIDI CC message";
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
        newPorts.add (PortType::CV,   index++, 0, "cv_gate",  "Gate",    true);
        newPorts.add (PortType::CV,   index++, 1, "cv_value", "Value",   true);
        newPorts.add (PortType::CV,   index++, 2, "cv_aux",   "Aux",     true);
        newPorts.add (PortType::Midi, index++, 0, "midi_out", "MIDI Out", false);
        setPorts (newPorts);
    }

    void setCcNumber (int cc) noexcept
    {
        ccNumber.store (juce::jlimit (0, 127, cc), std::memory_order_relaxed);
    }
    int  getCcNumber() const noexcept
    {
        return ccNumber.load (std::memory_order_relaxed);
    }
    void setMidiChannel (int ch) noexcept
    {
        midiChannel.store (juce::jlimit (1, 16, ch), std::memory_order_relaxed);
    }
    int  getMidiChannel() const noexcept
    {
        return midiChannel.load (std::memory_order_relaxed);
    }

private:
    /** All cross-thread params atomic — message thread writes, audio thread reads. */
    std::atomic<int>  ccNumber    { 0 };
    std::atomic<int>  midiChannel { 1 };
    /** Audio-thread-only state — no synchronisation needed. */
    bool lastGateHigh { false };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PackMidiNode)
};

} // namespace element
