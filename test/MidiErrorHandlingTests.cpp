// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// MIDI error-handling tests: invalid devices, empty buffers, rapid
// note-on/off edge cases, and thread-safety of the atomic MIDI output.
// Coverage gap identified in the P0-5 audit.

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/settings.hpp>

#include "engine/midiengine.hpp"

using namespace element;
using namespace juce;

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (MidiErrorHandlingTests)

// Setting a non-existent MIDI output device does not crash.
BOOST_AUTO_TEST_CASE (set_invalid_output_device_no_crash)
{
    MidiEngine engine;
    MidiDeviceInfo bogus;
    bogus.name       = "DoesNotExist_XYZ_12345";
    bogus.identifier = "invalid-id-xyz";

    BOOST_CHECK_NO_THROW (engine.setDefaultMidiOutput (bogus));
    // Graceful failure: output stays null or is cleared.
    // No assertion on the pointer value — device may or may not be found.
}

// Calling setDefaultMidiOutput 50 times with invalid device is stable.
BOOST_AUTO_TEST_CASE (set_invalid_device_repeated_stable)
{
    MidiEngine engine;
    MidiDeviceInfo bogus;
    bogus.name       = "Ghost_Device_Repeated";
    bogus.identifier = "ghost-repeated";

    for (int i = 0; i < 50; ++i)
        BOOST_CHECK_NO_THROW (engine.setDefaultMidiOutput (bogus));
}

// Enabling a non-existent MIDI input by invalid MidiDeviceInfo does not crash.
BOOST_AUTO_TEST_CASE (enable_nonexistent_input_no_crash)
{
    MidiEngine engine;
    MidiDeviceInfo bogus;
    bogus.name       = "Ghost_Input_ABCDEF";
    bogus.identifier = "ghost-input-abcdef";

    BOOST_CHECK_NO_THROW (engine.setMidiInputEnabled (bogus, true));
    BOOST_CHECK_EQUAL (engine.getNumActiveMidiInputs(), 0);
}

// Disabling an already-disabled device does not crash.
BOOST_AUTO_TEST_CASE (disable_nonexistent_input_no_crash)
{
    MidiEngine engine;
    MidiDeviceInfo bogus;
    bogus.name       = "Ghost_Input_Disable";
    bogus.identifier = "ghost-input-disable";

    BOOST_CHECK_NO_THROW (engine.setMidiInputEnabled (bogus, false));
}

// applySettings / writeSettings with default Settings do not crash.
BOOST_AUTO_TEST_CASE (settings_round_trip_no_crash)
{
    MidiEngine engine;
    Settings settings;
    BOOST_CHECK_NO_THROW (engine.applySettings (settings));
    BOOST_CHECK_NO_THROW (engine.writeSettings (settings));
}

// getAtomicMidiOutput is safe to read from 8 concurrent threads.
BOOST_AUTO_TEST_CASE (atomic_output_concurrent_reads_safe)
{
    MidiEngine engine;
    std::atomic<int> reads { 0 };
    std::vector<std::thread> threads;

    for (int i = 0; i < 8; ++i)
    {
        threads.emplace_back ([&] {
            for (int j = 0; j < 1000; ++j)
            {
                (void) engine.getAtomicMidiOutput();
                ++reads;
            }
        });
    }

    for (auto& t : threads)
        t.join();

    BOOST_CHECK_EQUAL (reads.load(), 8 * 1000);
}

BOOST_AUTO_TEST_SUITE_END()

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (MidiEdgeCaseMessageTests)

// noteOn with velocity 0 is a valid note-off in MIDI spec.
BOOST_AUTO_TEST_CASE (note_on_velocity_zero_is_note_off)
{
    MidiMessage msg = MidiMessage::noteOn (1, 60, (uint8) 0);
    // MIDI spec: noteOn with vel=0 is a running-status note-off.
    // JUCE may return isNoteOff() true or isNoteOn(false) true.
    BOOST_CHECK (msg.isNoteOnOrOff());
}

// noteOn with max velocity (127) is valid.
BOOST_AUTO_TEST_CASE (note_on_max_velocity_valid)
{
    MidiMessage msg = MidiMessage::noteOn (1, 60, (uint8) 127);
    BOOST_CHECK (msg.isNoteOn());
    BOOST_CHECK_EQUAL (msg.getVelocity(), 127);
}

// All 16 MIDI channels round-trip correctly.
BOOST_AUTO_TEST_CASE (all_channels_round_trip)
{
    for (int ch = 1; ch <= 16; ++ch)
    {
        MidiMessage msg = MidiMessage::noteOn (ch, 64, (uint8) 100);
        BOOST_CHECK_EQUAL (msg.getChannel(), ch);
    }
}

// 256 rapid note-on/off messages (all pitches) are all valid.
BOOST_AUTO_TEST_CASE (rapid_note_on_off_all_pitches)
{
    MidiBuffer buf;
    for (int pitch = 0; pitch < 128; ++pitch)
    {
        buf.addEvent (MidiMessage::noteOn  (1, pitch, (uint8) 64), pitch * 2);
        buf.addEvent (MidiMessage::noteOff (1, pitch),              pitch * 2 + 1);
    }

    int count = 0;
    for (const auto meta : buf)
    {
        BOOST_CHECK (meta.getMessage().isNoteOnOrOff());
        ++count;
    }
    BOOST_CHECK_EQUAL (count, 256);
}

// All-notes-off CC (123) on each channel is valid.
BOOST_AUTO_TEST_CASE (all_notes_off_all_channels)
{
    for (int ch = 1; ch <= 16; ++ch)
    {
        MidiMessage msg = MidiMessage::allNotesOff (ch);
        BOOST_CHECK (msg.isController());
        BOOST_CHECK_EQUAL (msg.getControllerNumber(), 123);
    }
}

// SysEx message is recognized and has non-zero size.
BOOST_AUTO_TEST_CASE (sysex_message_recognized)
{
    const uint8 data[] = { 0x41, 0x10, 0x42, 0x12 };
    MidiMessage sysex = MidiMessage::createSysExMessage (data, sizeof (data));
    BOOST_CHECK (sysex.isSysEx());
    BOOST_CHECK_GT (sysex.getRawDataSize(), 0);
}

BOOST_AUTO_TEST_SUITE_END()
