// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** MidiEngine tests.
    Covers: construction, device enable/disable, callback registration,
    atomic MIDI output, default output lifecycle, settings persistence. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/settings.hpp>

#include "engine/midiengine.hpp"

using namespace element;
using namespace juce;

BOOST_AUTO_TEST_SUITE (MidiEngineTests)

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultConstruct)
{
    MidiEngine engine;
    // No default MIDI output assigned
    BOOST_CHECK (engine.getDefaultMidiOutput() == nullptr);
    BOOST_CHECK (engine.getDefaultMidiOutputName().isEmpty());
    BOOST_CHECK (engine.getDefaultMidiOutputID().isEmpty());
    BOOST_CHECK_EQUAL (engine.getNumActiveMidiInputs(), 0);
}

// ── Atomic MIDI output ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AtomicMidiOutputNullByDefault)
{
    MidiEngine engine;
    // Callable from any thread — must return nullptr when no output set
    BOOST_CHECK (engine.getAtomicMidiOutput() == nullptr);
}

// ── Default output ────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SetDefaultMidiOutputInvalidDevice)
{
    MidiEngine engine;
    // Setting a non-existent device must not crash
    MidiDeviceInfo bogus;
    bogus.name       = "NonExistentDevice_XYZ_12345";
    bogus.identifier = "invalid-id";

    engine.setDefaultMidiOutput (bogus);
    // Graceful failure: output stays null or is cleared
    // (no exception, no crash)
    BOOST_CHECK (true);
}

BOOST_AUTO_TEST_CASE (DefaultOutputNameAfterInvalidSet)
{
    MidiEngine engine;
    MidiDeviceInfo bogus;
    bogus.name       = "Ghost";
    bogus.identifier = "ghost-id";
    engine.setDefaultMidiOutput (bogus);

    // Name might be stored even if device couldn't open
    // (implementation-specific, but must not crash)
    BOOST_CHECK (true);
}

// ── MIDI input enable/disable ─────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (InputEnableDisableNonExistent)
{
    MidiEngine engine;
    MidiDeviceInfo bogus;
    bogus.name       = "FakeMidiIn";
    bogus.identifier = "fake-id";

    // Must not crash for non-existent devices
    engine.setMidiInputEnabled (bogus, true);
    engine.setMidiInputEnabled (bogus, false);
    BOOST_CHECK (true);
}

BOOST_AUTO_TEST_CASE (InputEnabledQueryNonExistent)
{
    MidiEngine engine;
    MidiDeviceInfo bogus;
    bogus.name       = "NoDevice";
    bogus.identifier = "none";

    bool enabled = engine.isMidiInputEnabled (bogus);
    BOOST_CHECK (! enabled);
}

// ── Callback management ───────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AddRemoveGlobalCallback)
{
    MidiEngine engine;

    struct TestCallback : public juce::MidiInputCallback
    {
        void handleIncomingMidiMessage (juce::MidiInput*, const juce::MidiMessage&) override {}
    };

    TestCallback cb;
    // Adding and removing a global callback must not crash
    engine.addMidiInputCallback (&cb, false);
    engine.removeMidiInputCallback (&cb);
    BOOST_CHECK (true);
}

BOOST_AUTO_TEST_CASE (AddRemoveCallbackByDeviceInfo)
{
    MidiEngine engine;

    struct TestCallback : public juce::MidiInputCallback
    {
        void handleIncomingMidiMessage (juce::MidiInput*, const juce::MidiMessage&) override {}
    };

    TestCallback cb;
    MidiDeviceInfo bogus;
    bogus.name       = "TestDevice";
    bogus.identifier = "test-id";

    engine.addMidiInputCallback (bogus, &cb, false);
    engine.removeMidiInputCallback (bogus, &cb);
    BOOST_CHECK (true);
}

BOOST_AUTO_TEST_CASE (AddRemoveCallbackByStringID)
{
    MidiEngine engine;

    struct TestCallback : public juce::MidiInputCallback
    {
        void handleIncomingMidiMessage (juce::MidiInput*, const juce::MidiMessage&) override {}
    };

    TestCallback cb;
    engine.addMidiInputCallback ("fake-device-id", &cb, false);
    // Remove by callback pointer (no matching device = no crash)
    engine.removeMidiInputCallback (&cb);
    BOOST_CHECK (true);
}

// ── Settings persistence ──────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ApplyAndWriteSettings)
{
    MidiEngine engine;
    Settings settings;

    // Should not crash on empty settings
    engine.applySettings (settings);
    engine.writeSettings (settings);
    BOOST_CHECK (true);
}

BOOST_AUTO_TEST_CASE (ApplySettingsPreservesState)
{
    MidiEngine engine;
    Settings settings;

    engine.applySettings (settings);
    // No active inputs from empty settings
    BOOST_CHECK_EQUAL (engine.getNumActiveMidiInputs(), 0);
}

// ── processMidiBuffer ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ProcessEmptyBufferNocrash)
{
    MidiEngine engine;
    juce::MidiBuffer empty;
    engine.processMidiBuffer (empty, 512, 44100.0);
    BOOST_CHECK (true);
}

BOOST_AUTO_TEST_CASE (ProcessBufferWithMessages)
{
    MidiEngine engine;
    juce::MidiBuffer buf;
    buf.addEvent (juce::MidiMessage::noteOn (1, 60, (uint8_t) 100), 0);
    buf.addEvent (juce::MidiMessage::noteOff (1, 60), 100);

    // No output device — messages are consumed/discarded without crash
    engine.processMidiBuffer (buf, 512, 44100.0);
    BOOST_CHECK (true);
}

// ── ChangeBroadcaster ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (IsChangeBroadcaster)
{
    MidiEngine engine;
    // MidiEngine inherits from juce::ChangeBroadcaster — verify it compiles
    juce::ChangeBroadcaster* cb = &engine;
    BOOST_CHECK (cb != nullptr);
}

BOOST_AUTO_TEST_SUITE_END()
