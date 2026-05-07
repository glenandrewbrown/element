// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Phase E — Node:writeFile() Lua binding must reject writes outside the
// Element data path. Without this restriction a malicious script can write
// arbitrary content to any file the host process can reach (e.g. ~/.ssh,
// /etc, the user's Documents folder).
//
// The tests construct an absolute path outside the data path, attempt the
// write, and verify (a) the binding returns false / fails, and (b) the
// target file does not exist on disk afterwards. A counter-test confirms
// that writes targeting a path inside the data root succeed.

#include <boost/test/unit_test.hpp>

#include <element/datapath.hpp>
#include <element/juce/core.hpp>
#include <element/node.hpp>

#include "sol/sol.hpp"
#include "scripting/bindings.hpp"

#include "el/factories.hpp"
#include "el/sol_helpers.hpp"

extern "C" {
extern int luaopen_el_Node (lua_State*);
}

using namespace element;
using juce::File;

namespace {

sol::state make_sandboxed_state()
{
    sol::state lua;
    Lua::initializeState (lua);
    return lua;
}

// Bind a juce::File-backed Node into the Lua state under the global
// `_test_node`.
void install_node (sol::state& lua, Node& n)
{
    auto* L = lua.lua_state();
    luaL_requiref (L, "el.Node", luaopen_el_Node, 0);
    lua_pop (L, 1);
    lua["_test_node"] = std::ref (n);
}

} // namespace

BOOST_AUTO_TEST_SUITE (NodeWriteFileTests)

BOOST_AUTO_TEST_CASE (writefile_rejects_path_outside_data_root)
{
    auto lua = make_sandboxed_state();

    Node node = Node::createGraph ("Test");
    install_node (lua, node);

    // Pick a target outside the Element data root and outside any normal
    // user-writable scope. /tmp is writable but is outside the data path.
    const auto target = File ("/tmp/element_phase_e_writefile_outside.elg");
    if (target.existsAsFile())
        target.deleteFile();

    sol::protected_function_result r = lua.safe_script (
        std::string ("return _test_node:writeFile('") + target.getFullPathName().toStdString() + "')",
        sol::script_pass_on_error);

    BOOST_REQUIRE (r.valid());
    sol::object o = r;
    BOOST_CHECK_EQUAL (o.as<bool>(), false);
    BOOST_CHECK (! target.existsAsFile());
}

BOOST_AUTO_TEST_CASE (writefile_rejects_relative_path)
{
    auto lua = make_sandboxed_state();
    Node node = Node::createGraph ("Test");
    install_node (lua, node);

    auto r = lua.safe_script (
        "return _test_node:writeFile('relative/path.elg')",
        sol::script_pass_on_error);
    BOOST_REQUIRE (r.valid());
    sol::object o = r;
    BOOST_CHECK_EQUAL (o.as<bool>(), false);
}

BOOST_AUTO_TEST_CASE (writefile_inside_datapath_succeeds)
{
    auto lua = make_sandboxed_state();
    Node node = Node::createGraph ("Test");
    install_node (lua, node);

    const auto root = DataPath::applicationDataDir();
    if (! root.exists())
        root.createDirectory();

    const auto target = root.getChildFile ("element_phase_e_writefile_inside.elg");
    if (target.existsAsFile())
        target.deleteFile();

    auto r = lua.safe_script (
        std::string ("return _test_node:writeFile('") + target.getFullPathName().toStdString() + "')",
        sol::script_pass_on_error);

    BOOST_REQUIRE (r.valid());
    sol::object o = r;
    BOOST_CHECK_EQUAL (o.as<bool>(), true);

    // Cleanup — the binding may legitimately have created the file.
    if (target.existsAsFile())
        target.deleteFile();
}

// Phase E-3 hardening: sibling-prefix bypass. A naive startsWith() would
// let `<rootParent>/<rootBasename>HACK/...` through because the prefix
// matches; juce::File::isAChildOf() correctly rejects it. This test is
// the discriminator between the two implementations.
BOOST_AUTO_TEST_CASE (writefile_rejects_sibling_prefix_directory)
{
    auto lua = make_sandboxed_state();
    Node node = Node::createGraph ("Test");
    install_node (lua, node);

    const auto root       = DataPath::applicationDataDir();
    const auto sibling    = root.getParentDirectory()
                                .getChildFile (root.getFileName() + "HACK");
    const auto target     = sibling.getChildFile ("evil.elg");
    if (target.existsAsFile())
        target.deleteFile();

    auto r = lua.safe_script (
        std::string ("return _test_node:writeFile('") + target.getFullPathName().toStdString() + "')",
        sol::script_pass_on_error);

    BOOST_REQUIRE (r.valid());
    sol::object o = r;
    BOOST_CHECK_EQUAL (o.as<bool>(), false);
    BOOST_CHECK (! target.existsAsFile());
}

// Phase E-3 hardening: `..` traversal. Even an absolute path that nominally
// starts with the data root must not be allowed to escape via `..`.
BOOST_AUTO_TEST_CASE (writefile_rejects_dotdot_traversal)
{
    auto lua = make_sandboxed_state();
    Node node = Node::createGraph ("Test");
    install_node (lua, node);

    const auto root = DataPath::applicationDataDir();
    const std::string traversal =
        root.getFullPathName().toStdString() + "/../../etc/element_evil.elg";

    auto r = lua.safe_script (
        std::string ("return _test_node:writeFile('") + traversal + "')",
        sol::script_pass_on_error);

    BOOST_REQUIRE (r.valid());
    sol::object o = r;
    BOOST_CHECK_EQUAL (o.as<bool>(), false);
}

BOOST_AUTO_TEST_SUITE_END()
