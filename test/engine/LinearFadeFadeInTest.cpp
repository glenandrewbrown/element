// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
// Gap: LinearFadeTest.cpp only tests fade-OUT. This covers fade-IN.

#include <boost/test/unit_test.hpp>
#include "engine/linearfade.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (LinearFadeFadeInTest)

BOOST_AUTO_TEST_CASE (FadeInStartsAtZeroEndsAtOne)
{
    LinearFade fader;
    fader.setSampleRate (44100.0);
    fader.setLength (0.02);
    fader.setFadesIn (true);

    BOOST_REQUIRE (! fader.isActive());
    // Before start envelope should be 0 (fade-in begins at 0)
    BOOST_REQUIRE_CLOSE (fader.getCurrentEnvelopeValue(), 0.0f, 0.001f);

    fader.startFading();
    BOOST_REQUIRE (fader.isActive());

    float lastValue = 0.0f;
    while (fader.isActive())
    {
        float gain = fader.getNextEnvelopeValue();
        BOOST_CHECK_GE (gain, 0.0f);
        BOOST_CHECK_LE (gain, 1.0f);
        lastValue = gain;
    }

    BOOST_CHECK (! fader.isActive());
    // After completing, envelope should be at full (1.0)
    BOOST_CHECK_CLOSE (fader.getCurrentEnvelopeValue(), 1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (FadeInReset)
{
    LinearFade fader;
    fader.setSampleRate (44100.0);
    fader.setLength (0.005);
    fader.setFadesIn (true);
    fader.startFading();

    while (fader.isActive())
        fader.getNextEnvelopeValue();

    fader.reset();
    // After reset, fade-in should restart from 0
    BOOST_CHECK_CLOSE (fader.getCurrentEnvelopeValue(), 0.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (FadeInMonotonicallyIncreasing)
{
    LinearFade fader;
    fader.setSampleRate (44100.0);
    fader.setLength (0.01);
    fader.setFadesIn (true);
    fader.startFading();

    float prev = -1.0f;
    while (fader.isActive())
    {
        float val = fader.getNextEnvelopeValue();
        BOOST_CHECK_GE (val, prev);
        prev = val;
    }
}

BOOST_AUTO_TEST_CASE (FadeOutMonotonicallyDecreasing)
{
    LinearFade fader;
    fader.setSampleRate (44100.0);
    fader.setLength (0.01);
    fader.setFadesIn (false);
    fader.startFading();

    float prev = 2.0f;
    while (fader.isActive())
    {
        float val = fader.getNextEnvelopeValue();
        BOOST_CHECK_LE (val, prev);
        prev = val;
    }
}

BOOST_AUTO_TEST_CASE (NotActiveBeforeStart)
{
    LinearFade fader;
    fader.setSampleRate (44100.0);
    fader.setLength (0.02);
    fader.setFadesIn (true);
    BOOST_CHECK (! fader.isActive());
}

BOOST_AUTO_TEST_CASE (SampleRateAffectsDuration)
{
    // At higher sample rate, same length (seconds) = more samples = longer active period
    LinearFade f44, f96;
    f44.setSampleRate (44100.0); f44.setLength (0.01); f44.setFadesIn (true); f44.startFading();
    f96.setSampleRate (96000.0); f96.setLength (0.01); f96.setFadesIn (true); f96.startFading();

    int count44 = 0, count96 = 0;
    while (f44.isActive()) { f44.getNextEnvelopeValue(); ++count44; }
    while (f96.isActive()) { f96.getNextEnvelopeValue(); ++count96; }

    BOOST_CHECK_GT (count96, count44);
}

BOOST_AUTO_TEST_SUITE_END()
