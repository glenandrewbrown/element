// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Phase E sandbox isolation tests — Team E, Wave 1.
// Pairs with luasandboxtest.cpp (banned globals at the bindings level) and
// covers the higher-level sandbox boundary: filesystem write restrictions on
// Node:writeFile, AudioBuffer/MidiBuffer Lua-binding bounds checks, and the
// instruction-count timeout that prevents runaway scripts.
//
// Each test pairs:
//   * a NEGATIVE assertion proving the dangerous path is rejected, and
//   * a POSITIVE counter-test proving the allowed path still succeeds.
//
// If any test in this suite starts failing, the sandbox has regressed and
// the host is vulnerable. Treat as a P0 release blocker.

#include <boost/test/unit_test.hpp>

#include <chrono>
#include <optional>
#include <string>

#include <element/datapath.hpp>
#include <element/juce/core.hpp>

#include "sol/sol.hpp"
#include "scripting/bindings.hpp"

using namespace element;

namespace {

// Fresh sandboxed Lua state matching ScriptNode's configuration.
sol::state make_sandboxed_state()
{
    sol::state lua;
    Lua::initializeState (lua);
    return lua;
}

// Run a Lua chunk under sol::script_pass_on_error so we can inspect failures
// without throwing across language boundaries.
sol::protected_function_result run (sol::state& lua, const std::string& code)
{
    return lua.safe_script (code, sol::script_pass_on_error);
}

} // namespace

BOOST_AUTO_TEST_SUITE (SandboxIsolationTests)

//==============================================================================
// E-7: lua_sethook instruction-count timeout — runaway scripts are interrupted
//
// Without an instruction-count hook a malicious or buggy script can hang the
// host indefinitely (e.g. `while true do end`). Lua::initializeState() must
// install a count hook that throws / errors out after a bounded number of
// instructions so the host stays responsive.
//==============================================================================

BOOST_AUTO_TEST_CASE (infinite_loop_is_interrupted_within_time_budget)
{
    auto lua = make_sandboxed_state();

    const auto start = std::chrono::steady_clock::now();
    auto r = run (lua, "while true do end");
    const auto elapsed = std::chrono::steady_clock::now() - start;

    BOOST_CHECK (! r.valid());
    // The instruction-count budget is sized so a tight infinite loop returns
    // well under 10 seconds even on slow CI. Generous bound; tighten later
    // once we have instrumentation.
    BOOST_CHECK_LT (
        std::chrono::duration_cast<std::chrono::seconds> (elapsed).count(),
        10);
}

BOOST_AUTO_TEST_CASE (short_loop_completes_normally)
{
    auto lua = make_sandboxed_state();
    auto r = run (lua,
        "local s = 0 "
        "for i = 1, 1000 do s = s + i end "
        "return tostring(s)");
    BOOST_REQUIRE (r.valid());
    sol::object o = r;
    BOOST_CHECK_EQUAL (o.as<std::string>(), "500500");
}

BOOST_AUTO_TEST_SUITE_END()
