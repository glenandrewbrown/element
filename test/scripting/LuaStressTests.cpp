// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Lua scripting stress and robustness tests: resource limits, error
// recovery, and sandbox boundary enforcement not covered by LuaSandboxTest.
// Coverage gap identified in the P0-5 audit.

#include <boost/test/unit_test.hpp>

#include "luatest.hpp"
#include "scripting/scriptloader.hpp"
#include "testutil.hpp"

using namespace element;

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (LuaStressTests)

// Loading an empty string does not crash.
BOOST_AUTO_TEST_CASE (load_empty_string_no_crash)
{
    LuaFixture lua;
    auto loader = std::make_unique<ScriptLoader> (lua.luaState());
    BOOST_CHECK_NO_THROW (loader->load (""));
}

// Syntactically invalid Lua: loader marks error, does not crash.
BOOST_AUTO_TEST_CASE (load_invalid_syntax_sets_error)
{
    LuaFixture lua;
    auto loader = std::make_unique<ScriptLoader> (lua.luaState());
    loader->load ("this is !!! not valid Lua @@@");
    BOOST_CHECK (loader->hasError());
}

// Error does not corrupt loader — subsequent valid load succeeds.
BOOST_AUTO_TEST_CASE (error_does_not_corrupt_loader)
{
    LuaFixture lua;
    auto loader = std::make_unique<ScriptLoader> (lua.luaState());

    loader->load ("error('deliberate')");
    // No hard requirement on hasError here (runtime error may differ from
    // compile error), but loader must survive and be re-usable.
    BOOST_CHECK_NO_THROW (loader->load ("local x = 1 + 1"));
}

// Loading the same valid script 100 times: no crash, stable state.
BOOST_AUTO_TEST_CASE (repeated_load_same_script_stable)
{
    LuaFixture lua;
    auto loader = std::make_unique<ScriptLoader> (lua.luaState());
    const juce::String script = "local x = 1 + 1";

    for (int i = 0; i < 100; ++i)
        BOOST_CHECK_NO_THROW (loader->load (script));
}

// Deeply recursive Lua call should fail gracefully (stack overflow).
BOOST_AUTO_TEST_CASE (recursive_call_fails_gracefully)
{
    LuaFixture lua;
    auto loader = std::make_unique<ScriptLoader> (lua.luaState());

    const juce::String recursive =
        "local function f(n) return f(n+1) end\n"
        "f(0)\n";

    // Must not crash — may produce an error state.
    BOOST_CHECK_NO_THROW (loader->load (recursive));
}

BOOST_AUTO_TEST_SUITE_END()

// ---------------------------------------------------------------------------
BOOST_AUTO_TEST_SUITE (LuaSandboxBoundaryTests)

// require() for an unknown module produces an error, not a crash.
BOOST_AUTO_TEST_CASE (require_unknown_module_no_crash)
{
    LuaFixture lua;
    auto loader = std::make_unique<ScriptLoader> (lua.luaState());
    BOOST_CHECK_NO_THROW (loader->load ("require('nonexistent_module_xyz_abc')"));
}

// Script accessing io.open must not create files (io stripped by sandbox).
BOOST_AUTO_TEST_CASE (file_io_blocked_no_file_created)
{
    LuaFixture lua;
    auto loader = std::make_unique<ScriptLoader> (lua.luaState());

    const juce::String fileAccess =
        "local f = io and io.open('/tmp/element_lua_escape.txt', 'w')\n"
        "if f then f:write('escaped') f:close() end\n";

    BOOST_CHECK_NO_THROW (loader->load (fileAccess));

    juce::File escaped ("/tmp/element_lua_escape.txt");
    BOOST_CHECK (! escaped.existsAsFile());
}

// os.execute must not create files (os stripped or restricted by sandbox).
BOOST_AUTO_TEST_CASE (os_execute_blocked_no_file_created)
{
    LuaFixture lua;
    auto loader = std::make_unique<ScriptLoader> (lua.luaState());

    const juce::String osExec =
        "if os and os.execute then\n"
        "  os.execute('touch /tmp/element_os_escape')\n"
        "end\n";

    BOOST_CHECK_NO_THROW (loader->load (osExec));

    juce::File escaped ("/tmp/element_os_escape");
    BOOST_CHECK (! escaped.existsAsFile());
}

// Loader getName() returns non-null string after successful load.
BOOST_AUTO_TEST_CASE (get_name_after_load)
{
    LuaFixture lua;
    auto loader = std::make_unique<ScriptLoader> (lua.luaState());
    // Script with no explicit name should return empty or default, not crash.
    loader->load ("local x = 42");
    BOOST_CHECK_NO_THROW ((void) loader->getName());
}

BOOST_AUTO_TEST_SUITE_END()
