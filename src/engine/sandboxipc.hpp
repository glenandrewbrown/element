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

    // Worker -> Coordinator
    PluginLoaded,       // Plugin loaded successfully
    PluginLoadFailed,   // Plugin load failed (error message)
    PluginUnloaded,     // Plugin unloaded
    Prepared,           // PrepareToPlay completed
    ProcessComplete,    // Audio processing done (trigger shared memory read)
    ParameterChanged,   // Parameter value changed (automation)
    StateData,          // Plugin state response
    LatencyChanged,     // Plugin latency changed
    Heartbeat,          // Worker is alive
    Error,              // Error message
    PluginInfo,         // Plugin metadata (param count + names + I/O config) sent after PluginLoaded
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

/** Prepare to play message payload. */
struct PreparePayload
{
    double sampleRate;
    int32_t maxBlockSize;
    int32_t numInputChannels;
    int32_t numOutputChannels;

    /** Shared memory name length (0 = no shared memory, use local). */
    uint32_t shmNameLength { 0 };

    // Followed by shmNameLength bytes of UTF-8 shared memory name.
    // Use createPrepareMessage() / parsePrepareMessage() to serialize.
};

/** Serialize a PreparePayload with optional shared memory name. */
inline juce::MemoryBlock createPrepareMessage (double sampleRate, int32_t maxBlockSize,
                                                int32_t numInputChannels, int32_t numOutputChannels,
                                                const std::string& shmName = {})
{
    const uint32_t nameLen = static_cast<uint32_t> (shmName.size());
    const size_t totalPayload = sizeof (PreparePayload) + nameLen;

    juce::MemoryBlock payload (totalPayload, true);
    auto* prep = static_cast<PreparePayload*> (payload.getData());
    prep->sampleRate = sampleRate;
    prep->maxBlockSize = maxBlockSize;
    prep->numInputChannels = numInputChannels;
    prep->numOutputChannels = numOutputChannels;
    prep->shmNameLength = nameLen;

    if (nameLen > 0)
    {
        auto* namePtr = static_cast<uint8_t*> (payload.getData()) + sizeof (PreparePayload);
        std::memcpy (namePtr, shmName.data(), nameLen);
    }

    return payload;
}

/** Parse a PreparePayload and extract the optional shared memory name. */
inline bool parsePrepareMessage (const void* payload, uint32_t payloadSize,
                                  PreparePayload& prep, std::string& shmName)
{
    if (payloadSize < sizeof (PreparePayload))
        return false;

    std::memcpy (&prep, payload, sizeof (PreparePayload));

    shmName.clear();
    if (prep.shmNameLength > 0)
    {
        if (payloadSize < sizeof (PreparePayload) + prep.shmNameLength)
            return false;

        const auto* namePtr = static_cast<const char*> (payload) + sizeof (PreparePayload);
        shmName.assign (namePtr, prep.shmNameLength);
    }

    return true;
}

/** Latency change message payload. */
struct LatencyPayload
{
    int32_t latencySamples;
};

//==============================================================================
/** Plugin metadata payload — sent worker → host immediately after PluginLoaded.
    Followed in the wire payload by `numParameters` length-prefixed UTF-8 names:
    each name has a `uint32_t byteLength` followed by `byteLength` bytes.
    Use createPluginInfoMessage() / parsePluginInfoMessage() to (de)serialize. */
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
};

/** Serialize a PluginInfoPayload + parameter names into a transferable block.
    Names beyond EL_SANDBOX_MAX_PARAMETERS are silently dropped — the worker is
    expected to apply the same cap before calling this helper. */
inline juce::MemoryBlock createPluginInfoMessage (const PluginInfoPayload& info,
                                                   const juce::StringArray& names)
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

    PluginInfoPayload header = info;
    header.numParameters = (uint32_t) safeCount;
    header.paramNamesLength = namesBytes;

    juce::MemoryBlock payload (sizeof (PluginInfoPayload) + namesBytes, true);
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

    return payload;
}

/** Parse a PluginInfoPayload + names. Returns false on any out-of-bounds read,
    on a numParameters > EL_SANDBOX_MAX_PARAMETERS, or on a paramNamesLength
    that doesn't match the actual trailing buffer size. */
inline bool parsePluginInfoMessage (const void* payload, uint32_t payloadSize,
                                     PluginInfoPayload& out, juce::StringArray& names)
{
    names.clear();
    if (payload == nullptr || payloadSize < sizeof (PluginInfoPayload))
        return false;

    std::memcpy (&out, payload, sizeof (PluginInfoPayload));

    if (out.numParameters > EL_SANDBOX_MAX_PARAMETERS)
        return false;

    if (payloadSize < sizeof (PluginInfoPayload) + out.paramNamesLength)
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
    return cursor == end;
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

        std::atomic<BufferState> state { BufferState::Idle };
        std::atomic<uint32_t> activeBuffer { 0 };  // 0 = A, 1 = B
        std::atomic<uint32_t> numSamples { 0 };
        std::atomic<uint32_t> numInputChannels { 0 };
        std::atomic<uint32_t> numOutputChannels { 0 };
        std::atomic<uint32_t> coordinatorSequence { 0 };
        std::atomic<uint32_t> workerSequence { 0 };
        double sampleRate { 0.0 };

        // Xrun tracking
        std::atomic<uint32_t> xrunCount { 0 };
        std::atomic<uint32_t> consecutiveXruns { 0 };

        // MIDI buffer sizes
        std::atomic<uint32_t> midiInputSize { 0 };
        std::atomic<uint32_t> midiOutputSize { 0 };
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
        const uint32_t writeBuffer = 1 - header->activeBuffer.load (std::memory_order_acquire);
        const int numChannels = std::min (source.getNumChannels(), maxChannels);

        for (int ch = 0; ch < numChannels; ++ch)
        {
            float* dest = getInputBuffer (ch, writeBuffer);
            std::memcpy (dest, source.getReadPointer (ch),
                        static_cast<size_t> (numSamples) * sizeof (float));
        }

        header->numSamples.store (static_cast<uint32_t> (numSamples), std::memory_order_release);
        header->numInputChannels.store (static_cast<uint32_t> (numChannels), std::memory_order_release);
    }

    /** Read processed audio from the active buffer (coordinator side). */
    void readOutputAudio (juce::AudioSampleBuffer& dest, int numSamples)
    {
        if (header == nullptr)
            return;

        numSamples = std::min (numSamples, maxSamples);
        const uint32_t readBuffer = header->activeBuffer.load (std::memory_order_acquire);
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

        header->activeBuffer.fetch_xor (1, std::memory_order_acq_rel);
        header->coordinatorSequence.fetch_add (1, std::memory_order_release);
    }

    /** Check if new data is available (worker side). */
    bool hasNewData() const
    {
        if (header == nullptr)
            return false;

        return header->coordinatorSequence.load (std::memory_order_acquire) != lastProcessedSequence;
    }

    /** Mark data as processed (worker side). */
    void markProcessed()
    {
        if (header == nullptr)
            return;

        lastProcessedSequence = header->coordinatorSequence.load (std::memory_order_acquire);
        header->workerSequence.fetch_add (1, std::memory_order_release);
    }

    //==========================================================================
    // Lock-free sequence helpers

    /** Increment coordinator sequence with release ordering (host side). */
    void signalHostReady()
    {
        if (header != nullptr)
            header->coordinatorSequence.fetch_add (1, std::memory_order_release);
    }

    /** Increment worker sequence with release ordering (worker side). */
    void signalWorkerDone()
    {
        if (header != nullptr)
            header->workerSequence.fetch_add (1, std::memory_order_release);
    }

    /** Check if the worker has completed processing for the expected sequence. */
    bool isWorkerDone (uint32_t expectedSeq) const
    {
        if (header == nullptr)
            return false;
        return header->workerSequence.load (std::memory_order_acquire) >= expectedSeq;
    }

    /** Record an xrun by incrementing both total and consecutive counters. */
    void recordXrun()
    {
        if (header == nullptr)
            return;
        header->xrunCount.fetch_add (1, std::memory_order_relaxed);
        header->consecutiveXruns.fetch_add (1, std::memory_order_relaxed);
    }

    /** Reset the consecutive xrun counter to zero. */
    void clearConsecutiveXruns()
    {
        if (header != nullptr)
            header->consecutiveXruns.store (0, std::memory_order_relaxed);
    }

    /** Get the current consecutive xrun count. */
    uint32_t getConsecutiveXruns() const
    {
        if (header == nullptr)
            return 0;
        return header->consecutiveXruns.load (std::memory_order_relaxed);
    }

    /** Get the current host (coordinator) sequence number. */
    uint32_t getHostSequence() const
    {
        if (header == nullptr)
            return 0;
        return header->coordinatorSequence.load (std::memory_order_acquire);
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
