// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include "engine/ionode.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (IONodeTests)

BOOST_AUTO_TEST_CASE (Basics)
{
    // Mode, direction, and port-type invariants for all four IO device types.
    IONode audioIn (IONode::audioInputNode);
    BOOST_CHECK_EQUAL (audioIn.getType(), IONode::audioInputNode);
    BOOST_CHECK (audioIn.isInput());
    BOOST_CHECK (! audioIn.isOutput());
    BOOST_CHECK (audioIn.getPortType() == PortType::Audio);

    IONode audioOut (IONode::audioOutputNode);
    BOOST_CHECK_EQUAL (audioOut.getType(), IONode::audioOutputNode);
    BOOST_CHECK (! audioOut.isInput());
    BOOST_CHECK (audioOut.isOutput());
    BOOST_CHECK (audioOut.getPortType() == PortType::Audio);

    IONode midiIn (IONode::midiInputNode);
    BOOST_CHECK (midiIn.isInput());
    BOOST_CHECK (midiIn.getPortType() == PortType::Midi);

    IONode midiOut (IONode::midiOutputNode);
    BOOST_CHECK (midiOut.isOutput());
    BOOST_CHECK (midiOut.getPortType() == PortType::Midi);
}

BOOST_AUTO_TEST_SUITE_END()
