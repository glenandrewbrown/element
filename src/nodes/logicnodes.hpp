// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <atomic>
#include <cmath>

#include <element/node.h>
#include <element/processor.hpp>

namespace element {

// =============================================================================
/** Compares two CV signals and emits a boolean CV (1.0 / 0.0).

    rc.cv layout: channel 0 = inA, channel 1 = inB, channel 2 = out.
    out[i] = (a[i] <op> b[i]) ? 1 : 0. Equality tests use a configurable
    epsilon. The operator is runtime-switchable (thread-safe).

    Ports: 2 CV in, 1 CV out.  ID: element.compare */
class ComparatorNode : public Processor
{
public:
    enum class Op : int
    {
        greater = 0,    ///< a >  b
        greaterEqual,   ///< a >= b
        less,           ///< a <  b
        lessEqual,      ///< a <= b
        equal,          ///< |a - b| <= epsilon
        notEqual        ///< |a - b| >  epsilon
    };

    static constexpr int numOps = 6;

    ComparatorNode() : Processor (0)
    {
        setName ("Comparator");
    }

    ~ComparatorNode() override = default;

    // =========================================================================
    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate, maxBufferSize);
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        if (rc.cv.getNumChannels() < 3)
            return;

        const int    n   = rc.cv.getNumSamples();
        const Op     o   = (Op) op.load (std::memory_order_relaxed);
        const float  eps = epsilon.load (std::memory_order_relaxed);
        const float* a   = rc.cv.getReadPointer (0);
        const float* b   = rc.cv.getReadPointer (1);
        float*       out = rc.cv.getWritePointer (2);

        for (int i = 0; i < n; ++i)
            out[i] = compare (o, a[i], b[i], eps) ? 1.0f : 0.0f;
    }

    /** Bypass = condition false: zero the output, never touch inputs. */
    void renderBypassed (RenderContext& rc) override
    {
        if (rc.cv.getNumChannels() >= 3)
            rc.cv.clear (2, 0, rc.cv.getNumSamples());
    }

    // =========================================================================
    void getState (juce::MemoryBlock& block) override
    {
        const int32_t o = (int32_t) op.load (std::memory_order_relaxed);
        const float e = epsilon.load (std::memory_order_relaxed);
        block.append (&o, sizeof (o));
        block.append (&e, sizeof (e));
    }

    void setState (const void* data, int sizeInBytes) override
    {
        if (sizeInBytes >= (int) (sizeof (int32_t) + sizeof (float)))
        {
            const auto* bytes = static_cast<const char*> (data);
            int32_t o = 0;
            float e = 0.0f;
            memcpy (&o, bytes, sizeof (o));
            memcpy (&e, bytes + sizeof (o), sizeof (e));
            op.store (juce::jlimit (0, numOps - 1, (int) o), std::memory_order_relaxed);
            epsilon.store (juce::jmax (0.0f, e), std::memory_order_relaxed);
        }
    }

    // =========================================================================
    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier   = "element.compare";
        desc.uniqueId           = 0x656c6370; // 'elcp'
        desc.name               = "Comparator";
        desc.descriptiveName    = "Compares two CV signals -> boolean CV (1/0)";
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
        newPorts.add (PortType::CV, 0, 0, "cv_in_a", "A", true);
        newPorts.add (PortType::CV, 1, 1, "cv_in_b", "B", true);
        newPorts.add (PortType::CV, 2, 0, "cv_out", "Out", false);
        setPorts (newPorts);
    }

    // =========================================================================
    /** Set the comparison operator (thread-safe). */
    void setOperator (Op o) noexcept
    {
        op.store (juce::jlimit (0, numOps - 1, (int) o), std::memory_order_relaxed);
    }

    Op getOperator() const noexcept { return (Op) op.load (std::memory_order_relaxed); }

    /** Set the equality epsilon (thread-safe, >= 0). */
    void setEpsilon (float e) noexcept
    {
        epsilon.store (juce::jmax (0.0f, e), std::memory_order_relaxed);
    }

    float getEpsilon() const noexcept { return epsilon.load (std::memory_order_relaxed); }

private:
    static bool compare (Op o, float a, float b, float eps) noexcept
    {
        switch (o)
        {
            case Op::greater:      return a > b;
            case Op::greaterEqual: return a >= b;
            case Op::less:         return a < b;
            case Op::lessEqual:    return a <= b;
            case Op::equal:        return std::fabs (a - b) <= eps;
            case Op::notEqual:     return std::fabs (a - b) > eps;
        }
        return false;
    }

    std::atomic<int>   op      { (int) Op::greater };
    std::atomic<float> epsilon { 1.0e-3f };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ComparatorNode)
};

// =============================================================================
/** Boolean logic on two CV signals. An input is "true" when >= 0.5.

    rc.cv layout: channel 0 = inA, channel 1 = inB, channel 2 = out.
    NOT mode uses input A only.

    Ports: 2 CV in, 1 CV out.  ID: element.logic */
class LogicGateNode : public Processor
{
public:
    enum class Mode : int
    {
        andMode = 0,
        orMode,
        xorMode,
        nandMode,
        norMode,
        notMode ///< !A (input B ignored)
    };

    static constexpr int numModes = 6;

    LogicGateNode() : Processor (0)
    {
        setName ("Logic Gate");
    }

    ~LogicGateNode() override = default;

    // =========================================================================
    void prepareToRender (double sampleRate, int maxBufferSize) override
    {
        juce::ignoreUnused (sampleRate, maxBufferSize);
    }

    void releaseResources() override {}

    void render (RenderContext& rc) override
    {
        if (rc.cv.getNumChannels() < 3)
            return;

        const int    n   = rc.cv.getNumSamples();
        const Mode   m   = (Mode) mode.load (std::memory_order_relaxed);
        const float* a   = rc.cv.getReadPointer (0);
        const float* b   = rc.cv.getReadPointer (1);
        float*       out = rc.cv.getWritePointer (2);

        for (int i = 0; i < n; ++i)
        {
            const bool ta = a[i] >= 0.5f;
            const bool tb = b[i] >= 0.5f;
            out[i] = evaluate (m, ta, tb) ? 1.0f : 0.0f;
        }
    }

    /** Bypass = output false: zero the output, never touch inputs. */
    void renderBypassed (RenderContext& rc) override
    {
        if (rc.cv.getNumChannels() >= 3)
            rc.cv.clear (2, 0, rc.cv.getNumSamples());
    }

    // =========================================================================
    void getState (juce::MemoryBlock& block) override
    {
        const int32_t m = (int32_t) mode.load (std::memory_order_relaxed);
        block.append (&m, sizeof (m));
    }

    void setState (const void* data, int sizeInBytes) override
    {
        if (sizeInBytes >= (int) sizeof (int32_t))
        {
            int32_t m = 0;
            memcpy (&m, data, sizeof (m));
            mode.store (juce::jlimit (0, numModes - 1, (int) m), std::memory_order_relaxed);
        }
    }

    // =========================================================================
    void getPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.fileOrIdentifier   = "element.logic";
        desc.uniqueId           = 0x656c6c67; // 'ellg'
        desc.name               = "Logic Gate";
        desc.descriptiveName    = "Boolean logic (AND/OR/XOR/NAND/NOR/NOT) on CV";
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
        newPorts.add (PortType::CV, 0, 0, "cv_in_a", "A", true);
        newPorts.add (PortType::CV, 1, 1, "cv_in_b", "B", true);
        newPorts.add (PortType::CV, 2, 0, "cv_out", "Out", false);
        setPorts (newPorts);
    }

    // =========================================================================
    /** Set the logic mode (thread-safe). */
    void setMode (Mode m) noexcept
    {
        mode.store (juce::jlimit (0, numModes - 1, (int) m), std::memory_order_relaxed);
    }

    Mode getMode() const noexcept { return (Mode) mode.load (std::memory_order_relaxed); }

private:
    static bool evaluate (Mode m, bool a, bool b) noexcept
    {
        switch (m)
        {
            case Mode::andMode:  return a && b;
            case Mode::orMode:   return a || b;
            case Mode::xorMode:  return a != b;
            case Mode::nandMode: return ! (a && b);
            case Mode::norMode:  return ! (a || b);
            case Mode::notMode:  return ! a;
        }
        return false;
    }

    std::atomic<int> mode { (int) Mode::andMode };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (LogicGateNode)
};

} // namespace element
