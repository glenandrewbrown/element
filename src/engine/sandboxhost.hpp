// Copyright 2025 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce.hpp>
#include <element/signals.hpp>

#include "sandboxipc.hpp"
#include "sandboxsemaphore.hpp"
#include "sandboxsharedmemory.hpp"

#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
  #include <immintrin.h>
#endif

#include <condition_variable>
#include <mutex>
#include <memory>

namespace element {

class PluginManager;

//==============================================================================
/**
 * Coordinates a sandboxed plugin host running in a separate process.
 *
 * This class manages:
 * - Worker process lifecycle (launch, monitor, restart)
 * - IPC for plugin loading/unloading
 * - Shared memory audio buffer exchange
 * - Crash detection and recovery
 *
 * The host side runs in the main audio application, while the worker
 * runs the actual plugin in an isolated process.
 */
/** SandboxHost manages an out-of-process plugin via shared memory + IPC.

    Audio path (RT-safe): shared memory buffers + semaphore signaling.
    The audio thread never acquires a mutex or writes to pipes.
    See processBlock().

    Control path (message thread): JUCE ChildProcessCoordinator pipes.
    Used for loadPlugin, setPluginState, getPluginState, etc.
    Can block -- only called from the message thread.
*/
class SandboxHost : public juce::ChildProcessCoordinator,
                    private juce::Timer
{
public:
    //==========================================================================
    /** Listener interface for sandbox events. */
    struct Listener
    {
        virtual ~Listener() = default;

        /** Called when plugin is successfully loaded in sandbox. */
        virtual void sandboxPluginLoaded (SandboxHost*) {}

        /** Called when plugin loading fails. */
        virtual void sandboxPluginLoadFailed (SandboxHost*, const juce::String& error) { juce::ignoreUnused (error); }

        /** Called when sandbox worker crashes. */
        virtual void sandboxCrashed (SandboxHost*) {}

        /** Called when sandbox is successfully restarted after crash. */
        virtual void sandboxRestarted (SandboxHost*) {}

        /** Called when plugin latency changes. */
        virtual void sandboxLatencyChanged (SandboxHost*, int newLatency) { juce::ignoreUnused (newLatency); }

        /** Called when the worker delivers PluginInfo (parameter list, port config).
            Fires after sandboxPluginLoaded. Read getPluginInfo() / getParameterName(i)
            on the SandboxHost to consume the payload. */
        virtual void sandboxPluginInfo (SandboxHost*) {}

        /** Called when the worker reports a parameter value change (e.g. plugin
            internal automation). Use to update host-side proxies + UI without
            echoing back to the worker. */
        virtual void sandboxParameterChanged (SandboxHost*, int index, float value)
        {
            juce::ignoreUnused (index, value);
        }
    };

    //==========================================================================
    /** Sandbox operational state. */
    enum class State
    {
        Idle,           // No worker process
        Starting,       // Worker process launching
        Ready,          // Worker ready, no plugin loaded
        Loading,        // Plugin loading in progress
        Active,         // Plugin loaded and processing
        Error,          // Error state (recoverable)
        Crashed         // Worker crashed (needs restart)
    };

    //==========================================================================
    explicit SandboxHost (PluginManager& pm);
    ~SandboxHost() override;

    //==========================================================================
    /** Launch the worker process. Returns true if successful. */
    bool launch();

    /** Shutdown the worker process gracefully. */
    void shutdown();

    /** Check if the sandbox is in a healthy state. */
    bool isHealthy() const;

    /** Get the current state. */
    State getState() const { return state.load(); }

    //==========================================================================
    /** Load a plugin in the sandboxed worker. Async - listen for callback. */
    void loadPlugin (const juce::PluginDescription& desc);

    /** Unload the current plugin. */
    void unloadPlugin();

    /** Check if a plugin is currently loaded. */
    bool isPluginLoaded() const { return pluginLoaded.load(); }

    /** Get the loaded plugin description. */
    const juce::PluginDescription& getPluginDescription() const { return loadedPlugin; }

    //==========================================================================
    /** Prepare the sandbox for audio processing. */
    void prepareToPlay (double sampleRate, int maxBlockSize,
                        int numInputChannels, int numOutputChannels);

    /** Process audio through the sandboxed plugin. */
    void processBlock (juce::AudioSampleBuffer& buffer, juce::MidiBuffer& midi);

    /** Release audio processing resources. */
    void releaseResources();

    //==========================================================================
    /** Set a parameter value. */
    void setParameter (int index, float value);

    /** Set bypass state. */
    void setBypass (bool shouldBypass);

    /** Get the current latency in samples. */
    int getLatencySamples() const { return latencySamples.load(); }

    //==========================================================================
    /** Get the most recent PluginInfo payload from the worker.
        Empty/zero values until sandboxPluginInfo() listener has fired. */
    const PluginInfoPayload& getPluginInfo() const noexcept { return pluginInfo; }

    /** Get the cached parameter count from the latest PluginInfo. */
    int getParameterCount() const noexcept { return (int) pluginInfo.numParameters; }

    /** Get a parameter name by index. Returns empty string if out of range. */
    juce::String getParameterName (int index) const
    {
        return juce::isPositiveAndBelow (index, parameterNames.size())
                   ? parameterNames[index]
                   : juce::String();
    }

    //==========================================================================
    /** Save plugin state. Blocking call. */
    juce::MemoryBlock getPluginState();

    /** Restore plugin state. */
    void setPluginState (const juce::MemoryBlock& state);

    //==========================================================================
    /** Add a listener for sandbox events. */
    void addListener (Listener* l) { listeners.add (l); }

    /** Remove a listener. */
    void removeListener (Listener* l) { listeners.remove (l); }

    //==========================================================================
    /** Signal emitted when latency changes. */
    Signal<void (int)> latencyChanged;

    /** Signal emitted on crash. */
    Signal<void()> crashed;

protected:
    //==========================================================================
    /** Handle messages from the worker process. */
    void handleMessageFromWorker (const juce::MemoryBlock& mb) override;

    /** Handle worker process connection lost. */
    void handleConnectionLost() override;

    /** Send a control-pipe message to the worker.
        Marked protected + virtual so test stubs can intercept outbound IPC
        without needing to launch a real worker subprocess. */
    virtual void sendMessage (SandboxMessageType type, const void* payload = nullptr,
                              uint32_t payloadSize = 0);

private:
    //==========================================================================
    void timerCallback() override;

    bool launchWorkerProcess();
    void handleWorkerMessage (const SandboxMessageHeader& header, const void* payload);

    /** Wait for response from worker. Uses mutex+condvar.
        WARNING: NEVER call from the audio thread. Use only for control messages
        (loadPlugin, getPluginState, etc.) from the message thread.
    */
    bool waitForResponse (SandboxMessageType expectedType, uint32_t timeoutMs = 5000);

    void attemptRestart();

    //==========================================================================
    PluginManager& pluginManager;
    juce::ListenerList<Listener> listeners;

    std::atomic<State> state { State::Idle };
    std::atomic<bool> pluginLoaded { false };
    std::atomic<int> latencySamples { 0 };
    std::atomic<bool> bypassed { false };

    juce::PluginDescription loadedPlugin;
    juce::MemoryBlock lastKnownState;

    // Cached PluginInfo from worker (populated when PluginInfo IPC arrives).
    PluginInfoPayload pluginInfo {};
    juce::StringArray parameterNames;

    // Audio processing — shared memory backed
    SandboxSharedMemory sharedMemory;
    std::string shmName;
    SharedAudioBuffer audioBuffer;
    double currentSampleRate { 0.0 };
    int currentBlockSize { 0 };
    int numInputChannels { 0 };
    int numOutputChannels { 0 };

    // Lock-free audio IPC signaling
    SandboxSemaphore triggerSemaphore;   ///< Host signals worker to process
    SandboxSemaphore doneSemaphore;      ///< Worker signals host that processing is complete
    uint32_t expectedWorkerSequence { 0 }; ///< Tracks expected response sequence

    static constexpr int spinIterations = 10000;       ///< ~390us on x86 before falling back to semaphore
    static constexpr uint32_t maxConsecutiveXruns = 10; ///< Xrun threshold before bypass/recovery

    // IPC synchronization
    std::mutex responseMutex;
    std::condition_variable responseCondition;
    SandboxMessageType lastResponseType { SandboxMessageType::None };
    juce::MemoryBlock lastResponsePayload;
    bool responseReceived { false };

    SandboxHeartbeat heartbeat;
    int restartAttempts { 0 };
    static constexpr int maxRestartAttempts { 3 };

    juce::WaitableEvent shutdownAcked;
    static constexpr int shutdownAckTimeoutMs { 2000 };

    // Message sequencing
    std::atomic<uint32_t> messageSequence { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SandboxHost)
};

//==============================================================================
// Implementation

inline SandboxHost::SandboxHost (PluginManager& pm)
    : pluginManager (pm)
{
}

inline SandboxHost::~SandboxHost()
{
    stopTimer();
    shutdown();
}

inline bool SandboxHost::launch()
{
    if (state.load() != State::Idle)
        return false;

    state.store (State::Starting);

    if (! launchWorkerProcess())
    {
        state.store (State::Idle);
        return false;
    }

    // Start heartbeat monitoring
    heartbeat.reset();
    startTimer (EL_SANDBOX_HEARTBEAT_MS);

    state.store (State::Ready);
    return true;
}

inline void SandboxHost::shutdown()
{
    stopTimer();

    if (state.load() == State::Idle)
        return;

    state.store (State::Idle);
    pluginLoaded.store (false);

    shutdownAcked.reset();
    sendMessage (SandboxMessageType::Shutdown);

    const bool acked = shutdownAcked.wait (shutdownAckTimeoutMs);
    if (! acked)
        juce::Logger::writeToLog ("[sandbox] worker did not ack shutdown within "
                                   + juce::String (shutdownAckTimeoutMs) + " ms — forcing kill");

    killWorkerProcess();

    sharedMemory.close();
    shmName.clear();
}

inline bool SandboxHost::isHealthy() const
{
    const auto s = state.load();
    return (s == State::Ready || s == State::Active) && heartbeat.isAlive();
}

inline void SandboxHost::loadPlugin (const juce::PluginDescription& desc)
{
    if (state.load() != State::Ready && state.load() != State::Active)
        return;

    state.store (State::Loading);

    // Serialize plugin description to XML
    auto xml = desc.createXml();
    if (xml == nullptr)
    {
        state.store (State::Error);
        listeners.call (&Listener::sandboxPluginLoadFailed, this, "Failed to serialize plugin description");
        return;
    }

    auto xmlString = xml->toString();
    sendMessage (SandboxMessageType::LoadPlugin,
                 xmlString.toRawUTF8(),
                 static_cast<uint32_t> (xmlString.getNumBytesAsUTF8()));

    loadedPlugin = desc;
}

inline void SandboxHost::unloadPlugin()
{
    if (! pluginLoaded.load())
        return;

    sendMessage (SandboxMessageType::UnloadPlugin);
    pluginLoaded.store (false);
    state.store (State::Ready);
}

inline void SandboxHost::prepareToPlay (double sampleRate, int maxBlockSize,
                                         int inputChannels, int outputChannels)
{
    currentSampleRate = sampleRate;
    currentBlockSize = maxBlockSize;
    numInputChannels = inputChannels;
    numOutputChannels = outputChannels;

    const int maxChannels = std::max (inputChannels, outputChannels);
    const size_t requiredSize = SharedAudioBuffer::calculateRequiredSize (maxChannels, maxBlockSize);

    sharedMemory.close();
    shmName = SandboxSharedMemory::generateName();

    if (sharedMemory.create (shmName, requiredSize))
    {
        audioBuffer.attachToMemoryAsOwner (sharedMemory.getData(), requiredSize,
                                         maxChannels, maxBlockSize);
        juce::Logger::writeToLog ("[sandbox] Created shared memory: "
                                   + juce::String (shmName.c_str())
                                   + " (" + juce::String (requiredSize) + " bytes)");
    }
    else
    {
        juce::Logger::writeToLog ("[sandbox] Shared memory creation failed, using local allocation");
        shmName.clear();
        audioBuffer.allocate (maxChannels, maxBlockSize);
    }

    if (auto* header = audioBuffer.getHeader())
    {
        header->sampleRate = sampleRate;
        __atomic_store_n (&header->numInputChannels,
                          static_cast<uint32_t> (inputChannels),
                          __ATOMIC_RELEASE);
        __atomic_store_n (&header->numOutputChannels,
                          static_cast<uint32_t> (outputChannels),
                          __ATOMIC_RELEASE);
    }

    // Phase D D-2: open named cross-process semaphores as Owner before sending the
    // PreparePayload. The worker opens them as Attacher in handlePrepareToPlay.
    triggerSemaphore.close();
    doneSemaphore.close();
    const std::string trigName = SandboxSemaphore::generateName ('t');
    const std::string doneName = SandboxSemaphore::generateName ('d');
    const bool trigOk = triggerSemaphore.open (trigName, SandboxSemaphore::Mode::Owner);
    const bool doneOk = doneSemaphore.open (doneName, SandboxSemaphore::Mode::Owner);
    if (! trigOk || ! doneOk)
    {
        juce::Logger::writeToLog ("[sandbox] Cross-process semaphore open failed (trig="
                                   + juce::String ((int) trigOk) + " done=" + juce::String ((int) doneOk)
                                   + ") — falling back to in-process semaphores; "
                                   "host↔worker signalling will not work cross-process.");
        triggerSemaphore.close();
        doneSemaphore.close();
    }

    auto payload = createPrepareMessage (sampleRate, maxBlockSize,
                                          inputChannels, outputChannels,
                                          shmName,
                                          triggerSemaphore.isOpen() ? triggerSemaphore.getName() : std::string{},
                                          doneSemaphore.isOpen() ? doneSemaphore.getName() : std::string{});
    sendMessage (SandboxMessageType::PrepareToPlay,
                 payload.getData(),
                 static_cast<uint32_t> (payload.getSize()));
}

inline void SandboxHost::processBlock (juce::AudioSampleBuffer& buffer,
                                        juce::MidiBuffer& midi)
{
    // Health/bypass checks
    if (! isHealthy() || ! pluginLoaded.load() || bypassed.load())
    {
        if (state.load() == State::Crashed)
        {
            buffer.clear();
            midi.clear();
        }
        return;
    }

    // 1. Write input audio to shared buffer
    audioBuffer.writeInputAudio (buffer, buffer.getNumSamples());

    // 2. Write MIDI input to shared buffer
    if (auto* header = audioBuffer.getHeader())
    {
        auto* midiIn = audioBuffer.getMidiInputBuffer();
        uint32_t midiSize = serializeMidiBuffer (midi, midiIn, audioBuffer.getMidiBufferSize());
        __atomic_store_n (&header->midiInputSize, midiSize, __ATOMIC_RELEASE);
    }

    // 3. Signal data is ready (atomic sequence + buffer swap + semaphore)
    audioBuffer.swapBuffers();
    audioBuffer.signalHostReady();
    expectedWorkerSequence++;
    triggerSemaphore.post();

    // 4. Spin-wait phase: fast path for responsive plugins
    bool workerDone = false;
    for (int i = 0; i < spinIterations; ++i)
    {
        if (audioBuffer.isWorkerDone (expectedWorkerSequence))
        {
            workerDone = true;
            break;
        }
#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
        _mm_pause();
#elif defined(__aarch64__) || defined(__arm__)
        asm volatile("yield");
#endif
    }

    // 5. Semaphore wait phase: bounded blocking fallback
    if (! workerDone)
    {
        // Timeout = 80% of buffer period in microseconds
        const double bufferPeriodUs = (static_cast<double> (buffer.getNumSamples()) / currentSampleRate) * 1000000.0;
        const uint64_t timeoutUs = static_cast<uint64_t> (bufferPeriodUs * 0.8);
        doneSemaphore.timedWait (std::max (timeoutUs, uint64_t (1000)));
        workerDone = audioBuffer.isWorkerDone (expectedWorkerSequence);
    }

    // 6. Handle result
    if (workerDone)
    {
        audioBuffer.clearConsecutiveXruns();
        audioBuffer.readOutputAudio (buffer, buffer.getNumSamples());

        if (auto* header = audioBuffer.getHeader())
        {
            auto* midiOut = audioBuffer.getMidiOutputBuffer();
            uint32_t midiOutSize = __atomic_load_n (&header->midiOutputSize, __ATOMIC_ACQUIRE);
            if (midiOutSize > 0)
            {
                midi.clear();
                deserializeMidiBuffer (midiOut, midiOutSize, midi);
            }
        }
    }
    else
    {
        // Xrun: output silence
        buffer.clear();
        midi.clear();
        audioBuffer.recordXrun();

        if (audioBuffer.getConsecutiveXruns() >= maxConsecutiveXruns)
        {
            juce::Logger::writeToLog ("[sandbox] " + juce::String (maxConsecutiveXruns)
                                      + " consecutive xruns - worker may be hung");
        }
    }
}

inline void SandboxHost::releaseResources()
{
    // Worker will release on PrepareToPlay with 0 values or explicit message
}

inline void SandboxHost::setParameter (int index, float value)
{
    ParameterChangePayload payload;
    payload.parameterIndex = static_cast<uint32_t> (index);
    payload.value = value;
    sendMessage (SandboxMessageType::SetParameter, &payload, sizeof (payload));
}

inline void SandboxHost::setBypass (bool shouldBypass)
{
    bypassed.store (shouldBypass);
    uint8_t bypassValue = shouldBypass ? 1 : 0;
    sendMessage (SandboxMessageType::SetBypass, &bypassValue, 1);
}

inline juce::MemoryBlock SandboxHost::getPluginState()
{
    sendMessage (SandboxMessageType::GetState);

    if (waitForResponse (SandboxMessageType::StateData, 2000))
        return lastResponsePayload;

    return {};
}

inline void SandboxHost::setPluginState (const juce::MemoryBlock& stateData)
{
    sendMessage (SandboxMessageType::SetState,
                 stateData.getData(),
                 static_cast<uint32_t> (stateData.getSize()));

    // Cache for crash recovery
    lastKnownState = stateData;
}

inline void SandboxHost::handleMessageFromWorker (const juce::MemoryBlock& mb)
{
    SandboxMessageHeader header;
    const void* payload = nullptr;

    if (! parseSandboxMessage (mb, header, payload))
        return;

    handleWorkerMessage (header, payload);
}

inline void SandboxHost::handleConnectionLost()
{
    juce::Logger::writeToLog ("Sandbox worker connection lost");

    if (state.load() == State::Idle)
        return;

    state.store (State::Crashed);
    pluginLoaded.store (false);

    listeners.call (&Listener::sandboxCrashed, this);
    crashed();

    attemptRestart();
}

inline void SandboxHost::timerCallback()
{
    // Check heartbeat
    if (state.load() != State::Idle && ! heartbeat.isAlive())
    {
        juce::Logger::writeToLog ("Sandbox worker heartbeat timeout");
        handleConnectionLost();
    }
}

inline bool SandboxHost::launchWorkerProcess()
{
    auto exe = juce::File::getSpecialLocation (juce::File::currentExecutableFile);

    if (! exe.existsAsFile())
    {
        juce::Logger::writeToLog ("Failed to find executable for sandbox worker");
        return false;
    }

    juce::Logger::writeToLog ("Launching sandbox worker: " + exe.getFullPathName());

    return ChildProcessCoordinator::launchWorkerProcess (exe,
                                                          EL_PLUGIN_HOST_PROCESS_ID,
                                                          EL_SANDBOX_TIMEOUT_MS,
                                                          0);
}

inline void SandboxHost::handleWorkerMessage (const SandboxMessageHeader& header,
                                               const void* payload)
{
    switch (header.type)
    {
        case SandboxMessageType::Heartbeat:
            heartbeat.beat();
            break;

        case SandboxMessageType::PluginLoaded:
            pluginLoaded.store (true);
            state.store (State::Active);
            listeners.call (&Listener::sandboxPluginLoaded, this);
            break;

        case SandboxMessageType::PluginLoadFailed:
        {
            juce::String error = payload ? juce::String::fromUTF8 (
                static_cast<const char*> (payload),
                static_cast<int> (header.payloadSize)) : "Unknown error";
            state.store (State::Ready);
            listeners.call (&Listener::sandboxPluginLoadFailed, this, error);
            break;
        }

        case SandboxMessageType::PluginUnloaded:
            pluginLoaded.store (false);
            state.store (State::Ready);
            break;

        case SandboxMessageType::Prepared:
            break;

        case SandboxMessageType::ShutdownAck:
            shutdownAcked.signal();
            break;

        case SandboxMessageType::ProcessComplete:
            // Audio completion now handled by semaphore signaling.
            // This pipe response is for backward compatibility only.
            break;

        case SandboxMessageType::ParameterChanged:
            if (payload && header.payloadSize >= sizeof (ParameterChangePayload))
            {
                ParameterChangePayload pc;
                std::memcpy (&pc, payload, sizeof (pc));
                const int idx = static_cast<int> (pc.parameterIndex);
                if (juce::isPositiveAndBelow (idx, (int) pluginInfo.numParameters))
                {
                    listeners.call (&Listener::sandboxParameterChanged, this, idx, pc.value);
                }
                else
                {
                    juce::Logger::writeToLog ("[sandbox] Ignoring out-of-range ParameterChanged index "
                                              + juce::String (idx));
                }
            }
            break;

        case SandboxMessageType::PluginInfo:
        {
            PluginInfoPayload info;
            juce::StringArray names;
            if (parsePluginInfoMessage (payload, header.payloadSize, info, names))
            {
                pluginInfo = info;
                parameterNames = std::move (names);
                listeners.call (&Listener::sandboxPluginInfo, this);
            }
            else
            {
                juce::Logger::writeToLog ("[sandbox] Rejected malformed PluginInfo payload");
            }
            break;
        }

        case SandboxMessageType::StateData:
            {
                std::lock_guard<std::mutex> lock (responseMutex);
                lastResponseType = header.type;
                if (payload && header.payloadSize > 0)
                    lastResponsePayload = juce::MemoryBlock (payload, header.payloadSize);
                else
                    lastResponsePayload = {};
                responseReceived = true;
            }
            responseCondition.notify_one();
            break;

        case SandboxMessageType::LatencyChanged:
            if (payload && header.payloadSize >= sizeof (LatencyPayload))
            {
                auto* lat = static_cast<const LatencyPayload*> (payload);
                int newLatency = lat->latencySamples;
                latencySamples.store (newLatency);
                listeners.call (&Listener::sandboxLatencyChanged, this, newLatency);
                latencyChanged (newLatency);
            }
            break;

        case SandboxMessageType::Error:
        {
            juce::String error = payload ? juce::String::fromUTF8 (
                static_cast<const char*> (payload),
                static_cast<int> (header.payloadSize)) : "Unknown error";
            juce::Logger::writeToLog ("Sandbox error: " + error);
            break;
        }

        default:
            break;
    }
}

inline void SandboxHost::sendMessage (SandboxMessageType type,
                                       const void* payload,
                                       uint32_t payloadSize)
{
    auto msg = createSandboxMessage (type, payload, payloadSize,
                                      messageSequence.fetch_add (1));
    sendMessageToWorker (msg);
}

inline bool SandboxHost::waitForResponse (SandboxMessageType expectedType,
                                           uint32_t timeoutMs)
{
    std::unique_lock<std::mutex> lock (responseMutex);
    responseReceived = false;

    auto deadline = std::chrono::steady_clock::now() +
                    std::chrono::milliseconds (timeoutMs);

    while (! responseReceived)
    {
        if (responseCondition.wait_until (lock, deadline) == std::cv_status::timeout)
            return false;
    }

    return lastResponseType == expectedType;
}

inline void SandboxHost::attemptRestart()
{
    if (restartAttempts >= maxRestartAttempts)
    {
        juce::Logger::writeToLog ("Max sandbox restart attempts reached");
        state.store (State::Error);
        return;
    }

    restartAttempts++;
    juce::Logger::writeToLog ("Attempting sandbox restart " +
                               juce::String (restartAttempts) + "/" +
                               juce::String (maxRestartAttempts));

    // Kill existing process
    killWorkerProcess();
    juce::Thread::sleep (100);

    // Relaunch
    if (launchWorkerProcess())
    {
        state.store (State::Ready);
        heartbeat.reset();

        // Reload plugin if we had one
        if (loadedPlugin.name.isNotEmpty())
        {
            loadPlugin (loadedPlugin);

            // Restore state if available
            if (lastKnownState.getSize() > 0)
            {
                setPluginState (lastKnownState);
            }

            // Re-prepare if we were processing
            if (currentSampleRate > 0 && currentBlockSize > 0)
            {
                prepareToPlay (currentSampleRate, currentBlockSize,
                              numInputChannels, numOutputChannels);
            }
        }

        listeners.call (&Listener::sandboxRestarted, this);
        restartAttempts = 0;
    }
    else
    {
        state.store (State::Error);
    }
}

} // namespace element
