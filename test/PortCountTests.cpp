// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for PortCount — port configuration value type used throughout the engine.
// Gap: PortCount is set on every processor but had zero direct tests.

#include <boost/test/unit_test.hpp>
#include <element/portcount.hpp>
#include <element/porttype.hpp>

using namespace element;

BOOST_AUTO_TEST_SUITE (PortCountTests)

// ── Construction ─────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultConstructAllZero)
{
    PortCount pc;
    for (int i = 0; i < PortType::Unknown; ++i)
    {
        BOOST_CHECK_EQUAL (pc.inputs[i],  0);
        BOOST_CHECK_EQUAL (pc.outputs[i], 0);
    }
}

BOOST_AUTO_TEST_CASE (CopyConstructEquality)
{
    PortCount a;
    a.set (PortType::Audio, 2, 2);
    PortCount b (a);
    BOOST_CHECK (a == b);
}

// ── set / get ─────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SetAndGetAudio)
{
    PortCount pc;
    pc.set (PortType::Audio, 2, true);
    pc.set (PortType::Audio, 4, false);
    BOOST_CHECK_EQUAL (pc.get (PortType::Audio, true),  2);
    BOOST_CHECK_EQUAL (pc.get (PortType::Audio, false), 4);
}

BOOST_AUTO_TEST_CASE (SetBothInAndOutShorthand)
{
    PortCount pc;
    pc.set (PortType::Midi, 1, 1);
    BOOST_CHECK_EQUAL (pc.get (PortType::Midi, true),  1);
    BOOST_CHECK_EQUAL (pc.get (PortType::Midi, false), 1);
}

BOOST_AUTO_TEST_CASE (SetControlType)
{
    PortCount pc;
    pc.set (PortType::Control, 8, 2);
    BOOST_CHECK_EQUAL (pc.get (PortType::Control, true),  8);
    BOOST_CHECK_EQUAL (pc.get (PortType::Control, false), 2);
}

// ── clear() resets all to zero ────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ClearResetsAllPorts)
{
    PortCount pc;
    pc.set (PortType::Audio, 2, 2);
    pc.set (PortType::Midi,  1, 1);
    pc.clear();
    BOOST_CHECK_EQUAL (pc.get (PortType::Audio, true),  0);
    BOOST_CHECK_EQUAL (pc.get (PortType::Midi,  false), 0);
}

// ── with() returns modified copy ─────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (WithReturnsCopyNotMutatesOriginal)
{
    PortCount orig;
    orig.set (PortType::Audio, 2, 2);
    PortCount modified = orig.with (PortType::Midi, 1, 1);
    BOOST_CHECK_EQUAL (orig.get (PortType::Midi, true), 0); // orig unchanged
    BOOST_CHECK_EQUAL (modified.get (PortType::Midi, true), 1);
    BOOST_CHECK_EQUAL (modified.get (PortType::Audio, true), 2); // preserved
}

// ── equality operator ─────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (EqualityTrueForIdentical)
{
    PortCount a, b;
    a.set (PortType::Audio, 2, 2);
    b.set (PortType::Audio, 2, 2);
    BOOST_CHECK (a == b);
}

BOOST_AUTO_TEST_CASE (EqualityFalseForDifferent)
{
    PortCount a, b;
    a.set (PortType::Audio, 2, 2);
    b.set (PortType::Audio, 2, 4);
    BOOST_CHECK (! (a == b));
}

// ── toPortList / getPorts ─────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ToPortListCountMatchesSetPorts)
{
    PortCount pc;
    pc.set (PortType::Audio, 2, 2); // 2 in + 2 out = 4
    pc.set (PortType::Midi,  1, 1); // 1 in + 1 out = 2
    PortList ports = pc.toPortList();
    BOOST_CHECK_EQUAL (ports.size(), 6);
}

BOOST_AUTO_TEST_CASE (ToPortListEmptyForZeroCounts)
{
    PortCount pc;
    PortList ports = pc.toPortList();
    BOOST_CHECK_EQUAL (ports.size(), 0);
}

BOOST_AUTO_TEST_CASE (ToPortListPortsHaveCorrectFlow)
{
    PortCount pc;
    pc.set (PortType::Audio, 1, 1);
    PortList ports = pc.toPortList();
    bool foundInput  = false;
    bool foundOutput = false;
    for (int i = 0; i < ports.size(); ++i)
    {
        auto port = ports.getPort (i);
        if (port.input)  foundInput  = true;
        if (! port.input) foundOutput = true;
    }
    BOOST_CHECK (foundInput);
    BOOST_CHECK (foundOutput);
}

// ── Assignment operator ───────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AssignmentCopiesAllPorts)
{
    PortCount a;
    a.set (PortType::CV,   4, 4);
    a.set (PortType::Atom, 1, 0);
    PortCount b;
    b = a;
    BOOST_CHECK (a == b);
}

BOOST_AUTO_TEST_SUITE_END()
