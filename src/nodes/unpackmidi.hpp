// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/node.h>
#include <element/processor.hpp>

namespace element {

/** Extracts CC value, pitch-bend, and channel pressure from MIDI and
    outputs them as three normalised CV signals (0..1).
    Port layout:
      MIDI in 0  — source MIDI stream
      CV out 0   — CC value (parameter: cc number, channel); 0..1
      CV out 1   — pitch-bend; 0.0 = min, 0.5 = centre, 1.0 = max
      CV out 2   — channel pressure; 0..1
    The last seen value is held across blocks (sample-and-hold). */
class UnpackMidiNode : public Processor
{
public:
    UnpackMidiNode() : Processor (0)
    {
        setName ("Unpack MIDI");
    }

    ~UnpackMidiNode() override = default;

    bool wantsContext() const noexcept override { return true; }

    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate, maxBufferSize);
        // Initialise to neutral values
        lastCcNorm   = 0.0f;
        lastPbNorm   = 0.5f; // pitch-bend centre
        lastAtNorm   = 0.0f;
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        const auto* const inBuf = rc.midi.getReadBuffer (0);
        if (inBuf != nullptr && ! inBuf->isEmpty())
        {
            const int cc = juce::jlimit (0, 127, ccNumber);
            const int ch = juce::jlimit (1, 16,  midiChannel);

            for (const auto meta : *inBuf)
            {
                const auto msg = meta.getMessage();
                if (msg.getChannel() != ch)
                    continue;

                if (msg.isController() && msg.getControllerNumber() == cc)
                    lastCcNorm = static_cast<float> (msg.getControllerValue()) / 127.0f;
                else if (msg.isPitchWheel())
                    lastPbNorm = static_cast<float> (msg.getPitchWheelValue()) / 16383.0f;
                else if (msg.isChannelPressure())
                    lastAtNorm = static_cast<float> (msg.getChannelPressureValue()) / 127.0f;
            }
        }

        // Fill CV output channels with the last-seen value (sample-and-hold).
        const int numCvCh    = rc.cv.getNumChannels();
        const int numSamples = rc.cv.getNumSamples();

        if (numCvCh > 0)
            juce::FloatVectorOperations::fill (rc.cv.getWritePointer (0), lastCcNorm, numSamples);
        if (numCvCh > 1)
            juce::FloatVectorOperations::fill (rc.cv.getWritePointer (1), lastPbNorm, numSamples);
        if (numCvCh > 2)
            juce::FloatVectorOperations::fill (rc.cv.getWritePointer (2), lastAtNorm, numSamples);
    }

    void getState (juce::MemoryBlock& block) override
    {
        block.append (&ccNumber,   sizeof (ccNumber));
        block.append (&midiChannel, sizeof (midiChannel));
    }

    void setState (const void* data, int size) override
    {
        if (size >= (int) (2 * sizeof (int)))
        {
            int cc = 0, ch = 1;
            std::memcpy (&cc, data, sizeof (cc));
            std::memcpy (&ch, static_cast<const char*> (data) + sizeof (cc), sizeof (ch));
            ccNumber    = juce::jlimit (0, 127, cc);
            midiChannel = juce::jlimit (1, 16, ch);
        }
    }

    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier  = "element.unpackMidi";
        desc.uniqueId          = 0x756b6d69; // 'ukmi'
        desc.name              = "Unpack MIDI";
        desc.descriptiveName   = "Extract CC, pitch-bend, channel pressure as CV";
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
        newPorts.add (PortType::Midi, index++, 0, "midi_in",       "MIDI In",       true);
        newPorts.add (PortType::CV,   index++, 0, "cv_cc",         "CC Value",      false);
        newPorts.add (PortType::CV,   index++, 1, "cv_pitchbend",  "Pitch Bend",    false);
        newPorts.add (PortType::CV,   index++, 2, "cv_pressure",   "Ch. Pressure",  false);
        setPorts (newPorts);
    }

    void setCcNumber (int cc) noexcept    { ccNumber    = juce::jlimit (0, 127, cc); }
    int  getCcNumber() const noexcept     { return ccNumber; }
    void setMidiChannel (int ch) noexcept { midiChannel = juce::jlimit (1, 16, ch); }
    int  getMidiChannel() const noexcept  { return midiChannel; }

private:
    int   ccNumber    { 0 };
    int   midiChannel { 1 };

    // Last-seen CV values — only accessed on the audio thread, no atomics needed.
    float lastCcNorm  { 0.0f };
    float lastPbNorm  { 0.5f };
    float lastAtNorm  { 0.0f };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (UnpackMidiNode)
};

} // namespace element
