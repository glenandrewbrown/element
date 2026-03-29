// Copyright 2025 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/processor.hpp>

#include "engine/sandboxhost.hpp"
#include "engine/graphnode.hpp"

namespace element {

class PluginManager;

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

    setLatencySamples (sandbox ? sandbox->getLatencySamples() : 0);
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

    // Add audio inputs (assume stereo for now)
    for (int ch = 0; ch < numInputChannels; ++ch)
    {
        juce::String name = "Input " + juce::String (ch + 1);
        juce::String symbol = "audio_in_" + juce::String (ch + 1);
        newPorts.add (PortType::Audio, index++, ch, symbol, name, true);
    }

    // Add audio outputs
    for (int ch = 0; ch < numOutputChannels; ++ch)
    {
        juce::String name = "Output " + juce::String (ch + 1);
        juce::String symbol = "audio_out_" + juce::String (ch + 1);
        newPorts.add (PortType::Audio, index++, ch, symbol, name, false);
    }

    // Add MIDI if plugin accepts it
    // TODO: Get this info from plugin description
    newPorts.add (PortType::Midi, index++, 0, "midi_in_0", "MIDI", true);
    newPorts.add (PortType::Midi, index++, 0, "midi_out_0", "MIDI", false);

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
    // TODO: Implement parameter forwarding through sandbox IPC
    jassert (isPositiveAndBelow (port.channel, params.size()));
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

    // Setup ports now that plugin info is available
    setupPorts();

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
}

inline void SandboxedProcessorNode::sandboxCrashed (SandboxHost*)
{
    juce::Logger::writeToLog ("[SandboxedProcessor] Sandbox crashed: " + description.name);
    pluginLoaded.store (false);
    // Note: SandboxHost handles automatic restart attempts
}

inline void SandboxedProcessorNode::sandboxRestarted (SandboxHost*)
{
    juce::Logger::writeToLog ("[SandboxedProcessor] Sandbox restarted: " + description.name);
    // Plugin will be reloaded and state restored by SandboxHost
}

inline void SandboxedProcessorNode::sandboxLatencyChanged (SandboxHost*, int newLatency)
{
    setLatencySamples (newLatency);
    // Note: setLatencySamples should trigger graph rebuild via Processor mechanism
}

} // namespace element
