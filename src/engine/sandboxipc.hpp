// Copyright 2025 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce.hpp>
#include <element/atomic.hpp>

#include <atomic>
#include <cstring>

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
};

/** Latency change message payload. */
struct LatencyPayload
{
    int32_t latencySamples;
};

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
        std::atomic<BufferState> state { BufferState::Idle };
        std::atomic<uint32_t> activeBuffer { 0 };  // 0 = A, 1 = B
        std::atomic<uint32_t> numSamples { 0 };
        std::atomic<uint32_t> numInputChannels { 0 };
        std::atomic<uint32_t> numOutputChannels { 0 };
        std::atomic<uint32_t> coordinatorSequence { 0 };
        std::atomic<uint32_t> workerSequence { 0 };
        double sampleRate { 0.0 };

        // MIDI buffer sizes
        std::atomic<uint32_t> midiInputSize { 0 };
        std::atomic<uint32_t> midiOutputSize { 0 };
    };

    SharedAudioBuffer() = default;
    ~SharedAudioBuffer() = default;

    /** Allocate local buffers (for non-shared-memory mode). */
    void allocate (int numChannels, int numSamples)
    {
        const size_t bufferBytes = static_cast<size_t> (numChannels) *
                                   static_cast<size_t> (numSamples) * sizeof (float);
        const size_t midiBytes = 4096; // 4KB per MIDI buffer
        const size_t totalSize = sizeof (Header) +
                                 (bufferBytes * 4) +  // 2 input + 2 output double-buffered
                                 (midiBytes * 2);     // input + output MIDI

        memory.allocate (totalSize, true);
        setupPointers (numChannels, numSamples);
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

        const uint32_t writeBuffer = 1 - header->activeBuffer.load();
        const int numChannels = std::min (source.getNumChannels(), maxChannels);

        for (int ch = 0; ch < numChannels; ++ch)
        {
            float* dest = getInputBuffer (ch, writeBuffer);
            std::memcpy (dest, source.getReadPointer (ch),
                        static_cast<size_t> (numSamples) * sizeof (float));
        }

        header->numSamples.store (static_cast<uint32_t> (numSamples));
        header->numInputChannels.store (static_cast<uint32_t> (numChannels));
    }

    /** Read processed audio from the active buffer (coordinator side). */
    void readOutputAudio (juce::AudioSampleBuffer& dest, int numSamples)
    {
        if (header == nullptr)
            return;

        const uint32_t readBuffer = header->activeBuffer.load();
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

        header->activeBuffer.store (1 - header->activeBuffer.load());
        header->coordinatorSequence.fetch_add (1);
    }

    /** Check if new data is available (worker side). */
    bool hasNewData() const
    {
        if (header == nullptr)
            return false;

        return header->coordinatorSequence.load() != lastProcessedSequence;
    }

    /** Mark data as processed (worker side). */
    void markProcessed()
    {
        if (header == nullptr)
            return;

        lastProcessedSequence = header->coordinatorSequence.load();
        header->workerSequence.fetch_add (1);
    }

private:
    void setupPointers (int numChannels, int numSamples)
    {
        maxChannels = numChannels;
        maxSamples = numSamples;

        uint8_t* ptr = static_cast<uint8_t*> (memory.getData());

        header = reinterpret_cast<Header*> (ptr);
        new (header) Header();  // Placement new for atomic initialization
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

    juce::HeapBlock<uint8_t> memory;
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
