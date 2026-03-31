// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

// Separate .mm file to avoid namespace conflicts between juce:: types
// (Point, AudioBuffer) and macOS system headers (MacTypes.h, CoreAudioBaseTypes.h).
// The `using namespace juce` in pluginmanager.cpp makes it impossible to include
// AudioToolbox headers in the same translation unit.

#include <AudioToolbox/AudioComponent.h>
#include <AudioUnit/AUComponent.h>
#include <CoreFoundation/CoreFoundation.h>

// Forward-declare juce types we need — avoids pulling in JUCE headers
namespace juce {
    class String;
    class PluginDescription;
}

#include <element/juce/core.hpp>
#include <juce_audio_processors/juce_audio_processors.h>

bool readAUMetadata (const juce::String& identifier, juce::PluginDescription& desc)
{
    // AU identifiers look like: "AudioUnit:Effects/aufx,xxxx,yyyy"
    if (! identifier.startsWith ("AudioUnit:"))
        return false;

    auto parts = juce::StringArray::fromTokens (
        identifier.fromFirstOccurrenceOf ("/", false, false), ",", "");
    if (parts.size() < 3)
        return false;

    auto typeStr = parts[0].trim();
    auto subtypeStr = parts[1].trim();
    auto mfgStr = parts[2].trim();

    auto fourCC = [] (const juce::String& s) -> UInt32 {
        if (s.length() < 4) return 0;
        auto c = s.toRawUTF8();
        return (UInt32 (c[0]) << 24) | (UInt32 (c[1]) << 16)
             | (UInt32 (c[2]) << 8) | UInt32 (c[3]);
    };

    AudioComponentDescription acd;
    acd.componentType = fourCC (typeStr);
    acd.componentSubType = fourCC (subtypeStr);
    acd.componentManufacturer = fourCC (mfgStr);
    acd.componentFlags = 0;
    acd.componentFlagsMask = 0;

    AudioComponent comp = AudioComponentFindNext (nullptr, &acd);
    if (comp == nullptr)
        return false;

    // Read name from the system registry — no plugin loading
    CFStringRef cfName = nullptr;
    if (AudioComponentCopyName (comp, &cfName) == noErr && cfName != nullptr)
    {
        char buf[512] = {};
        CFStringGetCString (cfName, buf, sizeof (buf), kCFStringEncodingUTF8);
        CFRelease (cfName);

        juce::String fullName (buf);
        // AU names are typically "Manufacturer: Plugin Name"
        if (fullName.contains (": "))
        {
            desc.manufacturerName = fullName.upToFirstOccurrenceOf (": ", false, false).trim();
            desc.name = fullName.fromFirstOccurrenceOf (": ", false, false).trim();
        }
        else
        {
            desc.name = fullName;
        }
    }
    else
    {
        return false;
    }

    // Category from AU component type
    if (acd.componentType == kAudioUnitType_MusicDevice)
    {
        desc.category = "Instrument";
        desc.isInstrument = true;
    }
    else if (acd.componentType == kAudioUnitType_Effect
             || acd.componentType == kAudioUnitType_MusicEffect)
    {
        desc.category = "Effect";
        desc.isInstrument = false;
    }
    else if (acd.componentType == kAudioUnitType_MIDIProcessor)
    {
        desc.category = "MIDI Effect";
        desc.isInstrument = false;
    }
    else if (acd.componentType == kAudioUnitType_Generator)
    {
        desc.category = "Generator";
        desc.isInstrument = false;
    }
    else
    {
        desc.category = "Other";
        desc.isInstrument = false;
    }

    // Version from AudioComponent (no loading)
    UInt32 version = 0;
    if (AudioComponentGetVersion (comp, &version) == noErr && version > 0)
    {
        int major = (version >> 16) & 0xFF;
        int minor = (version >> 8) & 0xFF;
        int patch = version & 0xFF;
        desc.version = juce::String (major) + "." + juce::String (minor) + "." + juce::String (patch);
    }

    desc.pluginFormatName = "AudioUnit";
    desc.fileOrIdentifier = identifier;
    desc.descriptiveName = desc.name;
    desc.numInputChannels = 2;
    desc.numOutputChannels = 2;
    desc.uniqueId = static_cast<int> (acd.componentSubType);
    desc.deprecatedUid = desc.uniqueId;

    return true;
}
