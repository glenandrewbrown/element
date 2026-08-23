// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <atomic>
#include <cmath>
#include <cstring>

#include <element/node.h>
#include <element/processor.hpp>
#include <element/inlineparamcontrol.hpp>

namespace element {

/** Scales note-on velocity by a percentage factor and optional power curve.
    - scale: 0.0 = silent, 1.0 = unity (100%), 2.0 = double (200%)
    - power: exponent applied to normalised velocity before scaling;
             1.0 = linear, < 1.0 compresses dynamics, > 1.0 expands dynamics.
    Note-off events are passed through unchanged.
    All other messages pass through unchanged. */
class MidiVelocityAmpNode : public Processor, public InlineParamControl
{
public:
    MidiVelocityAmpNode() : Processor (0)
    {
        setName ("MIDI Velocity Amp");
    }

    ~MidiVelocityAmpNode() override = default;

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

        const float sc = scale.load (std::memory_order_relaxed);
        const float pw = power.load (std::memory_order_relaxed);
        if (sc == 1.0f && pw == 1.0f)
            return; // unity — pass through unchanged

        scratch.clear();
        for (const auto meta : *buf)
        {
            auto msg = meta.getMessage();
            if (msg.isNoteOn())
            {
                const float normVel = static_cast<float> (msg.getVelocity()) / 127.0f;
                const float curved  = std::pow (normVel, pw);
                const float scaled  = curved * sc;
                const int newVel    = juce::jlimit (0, 127,
                    static_cast<int> (scaled * 127.0f + 0.5f));
                msg = juce::MidiMessage::noteOn (msg.getChannel(),
                                                 msg.getNoteNumber(),
                                                 static_cast<uint8_t> (newVel));
            }
            scratch.addEvent (msg, meta.samplePosition);
        }

        buf->swapWith (scratch);
    }

    void getState (juce::MemoryBlock& block) override
    {
        const float s = scale.load (std::memory_order_relaxed);
        const float p = power.load (std::memory_order_relaxed);
        block.append (&s, sizeof (s));
        block.append (&p, sizeof (p));
    }

    void setState (const void* data, int size) override
    {
        if (size >= (int) (2 * sizeof (float)))
        {
            float s = 1.0f, p = 1.0f;
            std::memcpy (&s, data, sizeof (s));
            std::memcpy (&p, static_cast<const char*> (data) + sizeof (s), sizeof (p));
            scale.store (juce::jlimit (0.0f, 2.0f, s),  std::memory_order_relaxed);
            power.store (juce::jlimit (0.25f, 4.0f, p), std::memory_order_relaxed);
        }
    }

    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier  = "element.midiVelocityAmp";
        desc.uniqueId          = 0x6d766c61; // 'mvla'
        desc.name              = "MIDI Velocity Amp";
        desc.descriptiveName   = "Scale note-on velocity with optional power curve";
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

    /** Scale factor 0.0–2.0. Atomic relaxed for cross-thread safety. */
    void setScale (float s) noexcept
    {
        scale.store (juce::jlimit (0.0f, 2.0f, s), std::memory_order_relaxed);
    }
    float getScale() const noexcept
    {
        return scale.load (std::memory_order_relaxed);
    }

    /** Power curve exponent 0.25–4.0. Atomic relaxed for cross-thread safety. */
    void setPower (float p) noexcept
    {
        power.store (juce::jlimit (0.25f, 4.0f, p), std::memory_order_relaxed);
    }
    float getPower() const noexcept
    {
        return power.load (std::memory_order_relaxed);
    }

    // InlineParamControl
    bool setInlineParam (const juce::String& key, double value) override
    {
        if (key == "scale") { setScale ((float) value); return true; }
        if (key == "power") { setPower ((float) value); return true; }
        return false;
    }
    void getInlineParams (juce::Array<InlineParamInfo>& out) const override
    {
        out.add ({ "scale", "Scale", (double) getScale(), 0.0, 2.0, 0.01 });
        out.add ({ "power", "Power", (double) getPower(), 0.25, 4.0, 0.01 });
    }

private:
    std::atomic<float> scale { 1.0f }; ///< velocity scale factor, 0.0–2.0
    std::atomic<float> power { 1.0f }; ///< velocity curve power, 0.25–4.0
    juce::MidiBuffer scratch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MidiVelocityAmpNode)
};

} // namespace element
