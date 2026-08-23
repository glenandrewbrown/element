// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/node.h>
#include <element/processor.hpp>
#include <element/inlineparamcontrol.hpp>
#include <atomic>
#include <cmath>

namespace element {

/** Shifts all note-on and note-off MIDI messages by N semitones (-48 to +48).
    Notes that would fall outside 0–127 after transposition are dropped.
    All other MIDI messages pass through unchanged. */
class MidiTransposeNode : public Processor, public InlineParamControl
{
public:
    MidiTransposeNode() : Processor (0)
    {
        setName ("MIDI Transpose");
    }

    ~MidiTransposeNode() override = default;

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

        const int shift = semitones.load (std::memory_order_relaxed);
        if (shift == 0)
            return;

        scratch.clear();
        for (const auto meta : *buf)
        {
            auto msg = meta.getMessage();
            if (msg.isNoteOn() || msg.isNoteOff())
            {
                const int newNote = msg.getNoteNumber() + shift;
                if (newNote >= 0 && newNote <= 127)
                {
                    // Reconstruct message with transposed note number
                    const uint8_t status   = msg.getRawData()[0];
                    const uint8_t velocity = msg.getRawData()[2];
                    scratch.addEvent (juce::MidiMessage (status,
                                                         static_cast<uint8_t> (newNote),
                                                         velocity),
                                      meta.samplePosition);
                }
                // notes out of [0,127] are silently dropped
            }
            else
            {
                scratch.addEvent (msg, meta.samplePosition);
            }
        }

        buf->swapWith (scratch);
    }

    void getState (juce::MemoryBlock& block) override
    {
        const int val = semitones.load (std::memory_order_relaxed);
        block.append (&val, sizeof (val));
    }

    void setState (const void* data, int size) override
    {
        if (size >= (int) sizeof (int))
        {
            int val = 0;
            std::memcpy (&val, data, sizeof (val));
            semitones.store (juce::jlimit (-48, 48, val), std::memory_order_relaxed);
        }
    }

    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier  = "element.midiTranspose";
        desc.uniqueId          = 0x6d747270; // 'mtrp'
        desc.name              = "MIDI Transpose";
        desc.descriptiveName   = "Shift note-on/off events by N semitones";
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

    /** Set transpose amount in semitones, clamped to [-48, 48]. */
    void setSemitones (int n) noexcept { semitones.store (juce::jlimit (-48, 48, n), std::memory_order_relaxed); }
    int  getSemitones() const noexcept { return semitones.load (std::memory_order_relaxed); }

    // InlineParamControl
    bool setInlineParam (const juce::String& key, double value) override
    {
        if (key == "semitones") { setSemitones ((int) std::lround (value)); return true; }
        return false;
    }
    void getInlineParams (juce::Array<InlineParamInfo>& out) const override
    {
        out.add ({ "semitones", "Semitones", (double) getSemitones(), -48.0, 48.0, 1.0 });
    }

private:
    std::atomic<int> semitones { 0 };
    juce::MidiBuffer scratch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MidiTransposeNode)
};

} // namespace element
