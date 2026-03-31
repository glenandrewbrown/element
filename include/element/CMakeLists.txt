# SPDX-FileCopyrightText: 2026 Kushview, LLC
# SPDX-License-Identifier: GPL-3.0-or-later

# Generate a version header in a specific path (build/include/element/version.h)

# Build number: use ELEMENT_BUILD_NUMBER from parent scope (read from build_number.txt
# by cmake/Element.cmake). CI can override via -DELEMENT_BUILD_NUMBER=N.

# Git hashes for version identification
find_package(Git)
if(GIT_FOUND AND EXISTS "${PROJECT_SOURCE_DIR}/.git")
    execute_process(COMMAND ${GIT_EXECUTABLE} rev-parse --verify HEAD
        WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
        OUTPUT_VARIABLE ELEMENT_GIT_HASH
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET
        RESULT_VARIABLE GIT_HASH_RESULT)

    if(NOT GIT_HASH_RESULT EQUAL 0 OR NOT ELEMENT_GIT_HASH)
        set(ELEMENT_GIT_HASH "unknown")
    endif()

    execute_process(COMMAND ${GIT_EXECUTABLE} rev-parse --short HEAD
        WORKING_DIRECTORY ${PROJECT_SOURCE_DIR}
        OUTPUT_VARIABLE ELEMENT_GIT_SHORT_HASH
        OUTPUT_STRIP_TRAILING_WHITESPACE
        ERROR_QUIET)

    if(NOT ELEMENT_GIT_SHORT_HASH)
        string(SUBSTRING ${ELEMENT_GIT_HASH} 0 8 ELEMENT_GIT_SHORT_HASH)
    endif()
else()
    set(ELEMENT_GIT_HASH "unknown")
    set(ELEMENT_GIT_SHORT_HASH "unknown")
endif()

set(ELEMENT_BUILD_NUMBER ${ELEMENT_BUILD_NUMBER} PARENT_SCOPE)
set(ELEMENT_BUILD_VERSION "${PROJECT_VERSION}.${ELEMENT_BUILD_NUMBER}")
set(ELEMENT_VERSION_STRING ${PROJECT_VERSION_FULL})

set(GENERATED_INCLUDE_DIR ${CMAKE_BINARY_DIR}/include)
set(GENERATED_INCLUDE_DIR ${CMAKE_BINARY_DIR}/include PARENT_SCOPE)
file(MAKE_DIRECTORY ${GENERATED_INCLUDE_DIR}/element)

configure_file(${PROJECT_SOURCE_DIR}/cmake/buildversion.txt.in
    ${CMAKE_BINARY_DIR}/buildversion.txt @ONLY)
configure_file(${PROJECT_SOURCE_DIR}/cmake/version.txt.in
    ${CMAKE_BINARY_DIR}/version.txt @ONLY)
configure_file(${CMAKE_CURRENT_SOURCE_DIR}/version.h.in
    ${GENERATED_INCLUDE_DIR}/element/version.h @ONLY)
