// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>

// The pure keyword-matching helper lives in a header-only helper so it is
// testable without a Node or any host infrastructure.
#include "ui/blockcategory.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (BlockCategoryMapTests)

// Synth plugin → "instrument"
BOOST_AUTO_TEST_CASE (SynthIsInstrument)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Synth Bass", "Instrument"), "instrument");
}

// Reverb plugin → "audiofx"  (default bucket)
BOOST_AUTO_TEST_CASE (ReverbIsAudioFx)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Hall Verb", "Reverb"), "audiofx");
}

// MIDI router → "midifx"  (midi keyword wins before all others)
BOOST_AUTO_TEST_CASE (MidiRouterIsMidiFx)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("MIDI Router", "MIDI"), "midifx");
}

// LFO → "modulator"  (modulator check comes after midifx, before instrument)
BOOST_AUTO_TEST_CASE (LfoIsModulator)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Sine LFO", "Modulation"), "modulator");
}

// Completely unknown plugin name + empty category → "audiofx" default
BOOST_AUTO_TEST_CASE (UnknownIsAudioFx)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Unknown Plugin", ""), "audiofx");
}

// Envelope plugin → "modulator"
BOOST_AUTO_TEST_CASE (EnvelopeIsModulator)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Envelope Follower", "Modulation"), "modulator");
}

// Sampler plugin → "instrument"
BOOST_AUTO_TEST_CASE (SamplerIsInstrument)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Kontakt", "Sampler"), "instrument");
}

// Sequencer → "midifx"
BOOST_AUTO_TEST_CASE (SequencerIsMidiFx)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Step Sequencer", ""), "midifx");
}

// ── Conditional/logic routing family (logic-routing-flow-debug plan W4) ──
// Comparator / Logic Gate / Audio Gate / Audio Switch → "modulator" (purple ⬡,
// "routing logic" per the D1 taxonomy). MIDI Gate → "midifx" (it IS a MIDI
// processor). Envelope Follower already covered above.

BOOST_AUTO_TEST_CASE (ComparatorIsModulator)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Comparator", ""), "modulator");
}

BOOST_AUTO_TEST_CASE (LogicGateIsModulator)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Logic Gate", ""), "modulator");
}

BOOST_AUTO_TEST_CASE (AudioGateIsModulator)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Audio Gate", ""), "modulator");
}

BOOST_AUTO_TEST_CASE (AudioSwitchIsModulator)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Audio Switch", ""), "modulator");
}

BOOST_AUTO_TEST_CASE (MidiGateIsMidiFx)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("MIDI Gate", ""), "midifx");
}

// A vendor "Noise Gate" dynamics plugin must STAY audiofx — the family above
// matches full phrases ("audio gate"), never the bare word "gate".
BOOST_AUTO_TEST_CASE (VendorNoiseGateStaysAudioFx)
{
    BOOST_CHECK_EQUAL (mapBlockCategoryFromStrings ("Noise Gate", "Dynamics"), "audiofx");
}

BOOST_AUTO_TEST_SUITE_END()
