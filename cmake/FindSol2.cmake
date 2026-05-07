# SPDX-FileCopyrightText: 2026 Kushview, LLC
# SPDX-License-Identifier: GPL-3.0-or-later

find_package(sol2 4.0.0 CONFIG)
if(NOT sol2_FOUND)
    set(ELEMENT_SOL2_REPO "https://github.com/ThePhD/sol2.git")
    set(ELEMENT_SOL2_REVISION "c1f95a773c6f8f4fde8ca3efe872e7286afe4444")
    if(CMAKE_VERSION VERSION_GREATER_EQUAL 3.28)
        FetchContent_Declare(sol2
            GIT_REPOSITORY ${ELEMENT_SOL2_REPO}
            GIT_TAG ${ELEMENT_SOL2_REVISION}
            GIT_SHALLOW ON
            EXCLUDE_FROM_ALL)
        FetchContent_MakeAvailable(sol2)
    else()
        FetchContent_Declare(sol2
            GIT_REPOSITORY ${ELEMENT_SOL2_REPO}
            GIT_TAG ${ELEMENT_SOL2_REVISION}
            GIT_SHALLOW ON)
        FetchContent_Populate(sol2)
        add_subdirectory(${sol2_SOURCE_DIR} ${sol2_BINARY_DIR} EXCLUDE_FROM_ALL)
    endif()

    # Apple Clang 16 + C++20 substitution-failure workaround for sol2's
    # conditional noexcept clauses. The expression
    #     noexcept(std::is_nothrow_copy_assignable_v<T>)
    # causes a hard substitution failure for property/lambda usertype bindings
    # against juce::* member-pointer types when the resulting lua_CFunction
    # signature is non-noexcept (Lua 5.4). Strip the conditional clause so the
    # callable converts cleanly to lua_CFunction.
    set(_sol2_patch_marker "${sol2_SOURCE_DIR}/.element_noexcept_patched")
    if(NOT EXISTS "${_sol2_patch_marker}")
        message(STATUS "Patching sol2 (${ELEMENT_SOL2_REVISION}) for Apple Clang 16 / C++20 noexcept SFINAE")
        file(GLOB_RECURSE _sol2_headers
            "${sol2_SOURCE_DIR}/include/sol/*.hpp")
        foreach(_hdr ${_sol2_headers})
            file(READ "${_hdr}" _sol2_contents)
            string(REPLACE
                "noexcept(std::is_nothrow_copy_assignable_v<T>)"
                ""
                _sol2_contents_patched
                "${_sol2_contents}")
            if(NOT "${_sol2_contents_patched}" STREQUAL "${_sol2_contents}")
                file(WRITE "${_hdr}" "${_sol2_contents_patched}")
            endif()
        endforeach()
        file(WRITE "${_sol2_patch_marker}" "patched")
    endif()
endif()
