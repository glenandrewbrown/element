// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <atomic>
#include <cmath>

#include <element/node.h>
#include <element/processor.hpp>

namespace element {

/** Rectified peak envelope follower: stereo audio in -> unipolar CV out.

    The audio -> condition bridge for conditional routing: "is signal present
    on this path?" Feed the CV out into a Comparator/Trigger to derive gates.

    Per sample the detector input is max(|L|, |R|); the envelope rises with
    the attack coefficient and falls with the release coefficient (classic
    one-pole). Attack/release are runtime-settable in milliseconds
    (thread-safe atomics; coefficients derived once per block).

    Ports: 2 audio in, 1 CV out (rc.cv channel 0).  ID: element.envFollower */
class EnvelopeFollowerNode : public Processor
{
public:
    EnvelopeFollowerNode() : Processor (0)
    {
        setName ("Envelope Follower");
    }

    ~EnvelopeFollowerNode() override = default;

    // =========================================================================
    void prepareToRender (double newSampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (maxBufferSize);
        sampleRate = newSampleRate > 0.0 ? newSampleRate : 44100.0;
        envelope = 0.0f;
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        if (rc.cv.getNumChannels() < 1 || rc.audio.getNumChannels() < 1)
            return;

        const int n = rc.audio.getNumSamples();
        const int numIns = juce::jmin (2, rc.audio.getNumChannels());

        // One-pole coefficients from the atomic ms params (per block — cheap).
        const float atkMs = attackMs.load (std::memory_order_relaxed);
        const float relMs = releaseMs.load (std::memory_order_relaxed);
        const float atk = coefficient (atkMs);
        const float rel = coefficient (relMs);

        const float* inL = rc.audio.getReadPointer (0);
        const float* inR = numIns > 1 ? rc.audio.getReadPointer (1) : nullptr;
        float* out = rc.cv.getWritePointer (0);

        float env = envelope;
        for (int i = 0; i < n; ++i)
        {
            float x = std::fabs (inL[i]);
            if (inR != nullptr)
                x = juce::jmax (x, std::fabs (inR[i]));

            const float coeff = x > env ? atk : rel;
            env += coeff * (x - env);
            out[i] = env;
        }
        envelope = env;
    }

    /** Bypass = no detection: zero the CV out; NEVER touch the audio inputs
        (they may be shared, un-copied buffers read by other nodes). */
    void renderBypassed (RenderContext& rc) override
    {
        if (rc.cv.getNumChannels() >= 1)
            rc.cv.clear (0, 0, rc.cv.getNumSamples());
    }

    // =========================================================================
    void getState (juce::MemoryBlock& block) override
    {
        const float a = attackMs.load (std::memory_order_relaxed);
        const float r = releaseMs.load (std::memory_order_relaxed);
        block.append (&a, sizeof (a));
        block.append (&r, sizeof (r));
    }

    void setState (const void* data, int sizeInBytes) override
    {
        if (sizeInBytes >= (int) (2 * sizeof (float)))
        {
            const auto* bytes = static_cast<const char*> (data);
            float a = 0.0f, r = 0.0f;
            memcpy (&a, bytes, sizeof (a));
            memcpy (&r, bytes + sizeof (a), sizeof (r));
            setAttackMs (a);
            setReleaseMs (r);
        }
    }

    // =========================================================================
    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier   = "element.envFollower";
        desc.uniqueId           = 0x656c6566; // 'elef'
        desc.name               = "Envelope Follower";
        desc.descriptiveName    = "Audio level -> CV envelope (signal-presence detector)";
        desc.pluginFormatName   = EL_NODE_FORMAT_NAME;
        desc.manufacturerName   = EL_NODE_FORMAT_AUTHOR;
        desc.version            = "1.0.0";
        desc.hasSharedContainer = false;
        desc.isInstrument       = false;
        desc.numInputChannels   = 2;
        desc.numOutputChannels  = 0;
    }

    void refreshPorts() override
    {
        PortList newPorts;
        newPorts.add (PortType::Audio, 0, 0, "audio_in_l", "In L", true);
        newPorts.add (PortType::Audio, 1, 1, "audio_in_r", "In R", true);
        newPorts.add (PortType::CV, 2, 0, "cv_out", "Env", false);
        setPorts (newPorts);
    }

    // =========================================================================
    /** Attack time in milliseconds (thread-safe; clamped 0.1 – 2000). */
    void setAttackMs (float ms) noexcept
    {
        attackMs.store (juce::jlimit (0.1f, 2000.0f, ms), std::memory_order_relaxed);
    }

    float getAttackMs() const noexcept { return attackMs.load (std::memory_order_relaxed); }

    /** Release time in milliseconds (thread-safe; clamped 1 – 5000). */
    void setReleaseMs (float ms) noexcept
    {
        releaseMs.store (juce::jlimit (1.0f, 5000.0f, ms), std::memory_order_relaxed);
    }

    float getReleaseMs() const noexcept { return releaseMs.load (std::memory_order_relaxed); }

private:
    float coefficient (float ms) const noexcept
    {
        const double t = juce::jmax (0.0001, (double) ms * 0.001);
        return (float) (1.0 - std::exp (-1.0 / (t * sampleRate)));
    }

    std::atomic<float> attackMs { 5.0f };
    std::atomic<float> releaseMs { 120.0f };
    double sampleRate { 44100.0 };
    float envelope { 0.0f }; // audio thread only

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EnvelopeFollowerNode)
};

} // namespace element
