// Copyright 2025 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL3-or-later

#pragma once

#include <element/juce.hpp>
#include <element/plugins.hpp>

#include "sandboxipc.hpp"

#include <memory>

namespace element {

//==============================================================================
/**
 * Worker process that hosts a plugin in isolation.
 *
 * This class runs in a separate process and:
 * - Loads/unloads plugins via JUCE AudioPluginFormatManager
 * - Processes audio from shared memory buffers
 * - Reports status back to the coordinator via IPC
 * - Sends heartbeats to confirm it's alive
 *
 * If this process crashes, only the sandboxed plugin is affected,
 * not the main host application.
 */
class SandboxWorker : public juce::ChildProcessWorker,
                      private juce::Timer
{
public:
    SandboxWorker();
    ~SandboxWorker() override;

    //==========================================================================
    /** Initialize from command line. Returns true if this is a worker process. */
    bool initialise (const juce::String& commandLine);

protected:
    //==========================================================================
    /** Called when connected to coordinator. */
    void handleConnectionMade() override;

    /** Called when coordinator sends a message. */
    void handleMessageFromCoordinator (const juce::MemoryBlock& mb) override;

    /** Called when connection to coordinator is lost. */
    void handleConnectionLost() override;

private:
    //==========================================================================
    void timerCallback() override;

    void handleMessage (const SandboxMessageHeader& header, const void* payload);
    void sendResponse (SandboxMessageType type, const void* payload = nullptr,
                       uint32_t payloadSize = 0);
    void sendError (const juce::String& message);

    // Message handlers
    void handleLoadPlugin (const void* payload, uint32_t payloadSize);
    void handleUnloadPlugin();
    void handlePrepareToPlay (const void* payload, uint32_t payloadSize);
    void handleProcessBlock();
    void handleSetParameter (const void* payload, uint32_t payloadSize);
    void handleSetState (const void* payload, uint32_t payloadSize);
    void handleGetState();
    void handleSetBypass (const void* payload, uint32_t payloadSize);
    void handleShutdown();

    //==========================================================================
    // Plugin hosting
    juce::AudioPluginFormatManager formatManager;
    std::unique_ptr<juce::AudioPluginInstance> plugin;
    juce::PluginDescription loadedDescription;

    // Audio processing state
    double sampleRate { 0.0 };
    int blockSize { 0 };
    int numInputChannels { 0 };
    int numOutputChannels { 0 };
    bool isPrepared { false };
    bool isBypassed { false };

    // Shared audio buffer
    SharedAudioBuffer audioBuffer;

    // Internal buffers
    juce::AudioSampleBuffer processBuffer;
    juce::MidiBuffer midiBuffer;

    // Latency tracking
    int lastReportedLatency { 0 };

    // Logger for crash diagnostics
    std::unique_ptr<juce::FileLogger> logger;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SandboxWorker)
};

//==============================================================================
// Implementation

inline SandboxWorker::SandboxWorker()
{
    // Set up crash handler to not show OS dialogs
    juce::SystemStats::setApplicationCrashHandler ([] (void*) {});

    // Initialize logging
    auto logFile = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                       .getChildFile ("Element/log/sandbox_worker.log");
    logFile.create();
    logger = std::make_unique<juce::FileLogger> (logFile, "Sandbox Worker");
    juce::Logger::setCurrentLogger (logger.get());

    // Initialize plugin formats
    formatManager.addDefaultFormats();
}

inline SandboxWorker::~SandboxWorker()
{
    stopTimer();

    // Clean up plugin
    if (plugin)
    {
        if (isPrepared)
            plugin->releaseResources();
        plugin.reset();
    }

    juce::Logger::setCurrentLogger (nullptr);
}

inline bool SandboxWorker::initialise (const juce::String& commandLine)
{
    // Try to connect as worker process
    if (initialiseFromCommandLine (commandLine, EL_PLUGIN_HOST_PROCESS_ID, 20000))
    {
        juce::Logger::writeToLog ("Sandbox worker initialized");

        // Hide dock icon on macOS
        #if JUCE_MAC
        juce::Process::setDockIconVisible (false);
        #endif

        return true;
    }

    return false;
}

inline void SandboxWorker::handleConnectionMade()
{
    juce::Logger::writeToLog ("Connected to sandbox coordinator");

    // Start heartbeat timer
    startTimer (EL_SANDBOX_HEARTBEAT_MS);

    // Send initial heartbeat
    sendResponse (SandboxMessageType::Heartbeat);
}

inline void SandboxWorker::handleMessageFromCoordinator (const juce::MemoryBlock& mb)
{
    SandboxMessageHeader header;
    const void* payload = nullptr;

    if (! parseSandboxMessage (mb, header, payload))
    {
        juce::Logger::writeToLog ("Failed to parse message from coordinator");
        return;
    }

    handleMessage (header, payload);
}

inline void SandboxWorker::handleConnectionLost()
{
    juce::Logger::writeToLog ("Lost connection to coordinator - shutting down");

    // Clean shutdown
    if (plugin)
    {
        if (isPrepared)
            plugin->releaseResources();
        plugin.reset();
    }

    // Exit process
    juce::JUCEApplication::quit();
}

inline void SandboxWorker::timerCallback()
{
    // Send heartbeat
    sendResponse (SandboxMessageType::Heartbeat);

    // Check for latency changes
    if (plugin)
    {
        int currentLatency = plugin->getLatencySamples();
        if (currentLatency != lastReportedLatency)
        {
            lastReportedLatency = currentLatency;
            LatencyPayload payload;
            payload.latencySamples = currentLatency;
            sendResponse (SandboxMessageType::LatencyChanged, &payload, sizeof (payload));
        }
    }
}

inline void SandboxWorker::handleMessage (const SandboxMessageHeader& header,
                                           const void* payload)
{
    switch (header.type)
    {
        case SandboxMessageType::LoadPlugin:
            handleLoadPlugin (payload, header.payloadSize);
            break;

        case SandboxMessageType::UnloadPlugin:
            handleUnloadPlugin();
            break;

        case SandboxMessageType::PrepareToPlay:
            handlePrepareToPlay (payload, header.payloadSize);
            break;

        case SandboxMessageType::ProcessBlock:
            handleProcessBlock();
            break;

        case SandboxMessageType::SetParameter:
            handleSetParameter (payload, header.payloadSize);
            break;

        case SandboxMessageType::SetState:
            handleSetState (payload, header.payloadSize);
            break;

        case SandboxMessageType::GetState:
            handleGetState();
            break;

        case SandboxMessageType::SetBypass:
            handleSetBypass (payload, header.payloadSize);
            break;

        case SandboxMessageType::Shutdown:
            handleShutdown();
            break;

        default:
            juce::Logger::writeToLog ("Unknown message type: " +
                                       juce::String (static_cast<int> (header.type)));
            break;
    }
}

inline void SandboxWorker::sendResponse (SandboxMessageType type,
                                          const void* payload,
                                          uint32_t payloadSize)
{
    auto msg = createSandboxMessage (type, payload, payloadSize, 0);
    sendMessageToCoordinator (msg);
}

inline void SandboxWorker::sendError (const juce::String& message)
{
    juce::Logger::writeToLog ("Error: " + message);
    sendResponse (SandboxMessageType::Error,
                  message.toRawUTF8(),
                  static_cast<uint32_t> (message.getNumBytesAsUTF8()));
}

inline void SandboxWorker::handleLoadPlugin (const void* payload, uint32_t payloadSize)
{
    if (payload == nullptr || payloadSize == 0)
    {
        sendError ("Empty plugin description");
        sendResponse (SandboxMessageType::PluginLoadFailed,
                      "Empty plugin description", 24);
        return;
    }

    // Unload existing plugin first
    if (plugin)
    {
        handleUnloadPlugin();
    }

    // Parse plugin description XML
    juce::String xmlString = juce::String::fromUTF8 (
        static_cast<const char*> (payload),
        static_cast<int> (payloadSize));

    auto xml = juce::parseXML (xmlString);
    if (xml == nullptr)
    {
        sendError ("Failed to parse plugin description XML");
        sendResponse (SandboxMessageType::PluginLoadFailed,
                      "Invalid XML", 11);
        return;
    }

    juce::PluginDescription desc;
    if (! desc.loadFromXml (*xml))
    {
        sendError ("Failed to load plugin description from XML");
        sendResponse (SandboxMessageType::PluginLoadFailed,
                      "Invalid plugin description", 26);
        return;
    }

    juce::Logger::writeToLog ("Loading plugin: " + desc.name);

    // Create the plugin instance
    juce::String errorMessage;
    plugin = formatManager.createPluginInstance (
        desc, sampleRate > 0 ? sampleRate : 44100.0,
        blockSize > 0 ? blockSize : 512,
        errorMessage);

    if (plugin == nullptr)
    {
        juce::Logger::writeToLog ("Failed to load plugin: " + errorMessage);
        sendResponse (SandboxMessageType::PluginLoadFailed,
                      errorMessage.toRawUTF8(),
                      static_cast<uint32_t> (errorMessage.getNumBytesAsUTF8()));
        return;
    }

    loadedDescription = desc;
    lastReportedLatency = plugin->getLatencySamples();

    // Prepare if we have valid audio settings
    if (sampleRate > 0 && blockSize > 0)
    {
        plugin->setRateAndBufferSizeDetails (sampleRate, blockSize);
        plugin->prepareToPlay (sampleRate, blockSize);
        isPrepared = true;
    }

    juce::Logger::writeToLog ("Plugin loaded successfully: " + desc.name);
    sendResponse (SandboxMessageType::PluginLoaded);
}

inline void SandboxWorker::handleUnloadPlugin()
{
    if (plugin)
    {
        juce::Logger::writeToLog ("Unloading plugin: " + loadedDescription.name);

        if (isPrepared)
        {
            plugin->releaseResources();
            isPrepared = false;
        }

        plugin.reset();
        loadedDescription = {};
    }

    sendResponse (SandboxMessageType::PluginUnloaded);
}

inline void SandboxWorker::handlePrepareToPlay (const void* payload, uint32_t payloadSize)
{
    if (payloadSize < sizeof (PreparePayload))
    {
        sendError ("Invalid PrepareToPlay payload");
        return;
    }

    auto* prep = static_cast<const PreparePayload*> (payload);
    sampleRate = prep->sampleRate;
    blockSize = prep->maxBlockSize;
    numInputChannels = prep->numInputChannels;
    numOutputChannels = prep->numOutputChannels;

    juce::Logger::writeToLog ("PrepareToPlay: rate=" + juce::String (sampleRate) +
                               " blockSize=" + juce::String (blockSize) +
                               " inputs=" + juce::String (numInputChannels) +
                               " outputs=" + juce::String (numOutputChannels));

    // Allocate shared buffer
    const int maxChannels = std::max (numInputChannels, numOutputChannels);
    audioBuffer.allocate (maxChannels, blockSize);

    // Allocate process buffer
    processBuffer.setSize (maxChannels, blockSize);

    // Prepare plugin if loaded
    if (plugin)
    {
        if (isPrepared)
            plugin->releaseResources();

        plugin->setRateAndBufferSizeDetails (sampleRate, blockSize);
        plugin->prepareToPlay (sampleRate, blockSize);
        isPrepared = true;

        lastReportedLatency = plugin->getLatencySamples();
    }

    sendResponse (SandboxMessageType::Prepared);
}

inline void SandboxWorker::handleProcessBlock()
{
    if (! plugin || ! isPrepared)
    {
        sendResponse (SandboxMessageType::ProcessComplete);
        return;
    }

    auto* header = audioBuffer.getHeader();
    if (header == nullptr)
    {
        sendResponse (SandboxMessageType::ProcessComplete);
        return;
    }

    const int numSamples = static_cast<int> (header->numSamples.load());
    const int inChannels = static_cast<int> (header->numInputChannels.load());

    // Read input audio from shared buffer
    const uint32_t readBuffer = header->activeBuffer.load();
    for (int ch = 0; ch < inChannels && ch < processBuffer.getNumChannels(); ++ch)
    {
        const float* src = audioBuffer.getInputBuffer (ch, readBuffer);
        std::memcpy (processBuffer.getWritePointer (ch), src,
                    static_cast<size_t> (numSamples) * sizeof (float));
    }

    // Deserialize MIDI input
    midiBuffer.clear();
    uint32_t midiInSize = header->midiInputSize.load();
    if (midiInSize > 0)
    {
        deserializeMidiBuffer (audioBuffer.getMidiInputBuffer(), midiInSize, midiBuffer);
    }

    // Process audio
    if (! isBypassed)
    {
        plugin->processBlock (processBuffer, midiBuffer);
    }

    // Write output audio to shared buffer (write to inactive buffer)
    const uint32_t writeBuffer = 1 - readBuffer;
    const int outChannels = std::min (numOutputChannels, processBuffer.getNumChannels());
    for (int ch = 0; ch < outChannels; ++ch)
    {
        float* dest = audioBuffer.getOutputBuffer (ch, writeBuffer);
        std::memcpy (dest, processBuffer.getReadPointer (ch),
                    static_cast<size_t> (numSamples) * sizeof (float));
    }

    // Serialize MIDI output
    uint32_t midiOutSize = serializeMidiBuffer (midiBuffer,
                                                 audioBuffer.getMidiOutputBuffer(),
                                                 audioBuffer.getMidiBufferSize());
    header->midiOutputSize.store (midiOutSize);

    // Swap output buffer
    header->activeBuffer.store (writeBuffer);
    audioBuffer.markProcessed();

    sendResponse (SandboxMessageType::ProcessComplete);
}

inline void SandboxWorker::handleSetParameter (const void* payload, uint32_t payloadSize)
{
    if (! plugin || payloadSize < sizeof (ParameterChangePayload))
        return;

    auto* param = static_cast<const ParameterChangePayload*> (payload);

    auto params = plugin->getParameters();
    if (static_cast<int> (param->parameterIndex) < params.size())
    {
        params[static_cast<int> (param->parameterIndex)]->setValue (param->value);
    }
}

inline void SandboxWorker::handleSetState (const void* payload, uint32_t payloadSize)
{
    if (! plugin || payload == nullptr || payloadSize == 0)
        return;

    juce::Logger::writeToLog ("Setting plugin state (" +
                               juce::String (payloadSize) + " bytes)");

    plugin->setStateInformation (payload, static_cast<int> (payloadSize));
}

inline void SandboxWorker::handleGetState()
{
    if (! plugin)
    {
        sendResponse (SandboxMessageType::StateData);
        return;
    }

    juce::MemoryBlock state;
    plugin->getStateInformation (state);

    sendResponse (SandboxMessageType::StateData,
                  state.getData(),
                  static_cast<uint32_t> (state.getSize()));
}

inline void SandboxWorker::handleSetBypass (const void* payload, uint32_t payloadSize)
{
    if (payloadSize >= 1)
    {
        isBypassed = (*static_cast<const uint8_t*> (payload)) != 0;
        juce::Logger::writeToLog ("Bypass set to: " +
                                   juce::String (isBypassed ? "true" : "false"));
    }
}

inline void SandboxWorker::handleShutdown()
{
    juce::Logger::writeToLog ("Received shutdown request");

    stopTimer();

    if (plugin)
    {
        if (isPrepared)
            plugin->releaseResources();
        plugin.reset();
    }

    // Give time for final messages to send
    juce::Thread::sleep (50);

    juce::JUCEApplication::quit();
}

} // namespace element
