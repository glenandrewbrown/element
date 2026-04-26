// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <cmath>
#include <element/node.h>
#include <element/processor.hpp>

namespace element {

// =============================================================================
// Operation tags — select binary CV math at compile time.
struct CvOpAdd      {};
struct CvOpSubtract {};
struct CvOpMultiply {};
struct CvOpDivide   {};

namespace detail {

template <typename Op>
inline float cvApply (float a, float b) noexcept;

template <> inline float cvApply<CvOpAdd>      (float a, float b) noexcept { return a + b; }
template <> inline float cvApply<CvOpSubtract> (float a, float b) noexcept { return a - b; }
template <> inline float cvApply<CvOpMultiply> (float a, float b) noexcept { return a * b; }
template <> inline float cvApply<CvOpDivide>   (float a, float b) noexcept
{
    return (std::fabs (b) < 1.0e-9f) ? 0.0f : (a / b);
}

} // namespace detail

// =============================================================================
/** Template base for 2-in / 1-out CV math nodes.
    Concrete nodes are thin subclasses that supply name, ID, and uniqueId. */
template <typename Op>
class BinaryMathNode : public Processor
{
public:
    BinaryMathNode (const char* nodeName,
                    const char* nodeId,
                    int         nodeUniqueId)
        : Processor (0), id (nodeId), uniqueId (nodeUniqueId)
    {
        setName (nodeName);
    }

    ~BinaryMathNode() override = default;

    // =========================================================================
    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate, maxBufferSize);
    }

    void releaseResources() override {}

    /** rc.cv layout: channel 0 = inA, channel 1 = inB, channel 2 = out. */
    void render (RenderContext& rc) override
    {
        if (rc.cv.getNumChannels() < 3)
            return;

        const int   n   = rc.cv.getNumSamples();
        const float* a  = rc.cv.getReadPointer (0);
        const float* b  = rc.cv.getReadPointer (1);
        float*       o  = rc.cv.getWritePointer (2);

        for (int i = 0; i < n; ++i)
            o[i] = detail::cvApply<Op> (a[i], b[i]);
    }

    // =========================================================================
    void getState (juce::MemoryBlock&) override {}
    void setState (const void*, int) override {}

    // =========================================================================
    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier   = id;
        desc.uniqueId           = uniqueId;
        desc.name               = getName();
        desc.descriptiveName    = juce::String (getName()) + " — binary CV math";
        desc.pluginFormatName   = EL_NODE_FORMAT_NAME;
        desc.manufacturerName   = EL_NODE_FORMAT_AUTHOR;
        desc.version            = "1.0.0";
        desc.hasSharedContainer = false;
        desc.isInstrument       = false;
        desc.numInputChannels   = 0;
        desc.numOutputChannels  = 0;
    }

    void refreshPorts() override
    {
        PortList newPorts;
        // Two CV inputs (separate channel indices per flow direction).
        newPorts.add (PortType::CV, 0, 0, "cv_in_a", "A",      true);
        newPorts.add (PortType::CV, 1, 1, "cv_in_b", "B",      true);
        // One CV output.
        newPorts.add (PortType::CV, 2, 0, "cv_out",  "CV Out", false);
        setPorts (newPorts);
    }

private:
    const juce::String id;
    const int          uniqueId;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (BinaryMathNode)
};

// =============================================================================
/** out = inA + inB.  ID: element.add */
class AddNode : public BinaryMathNode<CvOpAdd>
{
public:
    AddNode() : BinaryMathNode<CvOpAdd> ("Add", "element.add", 0x656c6164 /* 'elad' */) {}
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AddNode)
};

/** out = inA − inB.  ID: element.subtract */
class SubtractNode : public BinaryMathNode<CvOpSubtract>
{
public:
    SubtractNode() : BinaryMathNode<CvOpSubtract> ("Subtract", "element.subtract", 0x656c7375 /* 'elsu' */) {}
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SubtractNode)
};

/** out = inA × inB.  ID: element.multiply */
class MultiplyNode : public BinaryMathNode<CvOpMultiply>
{
public:
    MultiplyNode() : BinaryMathNode<CvOpMultiply> ("Multiply", "element.multiply", 0x656c6d75 /* 'elmu' */) {}
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MultiplyNode)
};

/** out = inA / inB (returns 0 when |inB| < 1e-9).  ID: element.divide */
class DivideNode : public BinaryMathNode<CvOpDivide>
{
public:
    DivideNode() : BinaryMathNode<CvOpDivide> ("Divide", "element.divide", 0x656c6476 /* 'eldv' */) {}
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DivideNode)
};

} // namespace element
