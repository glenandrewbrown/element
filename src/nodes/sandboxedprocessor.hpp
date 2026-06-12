// Copyright 2025 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/processor.hpp>
#include <element/plugins.hpp>

#include "engine/sandboxhost.hpp"
#include "engine/sandboxparameter.hpp"
#include "engine/sandboxworkerpool.hpp"
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
    /** Tag for the deferred-launch constructor (T1/T2 message-thread-freeze fix):
        build the node + SandboxHost WITHOUT launching the worker. The owner then
        drives beginLaunch()/runLaunchHandshake()/finishLaunch() across the message
        + pool threads so the blocking handshake never freezes the message thread. */
    struct DeferLaunch {};

    /** Tag for the pool-adoption constructor (T7/instance-reuse, 2026-06-11):
        build the node around an ALREADY-RUNNING worker claimed from the
        SandboxWorkerPool — either a blank warm worker (handshake done, plugin
        still to load) or a parked instance already hosting this plugin. */
    struct AdoptHost {};

    //==========================================================================
    /** Create a sandboxed processor for the given plugin. */
    SandboxedProcessorNode (uint32 nodeId,
                             const juce::PluginDescription& pluginDesc,
                             PluginManager& plugins);

    /** Create with auto-generated node ID. */
    SandboxedProcessorNode (const juce::PluginDescription& pluginDesc,
                             PluginManager& plugins);

    /** DEFERRED-LAUNCH ctor: constructs the node + SandboxHost but does NOT launch
        the worker (no blocking handshake in the ctor). Launch is driven later via
        beginLaunch() / runLaunchHandshake() / finishLaunch(). */
    SandboxedProcessorNode (const juce::PluginDescription& pluginDesc,
                             PluginManager& plugins,
                             DeferLaunch);

    /** POOL-ADOPTION ctor: take ownership of a worker claimed from the
        SandboxWorkerPool. MESSAGE THREAD only. A blank worker gets loadPlugin
        issued immediately (non-blocking); a parked loaded worker is reset to
        its pristine post-load state and is ready as soon as the watcher
        observes it (typically the next poll). */
    SandboxedProcessorNode (const juce::PluginDescription& pluginDesc,
                             PluginManager& plugins,
                             AdoptHost,
                             std::unique_ptr<SandboxHost> claimedHost);

    ~SandboxedProcessorNode() override;

    //==========================================================================
    // Deferred launch (only valid on a node built with the DeferLaunch ctor).
    /** MESSAGE THREAD: arm the deferred launch. Returns false if the host could not
        transition to Starting (already launching/launched). */
    bool beginLaunch();

    /** POOL THREAD: run the BLOCKING worker spawn + connect handshake. Returns the
        handshake result. Pair with finishLaunch() on the message thread. */
    bool runLaunchHandshake();

    /** MESSAGE THREAD: finish the launch. On success this also issues the (non-
        blocking) loadPlugin so the worker begins loading the plugin in its own
        process. After this returns, getSandboxState() reflects Ready/Loading on
        success or Idle on handshake failure. */
    void finishLaunch (bool handshakeOk);

    /** Deferred-launch progress (lets the message-thread watcher distinguish "still
        launching" from "launch failed"). */
    enum class LaunchPhase { NotStarted, InFlight, Succeeded, Failed };
    LaunchPhase getLaunchPhase() const noexcept
    {
        return static_cast<LaunchPhase> (launchPhase.load());
    }

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

    /** True while the worker reports a plugin load in flight (within the load
        ceiling) — lets the GraphManager watcher extend its fallback deadline. */
    bool isWorkerLoadInProgress() const noexcept;

    /** True once the message-thread params/ports rebuild for the CURRENT load
        has completed (set at the end of the marshalled sandboxPluginInfo
        work). The GraphManager watcher gates the swap on this so the swap's
        setupNode/resetPorts NEVER run against an empty or half-built port
        list — the root of the 2026-06-11 stuck-loading/0-ports incidents
        (pre-marshal: torn IPC-thread rebuild; post-marshal: swap winning the
        race against the deferred rebuild). */
    bool arePortsSynced() const noexcept { return portsSynced.load(); }

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

    // MUST be true: this node has NO in-process AudioProcessor
    // (getAudioPluginInstance() == nullptr) and renders via render(RenderContext&)
    // → SandboxHost::processBlock. Returning false routes ProcessBufferOp::perform
    // to its cached AudioProcessor* branch, which derefs nullptr on the AUDIO
    // THREAD the first time the op renders (SIGSEGV — found live 2026-06-10).
    bool wantsContext() const noexcept override { return true; }

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

    // Deferred-launch progress (atomic int mirroring LaunchPhase). Set on the
    // message thread by begin/finishLaunch; read by the watcher (message thread).
    std::atomic<int> launchPhase { static_cast<int> (LaunchPhase::NotStarted) };

    // True once the marshalled PluginInfo params/ports rebuild completed for
    // the current load (see arePortsSynced). Written on the message thread.
    std::atomic<bool> portsSynced { false };

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

inline SandboxedProcessorNode::SandboxedProcessorNode (
    const juce::PluginDescription& pluginDesc,
    PluginManager& plugins,
    DeferLaunch)
    : Processor (0),
      pluginManager (plugins),
      description (pluginDesc)
{
    setName (description.name + " (Sandboxed)");

    // Build the host + register as listener, but DO NOT launch (no blocking
    // handshake in the ctor). The owner drives launch across threads.
    sandbox = std::make_unique<SandboxHost> (pluginManager);
    sandbox->addListener (this);
}

inline SandboxedProcessorNode::SandboxedProcessorNode (
    const juce::PluginDescription& pluginDesc,
    PluginManager& plugins,
    AdoptHost,
    std::unique_ptr<SandboxHost> claimedHost)
    : Processor (0),
      pluginManager (plugins),
      description (pluginDesc)
{
    // MESSAGE THREAD (loadPlugin's non-atomic write + the listener wiring).
    jassert (juce::MessageManager::getInstance()->isThisTheMessageThread());
    jassert (claimedHost != nullptr);

    setName (description.name + " (Sandboxed)");
    sandbox = std::move (claimedHost);
    sandbox->addListener (this);

    // The pool worker's handshake already succeeded — the watcher can go
    // straight to observing sandbox State instead of waiting on LaunchPhase.
    launchPhase.store (static_cast<int> (LaunchPhase::Succeeded));

    if (sandbox->isPluginLoaded())
    {
        // Parked instance for this very plugin: already loaded. Mirror the
        // listener effects that fired into the previous owner — local flag,
        // params + ports from the host's cached PluginInfo — and reset the
        // plugin to its pristine post-load state so a fresh add never
        // resurrects the deleted node's settings. (When this node comes from a
        // SESSION load, the saved state lands via setState() after the swap
        // and overwrites the pristine baseline — both paths end correct.)
        pluginLoaded.store (true);
        if (sandbox->hasReceivedPluginInfo())
            sandboxPluginInfo (sandbox.get());
        sandbox->resetToPristineState();
        juce::Logger::writeToLog ("[sandbox-load] adopted PARKED instance for \""
                                  + description.name + "\" — skipping load");

        // Adopting just emptied the shelf for this plugin — refill it in the
        // background so the user's NEXT add is instant too. Already on the
        // message thread here; the host carries its original instantiation
        // duration, so the expensive-load gate still applies.
        pluginManager.workerPool().maybePreinstantiate (description,
                                                        sandbox->getLastInstantiationMs());
    }
    else
    {
        // Blank warm worker: connected, formats registered — just load.
        sandbox->loadPlugin (description);
        juce::Logger::writeToLog ("[sandbox-load] adopted warm worker for \""
                                  + description.name + "\" — skipping spawn/handshake");
    }
}

inline bool SandboxedProcessorNode::beginLaunch()
{
    if (! sandbox)
        return false;
    const bool armed = sandbox->beginDeferredLaunch();
    if (armed)
        launchPhase.store (static_cast<int> (LaunchPhase::InFlight));
    return armed;
}

inline bool SandboxedProcessorNode::runLaunchHandshake()
{
    // POOL THREAD: the single blocking primitive.
    if (! sandbox)
        return false;
    return sandbox->runWorkerHandshake();
}

inline void SandboxedProcessorNode::finishLaunch (bool handshakeOk)
{
    // MESSAGE THREAD.
    if (! sandbox)
        return;

    sandbox->finishDeferredLaunch (handshakeOk);

    if (! handshakeOk)
    {
        hasError.store (true);
        lastError = "Failed to launch sandbox worker process";
        juce::Logger::writeToLog ("[SandboxedProcessor] " + lastError);
        launchPhase.store (static_cast<int> (LaunchPhase::Failed));
        return;
    }

    launchPhase.store (static_cast<int> (LaunchPhase::Succeeded));

    // Worker is connected (Ready) — issue the non-blocking plugin load. loadPlugin
    // is a pipe sendMessage + a `loadedPlugin = desc` write; running it here keeps
    // that non-atomic write on the message thread (never the pool thread).
    sandbox->loadPlugin (description);
}

inline SandboxedProcessorNode::~SandboxedProcessorNode()
{
    if (sandbox == nullptr)
        return;

    sandbox->removeListener (this);

    // Instance reuse (2026-06-11): a healthy worker still hosting its plugin is
    // PARKED in the process-wide pool instead of killed, so re-adding the same
    // plugin (or re-opening a session that contains it) skips the entire load.
    // Park only from the message thread — the pool's shelves are message-thread
    // state. Node releases on other threads (defensive: refcounted release
    // paths) take the plain shutdown.
    auto* mm = juce::MessageManager::getInstanceWithoutCreating();
    if (mm != nullptr && mm->isThisTheMessageThread()
        && sandbox->isPluginLoaded() && sandbox->isHealthy())
    {
        sandbox->closeEditor();
        if (pluginManager.workerPool().park (std::move (sandbox), description))
            return;
    }

    if (sandbox != nullptr)
        sandbox->shutdown();
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

inline bool SandboxedProcessorNode::isWorkerLoadInProgress() const noexcept
{
    return sandbox != nullptr && sandbox->isLoadInProgress();
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

inline void SandboxedProcessorNode::sandboxPluginLoaded (SandboxHost* host)
{
    juce::Logger::writeToLog ("[SandboxedProcessor] Plugin loaded: " + description.name);
    pluginLoaded.store (true);
    hasError.store (false);
    lastError.clear();

    // Speculative spare (2026-06-12): an expensive load (Kontakt-class) earns a
    // background pre-instantiated spare in the pool, so the user's NEXT add of
    // the same plugin adopts a parked instance instantly instead of paying the
    // full instantiation again. This callback fires on the host's IPC thread —
    // the pool is message-thread-only state, so bounce. PluginManager owns the
    // pool and outlives every node; the description is copied by value.
    {
        const auto instMs = host != nullptr ? host->getLastInstantiationMs() : 0;
        auto* pm = &pluginManager;
        const auto descCopy = description;
        juce::MessageManager::callAsync ([pm, descCopy, instMs] {
            pm->workerPool().maybePreinstantiate (descCopy, instMs);
        });
    }

    // Ports are built later in sandboxPluginInfo() when the worker delivers
    // the parameter list + I/O config. PluginInfo always follows PluginLoaded
    // on the wire, so doing it here would just be replaced milliseconds later.

    // Do NOT prepareToPlay here. This listener fires AFTER SandboxHost's
    // PluginLoaded handler publishes pluginLoaded/Active — the audio thread may
    // already be inside processBlock, and prepareToPlay() unmaps + remaps the
    // shm that render path reads (use-after-unmap host crash; RT verifier
    // 2026-06-10). The host now owns the single post-launch prepare, gated by
    // preparedSinceLaunch and issued BEFORE the gate opens; rate/buffer changes
    // keep flowing through prepareToRender() with the device stopped.
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
    // IPC-thread listener; setLatencySamples can trigger a graph rebuild —
    // message-thread territory. Marshal (same idiom as sandboxPluginInfo).
    ProcessorPtr self (this);
    const int blockSize = currentBlockSize;
    juce::MessageManager::callAsync ([self, newLatency, blockSize]
    {
        if (auto* node = static_cast<SandboxedProcessorNode*> (self.get()))
            // Add 1 buffer of IPC round-trip latency to the plugin's latency.
            node->setLatencySamples (newLatency + blockSize);
    });
}

inline void SandboxedProcessorNode::sandboxPluginInfo (SandboxHost*)
{
    if (! sandbox)
        return;

    // This listener fires on the IPC (pipe) thread. The params/ports rebuild
    // mutates state the MESSAGE thread reads concurrently (the swap's
    // resetPorts + the 60Hz snapshot build walk portList()) — rebuilding here
    // produced a TORN port list in the first post-swap snapshot (live
    // 2026-06-11: Kontakt's ready JSON choked the webview apply and the
    // poisoned push-dedupe froze the UI on the loading face for 35 minutes).
    // Marshal the rebuild to the message thread; the ProcessorPtr keeps this
    // node alive across the hop (a post-teardown run is a safe no-op rebuild).
    // The pool-adoption ctor calls this directly ON the message thread —
    // callAsync simply defers a tick there, which is equally correct.
    ProcessorPtr self (this);
    juce::MessageManager::callAsync ([self]
    {
        auto* node = static_cast<SandboxedProcessorNode*> (self.get());
        if (node == nullptr || node->sandbox == nullptr)
            return;

        // Rebuild parameter proxies. Each proxy holds a reference to the host
        // so setValue() pushes through the existing SetParameter IPC. The v2
        // wire format carries real defaults/ranges/flags/labels per parameter
        // (SandboxParamMeta) — a v1 payload without a meta table degrades to
        // the synthesized 0.5-midpoint defaults via getParameterMeta().
        node->params.clear();
        const int n = node->sandbox->getParameterCount();
        for (int i = 0; i < n; ++i)
        {
            auto name = node->sandbox->getParameterName (i);
            if (name.isEmpty())
                name = "Param " + juce::String (i);
            node->params.add (new SandboxParameterWithMeta (*node->sandbox, i, name,
                                                            node->sandbox->getParameterMeta (i),
                                                            node->sandbox->getParameterLabel (i)));
        }

        // Rebuild ports with real I/O config + per-parameter Control ports.
        node->setupPorts();

        // Publish "ports are real" — the GraphManager watcher holds the swap
        // until this flips, so setupNode/resetPorts always see the final list.
        node->portsSynced.store (true);
    });
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
