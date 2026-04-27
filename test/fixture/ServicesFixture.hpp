// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/context.hpp>
#include <element/services.hpp>

#include "testutil.hpp"

namespace element {
namespace test {

/** Convenience accessors for service tests.
    test::context() already constructs a RunMode::Standalone Context with all
    7 default services registered, initialized, and activated (see TestMain.cpp).
    These wrappers just save the ceremony of pulling the services container
    and dynamic-casting to the expected service type. */

inline Services& services()
{
    return context()->services();
}

template <class T>
inline T* getService()
{
    return services().find<T>();
}

} // namespace test
} // namespace element
