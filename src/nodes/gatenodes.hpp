// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <atomic>
#include <cmath>

#include <element/node.h>
#include <element/processor.hpp>

#include "engine/midipanic.hpp"

namespace element {

// =============================================================================
/** CV-keyed audio gate: passes audio while the "open" CV is high (>= 0.5).

    The gain target (0 or 1) is smoothed with a ~5ms linear ramp so opening /
    closing never clicks. Audio is processed IN PLACE (outputs share the input
    channels, standard audio in-place model).

    Ports: 2 audio in, 1 CV in ("open"), 2 audio out.  ID: element.audioGate */
class AudioGateNode : public Processor
{
public:
    AudioGateNode() : Processor (0)
    {
        setName ("Audio Gate");
    }

    ~AudioGateNode() override = default;

    static constexpr float rampSeconds = 0.005f;

    // =========================================================================
    void prepareToRender (double newSampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (maxBufferSize);
        const double sr = newSampleRate > 0.0 ? newSampleRate : 44100.0;
        rampStep = (float) (1.0 / (rampSeconds * sr));
        currentGain = 0.0f;
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        const int n = rc.audio.getNumSamples();
        const int numChans = juce::jmin (2, rc.audio.getNumChannels());
        if (numChans < 1)
            return;

        // CV "open" control: rc.cv channel 0 (the node's only CV input). When
        // the CV pool gave us no channel (defensive), treat as closed.
        const float* open = rc.cv.getNumChannels() > 0 ? rc.cv.getReadPointer (0) : nullptr;

        float g = currentGain;
        const float step = rampStep;

        for (int i = 0; i < n; ++i)
        {
            const float target = (open != nullptr && open[i] >= 0.5f) ? 1.0f : 0.0f;
            if (g < target)
                g = juce::jmin (target, g + step);
            else if (g > target)
                g = juce::jmax (target, g - step);

            for (int ch = 0; ch < numChans; ++ch)
                rc.audio.getWritePointer (ch)[i] *= g;
        }

        currentGain = g;
    }

    /** Bypass = gate fully open: audio passes untouched (in-place no-op). */
    void renderBypassed (RenderContext& rc) override
    {
        juce::ignoreUnused (rc);
        currentGain = 1.0f;
    }

    // =========================================================================
    void getState (juce::MemoryBlock&) override {}
    void setState (const void*, int) override {}

    // =========================================================================
    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier   = "element.audioGate";
        desc.uniqueId           = 0x656c6167; // 'elag'
        desc.name               = "Audio Gate";
        desc.descriptiveName    = "Passes audio while the open CV is high (click-free)";
        desc.pluginFormatName   = EL_NODE_FORMAT_NAME;
        desc.manufacturerName   = EL_NODE_FORMAT_AUTHOR;
        desc.version            = "1.0.0";
        desc.hasSharedContainer = false;
        desc.isInstrument       = false;
        desc.numInputChannels   = 2;
        desc.numOutputChannels  = 2;
    }

    void refreshPorts() override
    {
        PortList newPorts;
        newPorts.add (PortType::Audio, 0, 0, "audio_in_l", "In L", true);
        newPorts.add (PortType::Audio, 1, 1, "audio_in_r", "In R", true);
        newPorts.add (PortType::CV, 2, 0, "cv_open", "Open", true);
        newPorts.add (PortType::Audio, 3, 0, "audio_out_l", "Out L", false);
        newPorts.add (PortType::Audio, 4, 1, "audio_out_r", "Out R", false);
        setPorts (newPorts);
    }

private:
    float rampStep { 1.0f / (0.005f * 44100.0f) };
    float currentGain { 0.0f }; // audio thread only

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AudioGateNode)
};

// =============================================================================
/** CV-keyed MIDI gate: passes MIDI while the "open" CV is high (>= 0.5).

    Gating is per-event at the event's sample position against the CV buffer,
    so a mid-buffer close cannot leak a trailing note-on. On EVERY falling
    edge of the gate, panic messages (all-notes-off + all-sound-off, all 16
    channels) are written at that exact frame — a closed MIDI gate can never
    leave stuck notes downstream.

    MIDI is processed in place via the swap pattern (matches the built-in
    MIDI filter chain). tempMidi is pre-sized in prepareToRender; render()
    performs no allocation in the normal case.

    Ports: 1 MIDI in, 1 CV in ("open"), 1 MIDI out.  ID: element.midiGate */
class MidiGateNode : public Processor
{
public:
    MidiGateNode() : Processor (0)
    {
        setName ("MIDI Gate");
    }

    ~MidiGateNode() override = default;

    // =========================================================================
    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate, maxBufferSize);
        tempMidi.ensureSize (4096);
        tempMidi.clear();
        prevOpen = false;
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        if (rc.midi.getNumBuffers() < 1)
            return;

        auto& midi = *rc.midi.getWriteBuffer (0);
        const int n = rc.audio.getNumSamples() > 0 ? rc.audio.getNumSamples()
                                                   : (rc.cv.getNumSamples() > 0 ? rc.cv.getNumSamples() : 0);
        const float* open = rc.cv.getNumChannels() > 0 ? rc.cv.getReadPointer (0) : nullptr;

        tempMidi.clear();

        if (open == nullptr || n <= 0)
        {
            // No control signal: closed gate. Emit panic once on the
            // transition, then swallow everything.
            if (prevOpen)
                MidiPanic::write (tempMidi, 0);
            prevOpen = false;
            midi.swapWith (tempMidi);
            tempMidi.clear();
            return;
        }

        // Pass events whose sample position falls while the gate is open.
        for (const juce::MidiMessageMetadata m : midi)
        {
            const int pos = juce::jlimit (0, n - 1, m.samplePosition);
            if (open[pos] >= 0.5f)
                tempMidi.addEvent (m.data, m.numBytes, m.samplePosition);
        }

        // Sample-accurate falling-edge panic (covers mid-buffer closes).
        bool wasOpen = prevOpen;
        for (int i = 0; i < n; ++i)
        {
            const bool isOpen = open[i] >= 0.5f;
            if (wasOpen && ! isOpen)
                MidiPanic::write (tempMidi, i);
            wasOpen = isOpen;
        }
        prevOpen = wasOpen;

        midi.swapWith (tempMidi);
        tempMidi.clear();
    }

    /** Bypass = MIDI passes untouched (in-place no-op). */
    void renderBypassed (RenderContext& rc) override
    {
        juce::ignoreUnused (rc);
        prevOpen = true; // re-engaging from bypass with a low CV closes cleanly (panic fires)
    }

    // =========================================================================
    void getState (juce::MemoryBlock&) override {}
    void setState (const void*, int) override {}

    // =========================================================================
    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier   = "element.midiGate";
        desc.uniqueId           = 0x656c6d67; // 'elmg'
        desc.name               = "MIDI Gate";
        desc.descriptiveName    = "Passes MIDI while the open CV is high (panic on close)";
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
        newPorts.add (PortType::Midi, 0, 0, "midi_in", "MIDI In", true);
        newPorts.add (PortType::CV, 1, 0, "cv_open", "Open", true);
        newPorts.add (PortType::Midi, 2, 0, "midi_out", "MIDI Out", false);
        setPorts (newPorts);
    }

private:
    juce::MidiBuffer tempMidi;
    bool prevOpen { false }; // audio thread only

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MidiGateNode)
};

// =============================================================================
/** CV-keyed A/B audio switch: routes input pair A or B to the output with a
    ~5ms crossfade (sel < 0.5 -> A, sel >= 0.5 -> B).

    The output is written IN PLACE over input pair A's channels (0/1) — the
    audio in-place model — so bypass naturally passes A.

    Ports: 4 audio in (A L/R, B L/R), 1 CV in ("sel"), 2 audio out.
    ID: element.audioSwitch */
class AudioSwitchNode : public Processor
{
public:
    AudioSwitchNode() : Processor (0)
    {
        setName ("Audio Switch");
    }

    ~AudioSwitchNode() override = default;

    static constexpr float rampSeconds = 0.005f;

    // =========================================================================
    void prepareToRender (double newSampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (maxBufferSize);
        const double sr = newSampleRate > 0.0 ? newSampleRate : 44100.0;
        rampStep = (float) (1.0 / (rampSeconds * sr));
        mix = 0.0f;
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        const int n = rc.audio.getNumSamples();
        if (rc.audio.getNumChannels() < 4)
            return;

        const float* open = rc.cv.getNumChannels() > 0 ? rc.cv.getReadPointer (0) : nullptr;

        float* aL = rc.audio.getWritePointer (0);
        float* aR = rc.audio.getWritePointer (1);
        const float* bL = rc.audio.getReadPointer (2);
        const float* bR = rc.audio.getReadPointer (3);

        float m = mix;
        const float step = rampStep;

        for (int i = 0; i < n; ++i)
        {
            const float target = (open != nullptr && open[i] >= 0.5f) ? 1.0f : 0.0f;
            if (m < target)
                m = juce::jmin (target, m + step);
            else if (m > target)
                m = juce::jmax (target, m - step);

            aL[i] = aL[i] * (1.0f - m) + bL[i] * m;
            aR[i] = aR[i] * (1.0f - m) + bR[i] * m;
        }

        mix = m;
    }

    /** Bypass = pass input A: in-place no-op on channels 0/1. */
    void renderBypassed (RenderContext& rc) override
    {
        juce::ignoreUnused (rc);
        mix = 0.0f;
    }

    // =========================================================================
    void getState (juce::MemoryBlock&) override {}
    void setState (const void*, int) override {}

    // =========================================================================
    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier   = "element.audioSwitch";
        desc.uniqueId           = 0x656c7377; // 'elsw'
        desc.name               = "Audio Switch";
        desc.descriptiveName    = "CV-keyed A/B audio selector with crossfade";
        desc.pluginFormatName   = EL_NODE_FORMAT_NAME;
        desc.manufacturerName   = EL_NODE_FORMAT_AUTHOR;
        desc.version            = "1.0.0";
        desc.hasSharedContainer = false;
        desc.isInstrument       = false;
        desc.numInputChannels   = 4;
        desc.numOutputChannels  = 2;
    }

    void refreshPorts() override
    {
        PortList newPorts;
        newPorts.add (PortType::Audio, 0, 0, "audio_in_a_l", "A L", true);
        newPorts.add (PortType::Audio, 1, 1, "audio_in_a_r", "A R", true);
        newPorts.add (PortType::Audio, 2, 2, "audio_in_b_l", "B L", true);
        newPorts.add (PortType::Audio, 3, 3, "audio_in_b_r", "B R", true);
        newPorts.add (PortType::CV, 4, 0, "cv_sel", "A/B", true);
        newPorts.add (PortType::Audio, 5, 0, "audio_out_l", "Out L", false);
        newPorts.add (PortType::Audio, 6, 1, "audio_out_r", "Out R", false);
        setPorts (newPorts);
    }

private:
    float rampStep { 1.0f / (0.005f * 44100.0f) };
    float mix { 0.0f }; // audio thread only

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AudioSwitchNode)
};

} // namespace element
