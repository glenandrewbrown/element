// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/processor.hpp>
#include "nodes/mathnodes.hpp"

using namespace element;

namespace {

/** Fill cv channels 0 (A) and 1 (B) with scalar values, run render, return output. */
float runMath (Processor& node, float a, float b, int n = 64)
{
    juce::AudioSampleBuffer audio (0, n);
    juce::AudioSampleBuffer cv (3, n);
    juce::MidiBuffer        midi;

    for (int i = 0; i < n; ++i) {
        cv.setSample (0, i, a);
        cv.setSample (1, i, b);
        cv.setSample (2, i, 0.0f);
    }

    RenderContext rc { audio, cv, midi, n };
    node.render (rc);
    return cv.getSample (2, 0);
}

} // namespace

BOOST_AUTO_TEST_SUITE (BinaryMathNodeTests)

// ── AddNode ──────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AddBasic)
{
    AddNode node;
    BOOST_CHECK_CLOSE (runMath (node, 3.0f, 4.0f), 7.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (AddNegatives)
{
    AddNode node;
    BOOST_CHECK_CLOSE (runMath (node, -2.5f, 1.5f), -1.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (AddZero)
{
    AddNode node;
    BOOST_CHECK_CLOSE (runMath (node, 5.0f, 0.0f), 5.0f, 0.001f);
}

// ── SubtractNode ─────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (SubtractBasic)
{
    SubtractNode node;
    BOOST_CHECK_CLOSE (runMath (node, 10.0f, 3.0f), 7.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (SubtractYieldsNegative)
{
    SubtractNode node;
    BOOST_CHECK_CLOSE (runMath (node, 1.0f, 5.0f), -4.0f, 0.001f);
}

// ── MultiplyNode ─────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (MultiplyBasic)
{
    MultiplyNode node;
    BOOST_CHECK_CLOSE (runMath (node, 3.0f, 4.0f), 12.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (MultiplyByZero)
{
    MultiplyNode node;
    BOOST_CHECK_SMALL (runMath (node, 99.0f, 0.0f), 0.001f);
}

BOOST_AUTO_TEST_CASE (MultiplyByNegative)
{
    MultiplyNode node;
    BOOST_CHECK_CLOSE (runMath (node, 4.0f, -2.0f), -8.0f, 0.001f);
}

// ── DivideNode ───────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DivideBasic)
{
    DivideNode node;
    BOOST_CHECK_CLOSE (runMath (node, 10.0f, 2.0f), 5.0f, 0.001f);
}

BOOST_AUTO_TEST_CASE (DivideByZeroYieldsZero)
{
    // Critical: guard must return 0.0, not NaN/Inf
    DivideNode node;
    float result = runMath (node, 1.0f, 0.0f);
    BOOST_CHECK_SMALL (result, 0.001f);
    BOOST_CHECK (! std::isnan (result));
    BOOST_CHECK (! std::isinf (result));
}

BOOST_AUTO_TEST_CASE (DivideByNearZeroYieldsZero)
{
    DivideNode node;
    float result = runMath (node, 1.0f, 5.0e-10f); // below 1e-9 threshold
    BOOST_CHECK_SMALL (result, 0.001f);
    BOOST_CHECK (! std::isnan (result));
}

BOOST_AUTO_TEST_CASE (DivideNegativeByPositive)
{
    DivideNode node;
    BOOST_CHECK_CLOSE (runMath (node, -6.0f, 2.0f), -3.0f, 0.001f);
}

// ── Edge: too few CV channels ─────────────────────────────────────────

BOOST_AUTO_TEST_CASE (TooFewCvChannelsNocrash)
{
    AddNode node;
    juce::AudioSampleBuffer tinyCV (2, 64); // only 2 ch — render bails early
    juce::AudioSampleBuffer audio (0, 64);
    juce::MidiBuffer        midi;
    RenderContext rc { audio, tinyCV, midi, 64 };
    BOOST_CHECK_NO_THROW (node.render (rc));
}

// ── Port layout ───────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (AddNodePorts)
{
    AddNode node;
    node.refreshPorts();
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::CV, true),  2);
    BOOST_CHECK_EQUAL (node.getNumPorts (PortType::CV, false), 1);
}

BOOST_AUTO_TEST_CASE (AllMathNodesSamePortLayout)
{
    AddNode      add;  add.refreshPorts();
    SubtractNode sub;  sub.refreshPorts();
    MultiplyNode mul;  mul.refreshPorts();
    DivideNode   div;  div.refreshPorts();

    BOOST_CHECK_EQUAL (add.getNumPorts (PortType::CV, true),  2);
    BOOST_CHECK_EQUAL (sub.getNumPorts (PortType::CV, true),  2);
    BOOST_CHECK_EQUAL (mul.getNumPorts (PortType::CV, true),  2);
    BOOST_CHECK_EQUAL (div.getNumPorts (PortType::CV, true),  2);
    BOOST_CHECK_EQUAL (add.getNumPorts (PortType::CV, false), 1);
}

// ── Per-sample correctness across a buffer ────────────────────────────

BOOST_AUTO_TEST_CASE (AddAllSamplesCorrect)
{
    AddNode node;
    const int n = 64;
    juce::AudioSampleBuffer audio (0, n);
    juce::AudioSampleBuffer cv (3, n);
    juce::MidiBuffer        midi;

    for (int i = 0; i < n; ++i) {
        cv.setSample (0, i, (float) i);
        cv.setSample (1, i, (float) (n - i));
    }

    RenderContext rc { audio, cv, midi, n };
    node.render (rc);

    for (int i = 0; i < n; ++i)
        BOOST_CHECK_CLOSE (cv.getSample (2, i), (float) n, 0.001f);
}

// ── Name / description ────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (NodeNamesDistinct)
{
    AddNode add; SubtractNode sub; MultiplyNode mul; DivideNode div;
    BOOST_CHECK (add.getName() != sub.getName());
    BOOST_CHECK (mul.getName() != div.getName());
    BOOST_CHECK (add.getName() != mul.getName());
}

BOOST_AUTO_TEST_SUITE_END()
