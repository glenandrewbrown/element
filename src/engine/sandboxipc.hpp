// Copyright 2025 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce.hpp>
#include <element/atomic.hpp>

#include <atomic>
#include <chrono>
#include <cstring>
#include <thread>

namespace element {

//==============================================================================
/** Unique ID for sandbox host worker processes. */
#define EL_PLUGIN_HOST_PROCESS_ID "pshelbg"

/** Default heartbeat interval in milliseconds. */
#define EL_SANDBOX_HEARTBEAT_MS 500

/** Maximum time to wait for worker response before assuming crash. */
#define EL_SANDBOX_TIMEOUT_MS 5000

/** Maximum time a single plugin LOAD may run before the host stops extending the
    heartbeat grace and treats the worker as hung (BUG B). Generous enough for the
    heaviest sample-based instruments (Kontakt cold-loading a large library) so a
    slow-but-alive load is never misread as a crash, but bounded so a TRUE deadlock
    still dies and recovers. The worker's message thread is blocked answering pings
    during the load, so the host suspends the 5 s watchdog for up to this long. */
#define EL_SANDBOX_LOAD_CEILING_MS 120000

/** BUG D (post-load message-thread starvation). After instantiation completes,
    some instruments keep doing heavy MESSAGE-THREAD work for many seconds — Kontakt
    8 scans its content database and runs registration/UI timers AFTER the plugin is
    "loaded". With the heartbeat now emitted from a dedicated thread (process/IPC
    liveness, independent of the message thread), a busy-but-alive main thread is no
    longer misread as dead. The MAIN-THREAD beat (MainThreadBeat, sent from the
    worker's juce::Timer) is therefore ADVISORY: a stalled main thread is logged but
    only forces teardown once it exceeds this ceiling, at which point it is a genuine
    deadlock (no UI/automation will ever respond again) and the worker must die +
    recover. 120 s mirrors the load ceiling and comfortably exceeds any legitimate
    post-load warm-up (Kontakt's content-DB scan is tens of seconds at worst). */
#define EL_SANDBOX_MAINTHREAD_CEILING_MS 120000

/** Settling window after PluginLoaded during which audio xruns are EXPECTED and the
    "consecutive xruns" diagnostic is suppressed. A sample-streaming instrument
    (Kontakt) does slow first blocks while its streaming engine warms up; the host's
    self-healing sequence counter (processBlock, expectedSeq = workerSeq + 1) already
    tolerates these transient misses within a single block. Bounded so a genuinely
    hung worker still surfaces the diagnostic once the warm-up window has elapsed. */
#define EL_SANDBOX_POSTLOAD_SETTLE_MS 30000

/** Maximum audio channels supported in sandbox IPC. */
#define EL_SANDBOX_MAX_CHANNELS 64

/** Maximum buffer size supported in sandbox IPC. */
#define EL_SANDBOX_MAX_BUFFER_SIZE 8192

/** Maximum parameters reported by a sandboxed plugin to the host.
    Plugins above this cap are truncated by the worker and parsed payloads
    above this cap are rejected — defends the host against buggy or
    malicious plugins from triggering unbounded host-side allocation. */
#define EL_SANDBOX_MAX_PARAMETERS 4096

//==============================================================================
/** Message types for sandbox control IPC. */
enum class SandboxMessageType : uint32_t
{
    None = 0,

    // Coordinator -> Worker
    LoadPlugin,         // Load a plugin by description XML
    UnloadPlugin,       // Unload the current plugin
    PrepareToPlay,      // Set sample rate and buffer size
    ProcessBlock,       // Process audio (trigger shared memory read)
    SetParameter,       // Set parameter value
    SetState,           // Set plugin state (XML)
    GetState,           // Request plugin state
    SetBypass,          // Enable/disable bypass
    Shutdown,           // Graceful shutdown request
    OpenEditorWindow,   // Ask worker to create + show the plugin editor in its OWN NSWindow (EditorWindowPayload)
    CloseEditorWindow,  // Ask worker to close the plugin editor window

    // Worker -> Coordinator
    LoadInProgress,     // Worker has begun a (potentially slow) plugin instantiation;
                        // host suspends its heartbeat deadline until PluginLoaded /
                        // PluginLoadFailed or a generous load-ceiling elapses (BUG B).
    PluginLoaded,       // Plugin loaded successfully
    PluginLoadFailed,   // Plugin load failed (error message)
    PluginUnloaded,     // Plugin unloaded
    Prepared,           // PrepareToPlay completed
    ProcessComplete,    // Audio processing done (trigger shared memory read)
    ParameterChanged,   // Parameter value changed (automation)
    StateData,          // Plugin state response
    LatencyChanged,     // Plugin latency changed
    Heartbeat,          // Worker PROCESS is alive — emitted from a DEDICATED worker
                        // thread (NOT the message thread), so it keeps flowing even
                        // while a busy-but-alive plugin (Kontakt post-load DB scan)
                        // blocks the worker message thread (BUG D). Governs the
                        // host's crash/teardown watchdog.
    Error,              // Error message
    PluginInfo,         // Plugin metadata (param count + names + I/O config) sent after PluginLoaded
    ShutdownAck,        // Worker has finished cleanup and is about to exit (D-4 ordered shutdown)
    EditorWindowOpened, // Worker created + showed its editor window (EditorWindowPayload, size only)
    EditorWindowFailed, // Worker could not create an editor (no UI / null view)
    EditorWindowClosed, // Worker's editor window was closed
    MainThreadBeat,     // Worker MESSAGE THREAD is responsive — emitted from the
                        // worker's juce::Timer (the message thread). ADVISORY only
                        // (BUG D): a stalled main thread is logged but does not force
                        // teardown until EL_SANDBOX_MAINTHREAD_CEILING_MS, since a
                        // busy-but-alive plugin still keeps the PROCESS Heartbeat
                        // flowing. Appended at the END of the enum so existing
                        // ordinals (and the wire format) are unchanged.
    ResetToPristine,    // Coordinator -> Worker: restore the plugin to the state
                        // captured immediately after it loaded (instance-reuse:
                        // a parked worker adopted for a FRESH add must not
                        // resurrect the deleted node's settings). Appended at
                        // the END — ordinals unchanged.
};

//==============================================================================
/** Separate-window editor bridge (REAPER model): the worker hosts the plugin
    editor in its OWN real NSWindow, which the WindowServer composites normally.
    Crash-isolated — the editor lives in the worker process, so a plugin crash
    takes the window down with the worker and the host survives. No pixel
    mirroring, no CALayerHost, no input forwarding (the OS routes events to the
    worker's window directly).

    Host -> Worker on OpenEditorWindow: requested top-left screen position to
    place the window near the originating Block. Worker -> Host on
    EditorWindowOpened: the editor's reported size (position echoed for
    confirmation). */
struct EditorWindowPayload
{
    int32_t  x { 0 };       ///< requested window top-left, global screen coords
    int32_t  y { 0 };
    int32_t  width { 0 };   ///< editor size (worker -> host); 0 on request
    int32_t  height { 0 };
    int32_t  hidden { 0 };  ///< host -> worker: 1 = create the editor but keep the
                            ///< window invisible (pre-warm — pays the plugin's
                            ///< editor-time init before the user first opens it)
};

//==============================================================================
/** Header structure for sandbox messages sent via IPC. */
struct SandboxMessageHeader
{
    SandboxMessageType type { SandboxMessageType::None };
    uint32_t payloadSize { 0 };
    uint32_t sequenceNumber { 0 };
    uint32_t reserved { 0 };
};

//==============================================================================
/** Serialize a SandboxMessage to a MemoryBlock for IPC. */
inline juce::MemoryBlock createSandboxMessage (SandboxMessageType type,
                                                const void* payload = nullptr,
                                                uint32_t payloadSize = 0,
                                                uint32_t sequenceNumber = 0)
{
    juce::MemoryBlock block (sizeof (SandboxMessageHeader) + payloadSize);
    auto* header = static_cast<SandboxMessageHeader*> (block.getData());
    header->type = type;
    header->payloadSize = payloadSize;
    header->sequenceNumber = sequenceNumber;
    header->reserved = 0;

    if (payload != nullptr && payloadSize > 0)
        std::memcpy (static_cast<uint8_t*> (block.getData()) + sizeof (SandboxMessageHeader),
                     payload, payloadSize);

    return block;
}

/** Parse a MemoryBlock into a SandboxMessageHeader and payload pointer. */
inline bool parseSandboxMessage (const juce::MemoryBlock& block,
                                  SandboxMessageHeader& header,
                                  const void*& payload)
{
    if (block.getSize() < sizeof (SandboxMessageHeader))
        return false;

    std::memcpy (&header, block.getData(), sizeof (SandboxMessageHeader));

    if (block.getSize() < sizeof (SandboxMessageHeader) + header.payloadSize)
        return false;

    if (header.payloadSize > 0)
        payload = static_cast<const uint8_t*> (block.getData()) + sizeof (SandboxMessageHeader);
    else
        payload = nullptr;

    return true;
}

//==============================================================================
/** Parameter change message payload. */
struct ParameterChangePayload
{
    uint32_t parameterIndex;
    float value;
};

/** Prepare to play message payload.

    Wire layout (in order):
        [PreparePayload struct]
        [shmNameLength bytes of UTF-8 shared-mem name]
        [trigSemNameLength bytes of UTF-8 trigger-semaphore name]
        [doneSemNameLength bytes of UTF-8 done-semaphore name]

    Use createPrepareMessage() / parsePrepareMessage() to (de)serialize. */
struct PreparePayload
{
    double sampleRate;
    int32_t maxBlockSize;
    int32_t numInputChannels;
    int32_t numOutputChannels;

    uint32_t shmNameLength { 0 };       ///< 0 = no shared memory, use local
    uint32_t trigSemNameLength { 0 };   ///< 0 = no cross-process trigger sem (in-process fallback)
    uint32_t doneSemNameLength { 0 };   ///< 0 = no cross-process done sem (in-process fallback)
};

inline juce::MemoryBlock createPrepareMessage (double sampleRate, int32_t maxBlockSize,
                                                int32_t numInputChannels, int32_t numOutputChannels,
                                                const std::string& shmName = {},
                                                const std::string& trigSemName = {},
                                                const std::string& doneSemName = {})
{
    const uint32_t shmLen = static_cast<uint32_t> (shmName.size());
    const uint32_t trigLen = static_cast<uint32_t> (trigSemName.size());
    const uint32_t doneLen = static_cast<uint32_t> (doneSemName.size());
    const size_t totalPayload = sizeof (PreparePayload) + shmLen + trigLen + doneLen;

    juce::MemoryBlock payload (totalPayload, true);
    auto* prep = static_cast<PreparePayload*> (payload.getData());
    prep->sampleRate = sampleRate;
    prep->maxBlockSize = maxBlockSize;
    prep->numInputChannels = numInputChannels;
    prep->numOutputChannels = numOutputChannels;
    prep->shmNameLength = shmLen;
    prep->trigSemNameLength = trigLen;
    prep->doneSemNameLength = doneLen;

    auto* cursor = static_cast<uint8_t*> (payload.getData()) + sizeof (PreparePayload);
    if (shmLen > 0)
    {
        std::memcpy (cursor, shmName.data(), shmLen);
        cursor += shmLen;
    }
    if (trigLen > 0)
    {
        std::memcpy (cursor, trigSemName.data(), trigLen);
        cursor += trigLen;
    }
    if (doneLen > 0)
    {
        std::memcpy (cursor, doneSemName.data(), doneLen);
    }

    return payload;
}

inline bool parsePrepareMessage (const void* payload, uint32_t payloadSize,
                                  PreparePayload& prep, std::string& shmName,
                                  std::string& trigSemName, std::string& doneSemName)
{
    if (payloadSize < sizeof (PreparePayload))
        return false;

    std::memcpy (&prep, payload, sizeof (PreparePayload));

    const size_t total = sizeof (PreparePayload)
                       + prep.shmNameLength
                       + prep.trigSemNameLength
                       + prep.doneSemNameLength;
    if (payloadSize < total)
        return false;

    const auto* cursor = static_cast<const char*> (payload) + sizeof (PreparePayload);

    shmName.clear();
    if (prep.shmNameLength > 0)
    {
        shmName.assign (cursor, prep.shmNameLength);
        cursor += prep.shmNameLength;
    }

    trigSemName.clear();
    if (prep.trigSemNameLength > 0)
    {
        trigSemName.assign (cursor, prep.trigSemNameLength);
        cursor += prep.trigSemNameLength;
    }

    doneSemName.clear();
    if (prep.doneSemNameLength > 0)
    {
        doneSemName.assign (cursor, prep.doneSemNameLength);
    }

    return true;
}

/** Backwards-compat overload for callers that only need shmName extraction.
    Used by tests that don't exercise the cross-process semaphore wiring. */
inline bool parsePrepareMessage (const void* payload, uint32_t payloadSize,
                                  PreparePayload& prep, std::string& shmName)
{
    std::string trig;
    std::string done;
    return parsePrepareMessage (payload, payloadSize, prep, shmName, trig, done);
}

/** Latency change message payload. */
struct LatencyPayload
{
    int32_t latencySamples;
};

//==============================================================================
/** Per-parameter metadata carried in the PluginInfo wire payload (v2).

    Mirrors what the worker reads off the live juce::AudioProcessorParameter so
    the host can build REAL parameter proxies instead of synthesizing 0.5
    defaults with no ranges/labels/flags. min/max come from
    juce::RangedAudioParameter::getNormalisableRange() when the parameter is
    ranged, else the normalized 0..1. The unit label string travels in the
    trailing meta table (variable length), not in this POD. */
struct SandboxParamMeta
{
    float defaultValue { 0.5f };
    float minValue { 0.0f };
    float maxValue { 1.0f };
    uint8_t stepped { 0 };   ///< parameter is discrete (isDiscrete)
    uint8_t boolean { 0 };   ///< parameter is a toggle (isBoolean)
    uint16_t numSteps { 0 }; ///< 0 = continuous / use host default
};

static_assert (std::is_trivially_copyable_v<SandboxParamMeta>,
               "SandboxParamMeta crosses the process boundary — must stay POD.");
static_assert (sizeof (SandboxParamMeta) == 16,
               "SandboxParamMeta layout changed — coordinate worker+host rebuild.");

/** Plugin metadata payload — sent worker → host immediately after PluginLoaded.

    Wire layout (in order):
        [PluginInfoPayload struct]
        [name table: numParameters × (uint32_t byteLength + UTF-8 bytes)]
        [meta table: numParameters × (SandboxParamMeta + uint32_t labelLength + UTF-8 label bytes)]

    paramMetaLength == 0 means a v1 payload with no meta table — the parser
    accepts it and the host falls back to synthesized defaults. Use
    createPluginInfoMessage() / parsePluginInfoMessage() to (de)serialize. */
struct PluginInfoPayload
{
    uint32_t numParameters { 0 };
    uint32_t numInputChannels { 0 };
    uint32_t numOutputChannels { 0 };
    uint8_t isInstrument { 0 };
    uint8_t acceptsMidi { 0 };
    uint8_t producesMidi { 0 };
    uint8_t reserved { 0 };
    uint32_t paramNamesLength { 0 };  ///< total bytes of trailing name table
    uint32_t paramMetaLength { 0 };   ///< total bytes of trailing meta table (0 = v1, no metas)
};

/** Serialize a PluginInfoPayload + parameter names (+ optional per-parameter
    metas/labels) into a transferable block.
    Names beyond EL_SANDBOX_MAX_PARAMETERS are silently dropped — the worker is
    expected to apply the same cap before calling this helper. When `metas` is
    non-null it must hold one entry per (capped) name; `labels` likewise. A null
    metas pointer emits a v1 payload (paramMetaLength == 0). */
inline juce::MemoryBlock createPluginInfoMessage (const PluginInfoPayload& info,
                                                   const juce::StringArray& names,
                                                   const juce::Array<SandboxParamMeta>* metas = nullptr,
                                                   const juce::StringArray* labels = nullptr)
{
    // Cap names at EL_SANDBOX_MAX_PARAMETERS — defensive duplicate of the
    // worker-side cap; ensures bounded allocation even if the caller forgot.
    const int safeCount = juce::jmin (names.size(), (int) EL_SANDBOX_MAX_PARAMETERS);

    // First pass: compute total bytes for the trailing name table.
    uint32_t namesBytes = 0;
    for (int i = 0; i < safeCount; ++i)
    {
        const auto utf8Len = (uint32_t) names[i].getNumBytesAsUTF8();
        namesBytes += (uint32_t) sizeof (uint32_t) + utf8Len;
    }

    // Meta table bytes: per param a fixed POD + length-prefixed label string.
    const bool haveMetas = metas != nullptr && metas->size() >= safeCount;
    uint32_t metaBytes = 0;
    if (haveMetas)
    {
        for (int i = 0; i < safeCount; ++i)
        {
            const uint32_t labelLen = (labels != nullptr && i < labels->size())
                                          ? (uint32_t) (*labels)[i].getNumBytesAsUTF8()
                                          : 0u;
            metaBytes += (uint32_t) sizeof (SandboxParamMeta) + (uint32_t) sizeof (uint32_t) + labelLen;
        }
    }

    PluginInfoPayload header = info;
    header.numParameters = (uint32_t) safeCount;
    header.paramNamesLength = namesBytes;
    header.paramMetaLength = metaBytes;

    juce::MemoryBlock payload (sizeof (PluginInfoPayload) + namesBytes + metaBytes, true);
    auto* dst = static_cast<uint8_t*> (payload.getData());
    std::memcpy (dst, &header, sizeof (PluginInfoPayload));

    uint8_t* cursor = dst + sizeof (PluginInfoPayload);
    for (int i = 0; i < safeCount; ++i)
    {
        const auto utf8 = names[i].toRawUTF8();
        const uint32_t len = (uint32_t) names[i].getNumBytesAsUTF8();
        std::memcpy (cursor, &len, sizeof (len));
        cursor += sizeof (len);
        std::memcpy (cursor, utf8, len);
        cursor += len;
    }

    if (haveMetas)
    {
        for (int i = 0; i < safeCount; ++i)
        {
            const auto& meta = metas->getReference (i);
            std::memcpy (cursor, &meta, sizeof (SandboxParamMeta));
            cursor += sizeof (SandboxParamMeta);

            const juce::String label = (labels != nullptr && i < labels->size()) ? (*labels)[i]
                                                                                  : juce::String();
            const uint32_t labelLen = (uint32_t) label.getNumBytesAsUTF8();
            std::memcpy (cursor, &labelLen, sizeof (labelLen));
            cursor += sizeof (labelLen);
            if (labelLen > 0)
            {
                std::memcpy (cursor, label.toRawUTF8(), labelLen);
                cursor += labelLen;
            }
        }
    }

    return payload;
}

/** Parse a PluginInfoPayload + names (+ optional v2 meta table). Returns false
    on any out-of-bounds read, on a numParameters > EL_SANDBOX_MAX_PARAMETERS,
    or on a paramNamesLength/paramMetaLength that doesn't match the actual
    trailing buffer size. A v1 payload (paramMetaLength == 0) parses fine and
    leaves `metas`/`labels` empty. */
inline bool parsePluginInfoMessage (const void* payload, uint32_t payloadSize,
                                     PluginInfoPayload& out, juce::StringArray& names,
                                     juce::Array<SandboxParamMeta>* metas = nullptr,
                                     juce::StringArray* labels = nullptr)
{
    names.clear();
    if (metas != nullptr)
        metas->clearQuick();
    if (labels != nullptr)
        labels->clear();

    if (payload == nullptr || payloadSize < sizeof (PluginInfoPayload))
        return false;

    std::memcpy (&out, payload, sizeof (PluginInfoPayload));

    if (out.numParameters > EL_SANDBOX_MAX_PARAMETERS)
        return false;

    // Guard the additions against overflow before the bounds check.
    const uint64_t total = (uint64_t) sizeof (PluginInfoPayload)
                         + (uint64_t) out.paramNamesLength
                         + (uint64_t) out.paramMetaLength;
    if ((uint64_t) payloadSize < total)
        return false;

    const auto* cursor = static_cast<const uint8_t*> (payload) + sizeof (PluginInfoPayload);
    const auto* end = cursor + out.paramNamesLength;

    for (uint32_t i = 0; i < out.numParameters; ++i)
    {
        if (cursor + sizeof (uint32_t) > end)
            return false;

        uint32_t len = 0;
        std::memcpy (&len, cursor, sizeof (uint32_t));
        cursor += sizeof (uint32_t);

        if (cursor + len > end)
            return false;

        names.add (juce::String::fromUTF8 (reinterpret_cast<const char*> (cursor), (int) len));
        cursor += len;
    }

    // Strict: any leftover bytes in the names region are an encoding error.
    if (cursor != end)
        return false;

    // v2 meta table (optional). Validate the full region even when the caller
    // didn't ask for metas — a malformed table is a protocol error either way.
    if (out.paramMetaLength > 0)
    {
        const auto* metaEnd = cursor + out.paramMetaLength;
        for (uint32_t i = 0; i < out.numParameters; ++i)
        {
            if (cursor + sizeof (SandboxParamMeta) + sizeof (uint32_t) > metaEnd)
                return false;

            SandboxParamMeta meta;
            std::memcpy (&meta, cursor, sizeof (SandboxParamMeta));
            cursor += sizeof (SandboxParamMeta);

            uint32_t labelLen = 0;
            std::memcpy (&labelLen, cursor, sizeof (uint32_t));
            cursor += sizeof (uint32_t);

            if (cursor + labelLen > metaEnd)
                return false;

            if (metas != nullptr)
                metas->add (meta);
            if (labels != nullptr)
                labels->add (juce::String::fromUTF8 (reinterpret_cast<const char*> (cursor), (int) labelLen));
            cursor += labelLen;
        }

        if (cursor != metaEnd)
            return false;
    }

    return true;
}

//==============================================================================
/**
 * Lock-free shared audio buffer for real-time audio IPC.
 * Uses double-buffering with atomic state to ensure glitch-free operation.
 *
 * Memory layout:
 *   [Header][Buffer A][Buffer B]
 *
 * The coordinator writes to the inactive buffer and atomically swaps.
 * The worker reads from the active buffer.
 */
class SharedAudioBuffer
{
public:
    /** Buffer state for lock-free swapping. */
    enum class BufferState : uint32_t
    {
        Idle = 0,
        WritingA,
        ReadingA,
        WritingB,
        ReadingB
    };

    /** Header stored at the start of shared memory. */
    struct Header
    {
        /** Written last by the owner (host) after all other fields are zeroed.
            The attacher (worker) spins on this value before touching any other field.
            Value = 'ELSB' in little-endian: 0x454C5342. */
        static constexpr uint32_t kMagic = 0x454C5342u;

        /** First field: zero until the owner finishes placement-new + writes kMagic.
            The attacher reads this with acquire ordering to detect completed init. */
        uint32_t magic { 0 };

        uint32_t state { static_cast<uint32_t> (BufferState::Idle) };
        uint32_t activeBuffer { 0 };  // 0 = A, 1 = B
        uint32_t numSamples { 0 };
        uint32_t numInputChannels { 0 };
        uint32_t numOutputChannels { 0 };
        uint32_t coordinatorSequence { 0 };
        uint32_t workerSequence { 0 };
        double sampleRate { 0.0 };

        // Xrun tracking
        uint32_t xrunCount { 0 };
        uint32_t consecutiveXruns { 0 };

        // MIDI buffer sizes
        uint32_t midiInputSize { 0 };
        uint32_t midiOutputSize { 0 };
    };

    SharedAudioBuffer() = default;
    ~SharedAudioBuffer() = default;

    /** Calculate the total bytes required for a given channel/sample configuration. */
    static size_t calculateRequiredSize (int numChannels, int numSamples)
    {
        const size_t bufferBytes = static_cast<size_t> (numChannels) *
                                   static_cast<size_t> (numSamples) * sizeof (float);
        const size_t midiBytes = 4096;
        return sizeof (Header) +
               (bufferBytes * 4) +  // 2 input + 2 output double-buffered
               (midiBytes * 2);     // input + output MIDI
    }

    /** Allocate local buffers (for non-shared-memory mode / in-process fallback). */
    void allocate (int numChannels, int numSamples)
    {
        usingExternalMemory = false;
        const size_t totalSize = calculateRequiredSize (numChannels, numSamples);
        memory.allocate (totalSize, true);
        setupPointersAsOwner (static_cast<uint8_t*> (memory.getData()), numChannels, numSamples);
    }

    /** Host (owner) path: attach to shared memory and placement-new the Header,
        then write kMagic last with release ordering so the attacher can detect
        completed initialisation.  Call this exactly once per prepareToPlay on
        the host side. */
    void attachToMemoryAsOwner (uint8_t* externalData, size_t externalSize,
                                int numChannels, int numSamples)
    {
        const size_t required = calculateRequiredSize (numChannels, numSamples);
        jassert (externalData != nullptr);
        jassert (externalSize >= required);
        juce::ignoreUnused (required);

        usingExternalMemory = true;
        memory.free();
        setupPointersAsOwner (externalData, numChannels, numSamples);
    }

    /** Worker (attacher) path: attach to existing shared memory without
        placement-new.  Spins on the header magic written by the owner until
        timeout.  Returns true if magic was observed; returns false on timeout,
        meaning the shared memory was never fully initialised by the host. */
    bool attachToMemoryAsAttacher (uint8_t* externalData, size_t externalSize,
                                   int numChannels, int numSamples,
                                   std::chrono::milliseconds timeout = std::chrono::milliseconds { 100 })
    {
        const size_t required = calculateRequiredSize (numChannels, numSamples);
        jassert (externalData != nullptr);
        jassert (externalSize >= required);
        juce::ignoreUnused (required);

        usingExternalMemory = true;
        memory.free();
        return setupPointersAsAttacher (externalData, numChannels, numSamples, timeout);
    }

    /** Get the header for reading/writing state. */
    Header* getHeader() { return header; }
    const Header* getHeader() const { return header; }

    /** Typed accessor for Header::state (cross-process atomic via __atomic_load_n).
        Use this rather than touching state directly so that any future
        BufferState-backing-type change has a single migration point. */
    static BufferState loadBufferState (const Header& h, int memoryOrder = __ATOMIC_ACQUIRE) noexcept
    {
        return static_cast<BufferState> (__atomic_load_n (&h.state, memoryOrder));
    }
    static void storeBufferState (Header& h, BufferState s, int memoryOrder = __ATOMIC_RELEASE) noexcept
    {
        __atomic_store_n (&h.state, static_cast<uint32_t> (s), memoryOrder);
    }

    /** Get pointers to audio buffers. */
    float* getInputBuffer (int channel, int bufferIndex)
    {
        jassert (channel < maxChannels && bufferIndex < 2);
        return inputBuffers[bufferIndex] + (channel * maxSamples);
    }

    float* getOutputBuffer (int channel, int bufferIndex)
    {
        jassert (channel < maxChannels && bufferIndex < 2);
        return outputBuffers[bufferIndex] + (channel * maxSamples);
    }

    /** Get MIDI buffer pointers. */
    uint8_t* getMidiInputBuffer() { return midiInputBuffer; }
    uint8_t* getMidiOutputBuffer() { return midiOutputBuffer; }
    size_t getMidiBufferSize() const { return midiBufferSize; }

    /** Copy audio data to the inactive write buffer (coordinator side). */
    void writeInputAudio (const juce::AudioSampleBuffer& source, int numSamples)
    {
        if (header == nullptr)
            return;

        numSamples = std::min (numSamples, maxSamples);
        const uint32_t writeBuffer = 1 - __atomic_load_n (&header->activeBuffer, __ATOMIC_ACQUIRE);
        const int numChannels = std::min (source.getNumChannels(), maxChannels);

        for (int ch = 0; ch < numChannels; ++ch)
        {
            float* dest = getInputBuffer (ch, writeBuffer);
            std::memcpy (dest, source.getReadPointer (ch),
                        static_cast<size_t> (numSamples) * sizeof (float));
        }

        __atomic_store_n (&header->numSamples, static_cast<uint32_t> (numSamples), __ATOMIC_RELEASE);
        __atomic_store_n (&header->numInputChannels, static_cast<uint32_t> (numChannels), __ATOMIC_RELEASE);
    }

    /** Read processed audio from the active buffer (coordinator side). */
    void readOutputAudio (juce::AudioSampleBuffer& dest, int numSamples)
    {
        if (header == nullptr)
            return;

        numSamples = std::min (numSamples, maxSamples);
        const uint32_t readBuffer = __atomic_load_n (&header->activeBuffer, __ATOMIC_ACQUIRE);
        const int numChannels = std::min (dest.getNumChannels(), maxChannels);

        for (int ch = 0; ch < numChannels; ++ch)
        {
            const float* src = getOutputBuffer (ch, readBuffer);
            std::memcpy (dest.getWritePointer (ch), src,
                        static_cast<size_t> (numSamples) * sizeof (float));
        }
    }

    /** Swap the active buffer (call after write is complete). */
    void swapBuffers()
    {
        if (header == nullptr)
            return;

        __atomic_fetch_xor (&header->activeBuffer, 1u, __ATOMIC_ACQ_REL);
        __atomic_fetch_add (&header->coordinatorSequence, 1u, __ATOMIC_RELEASE);
    }

    /** Check if new data is available (worker side). */
    bool hasNewData() const
    {
        if (header == nullptr)
            return false;

        return __atomic_load_n (&header->coordinatorSequence, __ATOMIC_ACQUIRE) != lastProcessedSequence;
    }

    /** Mark data as processed (worker side).

        Updates the worker-local `lastProcessedSequence` so `hasNewData()` will
        return false until the host writes new input. Does NOT touch
        `header->workerSequence` — that is the dedicated "I've finished this
        block" signal owned exclusively by `signalWorkerDone()`. The host's
        `isWorkerDone(expectedSeq)` check assumes one worker-sequence increment
        per host-trigger; double-incrementing here used to cause the host to
        report `workerDone == true` a full cycle early and read stale output. */
    void markProcessed()
    {
        if (header == nullptr)
            return;

        lastProcessedSequence = __atomic_load_n (&header->coordinatorSequence, __ATOMIC_ACQUIRE);
    }

    //==========================================================================
    // Lock-free sequence helpers

    /** Increment coordinator sequence with release ordering (host side). */
    void signalHostReady()
    {
        if (header != nullptr)
            __atomic_fetch_add (&header->coordinatorSequence, 1u, __ATOMIC_RELEASE);
    }

    /** Increment worker sequence with release ordering (worker side). */
    void signalWorkerDone()
    {
        if (header != nullptr)
            __atomic_fetch_add (&header->workerSequence, 1u, __ATOMIC_RELEASE);
    }

    /** Check if the worker has completed processing for the expected sequence. */
    bool isWorkerDone (uint32_t expectedSeq) const
    {
        if (header == nullptr)
            return false;
        return __atomic_load_n (&header->workerSequence, __ATOMIC_ACQUIRE) >= expectedSeq;
    }

    /** Record an xrun by incrementing both total and consecutive counters. */
    void recordXrun()
    {
        if (header == nullptr)
            return;
        __atomic_fetch_add (&header->xrunCount, 1u, __ATOMIC_RELAXED);
        __atomic_fetch_add (&header->consecutiveXruns, 1u, __ATOMIC_RELAXED);
    }

    /** Reset the consecutive xrun counter to zero. */
    void clearConsecutiveXruns()
    {
        if (header != nullptr)
            __atomic_store_n (&header->consecutiveXruns, 0u, __ATOMIC_RELAXED);
    }

    /** Get the current consecutive xrun count. */
    uint32_t getConsecutiveXruns() const
    {
        if (header == nullptr)
            return 0;
        return __atomic_load_n (&header->consecutiveXruns, __ATOMIC_RELAXED);
    }

    /** Get the current host (coordinator) sequence number. */
    uint32_t getHostSequence() const
    {
        if (header == nullptr)
            return 0;
        return __atomic_load_n (&header->coordinatorSequence, __ATOMIC_ACQUIRE);
    }

    /** Get the worker's completed-block sequence number (RT-safe acquire read).
        The host derives its per-block expectation from THIS value (+1) rather
        than a private mirror counter — a private counter diverges permanently
        when the worker misses triggers (e.g. it is still attaching a new shm
        generation while the host already renders against it) and the >= done
        check then never passes again (the 2026-06-10 session-load xrun storm). */
    uint32_t getWorkerSequence() const
    {
        if (header == nullptr)
            return 0;
        return __atomic_load_n (&header->workerSequence, __ATOMIC_ACQUIRE);
    }

private:
    void setupPointersCommon (uint8_t* base, int numChannels, int numSamples)
    {
        maxChannels = numChannels;
        maxSamples = numSamples;

        uint8_t* ptr = base;

        header = reinterpret_cast<Header*> (ptr);
        ptr += sizeof (Header);

        const size_t channelBytes = static_cast<size_t> (numChannels) *
                                    static_cast<size_t> (numSamples) * sizeof (float);

        inputBuffers[0] = reinterpret_cast<float*> (ptr);
        ptr += channelBytes;
        inputBuffers[1] = reinterpret_cast<float*> (ptr);
        ptr += channelBytes;

        outputBuffers[0] = reinterpret_cast<float*> (ptr);
        ptr += channelBytes;
        outputBuffers[1] = reinterpret_cast<float*> (ptr);
        ptr += channelBytes;

        midiBufferSize = 4096;
        midiInputBuffer = ptr;
        ptr += midiBufferSize;
        midiOutputBuffer = ptr;
    }

    void setupPointersAsOwner (uint8_t* base, int numChannels, int numSamples)
    {
        setupPointersCommon (base, numChannels, numSamples);
        new (header) Header();
        __atomic_store_n (&header->magic, Header::kMagic, __ATOMIC_RELEASE);
    }

    bool setupPointersAsAttacher (uint8_t* base, int numChannels, int numSamples,
                                  std::chrono::milliseconds timeout)
    {
        setupPointersCommon (base, numChannels, numSamples);
        const auto deadline = std::chrono::steady_clock::now() + timeout;
        while (__atomic_load_n (&header->magic, __ATOMIC_ACQUIRE) != Header::kMagic)
        {
            if (std::chrono::steady_clock::now() >= deadline)
                return false;
            std::this_thread::sleep_for (std::chrono::microseconds (50));
        }
        return true;
    }

    juce::HeapBlock<uint8_t> memory;
    bool usingExternalMemory { false };
    Header* header { nullptr };
    float* inputBuffers[2] { nullptr, nullptr };
    float* outputBuffers[2] { nullptr, nullptr };
    uint8_t* midiInputBuffer { nullptr };
    uint8_t* midiOutputBuffer { nullptr };
    size_t midiBufferSize { 0 };
    int maxChannels { 0 };
    int maxSamples { 0 };
    uint32_t lastProcessedSequence { 0 };

    // === D-1 layout / lock-free guards ===
    //
    // These asserts lock in the cross-process layout. If a future change reorders
    // fields or adds padding, the assert fires at compile time — preventing the
    // silent corruption mode where host writes at offset N and worker reads from
    // offset N+padding.
    static_assert (__atomic_always_lock_free (sizeof (uint32_t), 0),
                   "Phase D requires lock-free uint32_t atomics on this platform.");
    static_assert (std::is_trivially_copyable_v<Header>,
                   "Header must be trivially copyable for cross-process layout stability "
                   "(every field plain or layout-equivalent to plain).");
    static_assert (sizeof (uint32_t) == 4, "uint32_t must be exactly 4 bytes.");
    static_assert (alignof (uint32_t) == 4, "uint32_t must be 4-byte aligned.");
    static_assert (alignof (double) == 8, "double must be 8-byte aligned (sampleRate).");
    // Field offsets — must match what the worker process expects byte-for-byte.
    static_assert (offsetof (Header, magic) == 0);
    static_assert (offsetof (Header, state) == 4);
    static_assert (offsetof (Header, activeBuffer) == 8);
    static_assert (offsetof (Header, numSamples) == 12);
    static_assert (offsetof (Header, numInputChannels) == 16);
    static_assert (offsetof (Header, numOutputChannels) == 20);
    static_assert (offsetof (Header, coordinatorSequence) == 24);
    static_assert (offsetof (Header, workerSequence) == 28);
    // sampleRate (double) at offset 32 — natural 8-byte alignment, no padding needed
    // since prior 8 × uint32_t = 32 bytes brings us to 8-byte boundary.
    static_assert (offsetof (Header, sampleRate) == 32);
    static_assert (offsetof (Header, xrunCount) == 40);
    static_assert (offsetof (Header, consecutiveXruns) == 44);
    static_assert (offsetof (Header, midiInputSize) == 48);
    static_assert (offsetof (Header, midiOutputSize) == 52);
    static_assert (sizeof (Header) == 56,
                   "Header layout changed — coordinate with worker rebuild and update "
                   "the offsetof asserts above.");
};

//==============================================================================
/** Serialize MIDI messages to a byte buffer for IPC. */
inline uint32_t serializeMidiBuffer (const juce::MidiBuffer& source,
                                      uint8_t* dest,
                                      size_t destSize)
{
    uint32_t written = 0;

    for (const auto metadata : source)
    {
        // Each message: [timestamp:4][size:2][data:N]
        const size_t msgSize = sizeof (int32_t) + sizeof (uint16_t) +
                               static_cast<size_t> (metadata.numBytes);

        if (written + msgSize > destSize)
            break;

        // Write timestamp
        int32_t timestamp = metadata.samplePosition;
        std::memcpy (dest + written, &timestamp, sizeof (timestamp));
        written += sizeof (timestamp);

        // Write size
        uint16_t size = static_cast<uint16_t> (metadata.numBytes);
        std::memcpy (dest + written, &size, sizeof (size));
        written += sizeof (size);

        // Write data
        std::memcpy (dest + written, metadata.data, static_cast<size_t> (metadata.numBytes));
        written += static_cast<uint32_t> (metadata.numBytes);
    }

    return written;
}

/** Deserialize MIDI messages from a byte buffer. */
inline void deserializeMidiBuffer (const uint8_t* source,
                                    uint32_t sourceSize,
                                    juce::MidiBuffer& dest)
{
    dest.clear();
    uint32_t read = 0;

    while (read + sizeof (int32_t) + sizeof (uint16_t) <= sourceSize)
    {
        // Read timestamp
        int32_t timestamp;
        std::memcpy (&timestamp, source + read, sizeof (timestamp));
        read += sizeof (timestamp);

        // Read size
        uint16_t size;
        std::memcpy (&size, source + read, sizeof (size));
        read += sizeof (size);

        // Check bounds
        if (read + size > sourceSize)
            break;

        // Add message
        dest.addEvent (source + read, static_cast<int> (size), timestamp);
        read += size;
    }
}

//==============================================================================
/** Simple crash detection via last-known-alive timestamp. */
class SandboxHeartbeat
{
public:
    SandboxHeartbeat() = default;

    /** Record a heartbeat (worker side). */
    void beat()
    {
        lastBeat.store (juce::Time::getMillisecondCounter());
    }

    /** Check if worker is alive (coordinator side). */
    bool isAlive (uint32_t timeoutMs = EL_SANDBOX_TIMEOUT_MS) const
    {
        const uint32_t now = juce::Time::getMillisecondCounter();
        const uint32_t last = lastBeat.load();

        if (last == 0)
            return true;  // Not yet started

        return (now - last) < timeoutMs;
    }

    /** Get milliseconds since last heartbeat. */
    uint32_t getTimeSinceLastBeat() const
    {
        const uint32_t now = juce::Time::getMillisecondCounter();
        const uint32_t last = lastBeat.load();

        if (last == 0)
            return 0;

        return now - last;
    }

    /** Reset the heartbeat state. */
    void reset()
    {
        lastBeat.store (0);
    }

private:
    std::atomic<uint32_t> lastBeat { 0 };
};

} // namespace element
