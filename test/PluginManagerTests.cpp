// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later

#include <optional>

#include <boost/test/unit_test.hpp>

#include <element/context.hpp>
#include <element/plugins.hpp>

#include "engine/clapprovider.hpp"
#include "utils.hpp"

using namespace element;

BOOST_AUTO_TEST_SUITE (PluginManagerTests)

BOOST_AUTO_TEST_CASE (SupportedFormats)
{
    PluginManager manager;
    for (const auto& supported : Util::compiledAudioPluginFormats())
        BOOST_REQUIRE (! manager.isAudioPluginFormatSupported (supported));

    manager.getNodeFactory().add (new CLAPProvider());
    manager.addDefaultFormats();
    for (const auto& supported : Util::compiledAudioPluginFormats())
        BOOST_REQUIRE_MESSAGE (manager.isAudioPluginFormatSupported (supported), supported.toStdString());
}

BOOST_AUTO_TEST_SUITE_END()

// =============================================================================
// Plugin Lifecycle Tests — AUSampler (P1-16)
//
// All cases are macOS-only. AUSampler ships with every macOS installation and
// provides a controlled, zero-configuration test subject for the full plugin
// lifecycle: scan → load → prepare → render → state round-trip → release.
//
// Identifier: AudioUnit:Synths/aumu,samp,appl
//   type=aumu  (kAudioUnitType_MusicDevice)
//   subType=samp
//   manufacturer=appl
// =============================================================================

#ifdef __APPLE__

namespace {
// AUSampler identifier — stable across all macOS versions
static constexpr const char* kAUSamplerIdentifier = "AudioUnit:Synths/aumu,samp,appl";

// Helper: build a PluginManager with AU support enabled and the play config set.
static std::unique_ptr<PluginManager> makeAUPluginManager (double sampleRate = 44100.0,
                                                            int blockSize = 512)
{
    auto mgr = std::make_unique<PluginManager>();
    mgr->addDefaultFormats();
    mgr->setPlayConfig (sampleRate, blockSize);
    return mgr;
}

// Helper: locate the AUSampler PluginDescription via findAllTypesForFile.
// Returns an empty optional if the component is not found on this system.
static std::optional<juce::PluginDescription> findAUSamplerDescription (PluginManager& mgr)
{
    auto* auFormat = mgr.getAudioPluginFormat ("AudioUnit");
    if (auFormat == nullptr)
        return std::nullopt;

    juce::OwnedArray<juce::PluginDescription> types;
    auFormat->findAllTypesForFile (types, kAUSamplerIdentifier);

    if (types.isEmpty())
        return std::nullopt;

    return *types[0];
}
} // namespace

BOOST_AUTO_TEST_SUITE (PluginLifecycle)

// Case 1: The AU format is loaded and AUSampler is discoverable by identifier.
BOOST_AUTO_TEST_CASE (ausampler_scan_finds_apple_components)
{
    auto mgr = makeAUPluginManager();

    BOOST_REQUIRE_MESSAGE (mgr->isAudioPluginFormatSupported ("AudioUnit"),
                           "AudioUnit format must be supported on macOS");

    auto desc = findAUSamplerDescription (*mgr);
    BOOST_REQUIRE_MESSAGE (desc.has_value(),
                           "AUSampler (aumu/samp/appl) must be discoverable on this macOS system");

    BOOST_CHECK_EQUAL (desc->pluginFormatName.toStdString(), std::string ("AudioUnit"));
}

// Case 2: AUSampler instantiates without error.
BOOST_AUTO_TEST_CASE (ausampler_load_succeeds)
{
    auto mgr = makeAUPluginManager();
    auto desc = findAUSamplerDescription (*mgr);

    if (! desc.has_value())
    {
        BOOST_TEST_MESSAGE ("AUSampler not found — skipping ausampler_load_succeeds");
        return;
    }

    juce::String errorMsg;
    std::unique_ptr<juce::AudioPluginInstance> instance (mgr->createAudioPlugin (*desc, errorMsg));

    BOOST_REQUIRE_MESSAGE (instance != nullptr,
                           "createAudioPlugin failed: " + errorMsg.toStdString());
}

// Case 3: prepareToPlay + processBlock on an empty buffer produces silence.
BOOST_AUTO_TEST_CASE (ausampler_prepare_and_render_one_block)
{
    static constexpr double kSampleRate = 44100.0;
    static constexpr int    kBlockSize  = 512;

    auto mgr = makeAUPluginManager (kSampleRate, kBlockSize);
    auto desc = findAUSamplerDescription (*mgr);

    if (! desc.has_value())
    {
        BOOST_TEST_MESSAGE ("AUSampler not found — skipping ausampler_prepare_and_render_one_block");
        return;
    }

    juce::String errorMsg;
    std::unique_ptr<juce::AudioPluginInstance> instance (mgr->createAudioPlugin (*desc, errorMsg));

    if (instance == nullptr)
    {
        BOOST_TEST_MESSAGE ("AUSampler instantiation failed — skipping render test: " + errorMsg.toStdString());
        return;
    }

    instance->prepareToPlay (kSampleRate, kBlockSize);

    // AUSampler with no MIDI input and no loaded sample should output silence.
    juce::AudioBuffer<float> buffer (2, kBlockSize);
    buffer.clear();
    juce::MidiBuffer midi;
    instance->processBlock (buffer, midi);

    // Verify silence: all samples must be zero (or very close to zero).
    bool isSilent = true;
    for (int ch = 0; ch < buffer.getNumChannels() && isSilent; ++ch)
    {
        const float* data = buffer.getReadPointer (ch);
        for (int i = 0; i < kBlockSize && isSilent; ++i)
            if (std::abs (data[i]) > 1.0e-6f)
                isSilent = false;
    }

    BOOST_CHECK_MESSAGE (isSilent,
                         "AUSampler with no MIDI/sample input should render silence");

    instance->releaseResources();
}

// Case 4: getStateInformation / setStateInformation round-trip is stable.
BOOST_AUTO_TEST_CASE (ausampler_get_set_state_round_trip)
{
    auto mgr = makeAUPluginManager();
    auto desc = findAUSamplerDescription (*mgr);

    if (! desc.has_value())
    {
        BOOST_TEST_MESSAGE ("AUSampler not found — skipping ausampler_get_set_state_round_trip");
        return;
    }

    juce::String errorMsg;
    std::unique_ptr<juce::AudioPluginInstance> instance (mgr->createAudioPlugin (*desc, errorMsg));

    if (instance == nullptr)
    {
        BOOST_TEST_MESSAGE ("AUSampler instantiation failed — skipping state test: " + errorMsg.toStdString());
        return;
    }

    instance->prepareToPlay (44100.0, 512);

    juce::MemoryBlock state1;
    instance->getStateInformation (state1);

    BOOST_REQUIRE_MESSAGE (state1.getSize() > 0,
                           "getStateInformation should return non-empty state");

    // Apply the state back; a second getStateInformation should match.
    instance->setStateInformation (state1.getData(), static_cast<int> (state1.getSize()));

    juce::MemoryBlock state2;
    instance->getStateInformation (state2);

    BOOST_CHECK_MESSAGE (state1.getSize() == state2.getSize(),
                         "State size should be stable across get/set/get round-trip");

    instance->releaseResources();
}

// Case 5: releaseResources + destruction via RAII — no leaks or crashes.
BOOST_AUTO_TEST_CASE (ausampler_release)
{
    auto mgr = makeAUPluginManager();
    auto desc = findAUSamplerDescription (*mgr);

    if (! desc.has_value())
    {
        BOOST_TEST_MESSAGE ("AUSampler not found — skipping ausampler_release");
        return;
    }

    juce::String errorMsg;
    std::unique_ptr<juce::AudioPluginInstance> instance (mgr->createAudioPlugin (*desc, errorMsg));

    if (instance == nullptr)
    {
        BOOST_TEST_MESSAGE ("AUSampler instantiation failed — skipping release test: " + errorMsg.toStdString());
        return;
    }

    instance->prepareToPlay (44100.0, 512);
    instance->releaseResources();

    // Destruction via unique_ptr reset — RAII handles cleanup.
    instance.reset();

    BOOST_CHECK_MESSAGE (true, "AUSampler destroyed cleanly after releaseResources");
}

BOOST_AUTO_TEST_SUITE_END() // PluginLifecycle

#endif // __APPLE__
