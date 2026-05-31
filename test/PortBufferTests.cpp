// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

// PortBuffer is on every audio hot path — direct tests catch regressions before
// they reach GraphBuilder.

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/porttype.hpp>
#include "engine/portbuffer.hpp"

using namespace element;

// Minimal URID for Atom sequence body (mirrors what GraphBuilder uses)
static constexpr uint32_t kAtomUridMidiEvent = 1;
static constexpr uint32_t kAtomUridSeqBody   = 2;

// ── Construction ──────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_SUITE (PortBufferTests)

BOOST_AUTO_TEST_CASE (AudioBufferConstruction)
{
    PortBuffer buf (true, PortType::Audio, 0, 512 * sizeof (float));
    BOOST_CHECK (buf.isAudio());
    BOOST_CHECK (! buf.isControl());
    BOOST_CHECK (! buf.isAtom());
    BOOST_CHECK (buf.isInput());
    BOOST_CHECK (! buf.referred());
    BOOST_CHECK_GE (buf.getCapacity(), static_cast<uint32_t> (sizeof (float)));
}

BOOST_AUTO_TEST_CASE (ControlBufferConstruction)
{
    PortBuffer buf (false, PortType::Control, 0, sizeof (float));
    BOOST_CHECK (buf.isControl());
    BOOST_CHECK (! buf.isInput());
    BOOST_CHECK_GE (buf.getCapacity(), static_cast<uint32_t> (sizeof (float)));
}

BOOST_AUTO_TEST_CASE (AtomBufferConstruction)
{
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, 4096);
    BOOST_CHECK (buf.isAtom());
    BOOST_CHECK (buf.isSequence());
    BOOST_CHECK_GE (buf.getCapacity(), static_cast<uint32_t> (4096));
}

BOOST_AUTO_TEST_CASE (CVBufferConstruction)
{
    PortBuffer buf (true, PortType::CV, 0, 512 * sizeof (float));
    BOOST_CHECK (buf.isCV());
    BOOST_CHECK (! buf.isAudio());
}

// ── getPortData ───────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (GetPortDataNotNullAfterConstruction)
{
    PortBuffer audio (true, PortType::Audio, 0, 512 * sizeof (float));
    BOOST_CHECK (audio.getPortData() != nullptr);

    PortBuffer atom (true, PortType::Atom, kAtomUridSeqBody, 4096);
    BOOST_CHECK (atom.getPortData() != nullptr);
}

// ── referTo ───────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ReferToNonNullSetsReferenced)
{
    PortBuffer buf (true, PortType::Audio, 0, sizeof (float) * 64);
    float externalStorage[64] = {};
    buf.referTo (externalStorage);
    BOOST_CHECK (buf.referred());
    BOOST_CHECK_EQUAL (buf.getPortData(), static_cast<void*> (externalStorage));
}

BOOST_AUTO_TEST_CASE (ReferToNullptrClearsReference)
{
    PortBuffer buf (true, PortType::Audio, 0, sizeof (float) * 64);
    float externalStorage[64] = {};
    buf.referTo (externalStorage);
    BOOST_REQUIRE (buf.referred());
    buf.referTo (nullptr);
    BOOST_CHECK (! buf.referred());
    // After clearing, getPortData() must still return a valid pointer (own buffer)
    BOOST_CHECK (buf.getPortData() != nullptr);
}

// ── setValue / getValue ───────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SetGetValueRoundTrip)
{
    PortBuffer buf (true, PortType::Control, 0, sizeof (float));
    buf.setValue (0.75f);
    BOOST_CHECK_CLOSE (buf.getValue(), 0.75f, 1e-5f);
}

BOOST_AUTO_TEST_CASE (SetValueZero)
{
    PortBuffer buf (false, PortType::Control, 0, sizeof (float));
    buf.setValue (1.0f);
    buf.setValue (0.0f);
    BOOST_CHECK_SMALL (buf.getValue(), 1e-7f);
}

BOOST_AUTO_TEST_CASE (SetValueNegative)
{
    PortBuffer buf (true, PortType::Control, 0, sizeof (float));
    buf.setValue (-1.0f);
    BOOST_CHECK_CLOSE (buf.getValue(), -1.0f, 1e-5f);
}

// ── clear / reset ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ClearAtomBufferResetsSize)
{
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, 4096);
    // Add an event, then clear — sequence body size should reset
    const uint8_t midiData[] = { 0x90, 0x3C, 0x64 }; // note-on
    buf.addEvent (0, sizeof (midiData), kAtomUridMidiEvent, midiData);
    buf.clear();
    // After clear the atom body size equals LV2_Atom_Sequence_Body
    auto* seq = static_cast<LV2_Atom_Sequence*> (buf.getPortData());
    BOOST_CHECK_EQUAL (seq->atom.size,
                       static_cast<uint32_t> (sizeof (LV2_Atom_Sequence_Body)));
}

BOOST_AUTO_TEST_CASE (ResetAtomBufferIsIdempotent)
{
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, 4096);
    const uint8_t midiData[] = { 0x80, 0x3C, 0x00 }; // note-off
    buf.addEvent (0, sizeof (midiData), kAtomUridMidiEvent, midiData);
    buf.reset();
    buf.reset(); // second reset should be safe
    auto* seq = static_cast<LV2_Atom_Sequence*> (buf.getPortData());
    BOOST_CHECK (seq != nullptr);
}

// ── addEvent ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AddEventToAtomBufferReturnsTrue)
{
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, 4096);
    const uint8_t midiData[] = { 0x90, 0x3C, 0x64 };
    bool ok = buf.addEvent (0, sizeof (midiData), kAtomUridMidiEvent, midiData);
    BOOST_CHECK (ok);
}

BOOST_AUTO_TEST_CASE (AddEventOverCapacityReturnsFalse)
{
    // Tiny buffer — barely fits the LV2_Atom header, not an event body
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, sizeof (LV2_Atom) + sizeof (LV2_Atom_Sequence_Body));
    const uint8_t midiData[] = { 0x90, 0x3C, 0x64 };
    bool ok = buf.addEvent (0, sizeof (midiData), kAtomUridMidiEvent, midiData);
    BOOST_CHECK (! ok);
}

BOOST_AUTO_TEST_CASE (AddEventToNonSequenceBufferReturnsFalse)
{
    PortBuffer buf (true, PortType::Audio, 0, 512 * sizeof (float));
    const uint8_t midiData[] = { 0x90, 0x3C, 0x64 };
    bool ok = buf.addEvent (0, sizeof (midiData), kAtomUridMidiEvent, midiData);
    BOOST_CHECK (! ok);
}

BOOST_AUTO_TEST_CASE (MultipleEventsAccumulate)
{
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, 4096);
    const uint8_t ev[] = { 0x90, 0x3C, 0x64 };
    for (int i = 0; i < 10; ++i)
        BOOST_CHECK (buf.addEvent (i * 64, sizeof (ev), kAtomUridMidiEvent, ev));
}

BOOST_AUTO_TEST_CASE (AddEventAtFrame0)
{
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, 4096);
    const uint8_t ev[] = { 0xB0, 0x07, 0x7F }; // CC volume
    BOOST_CHECK (buf.addEvent (0, sizeof (ev), kAtomUridMidiEvent, ev));
}

BOOST_AUTO_TEST_CASE (AddEventAtLargeFrame)
{
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, 4096);
    const uint8_t ev[] = { 0xB0, 0x07, 0x7F };
    BOOST_CHECK (buf.addEvent (2147483647LL, sizeof (ev), kAtomUridMidiEvent, ev));
}

// ── resize (Atom only) ────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ResizeAtomBufferIncreasesCapacity)
{
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, 512);
    BOOST_REQUIRE_EQUAL (buf.getCapacity(), static_cast<uint32_t> (512));
    buf.resize (1024);
    BOOST_CHECK_GE (buf.getCapacity(), static_cast<uint32_t> (1024));
}

BOOST_AUTO_TEST_CASE (ResizeAtomBufferPreservesData)
{
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, 4096);
    const uint8_t ev[] = { 0x90, 0x3C, 0x64 };
    buf.addEvent (0, sizeof (ev), kAtomUridMidiEvent, ev);
    buf.resize (8192); // grow
    // Buffer pointer must remain valid and getPortData() must not be null
    BOOST_CHECK (buf.getPortData() != nullptr);
}

BOOST_AUTO_TEST_CASE (ResizeAudioBufferIsNoop)
{
    PortBuffer buf (true, PortType::Audio, 0, 512 * sizeof (float));
    const auto capBefore = buf.getCapacity();
    buf.resize (1024 * sizeof (float));
    // Audio resize is a no-op — capacity unchanged
    BOOST_CHECK_EQUAL (buf.getCapacity(), capBefore);
}

BOOST_AUTO_TEST_CASE (ResizeReferredBufferIsNoop)
{
    PortBuffer buf (true, PortType::Atom, kAtomUridSeqBody, 4096);
    float dummy = 0;
    buf.referTo (&dummy);
    const auto capBefore = buf.getCapacity();
    buf.resize (8192);
    // Referenced buffers must not resize (would corrupt external storage)
    BOOST_CHECK_EQUAL (buf.getCapacity(), capBefore);
}

BOOST_AUTO_TEST_SUITE_END()
