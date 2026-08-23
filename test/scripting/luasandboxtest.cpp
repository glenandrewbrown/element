// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Documents and verifies the Lua sandbox boundary used by ScriptNode and the
// in-app Lua console. Each test in this suite runs adversarial Lua code that
// would represent a real attack vector if loaded from a malicious .elg file.
//
// All tests must PASS by demonstrating that the dangerous global is unreachable
// (returns nil, raises an error, or returns the empty string).
//
// If any test in this suite starts failing, the sandbox has regressed and the
// host is vulnerable to RCE through user-shared session/script files. Treat as
// a P0 release blocker.

#include <boost/test/unit_test.hpp>

#include <optional>
#include <string>

#include "sol/sol.hpp"
#include "scripting/bindings.hpp"

using namespace element;

namespace {

// Fresh sandboxed Lua state, configured exactly as ScriptNode does at
// scriptnode.cpp:41 via Lua::initializeState().
sol::state make_sandboxed_state()
{
    sol::state lua;
    Lua::initializeState (lua);
    return lua;
}

// Run a Lua chunk and return whatever it produced as a string for inspection.
// Returns std::nullopt if the chunk failed to compile or threw.
std::optional<std::string> run_chunk (sol::state& lua, const std::string& code)
{
    sol::protected_function_result r = lua.safe_script (code, sol::script_pass_on_error);
    if (! r.valid())
        return std::nullopt;
    if (r.return_count() == 0)
        return std::string {};
    sol::object o = r;
    if (o.is<std::string>())
        return o.as<std::string>();
    sol::function tostring = lua["tostring"];
    if (tostring.valid())
    {
        sol::object s = tostring (o);
        if (s.is<std::string>())
            return s.as<std::string>();
    }
    return std::string {};
}

} // namespace

BOOST_AUTO_TEST_SUITE (LuaSandboxTests)

// ── Banned globals: the most dangerous primitives ──

BOOST_AUTO_TEST_CASE (os_library_is_nil)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "return type(os)");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "nil");
}

BOOST_AUTO_TEST_CASE (io_library_is_nil)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "return type(io)");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "nil");
}

BOOST_AUTO_TEST_CASE (os_execute_unreachable)
{
    auto lua = make_sandboxed_state();
    // Should fail because os is nil — attempting os.execute on nil raises.
    auto r = run_chunk (lua, "return os.execute('echo HACKED')");
    BOOST_CHECK (! r.has_value());
}

BOOST_AUTO_TEST_CASE (io_popen_unreachable)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "return io.popen('whoami')");
    BOOST_CHECK (! r.has_value());
}

BOOST_AUTO_TEST_CASE (io_open_unreachable)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "return io.open('/etc/passwd', 'r')");
    BOOST_CHECK (! r.has_value());
}

BOOST_AUTO_TEST_CASE (debug_library_unavailable)
{
    auto lua = make_sandboxed_state();
    // debug library is never opened by Lua::initializeState(); should be nil.
    auto r = run_chunk (lua, "return type(debug)");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "nil");
}

// ── Code-loading primitives that bypass the sandbox ──

BOOST_AUTO_TEST_CASE (dofile_is_nil)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "return type(dofile)");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "nil");
}

BOOST_AUTO_TEST_CASE (loadfile_is_nil)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "return type(loadfile)");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "nil");
}

BOOST_AUTO_TEST_CASE (load_is_nil)
{
    auto lua = make_sandboxed_state();
    // load() lets attackers turn arbitrary strings into callable code.
    auto r = run_chunk (lua, "return type(load)");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "nil");
}

// ── Native library loading ──

BOOST_AUTO_TEST_CASE (package_loadlib_is_nil)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "return type(package.loadlib)");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "nil");
}

BOOST_AUTO_TEST_CASE (package_cpath_is_empty)
{
    auto lua = make_sandboxed_state();
    // cpath = "" prevents require() from finding any .so/.dylib via package.searchers.
    auto r = run_chunk (lua, "return package.cpath");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "");
}

// ── Allow-listed: things scripts SHOULD still be able to do ──

BOOST_AUTO_TEST_CASE (math_library_works)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "return tostring(math.floor(3.7))");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "3");
}

BOOST_AUTO_TEST_CASE (string_library_works)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "return string.upper('hello')");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "HELLO");
}

BOOST_AUTO_TEST_CASE (table_library_works)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "local t={3,1,2} table.sort(t) return tostring(t[1])");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "1");
}

BOOST_AUTO_TEST_CASE (coroutine_library_works)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua,
        "local co = coroutine.create(function() coroutine.yield(42) end) "
        "local ok, v = coroutine.resume(co) "
        "return tostring(v)");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "42");
}

BOOST_AUTO_TEST_CASE (utf8_library_works)
{
    auto lua = make_sandboxed_state();
    auto r = run_chunk (lua, "return tostring(utf8.len('héllo'))");
    BOOST_REQUIRE (r.has_value());
    BOOST_CHECK_EQUAL (*r, "5");
}

// ── Defense-in-depth: package.searchers should not load arbitrary modules ──

BOOST_AUTO_TEST_CASE (require_cannot_load_arbitrary_filesystem_path)
{
    auto lua = make_sandboxed_state();
    // /tmp is not in any allowed search path, and even if it were, .lua files
    // there are not in the package.path the host configures. require() should fail.
    auto r = run_chunk (lua, "return require('/tmp/evil')");
    BOOST_CHECK (! r.has_value());
}

BOOST_AUTO_TEST_CASE (require_cannot_load_native_module)
{
    auto lua = make_sandboxed_state();
    // package.cpath = "" + package.loadlib = nil should prevent any .so/.dylib load.
    auto r = run_chunk (lua, "return require('libc')");
    BOOST_CHECK (! r.has_value());
}

BOOST_AUTO_TEST_SUITE_END()
