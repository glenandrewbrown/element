// SPDX-FileCopyrightText: 2026 Kushview, LLC
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Forwarding header so that #include <lua/lua.h> (used by sol2's
// compatibility/compat-5.3.h via __has_include(<lua/lua.h>)) resolves
// to the BUNDLED Lua 5.4 in src/lua/src/ rather than a system-installed
// Lua at /usr/local/include/lua/lua.h (which is typically Lua 5.5+ on
// macOS Homebrew and incompatible with sol2's compat header).
//
// Without this, sol2 picks up Lua 5.5 from the system include path and
// fails with: "unsupported Lua version (i.e. not Lua 5.1, 5.2, 5.3, or 5.4)".
#pragma once
#include "../lua.h"
