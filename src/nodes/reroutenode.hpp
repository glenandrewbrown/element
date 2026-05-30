// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/node.h>
#include <element/processor.hpp>

namespace element {

/** A simple pass-through node used for visual cable routing.
    Like reroute nodes in Blender/Unreal, this allows users to add
    waypoints along cables to improve visual organization.
*/
class RerouteNode : public Processor
{
public:
    enum Mode
    {
        Audio = 0,
        Midi = 1,
        AudioAndMidi = 2
    };

    explicit RerouteNode (Mode m = AudioAndMidi)
        : Processor (0), mode (m)
    {
        setName ("Reroute");
    }

    ~RerouteNode() override = default;

    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate, maxBufferSize);
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        // Simple pass-through - just copy input to output
        auto& audio = rc.audio;
        auto& midi = rc.midi;

        // Audio pass-through
        if (mode == Audio || mode == AudioAndMidi)
        {
            // Audio is already in the buffer, no processing needed
            // The graph routing handles the actual signal flow
        }

        // MIDI pass-through
        if (mode == Midi || mode == AudioAndMidi)
        {
            // MIDI is already handled by the graph routing
        }

        juce::ignoreUnused (audio, midi);
    }

    void getState (juce::MemoryBlock& block) override
    {
        block.append (&mode, sizeof (Mode));
    }

    void setState (const void* data, int size) override
    {
        if (size >= (int) sizeof (Mode))
            mode = *static_cast<const Mode*> (data);
    }

    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier = EL_NODE_ID_REROUTE;
        desc.name = "Reroute";
        desc.descriptiveName = "Cable routing waypoint for visual organization";
        desc.numInputChannels = (mode == Audio || mode == AudioAndMidi) ? 2 : 0;
        desc.numOutputChannels = (mode == Audio || mode == AudioAndMidi) ? 2 : 0;
        desc.hasSharedContainer = false;
        desc.isInstrument = false;
        desc.manufacturerName = EL_NODE_FORMAT_AUTHOR;
        desc.pluginFormatName = "Element";
        desc.version = "1.0.0";
        desc.uniqueId = EL_NODE_UID_REROUTE;
    }

    void refreshPorts() override
    {
        PortList newPorts;
        int index = 0;

        if (mode == Audio || mode == AudioAndMidi)
        {
            // Stereo audio in/out
            newPorts.add (PortType::Audio, index++, 0, "audio_in_l", "Audio In L", true);
            newPorts.add (PortType::Audio, index++, 1, "audio_in_r", "Audio In R", true);
            newPorts.add (PortType::Audio, index++, 0, "audio_out_l", "Audio Out L", false);
            newPorts.add (PortType::Audio, index++, 1, "audio_out_r", "Audio Out R", false);
        }

        if (mode == Midi || mode == AudioAndMidi)
        {
            // MIDI in/out
            newPorts.add (PortType::Midi, index++, 0, "midi_in", "MIDI In", true);
            newPorts.add (PortType::Midi, index++, 0, "midi_out", "MIDI Out", false);
        }

        setPorts (newPorts);
    }

    Mode getMode() const noexcept { return mode; }
    void setMode (Mode m)
    {
        if (mode != m)
        {
            mode = m;
            refreshPorts();
        }
    }

private:
    Mode mode { AudioAndMidi };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (RerouteNode)
};

/** Audio-only reroute node */
class AudioRerouteNode : public RerouteNode
{
public:
    AudioRerouteNode() : RerouteNode (Audio)
    {
        setName ("Audio Reroute");
    }

    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        RerouteNode::getPluginDescription (desc);
        desc.fileOrIdentifier = EL_NODE_ID_AUDIO_REROUTE;
        desc.name = "Audio Reroute";
        desc.descriptiveName = "Audio cable routing waypoint";
        desc.uniqueId = EL_NODE_UID_AUDIO_REROUTE;
    }
};

/** MIDI-only reroute node */
class MidiRerouteNode : public RerouteNode
{
public:
    MidiRerouteNode() : RerouteNode (Midi)
    {
        setName ("MIDI Reroute");
    }

    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        RerouteNode::getPluginDescription (desc);
        desc.fileOrIdentifier = EL_NODE_ID_MIDI_REROUTE;
        desc.name = "MIDI Reroute";
        desc.descriptiveName = "MIDI cable routing waypoint";
        desc.uniqueId = EL_NODE_UID_MIDI_REROUTE;
    }
};

} // namespace element
