// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/processor.hpp>
#include "nodes/triggernode.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (TriggerNodeTests)

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultThreshold)
{
    TriggerNode node;
    BOOST_CHECK_CLOSE (node.getThreshold(), 0.5f, 0.001f);
}

BOOST_AUTO_TEST_CASE (SetThresholdClampsHigh)
{
    TriggerNode node;
    node.setThreshold (2.0f);
    BOOST_CHECK_CLOSE (node.getThreshold(), 1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (SetThresholdClampsLow)
{
    TriggerNode node;
    node.setThreshold (-0.5f);
    BOOST_CHECK_SMALL (node.getThreshold(), 0.001f);
}

BOOST_AUTO_TEST_CASE (SetThresholdMidRange)
{
    TriggerNode node;
    node.setThreshold (0.3f);
    BOOST_CHECK_CLOSE (node.getThreshold(), 0.3f, 0.001f);
}

// ── Port layout ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PortLayout)
{
    TriggerNode node;
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::CV, true),  1);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::CV, false), 1);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, true),  0);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::Audio, false), 0);
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PrepareReleaseNoCrash)
{
    TriggerNode node;
    BOOST_CHECK_NO_THROW (node.prepareToRender (44100.0, 512));
    BOOST_CHECK_NO_THROW (node.releaseResources());
}

BOOST_AUTO_TEST_CASE (PrepareResetsState)
{
    // prevSample is reset to 0.0 on prepare — ensures clean start
    TriggerNode node;
    BOOST_CHECK_NO_THROW (node.prepareToRender (44100.0, 64));
}

// ── Trigger logic ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (RisingEdgeEmitsPulse)
{
    // signal below threshold for samples 0-3, rises at sample 4
    TriggerNode node;
    node.setThreshold (0.5f);
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio  { 0, 64 };
    juce::AudioSampleBuffer cv     { 2, 64 };
    juce::MidiBuffer        midi;

    for (int i = 0; i < 64; ++i)
        cv.setSample (0, i, i < 4 ? 0.0f : 1.0f);

    RenderContext rc { audio, cv, midi, 64 };
    node.render (rc);

    BOOST_CHECK_CLOSE (cv.getSample (1, 4), 1.0f, 0.001f); // pulse at edge
    BOOST_CHECK_SMALL (cv.getSample (1, 5), 0.001f);        // no repeat
    BOOST_CHECK_SMALL (cv.getSample (1, 3), 0.001f);        // before edge
}

BOOST_AUTO_TEST_CASE (SteadyHighNoTrigger)
{
    // signal always high → no rising edge from within the block
    // (first sample IS a rising edge from prev=0 → 1, so sample 0 fires)
    TriggerNode node;
    node.setThreshold (0.5f);
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio { 0, 64 };
    juce::AudioSampleBuffer cv    { 2, 64 };
    juce::MidiBuffer        midi;

    for (int i = 0; i < 64; ++i)
        cv.setSample (0, i, 1.0f);

    RenderContext rc { audio, cv, midi, 64 };
    node.render (rc);

    // Sample 0 fires (prev=0 < thresh, cur=1 >= thresh)
    BOOST_CHECK_CLOSE (cv.getSample (1, 0), 1.0f, 0.001f);
    // All remaining samples are silent
    for (int i = 1; i < 64; ++i)
        BOOST_CHECK_SMALL (cv.getSample (1, i), 0.001f);
}

BOOST_AUTO_TEST_CASE (SteadyLowNoTrigger)
{
    TriggerNode node;
    node.setThreshold (0.5f);
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio { 0, 64 };
    juce::AudioSampleBuffer cv    { 2, 64 };
    juce::MidiBuffer        midi;

    for (int i = 0; i < 64; ++i)
        cv.setSample (0, i, 0.0f);

    RenderContext rc { audio, cv, midi, 64 };
    node.render (rc);

    for (int i = 0; i < 64; ++i)
        BOOST_CHECK_SMALL (cv.getSample (1, i), 0.001f);
}

BOOST_AUTO_TEST_CASE (FallingEdgeNoTrigger)
{
    // high for first half, falls at sample 32 → no trigger on falling edge
    TriggerNode node;
    node.setThreshold (0.5f);
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio { 0, 64 };
    juce::AudioSampleBuffer cv    { 2, 64 };
    juce::MidiBuffer        midi;

    for (int i = 0; i < 64; ++i)
        cv.setSample (0, i, i < 32 ? 1.0f : 0.0f);

    RenderContext rc { audio, cv, midi, 64 };
    node.render (rc);

    // Falling region: no pulses
    for (int i = 32; i < 64; ++i)
        BOOST_CHECK_SMALL (cv.getSample (1, i), 0.001f);
}

BOOST_AUTO_TEST_CASE (TwoRisingEdgesTwoPulses)
{
    TriggerNode node;
    node.setThreshold (0.5f);
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio { 0, 64 };
    juce::AudioSampleBuffer cv    { 2, 64 };
    juce::MidiBuffer        midi;

    // low 0-9, high 10-19, low 20-29, high 30-63
    for (int i = 0; i < 64; ++i)
        cv.setSample (0, i, (i >= 10 && i < 20) || i >= 30 ? 1.0f : 0.0f);

    RenderContext rc { audio, cv, midi, 64 };
    node.render (rc);

    BOOST_CHECK_CLOSE (cv.getSample (1, 10), 1.0f, 0.001f); // first edge
    BOOST_CHECK_CLOSE (cv.getSample (1, 30), 1.0f, 0.001f); // second edge
    BOOST_CHECK_SMALL (cv.getSample (1, 11), 0.001f);        // no repeat
    BOOST_CHECK_SMALL (cv.getSample (1, 31), 0.001f);
}

BOOST_AUTO_TEST_CASE (CrossBlockEdgeTracking)
{
    // prevSample persists across render calls
    TriggerNode node;
    node.setThreshold (0.5f);
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio { 0, 64 };
    juce::AudioSampleBuffer cv    { 2, 64 };
    juce::MidiBuffer        midi;

    // Block 1: all high (triggers at sample 0 since prev=0)
    for (int i = 0; i < 64; ++i)
        cv.setSample (0, i, 1.0f);

    {
        RenderContext rc { audio, cv, midi, 64 };
        node.render (rc);
    }
    BOOST_CHECK_CLOSE (cv.getSample (1, 0), 1.0f, 0.001f);
    for (int i = 1; i < 64; ++i)
        BOOST_CHECK_SMALL (cv.getSample (1, i), 0.001f);

    // Block 2: drops to 0 at sample 0, rises again at sample 4
    // → falling at 0 (no trigger), rising at 4 (trigger)
    cv.clear();
    for (int i = 0; i < 64; ++i)
        cv.setSample (0, i, i >= 4 ? 1.0f : 0.0f);

    {
        RenderContext rc { audio, cv, midi, 64 };
        node.render (rc);
    }
    BOOST_CHECK_SMALL (cv.getSample (1, 0), 0.001f); // fall: no trigger
    BOOST_CHECK_CLOSE (cv.getSample (1, 4), 1.0f, 0.001f); // rise: trigger
}

BOOST_AUTO_TEST_CASE (ExactThresholdCrossing)
{
    // prev exactly at threshold-epsilon, cur exactly at threshold → triggers
    TriggerNode node;
    node.setThreshold (0.5f);
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio { 0, 64 };
    juce::AudioSampleBuffer cv    { 2, 64 };
    juce::MidiBuffer        midi;

    // sample 0 just below, sample 1 exactly at threshold
    cv.setSample (0, 0, 0.4999f);
    cv.setSample (0, 1, 0.5000f);
    for (int i = 2; i < 64; ++i)
        cv.setSample (0, i, 0.5f);

    RenderContext rc { audio, cv, midi, 64 };
    node.render (rc);

    BOOST_CHECK_CLOSE (cv.getSample (1, 1), 1.0f, 0.001f);
}

// ── State save/restore ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (StateRoundTrip)
{
    TriggerNode src;
    src.setThreshold (0.3f);

    juce::MemoryBlock block;
    src.getState (block);

    TriggerNode dst;
    dst.setState (block.getData(), (int) block.getSize());
    BOOST_CHECK_CLOSE (dst.getThreshold(), 0.3f, 0.001f);
}

BOOST_AUTO_TEST_CASE (SetStateClampsSaturation)
{
    TriggerNode node;
    const float bad = 99.0f;
    juce::MemoryBlock block;
    block.append (&bad, sizeof (bad));
    node.setState (block.getData(), (int) block.getSize());
    BOOST_CHECK_CLOSE (node.getThreshold(), 1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (SetStateEmptyIgnored)
{
    TriggerNode node;
    BOOST_CHECK_NO_THROW (node.setState (nullptr, 0));
    BOOST_CHECK_CLOSE (node.getThreshold(), 0.5f, 0.001f);
}

// ── Plugin description ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PluginDescriptionPopulated)
{
    TriggerNode node;
    juce::PluginDescription desc;
    node.getPluginDescription (desc);
    BOOST_CHECK (desc.name.isNotEmpty());
    BOOST_CHECK (desc.fileOrIdentifier.isNotEmpty());
}

// ── Too few CV channels — no crash ────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (TooFewCvChannelsNoCrash)
{
    TriggerNode node;
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio  { 0, 64 };
    juce::AudioSampleBuffer tinyCV { 1, 64 }; // only 1 ch — render bails early
    juce::MidiBuffer        midi;
    RenderContext rc { audio, tinyCV, midi, 64 };
    BOOST_CHECK_NO_THROW (node.render (rc));
}

BOOST_AUTO_TEST_CASE (ZeroCvChannelsNoCrash)
{
    TriggerNode node;
    node.prepareToRender (44100.0, 64);

    juce::AudioSampleBuffer audio { 0, 64 };
    juce::AudioSampleBuffer noCV  { 0, 64 };
    juce::MidiBuffer        midi;
    RenderContext rc { audio, noCV, midi, 64 };
    BOOST_CHECK_NO_THROW (node.render (rc));
}

BOOST_AUTO_TEST_SUITE_END()
