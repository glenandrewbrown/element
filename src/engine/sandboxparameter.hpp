// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/parameter.hpp>

#include "engine/sandboxhost.hpp"

namespace element {

//==============================================================================
/**
 * Host-side proxy for a parameter exposed by a sandboxed plugin.
 *
 * The actual juce::AudioProcessorParameter lives in the worker process. The
 * proxy holds a cached value + the metadata received via PluginInfo IPC, and
 * forwards setValue() calls to the worker through SandboxHost::setParameter
 * (which already exists on the existing SetParameter wire message).
 *
 * applyValueFromWorker() is the inbound mirror — used when a ParameterChanged
 * message arrives from the worker (plugin internal automation). It updates
 * the cached value and notifies host-side listeners WITHOUT echoing back to
 * the worker, otherwise we'd create an infinite ping-pong.
 */
class SandboxParameter : public Parameter
{
public:
    SandboxParameter (SandboxHost& host,
                       int paramIndex,
                       juce::String paramName,
                       float defaultVal)
        : sandboxHost (host),
          index (paramIndex),
          name (std::move (paramName)),
          defaultValue (defaultVal),
          cachedValue (defaultVal)
    {
    }

    ~SandboxParameter() override = default;

    //==========================================================================
    int getPortIndex() const noexcept override { return portIndex; }
    int getParameterIndex() const noexcept override { return index; }
    float getValue() const override { return cachedValue.load (std::memory_order_acquire); }

    /** Outbound: cache + push to worker. Triggered by host UI / automation. */
    void setValue (float newValue) override
    {
        const float clamped = juce::jlimit (0.0f, 1.0f, newValue);
        cachedValue.store (clamped, std::memory_order_release);
        sandboxHost.setParameter (index, clamped);
    }

    float getDefaultValue() const override { return defaultValue; }

    float getValueForText (const juce::String& text) const override
    {
        return juce::jlimit (0.0f, 1.0f, text.getFloatValue());
    }

    juce::String getName (int maximumStringLength) const override
    {
        return maximumStringLength > 0 ? name.substring (0, maximumStringLength) : name;
    }

    juce::String getLabel() const override { return {}; }

    int getNumSteps() const override { return Parameter::defaultNumSteps(); }
    bool isDiscrete() const override { return false; }
    bool isBoolean() const override { return false; }

    //==========================================================================
    /** Inbound: update cached value and notify listeners WITHOUT echoing back
        to the worker. Used by SandboxHost::handleWorkerMessage's
        ParameterChanged case so plugin automation reaches the host UI. */
    void applyValueFromWorker (float newValue)
    {
        const float clamped = juce::jlimit (0.0f, 1.0f, newValue);
        cachedValue.store (clamped, std::memory_order_release);
        sendValueChangedMessageToListeners (clamped);
    }

    /** Set after setupPorts() has placed this parameter in the port list. */
    void setPortIndex (int newPortIndex) noexcept { portIndex = newPortIndex; }

private:
    SandboxHost& sandboxHost;
    const int index;
    const juce::String name;
    const float defaultValue;
    std::atomic<float> cachedValue;
    int portIndex { -1 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SandboxParameter)
};

} // namespace element
