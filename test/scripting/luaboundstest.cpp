// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Phase E — bounds-check coverage for the AudioBuffer / MidiBuffer Lua
// bindings. The buffer bindings expose raw pointer arithmetic to Lua scripts
// (see src/el/AudioBufferImpl.ipp and src/el/MidiBuffer.cpp). Without bounds
// checks a script can read past the end of an audio buffer or write to a
// negative channel index, which is a straight memory-corruption primitive.
//
// Each test exercises an out-of-range argument and verifies the binding
// rejects it (returns nil / raises) rather than performing an unsafe access.
// Counter-tests cover the in-range path so the bindings remain usable.

#include <boost/test/unit_test.hpp>

#include "sol/sol.hpp"
#include "scripting/bindings.hpp"

using namespace element;

namespace {

// Lua::initializeState registers `el.AudioBuffer` / `el.MidiBuffer` with
// package.searchers via searchInternalModules() — the test scripts below
// reach them through plain require(). No force-load is needed here.
sol::state make_sandboxed_state_with_buffers()
{
    sol::state lua;
    Lua::initializeState (lua);
    return lua;
}

sol::protected_function_result run (sol::state& lua, const std::string& code)
{
    return lua.safe_script (code, sol::script_pass_on_error);
}

} // namespace

BOOST_AUTO_TEST_SUITE (LuaBoundsTests)

//==============================================================================
// AudioBuffer:get / :set bounds checks
//==============================================================================

BOOST_AUTO_TEST_CASE (audiobuffer_get_negative_channel_returns_nil)
{
    auto lua = make_sandboxed_state_with_buffers();
    auto r = run (lua, R"(
        local AudioBuffer = require ('el.AudioBuffer')
        local b = AudioBuffer.new (2, 64)
        return b:get(-5, 1)
    )");
    BOOST_CHECK (! r.valid());
}

BOOST_AUTO_TEST_CASE (audiobuffer_get_channel_beyond_end_returns_nil)
{
    auto lua = make_sandboxed_state_with_buffers();
    auto r = run (lua, R"(
        local AudioBuffer = require ('el.AudioBuffer')
        local b = AudioBuffer.new (2, 64)
        return b:get(99, 1)
    )");
    BOOST_CHECK (! r.valid());
}

BOOST_AUTO_TEST_CASE (audiobuffer_get_frame_beyond_end_returns_nil)
{
    auto lua = make_sandboxed_state_with_buffers();
    auto r = run (lua, R"(
        local AudioBuffer = require ('el.AudioBuffer')
        local b = AudioBuffer.new (2, 64)
        return b:get(1, 999999)
    )");
    BOOST_CHECK (! r.valid());
}

BOOST_AUTO_TEST_CASE (audiobuffer_set_negative_channel_is_rejected)
{
    auto lua = make_sandboxed_state_with_buffers();
    auto r = run (lua, R"(
        local AudioBuffer = require ('el.AudioBuffer')
        local b = AudioBuffer.new (2, 64)
        b:set(-1, 1, 0.5)
    )");
    BOOST_CHECK (! r.valid());
}

BOOST_AUTO_TEST_CASE (audiobuffer_set_frame_beyond_end_is_rejected)
{
    auto lua = make_sandboxed_state_with_buffers();
    auto r = run (lua, R"(
        local AudioBuffer = require ('el.AudioBuffer')
        local b = AudioBuffer.new (2, 64)
        b:set(1, 99999, 0.5)
    )");
    BOOST_CHECK (! r.valid());
}

BOOST_AUTO_TEST_CASE (audiobuffer_in_range_get_set_succeeds)
{
    auto lua = make_sandboxed_state_with_buffers();
    // `el.AudioBuffer.new` defaults to the 32-bit (float) buffer, so the round
    // trip loses precision (0.42 → ~0.41999998 in float). Compare numerically
    // with a small tolerance instead of substring-matching the formatted text.
    auto r = run (lua, R"(
        local AudioBuffer = require ('el.AudioBuffer')
        local b = AudioBuffer.new (2, 64)
        b:set(1, 1, 0.42)
        return b:get(1, 1)
    )");
    BOOST_REQUIRE (r.valid());
    sol::object o = r;
    BOOST_REQUIRE (o.is<double>());
    const auto v = o.as<double>();
    BOOST_CHECK_CLOSE (v, 0.42, 0.01); // within 0.01% — float-precision is fine
}

//==============================================================================
// MidiBuffer:insert / :clear bounds checks
//==============================================================================

BOOST_AUTO_TEST_CASE (midibuffer_clear_negative_start_is_rejected)
{
    auto lua = make_sandboxed_state_with_buffers();
    auto r = run (lua, R"(
        local MidiBuffer = require ('el.MidiBuffer')
        local b = MidiBuffer.new (256)
        b:clear(-50, 100)
    )");
    BOOST_CHECK (! r.valid());
}

BOOST_AUTO_TEST_CASE (midibuffer_clear_in_range_succeeds)
{
    auto lua = make_sandboxed_state_with_buffers();
    auto r = run (lua, R"(
        local MidiBuffer = require ('el.MidiBuffer')
        local b = MidiBuffer.new (256)
        b:clear(1, 100)
        return tostring(b:empty())
    )");
    BOOST_REQUIRE (r.valid());
}

BOOST_AUTO_TEST_SUITE_END()
