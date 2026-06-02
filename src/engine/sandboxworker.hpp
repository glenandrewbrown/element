// Copyright 2025 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce.hpp>
#include <element/plugins.hpp>

#include "sandboxipc.hpp"
#include "sandboxeditorwindow.hpp"
#include "sandboxsemaphore.hpp"
#include "sandboxsharedmemory.hpp"

#if EL_SANDBOX_INCLUDE_TEST_FORMATS
 #include "test_echo_plugin.hpp"
#endif

#include <atomic>
#include <memory>
#include <thread>

#if JUCE_MAC
 #include <mach/mach_init.h>
 #include <mach/thread_policy.h>
 #include <mach/thread_act.h>
 #include <pthread.h>
 #include <unistd.h>
#elif JUCE_LINUX || JUCE_BSD
 #include <pthread.h>
 #include <sched.h>
 #include <unistd.h>
#endif

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

    /** Deferred initialization — only called when confirmed as a worker process. */
    void initializeWorker();

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

    // Separate-window editor bridge (REAPER model)
    void handleOpenEditorWindow (const void* payload, uint32_t payloadSize);
    void handleCloseEditorWindow();
    void closeEditorWindowIfOpen();

    // RT processing thread
    void processAudioBlock();
    void rtProcessingLoop();
    void stopRTThread();

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

    // Shared audio buffer (backed by OS shared memory when available)
    SandboxSharedMemory sharedMemory;
    SharedAudioBuffer audioBuffer;

    // Internal buffers
    juce::AudioSampleBuffer processBuffer;
    juce::MidiBuffer midiBuffer;

    // Latency tracking
    int lastReportedLatency { 0 };

    // Logger for crash diagnostics
    std::unique_ptr<juce::FileLogger> logger;

    // RT processing thread
    SandboxSemaphore triggerSemaphore;   // host signals new audio data available
    SandboxSemaphore doneSemaphore;      // worker signals processing complete
    std::atomic<bool> rtThreadRunning { false };
    std::unique_ptr<std::thread> rtThread;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SandboxWorker)
};

//==============================================================================
// Implementation

inline SandboxWorker::SandboxWorker()
{
    // NOTE: Do NOT set crash handlers, loggers, or initialize formats here.
    // This constructor runs on EVERY app launch (before we know if this is
    // a sandbox worker). Heavy initialization is deferred to initializeWorker()
    // which only runs when we confirm this is a worker process.
}

/** Called only when this process is confirmed as a sandbox worker. */
inline void SandboxWorker::initializeWorker()
{
    juce::SystemStats::setApplicationCrashHandler ([] (void*) {});

    const int pid = static_cast<int> (::getpid());

   #if EL_SANDBOX_INCLUDE_TEST_FORMATS
    auto logFile = juce::File ("/tmp/element-sandbox-worker-" + juce::String (pid) + ".log");
   #else
    auto logFile = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                       .getChildFile ("Element/log/sandbox_worker.log");
   #endif
    logFile.create();
    logger = std::make_unique<juce::FileLogger> (logFile, "Sandbox Worker");
    juce::Logger::setCurrentLogger (logger.get());

    juce::Logger::writeToLog ("[Sandbox] initializeWorker pid=" + juce::String (pid));

   #if EL_SANDBOX_INCLUDE_TEST_FORMATS
    formatManager.addFormat (std::make_unique<TestEchoPluginFormat>());
    juce::Logger::writeToLog ("[Sandbox] TestEchoPluginFormat registered (test build)");
   #endif

    juce::addDefaultFormatsToManager (formatManager);
    juce::Logger::writeToLog ("[Sandbox] default plugin formats registered, total="
                               + juce::String (formatManager.getNumFormats()));
}

inline SandboxWorker::~SandboxWorker()
{
    stopTimer();
    stopRTThread();

    // Clean up plugin
    if (plugin)
    {
        if (isPrepared)
            plugin->releaseResources();
        plugin.reset();
    }

    // Detach from shared memory (worker is not owner, so no unlink)
    sharedMemory.close();

    juce::Logger::setCurrentLogger (nullptr);
}

inline bool SandboxWorker::initialise (const juce::String& commandLine)
{
    // PROBE (diagnostic, cheap): the worker process is spawned with stdout/stderr
    // routed to /dev/null (streamFlags=0 in SandboxHost::launchWorkerProcess), and its
    // FileLogger is not created until initializeWorker() — so any failure in the
    // spawn->handshake window is otherwise INVISIBLE (empty sandbox_worker.log). Append
    // unconditionally to a probe log so we can see exactly how far the worker gets.
    auto probeFile = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                         .getChildFile ("Element/log/sandbox_worker_probe.log");
    probeFile.create();
    const bool looksLikeWorker = commandLine.contains (EL_PLUGIN_HOST_PROCESS_ID);
    probeFile.appendText ("[probe] initialise pid=" + juce::String ((int) ::getpid())
                          + (looksLikeWorker ? " role=WORKER" : " role=host")
                          + " cmd=\"" + commandLine.substring (0, 160) + "\"\n");

    // Try to connect as worker process
    if (initialiseFromCommandLine (commandLine, EL_PLUGIN_HOST_PROCESS_ID, 20000))
    {
        probeFile.appendText ("[probe] pipe-connected pid=" + juce::String ((int) ::getpid()) + "\n");

        // Only now do we know this is a real worker process — initialize
        initializeWorker();
        juce::Logger::writeToLog ("Sandbox worker initialized");

        // Hide dock icon on macOS
        #if JUCE_MAC
        juce::Process::setDockIconVisible (false);
        #endif

        return true;
    }

    if (looksLikeWorker)
        probeFile.appendText ("[probe] initialiseFromCommandLine returned FALSE (pipe connect failed) pid="
                              + juce::String ((int) ::getpid()) + "\n");
    return false;
}

inline void SandboxWorker::handleConnectionMade()
{
    juce::Logger::writeToLog ("Connected to sandbox coordinator");

    startTimer (EL_SANDBOX_HEARTBEAT_MS);

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

        case SandboxMessageType::OpenEditorWindow:
            handleOpenEditorWindow (payload, header.payloadSize);
            break;

        case SandboxMessageType::CloseEditorWindow:
            handleCloseEditorWindow();
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

    // Send PluginInfo so the host can build parameter proxies + correct ports.
    // Truncate parameter list at the IPC cap to bound the host-side allocation.
    {
        const auto& jParams = plugin->getParameters();
        const int paramCount = juce::jmin (jParams.size(), (int) EL_SANDBOX_MAX_PARAMETERS);
        if (jParams.size() > paramCount)
            juce::Logger::writeToLog ("[sandbox-worker] Truncated " + juce::String (jParams.size())
                                       + " plugin parameters to cap " + juce::String (paramCount));

        juce::StringArray paramNames;
        paramNames.ensureStorageAllocated (paramCount);
        for (int i = 0; i < paramCount; ++i)
            paramNames.add (jParams[i]->getName (256));

        PluginInfoPayload info;
        info.numParameters = (uint32_t) paramCount;
        info.numInputChannels = (uint32_t) plugin->getTotalNumInputChannels();
        info.numOutputChannels = (uint32_t) plugin->getTotalNumOutputChannels();
        info.isInstrument = loadedDescription.isInstrument ? 1 : 0;
        info.acceptsMidi = plugin->acceptsMidi() ? 1 : 0;
        info.producesMidi = plugin->producesMidi() ? 1 : 0;
        info.reserved = 0;

        auto block = createPluginInfoMessage (info, paramNames);
        sendResponse (SandboxMessageType::PluginInfo,
                      block.getData(),
                      static_cast<uint32_t> (block.getSize()));
    }
}

inline void SandboxWorker::handleUnloadPlugin()
{
    stopRTThread();

    // The editor owns an AudioProcessorEditor tied to the plugin — destroy the
    // window (message thread) before releasing the processor.
    closeEditorWindowIfOpen();

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
    PreparePayload prep;
    std::string shmName;
    std::string trigSemName;
    std::string doneSemName;

    if (! parsePrepareMessage (payload, payloadSize, prep, shmName, trigSemName, doneSemName))
    {
        sendError ("Invalid PrepareToPlay payload");
        return;
    }

    sampleRate = prep.sampleRate;
    blockSize = prep.maxBlockSize;
    numInputChannels = prep.numInputChannels;
    numOutputChannels = prep.numOutputChannels;

    juce::Logger::writeToLog ("PrepareToPlay: rate=" + juce::String (sampleRate) +
                               " blockSize=" + juce::String (blockSize) +
                               " inputs=" + juce::String (numInputChannels) +
                               " outputs=" + juce::String (numOutputChannels));

    const int maxChannels = std::max (numInputChannels, numOutputChannels);
    const size_t requiredSize = SharedAudioBuffer::calculateRequiredSize (maxChannels, blockSize);

    // Phase D D-2: open named cross-process semaphores as Attacher to match the
    // host's Owner pair. The host opens these in prepareToPlay BEFORE sending
    // PreparePayload, so the kernel objects must already exist by the time we
    // get here. If open fails the audio loop will run without cross-process
    // signalling (host's spin phase still works for short blocks).
    triggerSemaphore.close();
    doneSemaphore.close();
    if (! trigSemName.empty())
    {
        if (! triggerSemaphore.open (trigSemName, SandboxSemaphore::Mode::Attacher))
            juce::Logger::writeToLog ("[sandbox-worker] Failed to attach to trigger semaphore: "
                                       + juce::String (trigSemName.c_str()));
    }
    if (! doneSemName.empty())
    {
        if (! doneSemaphore.open (doneSemName, SandboxSemaphore::Mode::Attacher))
            juce::Logger::writeToLog ("[sandbox-worker] Failed to attach to done semaphore: "
                                       + juce::String (doneSemName.c_str()));
    }

    sharedMemory.close();
    bool usedShm = false;

    if (! shmName.empty())
    {
        if (sharedMemory.attach (shmName, requiredSize))
        {
            const bool magicSeen = audioBuffer.attachToMemoryAsAttacher (
                sharedMemory.getData(), requiredSize, maxChannels, blockSize);
            if (! magicSeen)
            {
                juce::Logger::writeToLog ("[sandbox-worker] Shared memory header magic not observed within 100 ms"
                                           " — host did not finish initialising. Bailing out.");
                sharedMemory.close();
                return;
            }
            usedShm = true;
            juce::Logger::writeToLog ("[sandbox-worker] Attached to shared memory: "
                                       + juce::String (shmName.c_str())
                                       + " (" + juce::String (requiredSize) + " bytes)");
        }
        else
        {
            juce::Logger::writeToLog ("[sandbox-worker] Failed to attach to shared memory: "
                                       + juce::String (shmName.c_str())
                                       + " — falling back to local allocation");
        }
    }

    if (! usedShm)
    {
        audioBuffer.allocate (maxChannels, blockSize);
    }

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

    if (! rtThread)
    {
        rtThreadRunning.store (true, std::memory_order_release);
        rtThread = std::make_unique<std::thread> ([this] { rtProcessingLoop(); });
    }

    sendResponse (SandboxMessageType::Prepared);
}

inline void SandboxWorker::processAudioBlock()
{
    if (! plugin || ! isPrepared)
        return;

    auto* header = audioBuffer.getHeader();
    if (header == nullptr)
        return;

    const int numSamples = std::min (
        static_cast<int> (__atomic_load_n (&header->numSamples, __ATOMIC_ACQUIRE)),
        processBuffer.getNumSamples());
    const int inChannels = std::min (
        static_cast<int> (__atomic_load_n (&header->numInputChannels, __ATOMIC_ACQUIRE)),
        processBuffer.getNumChannels());

    // Read input audio from shared buffer
    const uint32_t readBuffer = __atomic_load_n (&header->activeBuffer, __ATOMIC_ACQUIRE);
    for (int ch = 0; ch < inChannels; ++ch)
    {
        const float* src = audioBuffer.getInputBuffer (ch, readBuffer);
        std::memcpy (processBuffer.getWritePointer (ch), src,
                    static_cast<size_t> (numSamples) * sizeof (float));
    }

    // Deserialize MIDI input
    midiBuffer.clear();
    uint32_t midiInSize = __atomic_load_n (&header->midiInputSize, __ATOMIC_ACQUIRE);
    if (midiInSize > 0)
    {
        deserializeMidiBuffer (audioBuffer.getMidiInputBuffer(), midiInSize, midiBuffer);
    }

    if (! isBypassed)
    {
        plugin->processBlock (processBuffer, midiBuffer);
    }

    const uint32_t writeBuffer = 1 - readBuffer;
    const int outChannels = std::min (
        static_cast<int> (__atomic_load_n (&header->numOutputChannels, __ATOMIC_ACQUIRE)),
        processBuffer.getNumChannels());

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
    __atomic_store_n (&header->midiOutputSize, midiOutSize, __ATOMIC_RELEASE);

    // Swap output buffer
    __atomic_store_n (&header->activeBuffer, writeBuffer, __ATOMIC_RELEASE);
    audioBuffer.markProcessed();

    // Signal worker done via shared buffer sequence counter
    audioBuffer.signalWorkerDone();
}

inline void SandboxWorker::handleProcessBlock()
{
    if (! plugin || ! isPrepared)
    {
        sendResponse (SandboxMessageType::ProcessComplete);
        return;
    }

    // Pipe-based trigger: forward to semaphore-based RT thread
    triggerSemaphore.post();

    // Wait for RT thread to complete, then send pipe response for backward compat
    if (doneSemaphore.timedWait (100000))  // 100ms timeout
        sendResponse (SandboxMessageType::ProcessComplete);
}

inline void SandboxWorker::rtProcessingLoop()
{
    // Promote to real-time thread priority for audio processing
    {
        bool prioritySet = false;
       #if JUCE_MAC
        const int bs = blockSize > 0 ? blockSize : 512;
        const double sr = sampleRate > 0 ? sampleRate : 44100.0;
        const double periodSec = static_cast<double> (bs) / sr;
        thread_time_constraint_policy_data_t policy;
        policy.period      = static_cast<uint32_t> (juce::Time::secondsToHighResolutionTicks (periodSec));
        policy.computation = static_cast<uint32_t> (juce::Time::secondsToHighResolutionTicks (periodSec * 0.9));
        policy.constraint  = static_cast<uint32_t> (juce::Time::secondsToHighResolutionTicks (periodSec));
        policy.preemptible = true;
        prioritySet = thread_policy_set (pthread_mach_thread_np (pthread_self()),
                                         THREAD_TIME_CONSTRAINT_POLICY,
                                         reinterpret_cast<thread_policy_t> (&policy),
                                         THREAD_TIME_CONSTRAINT_POLICY_COUNT) == KERN_SUCCESS;
       #elif JUCE_LINUX || JUCE_BSD
        struct sched_param param;
        param.sched_priority = sched_get_priority_max (SCHED_FIFO);
        prioritySet = pthread_setschedparam (pthread_self(), SCHED_FIFO, &param) == 0;
       #elif JUCE_WINDOWS
        prioritySet = SetThreadPriority (GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL) != 0;
       #endif
        if (! prioritySet)
            if (logger)
                logger->logMessage ("[sandbox-worker] Warning: could not set RT thread priority");
    }

    while (rtThreadRunning.load (std::memory_order_acquire))
    {
        if (! triggerSemaphore.timedWait (500000))
            continue;

        if (! rtThreadRunning.load (std::memory_order_acquire))
            break;

        processAudioBlock();

        doneSemaphore.post();
    }
}

inline void SandboxWorker::stopRTThread()
{
    rtThreadRunning.store (false, std::memory_order_release);
    triggerSemaphore.post();  // wake thread so it can exit
    if (rtThread && rtThread->joinable())
        rtThread->join();
    rtThread.reset();
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
    stopRTThread();

    // Editor owns NSViews tied to the processor — destroy it first.
    closeEditorWindowIfOpen();

    if (plugin)
    {
        if (isPrepared)
            plugin->releaseResources();
        plugin.reset();
    }

    sharedMemory.close();

    sendResponse (SandboxMessageType::ShutdownAck);

    juce::Thread::sleep (50);

    juce::JUCEApplication::quit();
}

//==============================================================================
// Separate-window editor bridge handlers. ChildProcessWorker delivers
// coordinator messages on a background thread, but DocumentWindow /
// AudioProcessorEditor creation MUST run on the message thread — marshal each.

inline void SandboxWorker::closeEditorWindowIfOpen()
{
    if (! sandbox_editor_window::hasOpenEditorWindow())
        return;

    auto* mm = juce::MessageManager::getInstance();
    if (mm->isThisTheMessageThread())
        sandbox_editor_window::closeEditorWindow();
    else
        mm->callSync ([] { sandbox_editor_window::closeEditorWindow(); });
}

inline void SandboxWorker::handleOpenEditorWindow (const void* payload, uint32_t payloadSize)
{
    if (! plugin)
    {
        sendResponse (SandboxMessageType::EditorWindowFailed);
        return;
    }

    EditorWindowPayload req {};
    if (payload != nullptr && payloadSize >= sizeof (EditorWindowPayload))
        std::memcpy (&req, payload, sizeof (req));

    // Notify the host if the USER later closes the window (so the host clears its
    // "editor open" state + UI). SafePointer not needed — the worker outlives the
    // window; on shutdown we tear the window down before exiting.
    sandbox_editor_window::setUserCloseCallback ([this]
    {
        sendResponse (SandboxMessageType::EditorWindowClosed);
    });

    auto* proc = plugin.get();
    int w = 0, h = 0;
    bool ok = false;

    juce::MessageManager::getInstance()->callSync ([proc, &req, &w, &h, &ok]
    {
        ok = sandbox_editor_window::openEditorWindow (proc, req.x, req.y, w, h);
    });

    if (! ok)
    {
        sendResponse (SandboxMessageType::EditorWindowFailed);
        return;
    }

    EditorWindowPayload reply {};
    reply.x = req.x;
    reply.y = req.y;
    reply.width = w;
    reply.height = h;
    sendResponse (SandboxMessageType::EditorWindowOpened, &reply, sizeof (reply));
}

inline void SandboxWorker::handleCloseEditorWindow()
{
    closeEditorWindowIfOpen();
    sendResponse (SandboxMessageType::EditorWindowClosed);
}

} // namespace element
