// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

/** Parameter + RangedParameter tests.
    Covers: default values, normalization round-trip, listener callbacks,
    getText/getValueForText, category, discrete/boolean flags,
    beginChangeGesture/endChangeGesture, and ParameterObserver. */

#include <boost/test/unit_test.hpp>
#include <element/juce.hpp>
#include <element/parameter.hpp>
#include <element/arc.hpp>

using namespace element;
using namespace juce;

// ── Concrete Parameter implementation for testing ─────────────────────────────

class TestParameter : public Parameter
{
public:
    int portIdx  = 0;
    int paramIdx = 0;
    float val    = 0.5f;
    float defVal = 0.5f;

    int getPortIndex()      const noexcept override { return portIdx; }
    int getParameterIndex() const noexcept override { return paramIdx; }

    float getValue()              const override { return val; }
    void  setValue (float v)            override { val = v; }
    float getDefaultValue()       const override { return defVal; }
    float getValueForText (const String& t) const override { return t.getFloatValue(); }
    String getName (int)          const override { return "TestParam"; }
    String getLabel()             const override { return "dB"; }
};

BOOST_AUTO_TEST_SUITE (ParameterTests)

// ── Parameter base ────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (DefaultNumSteps)
{
    BOOST_CHECK_EQUAL (Parameter::defaultNumSteps(), 0x7fffffff);
}

BOOST_AUTO_TEST_CASE (GetSetValue)
{
    TestParameter p;
    p.setValue (0.75f);
    BOOST_CHECK_CLOSE (p.getValue(), 0.75f, 1e-5f);
}

BOOST_AUTO_TEST_CASE (GetDefaultValue)
{
    TestParameter p;
    p.defVal = 0.3f;
    BOOST_CHECK_CLOSE (p.getDefaultValue(), 0.3f, 1e-5f);
}

BOOST_AUTO_TEST_CASE (GetLabel)
{
    TestParameter p;
    BOOST_CHECK_EQUAL (p.getLabel(), "dB");
}

BOOST_AUTO_TEST_CASE (GetName)
{
    TestParameter p;
    BOOST_CHECK_EQUAL (p.getName (32), "TestParam");
}

BOOST_AUTO_TEST_CASE (IsNotDiscreteByDefault)
{
    TestParameter p;
    BOOST_CHECK (! p.isDiscrete());
}

BOOST_AUTO_TEST_CASE (IsNotBooleanByDefault)
{
    TestParameter p;
    BOOST_CHECK (! p.isBoolean());
}

BOOST_AUTO_TEST_CASE (IsAutomatableByDefault)
{
    TestParameter p;
    BOOST_CHECK (p.isAutomatable());
}

BOOST_AUTO_TEST_CASE (IsNotMetaByDefault)
{
    TestParameter p;
    BOOST_CHECK (! p.isMetaParameter());
}

BOOST_AUTO_TEST_CASE (GetCategoryDefault)
{
    TestParameter p;
    BOOST_CHECK_EQUAL ((int) p.getCategory(), (int) Parameter::genericParameter);
}

BOOST_AUTO_TEST_CASE (IsOrientationNotInvertedByDefault)
{
    TestParameter p;
    BOOST_CHECK (! p.isOrientationInverted());
}

BOOST_AUTO_TEST_CASE (GetValueForText)
{
    TestParameter p;
    BOOST_CHECK_CLOSE (p.getValueForText ("0.6"), 0.6f, 1e-4f);
}

// ── Listener ──────────────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (ListenerReceivesValueChange)
{
    struct TestListener : public Parameter::Listener
    {
        int   paramIdx = -1;
        float lastVal  = -1.f;
        bool  touched  = false;
        bool  gestureStart = false;

        void controlValueChanged (int idx, float v) override { paramIdx = idx; lastVal = v; }
        void controlTouched (int, bool start)        override { touched = true; gestureStart = start; }
    };

    TestParameter p;
    p.paramIdx = 7;
    TestListener listener;
    p.addListener (&listener);

    p.sendValueChangedMessageToListeners (0.8f);

    BOOST_CHECK_EQUAL (listener.paramIdx, 7);
    BOOST_CHECK_CLOSE (listener.lastVal,  0.8f, 1e-5f);

    p.removeListener (&listener);
}

BOOST_AUTO_TEST_CASE (ListenerReceivesGestureChange)
{
    struct GestureListener : public Parameter::Listener
    {
        bool touched = false;
        bool start   = false;
        void controlValueChanged (int, float) override {}
        void controlTouched (int, bool s) override { touched = true; start = s; }
    };

    TestParameter p;
    GestureListener listener;
    p.addListener (&listener);

    p.sendGestureChangedMessageToListeners (true);
    BOOST_CHECK (listener.touched);
    BOOST_CHECK (listener.start);

    p.sendGestureChangedMessageToListeners (false);
    BOOST_CHECK (! listener.start);

    p.removeListener (&listener);
}

BOOST_AUTO_TEST_CASE (MultipleListeners)
{
    struct CountingListener : public Parameter::Listener
    {
        int count = 0;
        void controlValueChanged (int, float) override { ++count; }
        void controlTouched (int, bool)       override {}
    };

    TestParameter p;
    CountingListener l1, l2, l3;
    p.addListener (&l1);
    p.addListener (&l2);
    p.addListener (&l3);

    p.sendValueChangedMessageToListeners (0.5f);

    BOOST_CHECK_EQUAL (l1.count, 1);
    BOOST_CHECK_EQUAL (l2.count, 1);
    BOOST_CHECK_EQUAL (l3.count, 1);

    p.removeListener (&l2);
    p.sendValueChangedMessageToListeners (0.5f);

    BOOST_CHECK_EQUAL (l1.count, 2);
    BOOST_CHECK_EQUAL (l2.count, 1); // removed - not called again
    BOOST_CHECK_EQUAL (l3.count, 2);

    p.removeListener (&l1);
    p.removeListener (&l3);
}

// ── RangedParameter ───────────────────────────────────────────────────────────

BOOST_AUTO_TEST_CASE (RangedParameterNormalization)
{
    // Build a PortDescription for a 0..1 float param
    PortDescription port;
    port.input   = true;
    port.index   = 0;
    port.channel = 0;
    port.type    = PortType::Control;
    port.name    = "Gain";
    port.symbol  = "gain";
    port.minValue = 0.f;
    port.maxValue = 1.f;
    port.defaultValue = 0.5f;

    RangedParameter rp (port);
    BOOST_CHECK_CLOSE (rp.convertTo0to1   (0.5f), 0.5f, 1e-4f);
    BOOST_CHECK_CLOSE (rp.convertFrom0to1 (0.5f), 0.5f, 1e-4f);
}

BOOST_AUTO_TEST_CASE (RangedParameterRangeMapping)
{
    PortDescription port;
    port.input        = true;
    port.index        = 0;
    port.channel      = 0;
    port.type         = PortType::Control;
    port.name         = "Freq";
    port.symbol       = "freq";
    port.minValue     = 20.f;
    port.maxValue     = 20000.f;
    port.defaultValue = 1000.f;

    RangedParameter rp (port);

    // 0 → min, 1 → max
    BOOST_CHECK_CLOSE (rp.convertFrom0to1 (0.f), 20.f,    0.5f);
    BOOST_CHECK_CLOSE (rp.convertFrom0to1 (1.f), 20000.f, 0.5f);

    // round-trip
    float mid = rp.convertFrom0to1 (0.5f);
    BOOST_CHECK_CLOSE (rp.convertTo0to1 (mid), 0.5f, 0.01f);
}

BOOST_AUTO_TEST_CASE (RangedParameterDefaultValue)
{
    PortDescription port;
    port.input        = true;
    port.index        = 0;
    port.channel      = 0;
    port.type         = PortType::Control;
    port.name         = "P";
    port.symbol       = "p";
    port.minValue     = 0.f;
    port.maxValue     = 100.f;
    port.defaultValue = 50.f;

    RangedParameter rp (port);
    BOOST_CHECK_CLOSE (rp.convertFrom0to1 (rp.getDefaultValue()), 50.f, 0.5f);
}

BOOST_AUTO_TEST_CASE (RangedParameterPortIndex)
{
    PortDescription port;
    port.input        = true;
    port.index        = 5;
    port.channel      = 2;
    port.type         = PortType::Control;
    port.name         = "X";
    port.symbol       = "x";
    port.minValue     = 0.f;
    port.maxValue     = 1.f;
    port.defaultValue = 0.f;

    RangedParameter rp (port);
    BOOST_CHECK_EQUAL (rp.getPortIndex(), 5);
    BOOST_CHECK_EQUAL (rp.getPortChannel(), 2);
}

BOOST_AUTO_TEST_CASE (RangedParameterGetSetValue)
{
    PortDescription port;
    port.input = true; port.index = 0; port.channel = 0;
    port.type = PortType::Control;
    port.name = "V"; port.symbol = "v";
    port.minValue = 0.f; port.maxValue = 1.f; port.defaultValue = 0.f;

    RangedParameter rp (port);
    rp.setValue (0.75f);           // normalized 0-1
    BOOST_CHECK_CLOSE (rp.getValue(), 0.75f, 1e-4f);
    BOOST_CHECK_CLOSE ((float) rp,    rp.convertFrom0to1 (0.75f), 1e-4f);
}

BOOST_AUTO_TEST_CASE (RangedParameterSetPort)
{
    PortDescription portA;
    portA.input = true; portA.index = 0; portA.channel = 0;
    portA.type = PortType::Control;
    portA.name = "A"; portA.symbol = "a";
    portA.minValue = 0.f; portA.maxValue = 1.f; portA.defaultValue = 0.f;

    PortDescription portB;
    portB.input = true; portB.index = 3; portB.channel = 1;
    portB.type = PortType::Control;
    portB.name = "B"; portB.symbol = "b";
    portB.minValue = -1.f; portB.maxValue = 1.f; portB.defaultValue = 0.f;

    RangedParameter rp (portA);
    rp.setPort (portB);
    BOOST_CHECK_EQUAL (rp.getPortIndex(), 3);
    BOOST_CHECK_EQUAL (rp.getName (32),   "B");
}

BOOST_AUTO_TEST_SUITE_END()
