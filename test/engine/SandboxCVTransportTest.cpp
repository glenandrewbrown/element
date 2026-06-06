// SPDX-License-Identifier: GPL-3.0-or-later
//
// FAILING-BY-DESIGN gap marker (P4 item 4, 2026-06-06): CV (Value) signals are
// NOT transported through the sandbox process boundary. The host-side
// SandboxedProcessorNode::render() forwards audio + MIDI only, and the
// SharedAudioBuffer shared-memory layout has no CV channel blocks.
//
// This suite is registered DISABLED in test/CMakeLists.txt. It exists so that:
//   1. the gap is mechanically documented (NOTHING-fake rule) instead of
//      silently shipping CV-dead sandboxed Blocks when sandbox goes default-ON;
//   2. the implementation wave for the v2 layout has a ready acceptance test
//      to un-disable.
//
// Design of record: .omo/plans/sandbox-cv-transport-design-2026-06-06.md
// (Header v2 + CV double-buffer blocks + magic bump 'ELSC' + param-drive /
// pass-through worker semantics).

#include <boost/test/unit_test.hpp>

#include "engine/sandboxipc.hpp"

using namespace element;

//==============================================================================
BOOST_AUTO_TEST_SUITE (SandboxCVTransportTests)

//------------------------------------------------------------------------------
BOOST_AUTO_TEST_CASE (shared_audio_buffer_carries_cv_channels)
{
    // v2 layout requirement: Header grows CV channel-count fields at offsets
    // 56/60 (sizeof == 64) and calculateRequiredSize() accounts for 4 CV
    // blocks (in/out, double-buffered). Today the header is the v1 56-byte
    // audio+MIDI-only layout — this assertion fails BY DESIGN until the
    // sandbox-cv-transport design is implemented.
    BOOST_TEST (sizeof (SharedAudioBuffer::Header) > 56,
                "CV transport not implemented: SharedAudioBuffer::Header is the v1 "
                "audio+MIDI-only layout. See "
                ".omo/plans/sandbox-cv-transport-design-2026-06-06.md");
}

BOOST_AUTO_TEST_SUITE_END()
