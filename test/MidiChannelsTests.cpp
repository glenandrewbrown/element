// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/midichannels.hpp>

using namespace element;

BOOST_AUTO_TEST_SUITE (MidiChannelsTests)

BOOST_AUTO_TEST_CASE (DefaultIsOmni)
{
    MidiChannels mc;
    BOOST_CHECK (mc.isOmni());
    // When omni, every channel reports on
    for (int ch = 1; ch <= 16; ++ch)
        BOOST_CHECK (mc.isOn (ch));
}

BOOST_AUTO_TEST_CASE (ConstructFromChannelZeroIsOmni)
{
    MidiChannels mc (0);
    BOOST_CHECK (mc.isOmni());
}

BOOST_AUTO_TEST_CASE (ConstructFromNegativeIsOmni)
{
    MidiChannels mc (-1);
    BOOST_CHECK (mc.isOmni());
}

BOOST_AUTO_TEST_CASE (ConstructFromSpecificChannel)
{
    for (int ch = 1; ch <= 16; ++ch)
    {
        MidiChannels mc (ch);
        BOOST_CHECK (! mc.isOmni());
        BOOST_CHECK (mc.isOn (ch));
        // all other channels off
        for (int other = 1; other <= 16; ++other)
            if (other != ch)
                BOOST_CHECK (mc.isOff (other));
    }
}

BOOST_AUTO_TEST_CASE (SetChannelClearsOmni)
{
    MidiChannels mc; // omni
    mc.setChannel (3);
    BOOST_CHECK (! mc.isOmni());
    BOOST_CHECK (mc.isOn (3));
    BOOST_CHECK (mc.isOff (1));
}

BOOST_AUTO_TEST_CASE (SetOmniTrue)
{
    MidiChannels mc (5);
    BOOST_CHECK (! mc.isOmni());
    mc.setOmni (true);
    BOOST_CHECK (mc.isOmni());
    for (int ch = 1; ch <= 16; ++ch)
        BOOST_CHECK (mc.isOn (ch));
}

BOOST_AUTO_TEST_CASE (SetOmniFalse)
{
    MidiChannels mc; // omni
    mc.setOmni (false);
    BOOST_CHECK (! mc.isOmni());
    // All channels now off (no individual ch set yet)
    for (int ch = 1; ch <= 16; ++ch)
        BOOST_CHECK (mc.isOff (ch));
}

BOOST_AUTO_TEST_CASE (IsOnVsIsOffMutuallyExclusive)
{
    MidiChannels mc (7);
    BOOST_CHECK (mc.isOn (7));
    BOOST_CHECK (! mc.isOff (7));
    BOOST_CHECK (mc.isOff (1));
    BOOST_CHECK (! mc.isOn (1));
}

BOOST_AUTO_TEST_CASE (Reset)
{
    MidiChannels mc (4);
    BOOST_CHECK (! mc.isOmni());
    mc.reset();
    BOOST_CHECK (mc.isOmni());
}

BOOST_AUTO_TEST_CASE (CopyConstructor)
{
    MidiChannels a (9);
    MidiChannels b (a);
    BOOST_CHECK (! b.isOmni());
    BOOST_CHECK (b.isOn (9));
    BOOST_CHECK (b.isOff (1));
}

BOOST_AUTO_TEST_CASE (Assignment)
{
    MidiChannels a (12);
    MidiChannels b;
    b = a;
    BOOST_CHECK (! b.isOmni());
    BOOST_CHECK (b.isOn (12));
}

BOOST_AUTO_TEST_CASE (SetChannels)
{
    MidiChannels mc;
    juce::BigInteger bits;
    bits.setBit (0, false); // not omni
    bits.setBit (3, true);  // channel 3
    bits.setBit (7, true);  // channel 7
    mc.setChannels (bits);
    BOOST_CHECK (! mc.isOmni());
    BOOST_CHECK (mc.isOn (3));
    BOOST_CHECK (mc.isOn (7));
    BOOST_CHECK (mc.isOff (1));
}

BOOST_AUTO_TEST_SUITE_END()
