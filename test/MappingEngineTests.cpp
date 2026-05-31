// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// MappingEngine unit tests.
// Covers: construction, clear, capture flag, startMapping/stopMapping,
// getCapturedMidiMessage, getCapturedControl, addInput/removeInput with
// invalid Controllers (no real MIDI hardware required).

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/controller.hpp>

#include "engine/mappingengine.hpp"
#include "engine/midiengine.hpp"
#include "testutil.hpp"

using namespace element;

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (MappingEngineTests)

// Construction and destruction do not crash.
BOOST_AUTO_TEST_CASE (construct_destruct)
{
    BOOST_CHECK_NO_THROW ({
        MappingEngine engine;
        (void) engine;
    });
}

// clear() on a freshly-constructed engine does not crash.
BOOST_AUTO_TEST_CASE (clear_on_empty_does_not_crash)
{
    MappingEngine engine;
    BOOST_CHECK_NO_THROW (engine.clear());
}

// Double-clear is safe.
BOOST_AUTO_TEST_CASE (double_clear_is_safe)
{
    MappingEngine engine;
    engine.clear();
    BOOST_CHECK_NO_THROW (engine.clear());
}

// getCapturedMidiMessage on a fresh engine returns without crash.
BOOST_AUTO_TEST_CASE (get_captured_message_default_no_crash)
{
    MappingEngine engine;
    BOOST_CHECK_NO_THROW ((void) engine.getCapturedMidiMessage());
}

// capture(true) then capture(false) toggles cleanly.
BOOST_AUTO_TEST_CASE (capture_toggle_no_crash)
{
    MappingEngine engine;
    BOOST_CHECK_NO_THROW (engine.capture (true));
    BOOST_CHECK_NO_THROW (engine.capture (false));
}

// startMapping / stopMapping do not crash on a fresh engine.
BOOST_AUTO_TEST_CASE (start_stop_mapping_no_crash)
{
    MappingEngine engine;
    BOOST_CHECK_NO_THROW (engine.startMapping());
    BOOST_CHECK_NO_THROW (engine.stopMapping());
}

// Repeated startMapping calls are idempotent.
BOOST_AUTO_TEST_CASE (start_mapping_idempotent)
{
    MappingEngine engine;
    engine.startMapping();
    BOOST_CHECK_NO_THROW (engine.startMapping());
}

// Repeated stopMapping calls are idempotent.
BOOST_AUTO_TEST_CASE (stop_mapping_idempotent)
{
    MappingEngine engine;
    engine.startMapping();
    engine.stopMapping();
    BOOST_CHECK_NO_THROW (engine.stopMapping());
}

// addInput with default-constructed (invalid) Controller does not crash.
BOOST_AUTO_TEST_CASE (add_invalid_controller_does_not_crash)
{
    MappingEngine engine;
    MidiEngine midiEngine;
    Controller emptyController;
    BOOST_CHECK_NO_THROW (engine.addInput (emptyController, midiEngine));
}

// removeInput for a Controller never added does not crash.
BOOST_AUTO_TEST_CASE (remove_unknown_controller_does_not_crash)
{
    MappingEngine engine;
    Controller emptyController;
    BOOST_CHECK_NO_THROW (engine.removeInput (emptyController));
}

// refreshInput for a Controller never added does not crash.
BOOST_AUTO_TEST_CASE (refresh_unknown_controller_does_not_crash)
{
    MappingEngine engine;
    Controller emptyController;
    BOOST_CHECK_NO_THROW (engine.refreshInput (emptyController));
}

// getCapturedControl on a fresh engine does not crash.
BOOST_AUTO_TEST_CASE (get_captured_control_default)
{
    MappingEngine engine;
    BOOST_CHECK_NO_THROW ((void) engine.getCapturedControl());
}

// capturedSignal() reference is valid — connect a lambda without crash.
BOOST_AUTO_TEST_CASE (captured_signal_connect_no_crash)
{
    MappingEngine engine;
    bool fired = false;
    BOOST_CHECK_NO_THROW ({
        auto conn = engine.capturedSignal().connect ([&fired]() { fired = true; });
        (void) conn;
    });
}

// addInput then clear does not crash.
BOOST_AUTO_TEST_CASE (add_then_clear_no_crash)
{
    MappingEngine engine;
    MidiEngine midiEngine;
    Controller emptyController;
    engine.addInput (emptyController, midiEngine);
    BOOST_CHECK_NO_THROW (engine.clear());
}

// Full lifecycle: construct → startMapping → capture on/off → stopMapping → clear.
BOOST_AUTO_TEST_CASE (full_lifecycle_no_crash)
{
    BOOST_CHECK_NO_THROW ({
        MappingEngine engine;
        engine.startMapping();
        engine.capture (true);
        engine.capture (false);
        engine.stopMapping();
        engine.clear();
    });
}

BOOST_AUTO_TEST_SUITE_END()
