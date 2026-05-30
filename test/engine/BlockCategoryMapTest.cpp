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

BOOST_AUTO_TEST_SUITE_END()
