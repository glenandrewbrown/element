// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>

#include "luatest.hpp"
#include "scripting/dspscript.hpp"
#include "scripting/scriptloader.hpp"
#include "testutil.hpp"

using namespace juce;
using namespace element;

BOOST_AUTO_TEST_SUITE (DSPScriptTest)

BOOST_AUTO_TEST_CASE (Basics)
{
    LuaFixture fix;
    sol::state_view lua (fix.luaState());

    auto script = std::make_unique<ScriptLoader> (lua);
    script->load (fix.getSnippetFile ("test_dsp_script_01.lua"));
    if (script->hasError()) {
        BOOST_REQUIRE_MESSAGE (false,
                               (String ("Could not load script: ") + script->getErrorMessage())
                                   .toStdString());
        return;
    }

    BOOST_REQUIRE_MESSAGE (! script->hasError(),
                           script->getErrorMessage().toStdString());
    if (script->hasError())
        return;

    auto result = script->call();
    BOOST_REQUIRE_MESSAGE (result.get_type() == sol::type::table,
                           sol::type_name (result.lua_state(), result.get_type()));

    sol::table Amp = result;
    DSPScript dsp (Amp);

    BOOST_REQUIRE_MESSAGE (dsp.isValid(), "Could not instantiate DSP Script");
    if (! dsp.isValid())
        return;

#define expect    BOOST_REQUIRE
#define expectMsg BOOST_REQUIRE_MESSAGE

    const auto& ports = dsp.getPorts();
    expect (ports.size (PortType::Audio, true) == 2);
    expect (ports.size (PortType::Audio, false) == 2);
    expect (ports.size (PortType::Midi, true) == 0);
    expect (ports.size (PortType::Midi, false) == 0);
    expect (ports.size (PortType::Control, true) == 1);
    expect (ports.size (PortType::Control, false) == 0);

    dsp.init();
    expectMsg (Amp.get_or ("initialized", false), "didn't call init");

    dsp.prepare (44100, 4096);
    expectMsg (Amp.get_or ("rate", 0.0) == 44100.0, String (Amp.get_or ("rate", 0)));
    expectMsg (Amp.get_or ("block", 0.0) == 4096.0, String (Amp.get_or ("block", 0)));

    AudioSampleBuffer audio (2, 4096);
    for (int c = 0; c < 2; ++c)
        for (int f = 0; f < 4096; ++f)
            audio.setSample (c, f, 1.0);
    MidiPipe midi;

    dsp.getParameterObject (0)->setValueNotifyingHost (0.0);
    dsp.process (audio, midi);

    expectMsg (audio.getSample (0, 4095) < 1.0, String (audio.getSample (0, 4095)));

    MemoryBlock block;
    dsp.save (block);
    dsp.restore (block.getData(), block.getSize());

    expect (Amp.get_or ("released", true) == false);
    dsp.release();
    expect (Amp.get_or ("released", false) == true);
}

BOOST_AUTO_TEST_CASE (LuaSandboxDangerousGlobalsBlocked)
{
    LuaFixture fix;
    sol::state_view lua (fix.luaState());

    // load() must be nil — prevents loading arbitrary code from strings
    {
        auto result = lua.script ("return type(load)", "sandbox_test");
        BOOST_REQUIRE_MESSAGE (result.valid(), "script failed");
        std::string t = result;
        BOOST_REQUIRE_MESSAGE (t == "nil", "load should be nil, got: " + t);
    }

    // loadfile() must be nil — prevents loading code from files
    {
        auto result = lua.script ("return type(loadfile)", "sandbox_test");
        BOOST_REQUIRE_MESSAGE (result.valid(), "script failed");
        std::string t = result;
        BOOST_REQUIRE_MESSAGE (t == "nil", "loadfile should be nil, got: " + t);
    }

    // dofile() must be nil — prevents executing files
    {
        auto result = lua.script ("return type(dofile)", "sandbox_test");
        BOOST_REQUIRE_MESSAGE (result.valid(), "script failed");
        std::string t = result;
        BOOST_REQUIRE_MESSAGE (t == "nil", "dofile should be nil, got: " + t);
    }

    // io must be nil — prevents file I/O
    {
        auto result = lua.script ("return type(io)", "sandbox_test");
        BOOST_REQUIRE_MESSAGE (result.valid(), "script failed");
        std::string t = result;
        BOOST_REQUIRE_MESSAGE (t == "nil", "io should be nil, got: " + t);
    }

    // os must be nil — prevents OS command execution
    {
        auto result = lua.script ("return type(os)", "sandbox_test");
        BOOST_REQUIRE_MESSAGE (result.valid(), "script failed");
        std::string t = result;
        BOOST_REQUIRE_MESSAGE (t == "nil", "os should be nil, got: " + t);
    }

    // package.cpath must be empty — prevents loading native .so/.dylib
    {
        auto result = lua.script ("return package.cpath", "sandbox_test");
        BOOST_REQUIRE_MESSAGE (result.valid(), "script failed");
        std::string cpath = result;
        BOOST_REQUIRE_MESSAGE (cpath.empty(), "package.cpath should be empty, got: " + cpath);
    }

    // package.loadlib must be nil — prevents native library loading
    {
        auto result = lua.script ("return type(package.loadlib)", "sandbox_test");
        BOOST_REQUIRE_MESSAGE (result.valid(), "script failed");
        std::string t = result;
        BOOST_REQUIRE_MESSAGE (t == "nil", "package.loadlib should be nil, got: " + t);
    }

    // package.path must not contain system paths like /usr
    {
        auto result = lua.script ("return package.path", "sandbox_test");
        BOOST_REQUIRE_MESSAGE (result.valid(), "script failed");
        std::string path = result;
        BOOST_REQUIRE_MESSAGE (path.find ("/usr") == std::string::npos,
                               "package.path should not contain /usr, got: " + path);
    }
}

// Phase E-6: DSPScript::validate() must reject empty + malformed scripts
// at the gate so the host never tries to wire a half-broken DSP node into
// the audio graph. The previous implementation always returned ok() because
// the full render-side dry run was disabled; the lightweight version now
// runs the script through ScriptLoader inside a sandboxed Lua state and
// surfaces compile errors.
BOOST_AUTO_TEST_CASE (ValidateRejectsEmptyScript)
{
    auto r = DSPScript::validate (String());
    BOOST_REQUIRE (! r.wasOk());
}

BOOST_AUTO_TEST_CASE (ValidateRejectsSyntaxError)
{
    // Unbalanced 'function' keyword — syntactically invalid Lua. ScriptLoader
    // should report this through hasError() and validate() should bubble it
    // up as a failure.
    const String bad = "function broken(";
    auto r = DSPScript::validate (bad);
    BOOST_CHECK (! r.wasOk());
}

BOOST_AUTO_TEST_CASE (ValidateAcceptsTrivialReturnTable)
{
    // Minimal valid script that compiles cleanly. validate() should not
    // execute node_render against synthetic buffers; it just needs to load.
    const String ok = "return { layout = function() return {}, {} end }";
    auto r = DSPScript::validate (ok);
    BOOST_CHECK (r.wasOk());
}

BOOST_AUTO_TEST_SUITE_END()
