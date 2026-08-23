// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Phase D D-8 deterministic test plugin.
//
// This header defines a minimal `juce::AudioPluginFormat` subclass and
// `juce::AudioPluginInstance` subclass that the sandbox worker registers
// when built with `EL_SANDBOX_INCLUDE_TEST_FORMATS=1` (set on `test_element`
// only — production `element_app` does NOT see this header registered).
//
// Purpose: provide a deterministic, file-less plugin the host-side test
// harness can `loadPlugin` over real cross-process IPC, eliminating the
// dependency on disk-scanned VST3/AU plugins for end-to-end sandbox tests.
//
// Why zero parameters: JUCE 8 `AudioPluginInstance` privatises
// `AudioProcessor::addParameter` (`juce_AudioPluginInstance.h:175`), so
// custom plugin instances cannot expose parameters without the full
// `HostedParameter` machinery. D-8's contract is to prove cross-process
// LOAD + processBlock works, not parameter forwarding (D-7 already covers
// the in-process serialisation). Output is a hardcoded DC of
// `kTestEchoConstant` written into every output sample of every channel,
// so the host test asserts `buffer.getSample(0, 0) == kTestEchoConstant`.
//
// Why a sentinel `fileOrIdentifier`: JUCE 8
// `AudioPluginFormatManager::findFormatForDescription`
// (`juce_AudioPluginFormatManager.cpp:144-147`) requires BOTH
// `format->getName() == desc.pluginFormatName` AND
// `format->fileMightContainThisPluginType(desc.fileOrIdentifier) == true`.
// The previous Phase D D-8 attempt failed because its format returned
// `false` for `fileMightContainThisPluginType` (treated as a virtual,
// file-less plugin). This implementation matches on a sentinel string
// (`kTestEchoIdentifier`) so dispatch succeeds on the second predicate.

#pragma once

#include <element/juce.hpp>

namespace element {

//==============================================================================
/** Sentinel string the host-side test sets on `desc.fileOrIdentifier` and the
    format matches against in `fileMightContainThisPluginType`. Must match
    exactly across the host → worker XML serialisation boundary. */
inline constexpr const char* kTestEchoIdentifier = "ElementTestEcho";

/** Sentinel format-name string. Set on `desc.pluginFormatName` host-side and
    returned by `TestEchoPluginFormat::getName()`. JUCE matches by
    `String::operator==` (case-sensitive, no normalisation). */
inline constexpr const char* kTestEchoFormatName = "Test";

/** Hardcoded DC value the test plugin writes into every output sample. The
    host test reads sample[0][0] after `processBlock` and asserts equality
    via `BOOST_CHECK_CLOSE` with a tight tolerance. */
inline constexpr float kTestEchoConstant = 0.5f;

/** Unique-id for the test plugin. "E1E7" reads as "Element Test" in hex. */
inline constexpr int kTestEchoUniqueId = 0xE1E70000;

//==============================================================================
/** Minimal AudioPluginInstance with zero parameters that emits a DC of
    `kTestEchoConstant` on all output channels. Not registered in production
    builds. */
class TestEchoPluginInstance : public juce::AudioPluginInstance
{
public:
    TestEchoPluginInstance (double initialSampleRate, int initialBlockSize)
    {
        // 0 inputs, 2 outputs — matches what the D-8 host harness configures
        // via SandboxHost::prepareToPlay (sampleRate=48000, blockSize=256,
        // inputChannels=0, outputChannels=2).
        setRateAndBufferSizeDetails (initialSampleRate, initialBlockSize);
        setPlayConfigDetails (0, 2, initialSampleRate, initialBlockSize);
    }

    ~TestEchoPluginInstance() override = default;

    //==========================================================================
    // AudioProcessor — pure virtuals
    const juce::String getName() const override { return kTestEchoIdentifier; }

    void prepareToPlay (double sampleRate, int samplesPerBlock) override
    {
        setRateAndBufferSizeDetails (sampleRate, samplesPerBlock);
    }

    void releaseResources() override {}

    void processBlock (juce::AudioBuffer<float>& buffer,
                       juce::MidiBuffer& /*midi*/) override
    {
        for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
        {
            auto* data = buffer.getWritePointer (ch);
            for (int s = 0; s < buffer.getNumSamples(); ++s)
                data[s] = kTestEchoConstant;
        }
    }

    juce::AudioProcessorEditor* createEditor() override { return nullptr; }
    bool hasEditor() const override { return false; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram (int /*index*/) override {}
    const juce::String getProgramName (int /*index*/) override { return {}; }
    void changeProgramName (int /*index*/, const juce::String& /*name*/) override {}

    void getStateInformation (juce::MemoryBlock& /*dest*/) override {}
    void setStateInformation (const void* /*data*/, int /*sizeInBytes*/) override {}

    //==========================================================================
    // AudioPluginInstance — pure virtual
    void fillInPluginDescription (juce::PluginDescription& desc) const override
    {
        desc.name              = kTestEchoIdentifier;
        desc.descriptiveName   = "Element Test Echo";
        desc.pluginFormatName  = kTestEchoFormatName;
        desc.fileOrIdentifier  = kTestEchoIdentifier;
        desc.category          = "Effect";
        desc.manufacturerName  = "Element";
        desc.version           = "1.0";
        desc.uniqueId          = kTestEchoUniqueId;
        desc.deprecatedUid     = kTestEchoUniqueId;
        desc.numInputChannels  = 0;
        desc.numOutputChannels = 2;
        desc.isInstrument      = false;
    }

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TestEchoPluginInstance)
};

//==============================================================================
/** Minimal AudioPluginFormat that owns a single TestEchoPluginInstance type.
    Registered in `SandboxWorker::initializeWorker()` only when
    `EL_SANDBOX_INCLUDE_TEST_FORMATS` is defined (i.e. only inside
    `test_element`, never in `element_app`). */
class TestEchoPluginFormat : public juce::AudioPluginFormat
{
public:
    TestEchoPluginFormat() = default;
    ~TestEchoPluginFormat() override = default;

    //==========================================================================
    // The two predicates JUCE 8 AudioPluginFormatManager::findFormatForDescription
    // calls in conjunction (juce_AudioPluginFormatManager.cpp:144-147). BOTH must
    // succeed for our format to be selected.
    juce::String getName() const override { return kTestEchoFormatName; }

    bool fileMightContainThisPluginType (const juce::String& fileOrIdentifier) override
    {
        return fileOrIdentifier == kTestEchoIdentifier;
    }

    //==========================================================================
    // Format scanning surface — minimal stubs. The D-8 test never calls
    // findAllTypesForFile via the public scanner path; it constructs the
    // PluginDescription directly. We still implement it correctly so the
    // standard JUCE scanner machinery works if anything else exercises it.
    void findAllTypesForFile (juce::OwnedArray<juce::PluginDescription>& results,
                               const juce::String& fileOrIdentifier) override
    {
        if (fileOrIdentifier != kTestEchoIdentifier)
            return;

        auto desc = std::make_unique<juce::PluginDescription>();
        desc->name              = kTestEchoIdentifier;
        desc->descriptiveName   = "Element Test Echo";
        desc->pluginFormatName  = kTestEchoFormatName;
        desc->fileOrIdentifier  = kTestEchoIdentifier;
        desc->category          = "Effect";
        desc->manufacturerName  = "Element";
        desc->version           = "1.0";
        desc->uniqueId          = kTestEchoUniqueId;
        desc->deprecatedUid     = kTestEchoUniqueId;
        desc->numInputChannels  = 0;
        desc->numOutputChannels = 2;
        desc->isInstrument      = false;
        results.add (desc.release());
    }

    juce::String getNameOfPluginFromIdentifier (const juce::String& fileOrIdentifier) override
    {
        return fileOrIdentifier == kTestEchoIdentifier ? juce::String (kTestEchoIdentifier)
                                                       : juce::String();
    }

    bool pluginNeedsRescanning (const juce::PluginDescription&) override { return false; }
    bool doesPluginStillExist (const juce::PluginDescription&) override { return true; }
    bool canScanForPlugins() const override { return false; }
    bool isTrivialToScan() const override { return true; }

    juce::StringArray searchPathsForPlugins (const juce::FileSearchPath& /*paths*/,
                                              bool /*recursive*/,
                                              bool /*allowAsync*/) override
    {
        return {};
    }

    juce::FileSearchPath getDefaultLocationsToSearch() override { return {}; }

    /** Returning false here is what allows the host's synchronous
        `createInstanceFromDescription` path to call `createPluginInstance`
        directly on the message thread (juce_AudioPluginFormat.cpp:54-58). */
    bool requiresUnblockedMessageThreadDuringCreation (const juce::PluginDescription&) const override
    {
        return false;
    }

protected:
    //==========================================================================
    /** The actual instance factory. JUCE calls this synchronously from
        `createInstanceFromDescription` after `findFormatForDescription`
        selects this format. */
    void createPluginInstance (const juce::PluginDescription& desc,
                                double initialSampleRate,
                                int initialBufferSize,
                                PluginCreationCallback callback) override
    {
        if (desc.fileOrIdentifier != kTestEchoIdentifier)
        {
            callback (nullptr,
                      "TestEchoPluginFormat: identifier '"
                          + desc.fileOrIdentifier + "' is not '"
                          + kTestEchoIdentifier + "'");
            return;
        }

        auto instance = std::make_unique<TestEchoPluginInstance> (
            initialSampleRate, initialBufferSize);
        callback (std::move (instance), juce::String());
    }

private:
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TestEchoPluginFormat)
};

} // namespace element
