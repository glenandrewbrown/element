// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Unit tests for the conditional/logic routing node family
// (plan: logic-routing-flow-debug-2026-06-05, Wave 1).
//
// NOTE: these are direct-render unit tests (hand-built RenderContext). The
// built-graph signal-flow proof lives in CVFlowTests.cpp — BOTH must pass;
// unit-green alone proved nothing when the CV graph path was dead.

#include <boost/test/unit_test.hpp>

#include <element/processor.hpp>

#include "nodes/logicnodes.hpp"
#include "nodes/envfollowernode.hpp"
#include "nodes/gatenodes.hpp"

using namespace element;

namespace {

constexpr int kN = 512;

struct CvHarness
{
    juce::AudioSampleBuffer audio { 2, kN };
    juce::AudioSampleBuffer cv { 3, kN };
    juce::MidiBuffer midi;

    CvHarness()
    {
        audio.clear();
        cv.clear();
    }

    RenderContext context()
    {
        return RenderContext (audio, cv, midi, kN);
    }

    void fillCv (int chan, float value)
    {
        for (int i = 0; i < kN; ++i)
            cv.setSample (chan, i, value);
    }
};

} // namespace

// ===========================================================================
BOOST_AUTO_TEST_SUITE (LogicNodesTest)

// --- Comparator -----------------------------------------------------------

BOOST_AUTO_TEST_CASE (comparator_all_operators)
{
    struct Case
    {
        ComparatorNode::Op op;
        float a, b;
        bool expect;
    };
    const Case cases[] = {
        { ComparatorNode::Op::greater, 0.6f, 0.5f, true },
        { ComparatorNode::Op::greater, 0.5f, 0.5f, false },
        { ComparatorNode::Op::greaterEqual, 0.5f, 0.5f, true },
        { ComparatorNode::Op::greaterEqual, 0.4f, 0.5f, false },
        { ComparatorNode::Op::less, 0.4f, 0.5f, true },
        { ComparatorNode::Op::less, 0.5f, 0.5f, false },
        { ComparatorNode::Op::lessEqual, 0.5f, 0.5f, true },
        { ComparatorNode::Op::lessEqual, 0.6f, 0.5f, false },
        { ComparatorNode::Op::equal, 0.5f, 0.5f, true },
        { ComparatorNode::Op::equal, 0.6f, 0.5f, false },
        { ComparatorNode::Op::notEqual, 0.6f, 0.5f, true },
        { ComparatorNode::Op::notEqual, 0.5f, 0.5f, false },
    };

    for (const auto& c : cases)
    {
        ComparatorNode node;
        node.setRenderDetails (44100.0, kN);
        node.prepareToRender (44100.0, kN);
        node.setOperator (c.op);

        CvHarness h;
        h.fillCv (0, c.a);
        h.fillCv (1, c.b);
        auto rc = h.context();
        node.render (rc);

        BOOST_CHECK_MESSAGE (h.cv.getSample (2, 0) == (c.expect ? 1.0f : 0.0f),
                             "op=" << (int) c.op << " a=" << c.a << " b=" << c.b);
        BOOST_CHECK_MESSAGE (h.cv.getSample (2, kN - 1) == (c.expect ? 1.0f : 0.0f),
                             "op=" << (int) c.op << " (last sample)");
        node.releaseResources();
    }
}

// G2: state round-trip preserves operator + epsilon.
BOOST_AUTO_TEST_CASE (comparator_state_round_trip)
{
    ComparatorNode a;
    a.setOperator (ComparatorNode::Op::lessEqual);
    a.setEpsilon (0.025f);

    juce::MemoryBlock state;
    a.getState (state);
    BOOST_REQUIRE_GT ((int) state.getSize(), 0);

    ComparatorNode b;
    b.setState (state.getData(), (int) state.getSize());
    BOOST_CHECK ((int) b.getOperator() == (int) ComparatorNode::Op::lessEqual);
    BOOST_CHECK_CLOSE (b.getEpsilon(), 0.025f, 0.001);
}

// Bypassed comparator emits 0 (condition false), inputs untouched.
BOOST_AUTO_TEST_CASE (comparator_bypass_outputs_zero)
{
    ComparatorNode node;
    node.prepareToRender (44100.0, kN);
    CvHarness h;
    h.fillCv (0, 1.0f);
    h.fillCv (1, 0.0f);
    h.fillCv (2, 0.7f); // stale garbage in the out channel
    auto rc = h.context();
    node.renderBypassed (rc);
    BOOST_CHECK_EQUAL (h.cv.getSample (2, 0), 0.0f);
    BOOST_CHECK_EQUAL (h.cv.getSample (0, 0), 1.0f); // input untouched
}

// --- Logic gate ------------------------------------------------------------

BOOST_AUTO_TEST_CASE (logic_all_modes_truth_table)
{
    struct Case
    {
        LogicGateNode::Mode mode;
        bool a, b, expect;
    };
    const Case cases[] = {
        { LogicGateNode::Mode::andMode, true, true, true },
        { LogicGateNode::Mode::andMode, true, false, false },
        { LogicGateNode::Mode::orMode, false, true, true },
        { LogicGateNode::Mode::orMode, false, false, false },
        { LogicGateNode::Mode::xorMode, true, false, true },
        { LogicGateNode::Mode::xorMode, true, true, false },
        { LogicGateNode::Mode::nandMode, true, true, false },
        { LogicGateNode::Mode::nandMode, false, true, true },
        { LogicGateNode::Mode::norMode, false, false, true },
        { LogicGateNode::Mode::norMode, true, false, false },
        { LogicGateNode::Mode::notMode, true, false, false },
        { LogicGateNode::Mode::notMode, false, true, true }, // B ignored
    };

    for (const auto& c : cases)
    {
        LogicGateNode node;
        node.prepareToRender (44100.0, kN);
        node.setMode (c.mode);

        CvHarness h;
        h.fillCv (0, c.a ? 1.0f : 0.0f);
        h.fillCv (1, c.b ? 1.0f : 0.0f);
        auto rc = h.context();
        node.render (rc);

        BOOST_CHECK_MESSAGE (h.cv.getSample (2, 0) == (c.expect ? 1.0f : 0.0f),
                             "mode=" << (int) c.mode << " a=" << c.a << " b=" << c.b);
        node.releaseResources();
    }
}

BOOST_AUTO_TEST_CASE (logic_state_round_trip)
{
    LogicGateNode a;
    a.setMode (LogicGateNode::Mode::norMode);
    juce::MemoryBlock state;
    a.getState (state);

    LogicGateNode b;
    b.setState (state.getData(), (int) state.getSize());
    BOOST_CHECK ((int) b.getMode() == (int) LogicGateNode::Mode::norMode);
}

// 0.5 boundary: input exactly at threshold counts as true.
BOOST_AUTO_TEST_CASE (logic_threshold_boundary)
{
    LogicGateNode node;
    node.prepareToRender (44100.0, kN);
    node.setMode (LogicGateNode::Mode::andMode);
    CvHarness h;
    h.fillCv (0, 0.5f);
    h.fillCv (1, 0.5f);
    auto rc = h.context();
    node.render (rc);
    BOOST_CHECK_EQUAL (h.cv.getSample (2, 0), 1.0f);
}

// --- Envelope follower ------------------------------------------------------

BOOST_AUTO_TEST_CASE (envfollower_rises_with_signal_and_decays)
{
    EnvelopeFollowerNode node;
    node.setRenderDetails (44100.0, kN);
    node.prepareToRender (44100.0, kN);
    node.setAttackMs (1.0f);
    node.setReleaseMs (50.0f);

    CvHarness h;
    // Full-scale square input on both channels.
    for (int i = 0; i < kN; ++i)
    {
        h.audio.setSample (0, i, 1.0f);
        h.audio.setSample (1, i, -1.0f);
    }
    auto rc = h.context();
    node.render (rc);

    const float afterSignal = h.cv.getSample (0, kN - 1);
    BOOST_CHECK_GT (afterSignal, 0.9f); // 1ms attack over ~11.6ms of signal

    // Silence: envelope must decay monotonically toward zero.
    h.audio.clear();
    auto rc2 = h.context();
    node.render (rc2);
    const float afterSilence = h.cv.getSample (0, kN - 1);
    BOOST_CHECK_LT (afterSilence, afterSignal);

    // Long silence drains it to ~0.
    for (int blocks = 0; blocks < 40; ++blocks)
    {
        auto rcn = h.context();
        node.render (rcn);
    }
    BOOST_CHECK_SMALL (h.cv.getSample (0, kN - 1), 1.0e-3f);
}

BOOST_AUTO_TEST_CASE (envfollower_state_round_trip)
{
    EnvelopeFollowerNode a;
    a.setAttackMs (12.0f);
    a.setReleaseMs (345.0f);
    juce::MemoryBlock state;
    a.getState (state);

    EnvelopeFollowerNode b;
    b.setState (state.getData(), (int) state.getSize());
    BOOST_CHECK_CLOSE (b.getAttackMs(), 12.0f, 0.001);
    BOOST_CHECK_CLOSE (b.getReleaseMs(), 345.0f, 0.001);
}

// --- Audio gate --------------------------------------------------------------

BOOST_AUTO_TEST_CASE (audiogate_closed_silences_open_passes)
{
    AudioGateNode node;
    node.setRenderDetails (44100.0, kN);
    node.prepareToRender (44100.0, kN);

    // Closed (CV low): output must be fully silent once the ramp settles —
    // the gate starts at gain 0, so the very first block is already silent.
    CvHarness h;
    for (int i = 0; i < kN; ++i)
    {
        h.audio.setSample (0, i, 1.0f);
        h.audio.setSample (1, i, 1.0f);
    }
    h.fillCv (0, 0.0f);
    auto rc = h.context();
    node.render (rc);
    BOOST_CHECK_SMALL (h.audio.getRMSLevel (0, 0, kN), 1.0e-6f);

    // Open (CV high): after the 5ms ramp (~221 samples @44.1k) gain is 1.
    for (int i = 0; i < kN; ++i)
    {
        h.audio.setSample (0, i, 1.0f);
        h.audio.setSample (1, i, 1.0f);
    }
    h.fillCv (0, 1.0f);
    auto rc2 = h.context();
    node.render (rc2);
    BOOST_CHECK_CLOSE (h.audio.getSample (0, kN - 1), 1.0f, 0.1);
    // Ramp must be monotonic non-decreasing while opening.
    float prev = -1.0f;
    bool monotonic = true;
    for (int i = 0; i < kN; ++i)
    {
        const float s = h.audio.getSample (0, i);
        if (s + 1.0e-6f < prev)
            monotonic = false;
        prev = s;
    }
    BOOST_CHECK (monotonic);
}

BOOST_AUTO_TEST_CASE (audiogate_bypass_passes_audio)
{
    AudioGateNode node;
    node.prepareToRender (44100.0, kN);
    CvHarness h;
    for (int i = 0; i < kN; ++i)
        h.audio.setSample (0, i, 0.7f);
    h.fillCv (0, 0.0f); // control demands closed — bypass overrides
    auto rc = h.context();
    node.renderBypassed (rc);
    BOOST_CHECK_CLOSE (h.audio.getSample (0, kN - 1), 0.7f, 0.001);
}

// --- MIDI gate ----------------------------------------------------------------

BOOST_AUTO_TEST_CASE (midigate_open_passes_closed_drops)
{
    MidiGateNode node;
    node.setRenderDetails (44100.0, kN);
    node.prepareToRender (44100.0, kN);

    // Open: events pass.
    {
        juce::AudioSampleBuffer audio (1, kN);
        juce::AudioSampleBuffer cv (1, kN);
        audio.clear();
        for (int i = 0; i < kN; ++i)
            cv.setSample (0, i, 1.0f);
        juce::MidiBuffer midi;
        midi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 10);
        RenderContext rc (audio, cv, midi, kN);
        node.render (rc);
        BOOST_CHECK_EQUAL (midi.getNumEvents(), 1);
    }

    // Closed (gate was open, now low): panic fires once at the closing
    // sample, and the note-on while closed is dropped.
    {
        juce::AudioSampleBuffer audio (1, kN);
        juce::AudioSampleBuffer cv (1, kN);
        audio.clear();
        cv.clear(); // all low -> falling edge at sample 0
        juce::MidiBuffer midi;
        midi.addEvent (juce::MidiMessage::noteOn (1, 64, (juce::uint8) 100), 100);
        RenderContext rc (audio, cv, midi, kN);
        node.render (rc);

        // 16 channels x (allNotesOff + allSoundOff) = 32 panic events; the
        // note-on must NOT be among the output.
        BOOST_CHECK_EQUAL (midi.getNumEvents(), 32);
        bool sawNoteOn = false, sawAllNotesOff = false;
        for (const auto m : midi)
        {
            const auto msg = m.getMessage();
            if (msg.isNoteOn())
                sawNoteOn = true;
            if (msg.isAllNotesOff())
                sawAllNotesOff = true;
            BOOST_CHECK_EQUAL (m.samplePosition, 0); // panic at the edge frame
        }
        BOOST_CHECK (! sawNoteOn);
        BOOST_CHECK (sawAllNotesOff);
    }
}

BOOST_AUTO_TEST_CASE (midigate_midbuffer_close_is_sample_accurate)
{
    MidiGateNode node;
    node.setRenderDetails (44100.0, kN);
    node.prepareToRender (44100.0, kN);

    juce::AudioSampleBuffer audio (1, kN);
    juce::AudioSampleBuffer cv (1, kN);
    audio.clear();
    // Open for the first 256 samples, closed after.
    for (int i = 0; i < kN; ++i)
        cv.setSample (0, i, i < 256 ? 1.0f : 0.0f);

    juce::MidiBuffer midi;
    midi.addEvent (juce::MidiMessage::noteOn (1, 60, (juce::uint8) 100), 100); // while open -> passes
    midi.addEvent (juce::MidiMessage::noteOn (1, 62, (juce::uint8) 100), 400); // while closed -> dropped
    RenderContext rc (audio, cv, midi, kN);
    node.render (rc);

    int noteOns = 0, panicsAt256 = 0;
    for (const auto m : midi)
    {
        const auto msg = m.getMessage();
        if (msg.isNoteOn())
        {
            ++noteOns;
            BOOST_CHECK_EQUAL (msg.getNoteNumber(), 60);
            BOOST_CHECK_EQUAL (m.samplePosition, 100);
        }
        if ((msg.isAllNotesOff() || msg.isAllSoundOff()) && m.samplePosition == 256)
            ++panicsAt256;
    }
    BOOST_CHECK_EQUAL (noteOns, 1);
    BOOST_CHECK_EQUAL (panicsAt256, 32); // exact closing frame
}

// --- Audio switch ---------------------------------------------------------------

BOOST_AUTO_TEST_CASE (audioswitch_selects_a_then_b)
{
    AudioSwitchNode node;
    node.setRenderDetails (44100.0, kN);
    node.prepareToRender (44100.0, kN);

    juce::AudioSampleBuffer audio (4, kN);
    juce::AudioSampleBuffer cv (1, kN);
    juce::MidiBuffer midi;

    auto fill = [&audio] {
        for (int i = 0; i < kN; ++i)
        {
            audio.setSample (0, i, 0.25f); // A L
            audio.setSample (1, i, 0.25f); // A R
            audio.setSample (2, i, 0.75f); // B L
            audio.setSample (3, i, 0.75f); // B R
        }
    };

    // sel low -> A (mix starts at 0, no ramp needed).
    fill();
    cv.clear();
    {
        RenderContext rc (audio, cv, midi, kN);
        node.render (rc);
    }
    BOOST_CHECK_CLOSE (audio.getSample (0, kN - 1), 0.25f, 0.1);

    // sel high -> B after the 5ms crossfade.
    fill();
    for (int i = 0; i < kN; ++i)
        cv.setSample (0, i, 1.0f);
    {
        RenderContext rc (audio, cv, midi, kN);
        node.render (rc);
    }
    BOOST_CHECK_CLOSE (audio.getSample (0, kN - 1), 0.75f, 0.1);

    // During the crossfade every sample stays inside [A, B] — no overshoot.
    fill();
    cv.clear();
    node.prepareToRender (44100.0, kN); // reset mix to 0
    for (int i = 0; i < kN; ++i)
        cv.setSample (0, i, 1.0f);
    {
        RenderContext rc (audio, cv, midi, kN);
        node.render (rc);
    }
    for (int i = 0; i < kN; ++i)
    {
        const float s = audio.getSample (0, i);
        BOOST_REQUIRE_GE (s, 0.25f - 1.0e-5f);
        BOOST_REQUIRE_LE (s, 0.75f + 1.0e-5f);
    }
}

BOOST_AUTO_TEST_SUITE_END()
