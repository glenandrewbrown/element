// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for AudioMixerProcessor: construction, port layout, Monitor accessors,
// gain/mute request paths, and state serialisation.
// render() is not invoked here (no live audio device) — just lifecycle paths.

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include "nodes/audiomixer.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (AudioMixerProcessorTests)

// ── Construction ──────────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (construct_destruct_no_crash)
{
    auto* node = new AudioMixerProcessor (4); // 4-track mixer
    BOOST_CHECK (node != nullptr);
    delete node;
}

BOOST_AUTO_TEST_CASE (default_name_not_empty)
{
    AudioMixerProcessor node (2);
    BOOST_CHECK (node.getName().isNotEmpty());
}

// ── Port layout ───────────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (has_audio_ports)
{
    AudioMixerProcessor node (2);
    // AudioMixerProcessor is a JUCE AudioProcessor — use standard channel API
    BOOST_CHECK (node.getTotalNumInputChannels()  > 0);
    BOOST_CHECK (node.getTotalNumOutputChannels() > 0);
}

// ── Monitor accessors ─────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (monitor_initial_gain_is_unity)
{
    AudioMixerProcessor::Monitor m (0, 2);
    BOOST_CHECK_CLOSE (m.getGain(), 1.0f, 1.0f); // within 1% of 1.0
}

BOOST_AUTO_TEST_CASE (monitor_initial_not_muted)
{
    AudioMixerProcessor::Monitor m (0, 2);
    BOOST_CHECK (! m.isMuted());
}

BOOST_AUTO_TEST_CASE (monitor_track_id_preserved)
{
    AudioMixerProcessor::Monitor m (7, 2);
    BOOST_CHECK_EQUAL (m.getTrackId(), 7);
}

BOOST_AUTO_TEST_CASE (monitor_channel_count_preserved)
{
    AudioMixerProcessor::Monitor m (0, 4);
    BOOST_CHECK_EQUAL (m.getNumChannels(), 4);
}

BOOST_AUTO_TEST_CASE (monitor_get_level_out_of_range_returns_zero)
{
    AudioMixerProcessor::Monitor m (0, 2);
    BOOST_CHECK_CLOSE (m.getLevel (999), 0.0f, 0.001f);
    BOOST_CHECK_CLOSE (m.getLevel (-1),  0.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (monitor_request_mute_stores_value)
{
    AudioMixerProcessor::Monitor m (0, 2);
    m.requestMute (true);
    // nextMute is queued for the audio thread; we can't read it directly,
    // but the call must not crash.
    m.requestMute (false);
}

BOOST_AUTO_TEST_CASE (monitor_request_gain_no_crash)
{
    AudioMixerProcessor::Monitor m (0, 2);
    m.requestGain (0.5f);
    m.requestGain (0.0f);
    m.requestGain (2.0f); // overdrive — must not assert
}

BOOST_AUTO_TEST_CASE (monitor_request_volume_db_no_crash)
{
    AudioMixerProcessor::Monitor m (0, 2);
    m.requestVolume (0.0f);    // unity
    m.requestVolume (-6.0f);   // -6 dB
    m.requestVolume (-120.0f); // silence floor
}

// ── State round-trip ──────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (get_state_returns_non_empty_block)
{
    AudioMixerProcessor node (2);
    juce::MemoryBlock block;
    node.getStateInformation (block);
    BOOST_CHECK (block.getSize() > 0);
}

BOOST_AUTO_TEST_CASE (set_state_with_valid_block_no_crash)
{
    AudioMixerProcessor a (2);
    juce::MemoryBlock block;
    a.getStateInformation (block);

    AudioMixerProcessor b (2);
    BOOST_CHECK_NO_THROW (b.setStateInformation (block.getData(), (int) block.getSize()));
}

BOOST_AUTO_TEST_CASE (set_state_with_empty_block_no_crash)
{
    AudioMixerProcessor node (2);
    BOOST_CHECK_NO_THROW (node.setStateInformation (nullptr, 0));
}

// ── Plugin description ────────────────────────────────────────────────────
BOOST_AUTO_TEST_CASE (plugin_description_populated)
{
    AudioMixerProcessor node (2);
    auto desc = node.getPluginDescription();
    BOOST_CHECK (desc.name.isNotEmpty());
}

BOOST_AUTO_TEST_SUITE_END()
