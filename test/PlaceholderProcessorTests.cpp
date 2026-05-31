// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** PlaceholderProcessor tests.
    Covers: default construction, explicit channel/MIDI construction,
    prepareToPlay, processBlock (produces silence / bypass),
    fillInPluginDescription, state stubs, acceptsMidi/producesMidi.
    Priority: HIGH — used when a plugin fails to load; must be inert but stable. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>

#include "nodes/placeholder.hpp"

using namespace element;
using namespace juce;

static constexpr double kSR  = 44100.0;
static constexpr int    kBuf = 512;

BOOST_AUTO_TEST_SUITE (PlaceholderProcessorTests)

// ── Default construction ──────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultConstructStereoMidi)
{
    PlaceholderProcessor proc;
    BOOST_CHECK_EQUAL (proc.getTotalNumInputChannels(), 2);
    BOOST_CHECK_EQUAL (proc.getTotalNumOutputChannels(), 2);
    BOOST_CHECK (proc.acceptsMidi());
    BOOST_CHECK (proc.producesMidi());
}

BOOST_AUTO_TEST_CASE (DefaultNameIsPlaceholder)
{
    PlaceholderProcessor proc;
    BOOST_CHECK_EQUAL (proc.getName().toStdString(), "Placeholder");
}

// ── Explicit channel constructor ──────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ExplicitMonoNoMidi)
{
    PlaceholderProcessor proc (1, 1, false, false);
    BOOST_CHECK_EQUAL (proc.getTotalNumInputChannels(), 1);
    BOOST_CHECK_EQUAL (proc.getTotalNumOutputChannels(), 1);
    BOOST_CHECK (! proc.acceptsMidi());
    BOOST_CHECK (! proc.producesMidi());
}

BOOST_AUTO_TEST_CASE (ExplicitMultiChannelWithMidi)
{
    PlaceholderProcessor proc (4, 4, true, false);
    BOOST_CHECK_EQUAL (proc.getTotalNumInputChannels(), 4);
    BOOST_CHECK_EQUAL (proc.getTotalNumOutputChannels(), 4);
    BOOST_CHECK (proc.acceptsMidi());
    BOOST_CHECK (! proc.producesMidi());
}

// ── prepare / release ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (PrepareToPlayDoesNotCrash)
{
    PlaceholderProcessor proc;
    BOOST_CHECK_NO_THROW (proc.prepareToPlay (kSR, kBuf));
}

BOOST_AUTO_TEST_CASE (ReleaseResourcesDoesNotCrash)
{
    PlaceholderProcessor proc;
    proc.prepareToPlay (kSR, kBuf);
    BOOST_CHECK_NO_THROW (proc.releaseResources());
}

// ── processBlock produces silence ─────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ProcessBlockProducesSilence)
{
    // PlaceholderProcessor delegates to processBlockBypassed which clears output
    PlaceholderProcessor proc (2, 2, false, false);
    proc.prepareToPlay (kSR, kBuf);

    AudioBuffer<float> buf (2, kBuf);
    // Fill with non-zero signal
    for (int ch = 0; ch < 2; ++ch)
        FloatVectorOperations::fill (buf.getWritePointer (ch), 0.5f, kBuf);

    MidiBuffer midi;
    proc.processBlock (buf, midi);

    for (int ch = 0; ch < 2; ++ch)
        BOOST_CHECK_CLOSE (buf.getRMSLevel (ch, 0, kBuf), 0.f, 1e-4f);
}

BOOST_AUTO_TEST_CASE (ProcessBlockDoesNotCrashOnEmptyBuffer)
{
    PlaceholderProcessor proc;
    proc.prepareToPlay (kSR, kBuf);
    AudioBuffer<float> buf (0, kBuf);
    MidiBuffer midi;
    BOOST_CHECK_NO_THROW (proc.processBlock (buf, midi));
}

// ── state stubs ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (GetStateInformationReturnsEmpty)
{
    PlaceholderProcessor proc;
    MemoryBlock block;
    proc.getStateInformation (block);
    // Stub: returns empty — valid for a placeholder
    BOOST_CHECK_EQUAL (block.getSize(), 0u);
}

BOOST_AUTO_TEST_CASE (SetStateInformationWithNullDoesNotCrash)
{
    PlaceholderProcessor proc;
    BOOST_CHECK_NO_THROW (proc.setStateInformation (nullptr, 0));
}

// ── plugin description ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (FillInPluginDescriptionReflectsChannelCount)
{
    PlaceholderProcessor proc (3, 2, true, false);
    PluginDescription desc;
    proc.fillInPluginDescription (desc);

    BOOST_CHECK_EQUAL (desc.numInputChannels, 3);
    BOOST_CHECK_EQUAL (desc.numOutputChannels, 2);
    BOOST_CHECK_EQUAL (desc.name.toStdString(), "Placeholder");
    BOOST_CHECK (desc.fileOrIdentifier.isNotEmpty()); // EL_NODE_ID_PLACEHOLDER
}

// ── no editor ────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (HasNoEditor)
{
    PlaceholderProcessor proc;
    BOOST_CHECK (! proc.hasEditor());
    BOOST_CHECK (proc.createEditor() == nullptr);
}

BOOST_AUTO_TEST_SUITE_END()
