// Copyright 2025 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/processor.hpp>
#include <element/plugins.hpp>

#include "engine/sandboxhost.hpp"
#include "engine/sandboxparameter.hpp"
#include "engine/graphnode.hpp"

namespace element {

//==============================================================================
/** SandboxParameter enriched with the v2 PluginInfo metadata (unit label,
    discrete/boolean flags, step count). The base proxy already carries the
    real default value via its constructor; this subclass surfaces the rest of
    the worker-reported metadata to the host UI without changing the wire
    behavior of setValue()/applyValueFromWorker(). */
class SandboxParameterWithMeta : public SandboxParameter
{
public:
    SandboxParameterWithMeta (SandboxHost& host, int paramIndex,
                              juce::String paramName, const SandboxParamMeta& m,
                              juce::String unitLabel)
        : SandboxParameter (host, paramIndex, std::move (paramName), m.defaultValue),
          meta (m),
          label (std::move (unitLabel))
    {
    }

    juce::String getLabel() const override { return label; }
    bool isDiscrete() const override { return meta.stepped != 0; }
    bool isBoolean() const override { return meta.boolean != 0; }
    int getNumSteps() const override
    {
        return meta.numSteps > 0 ? (int) meta.numSteps : Parameter::defaultNumSteps();
    }

    /** Worker-reported (denormalized) range — informational for host UI. */
    float getMinValue() const noexcept { return meta.minValue; }
    float getMaxValue() const noexcept { return meta.maxValue; }

private:
    const SandboxParamMeta meta;
    const juce::String label;
};

//==============================================================================
/**
 * A Processor node that hosts a plugin in an isolated (sandboxed) process.
 *
 * This provides crash isolation - if the hosted plugin crashes, it will only
 * affect the sandbox process, not the main application or host DAW.
 *
 * Uses SandboxHost for IPC with the isolated worker process.
 */
class SandboxedProcessorNode : public Processor,
                                public SandboxHost::Listener
{
public:
    //==========================================================================
    /** Create a sandboxed processor for the given plugin. */
    SandboxedProcessorNode (uint32 nodeId,
                             const juce::PluginDescription& pluginDesc,
                             PluginManager& plugins);

    /** Create with auto-generated node ID. */
    SandboxedProcessorNode (const juce::PluginDescription& pluginDesc,
                             PluginManager& plugins);

    ~SandboxedProcessorNode() override;

    //==========================================================================
    /** Returns the plugin description. */
    const juce::PluginDescription& getPluginDescription() const { return description; }

    /** Check if the sandbox is healthy. */
    bool isSandboxHealthy() const;

    /** Get the current sandbox state. */
    SandboxHost::State getSandboxState() const;

    /** Manually restart the sandbox. */
    void restartSandbox();

    /** Check if the plugin was loaded successfully. */
    bool isPluginLoaded() const;

    //==========================================================================
    /** Ask the worker to open the plugin editor in its own OS window (REAPER
        model — crash-isolated, the editor lives in the worker process). The
        screen position places the window near the originating Block. */
    void openEditor (int screenX = 0, int screenY = 0);

    /** Ask the worker to close its editor window. */
    void closeEditor();

    /** True if the worker reports an editor window is open. */
    bool isEditorOpen() const;

    //==========================================================================
    // Processor interface
    void prepareToRender (double sampleRate, int maxBufferSize) override;
    void releaseResources() override;
    void render (RenderContext& context) override;
    void renderBypassed (RenderContext& context) override;

    void getState (juce::MemoryBlock& block) override;
    void setState (const void* data, int size) override;

    void refreshPorts() override;
    void getPluginDescription (juce::PluginDescription& desc) const override;

    bool wantsContext() const noexcept override { return false; }

    //==========================================================================
    // SandboxHost::Listener interface
    void sandboxPluginLoaded (SandboxHost*) override;
    void sandboxPluginLoadFailed (SandboxHost*, const juce::String& error) override;
    void sandboxCrashed (SandboxHost*) override;
    void sandboxRestarted (SandboxHost*) override;
    void sandboxLatencyChanged (SandboxHost*, int newLatency) override;
    void sandboxPluginInfo (SandboxHost*) override;
    void sandboxParameterChanged (SandboxHost*, int index, float value) override;

protected:
    ParameterPtr getParameter (const PortDescription& port) override;

private:
    //==========================================================================
    void initializeSandbox();
    void setupPorts();

    //==========================================================================
    PluginManager& pluginManager;
    juce::PluginDescription description;
    std::unique_ptr<SandboxHost> sandbox;

    // Processing state
    double currentSampleRate { 0.0 };
    int currentBlockSize { 0 };
    int numInputChannels { 2 };
    int numOutputChannels { 2 };

    // Parameter handling
    ParameterArray params;

    // State caching for crash recovery
    juce::MemoryBlock cachedState;
    std::atomic<bool> pluginLoaded { false };
    std::atomic<bool> hasError { false };
    juce::String lastError;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SandboxedProcessorNode)
};

//==============================================================================
// Implementation

inline SandboxedProcessorNode::SandboxedProcessorNode (
    uint32 nodeId,
    const juce::PluginDescription& pluginDesc,
    PluginManager& plugins)
    : Processor (nodeId),
      pluginManager (plugins),
      description (pluginDesc)
{
    setName (description.name + " (Sandboxed)");
    initializeSandbox();
}

inline SandboxedProcessorNode::SandboxedProcessorNode (
    const juce::PluginDescription& pluginDesc,
    PluginManager& plugins)
    : SandboxedProcessorNode (0, pluginDesc, plugins)
{
}

inline SandboxedProcessorNode::~SandboxedProcessorNode()
{
    if (sandbox)
    {
        sandbox->removeListener (this);
        sandbox->shutdown();
    }
}

inline void SandboxedProcessorNode::initializeSandbox()
{
    sandbox = std::make_unique<SandboxHost> (pluginManager);
    sandbox->addListener (this);

    // Launch sandbox worker process
    if (! sandbox->launch())
    {
        hasError.store (true);
        lastError = "Failed to launch sandbox worker process";
        juce::Logger::writeToLog ("[SandboxedProcessor] " + lastError);
        return;
    }

    // Request plugin load
    sandbox->loadPlugin (description);
}

inline bool SandboxedProcessorNode::isSandboxHealthy() const
{
    return sandbox && sandbox->isHealthy();
}

inline SandboxHost::State SandboxedProcessorNode::getSandboxState() const
{
    return sandbox ? sandbox->getState() : SandboxHost::State::Idle;
}

inline void SandboxedProcessorNode::restartSandbox()
{
    if (sandbox)
    {
        sandbox->shutdown();
        hasError.store (false);
        lastError.clear();

        if (sandbox->launch())
        {
            sandbox->loadPlugin (description);

            // Restore state if available
            if (cachedState.getSize() > 0)
                sandbox->setPluginState (cachedState);

            // Re-prepare if we were processing
            if (currentSampleRate > 0 && currentBlockSize > 0)
            {
                sandbox->prepareToPlay (currentSampleRate, currentBlockSize,
                                        numInputChannels, numOutputChannels);
            }
        }
        else
        {
            hasError.store (true);
            lastError = "Failed to restart sandbox";
        }
    }
}

inline bool SandboxedProcessorNode::isPluginLoaded() const
{
    return sandbox && sandbox->isPluginLoaded();
}

inline void SandboxedProcessorNode::openEditor (int screenX, int screenY)
{
    if (sandbox)
        sandbox->openEditor (screenX, screenY);
}

inline void SandboxedProcessorNode::closeEditor()
{
    if (sandbox)
        sandbox->closeEditor();
}

inline bool SandboxedProcessorNode::isEditorOpen() const
{
    return sandbox && sandbox->isEditorOpen();
}

inline void SandboxedProcessorNode::prepareToRender (double sampleRate, int maxBufferSize)
{
    currentSampleRate = sampleRate;
    currentBlockSize = maxBufferSize;

    // Get channel counts from ports
    numInputChannels = 0;
    numOutputChannels = 0;

    const auto& pl = this->portList();
    for (int i = 0; i < pl.size(); ++i)
    {
        const auto& p = pl.getPort (i);
        if (p.type == PortType::Audio)
        {
            if (p.input)
                numInputChannels = std::max (numInputChannels, p.channel + 1);
            else
                numOutputChannels = std::max (numOutputChannels, p.channel + 1);
        }
    }

    // Default to stereo if no ports configured yet
    if (numInputChannels == 0)
        numInputChannels = 2;
    if (numOutputChannels == 0)
        numOutputChannels = 2;

    if (sandbox)
    {
        sandbox->prepareToPlay (sampleRate, maxBufferSize,
                                numInputChannels, numOutputChannels);
    }

    // Report total latency: plugin's own latency + 1 buffer for IPC round-trip
    int pluginLatency = sandbox ? sandbox->getLatencySamples() : 0;
    setLatencySamples (pluginLatency + maxBufferSize);
}

inline void SandboxedProcessorNode::releaseResources()
{
    if (sandbox)
        sandbox->releaseResources();
}

inline void SandboxedProcessorNode::render (RenderContext& context)
{
    if (! sandbox || ! pluginLoaded.load() || hasError.load())
    {
        // Output silence on error
        context.audio.clear();
        return;
    }

    // Process through sandbox
    juce::MidiBuffer* midiPtr = context.midi.getWriteBuffer (0);
    juce::MidiBuffer midiTemp;
    sandbox->processBlock (context.audio, midiPtr ? *midiPtr : midiTemp);
}

inline void SandboxedProcessorNode::renderBypassed (RenderContext& context)
{
    // Let audio pass through unchanged
    ignoreUnused (context);
}

inline void SandboxedProcessorNode::getState (juce::MemoryBlock& block)
{
    if (sandbox)
    {
        block = sandbox->getPluginState();
        // Cache for crash recovery
        cachedState = block;
    }
}

inline void SandboxedProcessorNode::setState (const void* data, int size)
{
    if (sandbox && data && size > 0)
    {
        juce::MemoryBlock state (data, static_cast<size_t> (size));
        sandbox->setPluginState (state);
        // Cache for crash recovery
        cachedState = state;
    }
}

inline void SandboxedProcessorNode::setupPorts()
{
    PortList newPorts;
    int index = 0;

    // Pull I/O config + MIDI flags from PluginInfo when available; fall back
    // to the cached numInputChannels/numOutputChannels (set in prepareToRender)
    // when PluginInfo has not arrived yet (e.g. very first setupPorts before load).
    int audioIn = numInputChannels;
    int audioOut = numOutputChannels;
    bool acceptsMidi = true;
    bool producesMidi = true;

    if (sandbox && sandbox->hasReceivedPluginInfo())
    {
        // HONEST channel counts: propagate the worker plugin's actual bus
        // layout verbatim — a mono effect gets 1 in/1 out, an instrument gets
        // 0 audio inputs. The old jmax(2, …) stereo floor advertised phantom
        // ports that were never backed by plugin channels.
        const auto& info = sandbox->getPluginInfo();
        audioIn = (int) info.numInputChannels;
        audioOut = (int) info.numOutputChannels;
        acceptsMidi = info.acceptsMidi != 0;
        producesMidi = info.producesMidi != 0;
    }

    for (int ch = 0; ch < audioIn; ++ch)
    {
        juce::String name = "Input " + juce::String (ch + 1);
        juce::String symbol = "audio_in_" + juce::String (ch + 1);
        newPorts.add (PortType::Audio, index++, ch, symbol, name, true);
    }

    for (int ch = 0; ch < audioOut; ++ch)
    {
        juce::String name = "Output " + juce::String (ch + 1);
        juce::String symbol = "audio_out_" + juce::String (ch + 1);
        newPorts.add (PortType::Audio, index++, ch, symbol, name, false);
    }

    if (acceptsMidi)
        newPorts.add (PortType::Midi, index++, 0, "midi_in_0", "MIDI In", true);
    if (producesMidi)
        newPorts.add (PortType::Midi, index++, 0, "midi_out_0", "MIDI Out", false);

    // One Control input port per plugin parameter. Channel = parameter index
    // so getParameter(port).channel maps directly into params[].
    for (int i = 0; i < params.size(); ++i)
    {
        auto* sp = dynamic_cast<SandboxParameter*> (params.getObjectPointer (i));
        const juce::String paramName = sp != nullptr ? sp->getName (64)
                                                      : juce::String ("Param ") + juce::String (i);
        const juce::String symbol = "param_" + juce::String (i);
        newPorts.add (PortType::Control, index, i, symbol, paramName, true);
        if (sp != nullptr)
            sp->setPortIndex (index);
        ++index;
    }

    setPorts (newPorts);
}

inline void SandboxedProcessorNode::refreshPorts()
{
    setupPorts();
}

inline void SandboxedProcessorNode::getPluginDescription (juce::PluginDescription& desc) const
{
    desc = description;
}

inline ParameterPtr SandboxedProcessorNode::getParameter (const PortDescription& port)
{
    if (! juce::isPositiveAndBelow (port.channel, params.size()))
    {
        // Out-of-range query — caller should sync ports before this is called.
        // Return null instead of asserting+UB-reading.
        return nullptr;
    }
    return params.getObjectPointerUnchecked (port.channel);
}

//==============================================================================
// SandboxHost::Listener callbacks

inline void SandboxedProcessorNode::sandboxPluginLoaded (SandboxHost*)
{
    juce::Logger::writeToLog ("[SandboxedProcessor] Plugin loaded: " + description.name);
    pluginLoaded.store (true);
    hasError.store (false);
    lastError.clear();

    // Ports are built later in sandboxPluginInfo() when the worker delivers
    // the parameter list + I/O config. PluginInfo always follows PluginLoaded
    // on the wire, so doing it here would just be replaced milliseconds later.

    // Re-prepare if we have valid settings
    if (currentSampleRate > 0 && currentBlockSize > 0 && sandbox)
    {
        sandbox->prepareToPlay (currentSampleRate, currentBlockSize,
                                numInputChannels, numOutputChannels);
    }
}

inline void SandboxedProcessorNode::sandboxPluginLoadFailed (SandboxHost*,
                                                              const juce::String& error)
{
    juce::Logger::writeToLog ("[SandboxedProcessor] Plugin load failed: " + error);
    pluginLoaded.store (false);
    hasError.store (true);
    lastError = error;
    pluginManager.emitSandboxEvent (nodeId, PluginManager::SandboxEvent::LoadFailed, error);
}

inline void SandboxedProcessorNode::sandboxCrashed (SandboxHost*)
{
    juce::Logger::writeToLog ("[SandboxedProcessor] Sandbox crashed: " + description.name);
    pluginLoaded.store (false);
    // Note: SandboxHost handles automatic restart attempts
    pluginManager.emitSandboxEvent (nodeId, PluginManager::SandboxEvent::Crashed,
                                    description.name + " crashed");
}

inline void SandboxedProcessorNode::sandboxRestarted (SandboxHost*)
{
    juce::Logger::writeToLog ("[SandboxedProcessor] Sandbox restarted: " + description.name);
    // Plugin will be reloaded and state restored by SandboxHost
    pluginManager.emitSandboxEvent (nodeId, PluginManager::SandboxEvent::Restarted,
                                    description.name + " restarted");
}

inline void SandboxedProcessorNode::sandboxLatencyChanged (SandboxHost*, int newLatency)
{
    // Add 1 buffer of IPC round-trip latency to the plugin's reported latency
    setLatencySamples (newLatency + currentBlockSize);
    // Note: setLatencySamples should trigger graph rebuild via Processor mechanism
}

inline void SandboxedProcessorNode::sandboxPluginInfo (SandboxHost*)
{
    if (! sandbox)
        return;

    // Rebuild parameter proxies. Each proxy holds a reference to the host so
    // setValue() pushes through the existing SetParameter IPC. The v2 wire
    // format carries real defaults/ranges/flags/labels per parameter
    // (SandboxParamMeta) — a v1 payload without a meta table degrades to the
    // synthesized 0.5-midpoint defaults via SandboxHost::getParameterMeta().
    params.clear();
    const int n = sandbox->getParameterCount();
    for (int i = 0; i < n; ++i)
    {
        auto name = sandbox->getParameterName (i);
        if (name.isEmpty())
            name = "Param " + juce::String (i);
        params.add (new SandboxParameterWithMeta (*sandbox, i, name,
                                                  sandbox->getParameterMeta (i),
                                                  sandbox->getParameterLabel (i)));
    }

    // Rebuild ports with real I/O config + per-parameter Control ports.
    setupPorts();
}

inline void SandboxedProcessorNode::sandboxParameterChanged (SandboxHost*,
                                                              int index,
                                                              float value)
{
    if (! juce::isPositiveAndBelow (index, params.size()))
    {
        juce::Logger::writeToLog ("[SandboxedProcessor] Ignoring out-of-range "
                                  "parameter change for index " + juce::String (index));
        return;
    }

    if (auto* sp = dynamic_cast<SandboxParameter*> (params.getObjectPointer (index)))
        sp->applyValueFromWorker (value);
}

} // namespace element
