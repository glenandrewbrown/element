// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/context.hpp>
#include <element/devices.hpp>
#include <element/settings.hpp>

#include "appinfo.hpp"
#include "engine/midiengine.hpp"
#include "engine/midipanic.hpp"

namespace element {

const char* Settings::checkForUpdatesKey = "checkForUpdates";
const char* Settings::pluginFormatsKey = "pluginFormatsKey";
const char* Settings::pluginWindowOnTopDefault = "pluginWindowOnTopDefault";
const char* Settings::scanForPluginsOnStartKey = "scanForPluginsOnStart";
const char* Settings::showPluginWindowsKey = "showPluginWindows";
const char* Settings::openLastUsedSessionKey = "openLastUsedSession";
const char* Settings::askToSaveSessionKey = "askToSaveSession";
const char* Settings::defaultNewSessionFile = "defaultNewSessionFile";
const char* Settings::generateMidiClockKey = "generateMidiClockKey";
const char* Settings::sendMidiClockToInputKey = "sendMidiClockToInputKey";
const char* Settings::hidePluginWindowsWhenFocusLostKey = "hidePluginWindowsWhenFocusLost";
const char* Settings::lastGraphKey = "lastGraph";
const char* Settings::lastSessionKey = "lastSession";
const char* Settings::legacyInterfaceKey = "legacyInterface";
const char* Settings::midiEngineKey = "midiEngine";
const char* Settings::oscHostPortKey = "oscHostPortKey";
const char* Settings::oscHostEnabledKey = "oscHostEnabledKey";
const char* Settings::systrayKey = "systrayKey";
const char* Settings::midiOutLatencyKey = "midiOutLatency";
const char* Settings::desktopScaleKey = "desktopScale";
const char* Settings::mainContentTypeKey = "mainContentType";
const char* Settings::pluginListHeaderKey = "pluginListHeader";
const char* Settings::devicesKey = "devices";
const char* Settings::keymappingsKey = "keymappings";
const char* Settings::clockSourceKey = "clockSource";
const char* Settings::updateChannelKey = "updateChannel";
const char* Settings::updateKeyTypeKey = "updateKeyType";
const char* Settings::updateKeyKey = "updateKey";
const char* Settings::updateKeyUserKey = "updateKeyUserKey";
const char* Settings::transportStartStopContinue = "transportStartStopContinueKey";
const char* Settings::pluginSandboxModeKey = "pluginSandboxMode";

//=============================================================================
enum OptionsMenuItemId
{
    CheckForUpdatesOnStart = 1000000,
    ScanFormPluginsOnStart,
    AutomaticallyShowPluginWindows,
    HidePluginWindowsWhenFocusLost,
    PluginWindowsOnTop,
    OpenLastUsedSession,
    AskToSaveSessions,

    MidiInputDevice = 2000000,
    MidiOutputDevice = 3000000,
    AudioInputDevice = 4000000,
    AudioOutputDevice = 5000000,
    SampleRate = 6000000,
    BufferSize = 7000000
};

static bool settingResultIsFor (const int result, const int optionMenuId)
{
    return (result >= optionMenuId && result < optionMenuId + 1000000);
}

#if JUCE_32BIT
#if JUCE_MAC
const char* Settings::lastPluginScanPathPrefix = "pluginScanPath32_";
const char* Settings::pluginListKey = "pluginList32";

#else
const char* Settings::lastPluginScanPathPrefix = "pluginScanPath_"; // TODO: migrate this
const char* Settings::pluginListKey = "plugin-list"; // TODO: migrate this
#endif

#else // 64bit keys
#if JUCE_MAC
const char* Settings::lastPluginScanPathPrefix = "pluginScanPath_"; // TODO: migrate this
const char* Settings::pluginListKey = "plugin-list"; // TODO: migrate this

#else
const char* Settings::lastPluginScanPathPrefix = "pluginScanPath64_";
const char* Settings::pluginListKey = "pluginList64";
#endif
#endif

Settings::Settings()
{
    PropertiesFile::Options opts;
    opts.applicationName = EL_APP_NAME;
    opts.filenameSuffix = "conf";
    opts.osxLibrarySubFolder = "Application Support";
    opts.storageFormat = PropertiesFile::storeAsXML;

#if JUCE_DEBUG
    opts.applicationName << "_Debug";
#endif

#if JUCE_LINUX
    opts.folderName = String (".config/@0@").replace ("@0@", EL_APP_DATA_SUBDIR);
#else
    opts.folderName = EL_APP_DATA_SUBDIR;
#endif

    setStorageParameters (opts);
}

Settings::~Settings() {}

//=============================================================================
bool Settings::checkForUpdates() const
{
    if (auto* props = getProps())
        return props->getBoolValue (checkForUpdatesKey, true);
    return false;
}

void Settings::setCheckForUpdates (const bool shouldCheck)
{
    if (shouldCheck == checkForUpdates())
        return;
    if (auto* p = getProps())
        p->setValue (checkForUpdatesKey, shouldCheck);
}

//=============================================================================
PropertiesFile* Settings::getProps() const
{
    return (const_cast<Settings*> (this))->getUserSettings();
}

bool Settings::getBool (std::string_view key, bool fallback) const noexcept
{
    auto p = getProps();
    return p != nullptr ? p->getBoolValue (key.data(), fallback) : fallback;
}

void Settings::set (std::string_view key, const var& value)
{
    if (auto p = getProps())
        p->setValue (key.data(), value);
}

//=============================================================================
std::unique_ptr<XmlElement> Settings::getLastGraph() const
{
    if (auto* p = getProps())
        return p->getXmlValue ("lastGraph");
    return nullptr;
}

void Settings::setLastGraph (const ValueTree& data)
{
    jassert (data.hasType (types::Node));
    if (! data.hasType (types::Node))
        return;
    if (auto* p = getProps())
        if (auto xml = data.createXml())
            p->setValue ("lastGraph", xml.get());
}

//=============================================================================
bool Settings::scanForPluginsOnStartup() const
{
    if (auto* p = getProps())
        return p->getBoolValue (scanForPluginsOnStartKey, false);
    return false;
}

void Settings::setScanForPluginsOnStartup (const bool shouldScan)
{
    if (shouldScan == scanForPluginsOnStartup())
        return;
    if (auto* p = getProps())
        p->setValue (scanForPluginsOnStartKey, shouldScan);
}

//=============================================================================
bool Settings::showPluginWindowsWhenAdded() const
{
    if (auto* p = getProps())
        return p->getBoolValue (showPluginWindowsKey, false);
    return false;
}

void Settings::setShowPluginWindowsWhenAdded (const bool shouldShow)
{
    if (shouldShow == showPluginWindowsWhenAdded())
        return;
    if (auto* p = getProps())
        p->setValue (showPluginWindowsKey, shouldShow);
}

//=============================================================================
bool Settings::openLastUsedSession() const
{
    if (auto* p = getProps())
        return p->getBoolValue (openLastUsedSessionKey, true);
    return true;
}

void Settings::setOpenLastUsedSession (const bool shouldOpen)
{
    if (shouldOpen == openLastUsedSession())
        return;
    if (auto* p = getProps())
        p->setValue (openLastUsedSessionKey, shouldOpen);
}

//=============================================================================
void Settings::setGenerateMidiClock (const bool generate)
{
    if (auto* p = getProps())
        return p->setValue (generateMidiClockKey, generate);
}

bool Settings::generateMidiClock() const
{
    if (auto* p = getProps())
        return p->getBoolValue (generateMidiClockKey, false);
    return false;
}

bool Settings::pluginWindowsOnTop() const
{
    if (auto* p = getProps())
        return p->getBoolValue (pluginWindowOnTopDefault, true);
    return false;
}

bool Settings::askToSaveSession()
{
    if (auto* props = getProps())
        return props->getBoolValue (askToSaveSessionKey, true);
    return false;
}

void Settings::setAskToSaveSession (const bool value)
{
    if (auto* props = getProps())
        props->setValue (askToSaveSessionKey, value);
}

bool Settings::sendMidiClockToInput() const
{
    if (auto* props = getProps())
        return props->getBoolValue (sendMidiClockToInputKey, false);
    return false;
}

void Settings::setSendMidiClockToInput (const bool value)
{
    if (auto* props = getProps())
        props->setValue (sendMidiClockToInputKey, value);
}

void Settings::setPluginWindowsOnTop (const bool onTop)
{
    if (onTop == pluginWindowsOnTop())
        return;
    if (auto* p = getProps())
        p->setValue (pluginWindowOnTopDefault, onTop);
}

const File Settings::getDefaultNewSessionFile() const
{
    if (auto* p = getProps())
    {
        const auto value = p->getValue (defaultNewSessionFile);
        if (value.isNotEmpty() && File::isAbsolutePath (value))
            return File (value);
    }

    return File();
}

void Settings::setDefaultNewSessionFile (const File& file)
{
    if (auto* p = getProps())
        p->setValue (defaultNewSessionFile,
                     file.existsAsFile() ? file.getFullPathName() : "");
}

bool Settings::hidePluginWindowsWhenFocusLost() const
{
#if JUCE_LINUX
    const bool fallback = false;
#else
    const bool fallback = true;
#endif

    if (auto* p = getProps())
        return p->getBoolValue (hidePluginWindowsWhenFocusLostKey, fallback);
    return fallback;
}

void Settings::setHidePluginWindowsWhenFocusLost (const bool hideThem)
{
    if (hideThem == hidePluginWindowsWhenFocusLost())
        return;
    if (auto* p = getProps())
        p->setValue (hidePluginWindowsWhenFocusLostKey, hideThem);
}

bool Settings::useLegacyInterface() const
{
    if (auto* p = getProps())
        return p->getBoolValue (legacyInterfaceKey, false);
    return false;
}

void Settings::setUseLegacyInterface (const bool useLegacy)
{
    if (useLegacy == useLegacyInterface())
        return;
    if (auto* p = getProps())
        p->setValue (legacyInterfaceKey, useLegacy);
}

bool Settings::isOscHostEnabled() const
{
    if (auto* p = getProps())
        return p->getBoolValue (oscHostEnabledKey, false);
    return false;
}

void Settings::setOscHostEnabled (bool enabled)
{
    if (isOscHostEnabled() == enabled)
        return;
    if (auto* p = getProps())
        p->setValue (oscHostEnabledKey, enabled);
}

//=============================================================================
int Settings::getOscHostPort() const
{
    if (auto* p = getProps())
        return p->getIntValue (oscHostPortKey, 9000);
    return 9000;
}

void Settings::setOscHostPort (int port)
{
    if (getOscHostPort() == port)
        return;
    if (auto* p = getProps())
        p->setValue (oscHostPortKey, port);
}

//=============================================================================
bool Settings::isSystrayEnabled() const
{
#if JUCE_LINUX
    const bool defaultSysTrayEnabled = false;
#else
    const bool defaultSysTrayEnabled = true;
#endif

    if (auto* p = getProps())
        return p->getBoolValue (systrayKey, defaultSysTrayEnabled);
    return defaultSysTrayEnabled;
}

void Settings::setSystrayEnabled (bool enabled)
{
    if (isSystrayEnabled() == enabled)
        return;
    if (auto* p = getProps())
        p->setValue (systrayKey, enabled);
}

//=============================================================================
double Settings::getMidiOutLatency() const
{
    if (auto* p = getProps())
        return p->getDoubleValue (midiOutLatencyKey, true);
    return 0.0;
}

void Settings::setMidiOutLatency (double latencyMs)
{
    if (latencyMs == getMidiOutLatency())
        return;
    if (auto* p = getProps())
        p->setValue (midiOutLatencyKey, latencyMs);
}

//=============================================================================
double Settings::getDesktopScale() const
{
    if (auto* p = getProps())
        return p->getDoubleValue (desktopScaleKey, 1.15);
    return 1.15;
}

void Settings::setDesktopScale (double scale)
{
    if (scale == getDesktopScale())
        return;
    scale = jlimit (0.1, 8.0, scale);
    if (auto* p = getProps())
        p->setValue (desktopScaleKey, scale);
}

//=============================================================================
String Settings::getMainContentType() const
{
    if (auto* p = getProps())
        return p->getValue (mainContentTypeKey, "webview");
    return "webview";
}

void Settings::setMainContentType (const String& tp)
{
    if (auto* p = getProps())
        p->setValue (mainContentTypeKey, tp);
}

//=============================================================================
juce::String Settings::getClockSource() const
{
    if (auto* p = getProps())
        return p->getValue (clockSourceKey, "internal");
    return "internal";
}

void Settings::setClockSource (const juce::String& src)
{
    if (src != "internal" && src != "midiClock")
    {
        jassertfalse;
        return;
    }

    if (auto p = getProps())
        p->setValue (clockSourceKey, src);
}

static constexpr uint8_t obfuscationKey[] = {
    0x4b, 0x75, 0x73, 0x68, 0x76, 0x69, 0x65, 0x77,  // "Kushview"
    0x45, 0x6c, 0x65, 0x6d, 0x65, 0x6e, 0x74, 0x21   // "Element!"
};

juce::String Settings::obfuscate (const juce::String& plaintext)
{
    if (plaintext.isEmpty())
        return {};

    auto utf8 = plaintext.toUTF8();
    const int len = static_cast<int> (utf8.sizeInBytes() - 1); // exclude null
    juce::MemoryBlock block (static_cast<size_t> (len));

    for (int i = 0; i < len; ++i)
        static_cast<uint8_t*> (block.getData())[i] =
            static_cast<uint8_t> (utf8.getAddress()[i]) ^ obfuscationKey[i % 16];

    return block.toBase64Encoding();
}

juce::String Settings::deobfuscate (const juce::String& encoded)
{
    if (encoded.isEmpty())
        return {};

    juce::MemoryBlock block;
    if (! block.fromBase64Encoding (encoded))
        return encoded; // Not base64 — return as-is (legacy plaintext)

    const int len = static_cast<int> (block.getSize());
    juce::MemoryBlock decoded (static_cast<size_t> (len) + 1, true);

    for (int i = 0; i < len; ++i)
        static_cast<uint8_t*> (decoded.getData())[i] =
            static_cast<uint8_t*> (block.getData())[i] ^ obfuscationKey[i % 16];

    return juce::String::fromUTF8 (
        static_cast<const char*> (decoded.getData()), len);
}

juce::String Settings::getUpdateKeyType() const
{
    if (auto* p = getProps())
        return p->getValue (updateKeyTypeKey, "element-v1");
    return "element-v1";
}

void Settings::setUpdateKeyType (const String& slug)
{
    if (slug != "patreon" && slug != "element-v1" && slug != "member")
    {
        jassertfalse;
        return;
    }

    if (auto p = getProps())
        p->setValue (updateKeyTypeKey, slug);
}

juce::String Settings::getUpdateKeyUser() const
{
    if (auto* p = getProps())
        return deobfuscate (p->getValue (updateKeyUserKey, ""));
    return "";
}

void Settings::setUpdateKeyUser (const String& user)
{
    if (auto p = getProps())
        p->setValue (updateKeyUserKey, obfuscate (user.trim()));
}

juce::String Settings::getUpdateKey() const
{
    if (auto* p = getProps())
        return deobfuscate (p->getValue (updateKeyKey, ""));
    return "";
}

void Settings::setUpdateKey (const String& slug)
{
    if (auto p = getProps())
        p->setValue (updateKeyKey, obfuscate (slug.trim()));
}

juce::String Settings::getUpdateChannel() const
{
    if (auto* p = getProps())
        return p->getValue (updateChannelKey, "");
    return "";
}

void Settings::setUpdateChannel (const String& channel)
{
    if (auto p = getProps())
        p->setValue (updateChannelKey, channel.trim());
}

void Settings::setMidiPanicParams (MidiPanicParams params)
{
    if (auto p = getProps())
    {
        p->setValue ("midiPanicCCEnabled", params.enabled);
        p->setValue ("midiPanicCCNumber", params.ccNumber);
        p->setValue ("midiPanicChannel", params.channel);
    }
}

MidiPanicParams Settings::getMidiPanicParams() const
{
    MidiPanicParams params;
    if (auto p = getProps())
    {
        params.enabled = p->getBoolValue ("midiPanicCCEnabled", false);
        params.ccNumber = p->getIntValue ("midiPanicCCNumber", -1);
        params.channel = p->getIntValue ("midiPanicChannel", 1);
    }
    return params;
}

void Settings::setTransportRespondToStartStopContinue (bool shouldRespond)
{
    if (auto p = getProps())
        p->setValue (transportStartStopContinue, shouldRespond);
}

bool Settings::transportRespondToStartStopContinue() const
{
    if (auto* p = getProps())
        return p->getBoolValue (transportStartStopContinue, false);
    return false;
}

//=============================================================================
int Settings::getPluginSandboxMode() const
{
    // Default 0 (Disabled). Phase D Gate 1.5 stress-tested with the in-tree
    // TestEchoPluginInstance only; real-world AU plugins through the sandbox
    // at initial-load time hung the JUCE message thread on Glen's machine
    // (2026-05-08, BRASS_4Horns session). Until the sandbox is verified
    // against real third-party AUs end-to-end, sandbox stays opt-in via
    // Preferences → Plugins → Sandbox Mode.
    if (auto* p = getProps())
        return p->getIntValue (pluginSandboxModeKey, 0);
    return 0;
}

void Settings::setPluginSandboxMode (int mode)
{
    mode = jlimit (0, 2, mode);
    if (mode == getPluginSandboxMode())
        return;
    if (auto* p = getProps())
        p->setValue (pluginSandboxModeKey, mode);
}

bool Settings::shouldSandboxPlugin (const juce::PluginDescription& desc) const
{
    // Phase D restored sandbox IPC: cross-process atomics (D-1), named POSIX
    // semaphores (D-2), magic-sentinel placement-new (D-3), ordered shutdown
    // (D-4), waitForResponse timeout on connection loss (D-5), restart-then-
    // state-restore ordering (D-6), real-process round-trip test (D-8), and
    // SIGKILL-stress harness (D-9, 696/1000 recovery, 0 host crashes).
    // Gate 1.5 ratified 2026-05-08.
    //
    // Internal nodes are tightly coupled to host process state and never
    // sandboxable.
    if (desc.pluginFormatName == "Internal")
        return false;

    switch (getPluginSandboxMode())
    {
        case 1: // SandboxAllPlugins (preferences UI ID 2): every external plugin
            return true;

        case 2: // SandboxProblematicOnly (UI ID 3): formats most prone to
                // constructor-time crashes. AudioUnits on macOS are the
                // historical worst offender (sample-rate-set-during-validation,
                // OSStatus errors, malformed Info.plist, unsigned components).
                // Glen's crashed.txt at 2026-05-08 had 18 AU plugins blacklisted
                // (Antares, UAD, iZotope, PSP, Eventide, Dawesome) — every one
                // an AU. Default mode protects against these without sandbox
                // overhead for stable VST3/CLAP/LV2 plugins.
            return desc.pluginFormatName == "AudioUnit";

        case 0: // SandboxDisabled (UI ID 1): never sandbox. User opt-out.
        default:
            return false;
    }
}

//=============================================================================
void Settings::addItemsToMenu (Context& world, PopupMenu& menu)
{
    auto& devices (world.devices());
    auto& midi (world.midi());
    PopupMenu sub;

    sub.addItem (CheckForUpdatesOnStart, "Check Updates at Startup", true, checkForUpdates());

    sub.addSeparator(); // plugins items

    sub.addItem (ScanFormPluginsOnStart, "Scan Plugins at Startup", true, scanForPluginsOnStartup());
    sub.addItem (AutomaticallyShowPluginWindows, "Automatically Show Plugin Windows", true, showPluginWindowsWhenAdded());
    sub.addItem (PluginWindowsOnTop, "Plugins On Top By Default", true, pluginWindowsOnTop());
    sub.addItem (HidePluginWindowsWhenFocusLost, "Hide Plugin Windows When App Inactive", true, hidePluginWindowsWhenFocusLost());

    sub.addSeparator(); // session items

#if ! ELEMENT_SE
    const String sessTxt = "Session";
#else
    const String sessTxt = "Graph";
#endif

    sub.addItem (OpenLastUsedSession,
                 String ("Open Last Saved ") + sessTxt,
                 true,
                 openLastUsedSession());
    sub.addItem (AskToSaveSessions,
                 String ("Ask To Save ") + sessTxt,
                 true,
                 askToSaveSession());

    menu.addSubMenu ("General", sub);

    menu.addSeparator();

    int index = 0;
    sub.clear();
    for (const auto& device : MidiInput::getAvailableDevices())
        sub.addItem (MidiInputDevice + index++, device.name, true, midi.isMidiInputEnabled (device));
    menu.addSubMenu ("MIDI Input Devices", sub);

    index = 0;
    sub.clear();
    for (const auto& device : MidiOutput::getAvailableDevices())
        sub.addItem (MidiOutputDevice + index++, device.name, true, device.identifier == midi.getDefaultMidiOutputID());
    menu.addSubMenu ("MIDI Output Device", sub);

    if (auto* type = devices.getCurrentDeviceTypeObject())
    {
        AudioDeviceManager::AudioDeviceSetup setup;
        devices.getAudioDeviceSetup (setup);
        menu.addSeparator();
        if (type->getTypeName() != "ASIO")
        {
            index = 0;
            sub.clear();
            for (const auto& device : type->getDeviceNames (true))
                sub.addItem (AudioInputDevice + index++, device, true, device == setup.inputDeviceName);
            menu.addSubMenu ("Audio Input Device", sub);
        }
        index = 0;
        sub.clear();
        for (const auto& device : type->getDeviceNames (false))
            sub.addItem (AudioOutputDevice + index++, device, true, device == setup.outputDeviceName);
        const auto menuName = type->getTypeName() == "ASIO"
                                  ? "Audio Device"
                                  : "Audio Output Device";
        menu.addSubMenu (menuName, sub);
    }

    if (auto* device = devices.getCurrentAudioDevice())
    {
        menu.addSeparator();
        index = 0;
        sub.clear();
        for (const auto rate : device->getAvailableSampleRates())
            sub.addItem (SampleRate + index++, String (int (rate)), true, rate == device->getCurrentSampleRate());
        menu.addSubMenu ("Sample Rate", sub);

        index = 0;
        sub.clear();
        for (const auto bufSize : device->getAvailableBufferSizes())
            sub.addItem (BufferSize + index++, String (bufSize), true, bufSize == device->getCurrentBufferSizeSamples());
        menu.addSubMenu ("Buffer Size", sub);
    }
}

bool Settings::performMenuResult (Context& world, const int result)
{
    auto& devices (world.devices());
    auto& midi (world.midi());
    bool handled = true;

    switch (result)
    {
        case CheckForUpdatesOnStart:
            setCheckForUpdates (! checkForUpdates());
            break;
        case ScanFormPluginsOnStart:
            setScanForPluginsOnStartup (! scanForPluginsOnStartup());
            break;
        case AutomaticallyShowPluginWindows:
            setShowPluginWindowsWhenAdded (! showPluginWindowsWhenAdded());
            break;
        case PluginWindowsOnTop:
            setPluginWindowsOnTop (! pluginWindowsOnTop());
            break;
        case HidePluginWindowsWhenFocusLost:
            setHidePluginWindowsWhenFocusLost (! hidePluginWindowsWhenFocusLost());
            break;
        case OpenLastUsedSession:
            setOpenLastUsedSession (! openLastUsedSession());
            break;
        case AskToSaveSessions:
            setAskToSaveSession (! askToSaveSession());
            break;
        default:
            handled = false;
            break;
    }

    if (handled)
    {
        saveIfNeeded();
        return true;
    }

    handled = true;
    if (settingResultIsFor (result, MidiInputDevice))
    {
        // MIDI input device
        const auto device = MidiInput::getAvailableDevices()[result - MidiInputDevice];
        if (device.identifier.isNotEmpty())
            midi.setMidiInputEnabled (device, ! midi.isMidiInputEnabled (device));
    }
    else if (settingResultIsFor (result, MidiOutputDevice))
    {
        // MIDI Output device
        const auto device = MidiOutput::getAvailableDevices()[result - MidiOutputDevice];
        if (device.identifier.isNotEmpty() && device.identifier == midi.getDefaultMidiOutputID())
            midi.setDefaultMidiOutput ({});
        else if (device.identifier.isNotEmpty())
            midi.setDefaultMidiOutput (device);
    }
    else if (settingResultIsFor (result, AudioInputDevice))
    {
        // Audio input device
        if (auto* type = devices.getCurrentDeviceTypeObject())
        {
            AudioDeviceManager::AudioDeviceSetup setup;
            devices.getAudioDeviceSetup (setup);
            const auto device = type->getDeviceNames (true)[result - AudioInputDevice];
            if (device.isNotEmpty() && device != setup.inputDeviceName)
            {
                setup.inputDeviceName = device;
                if (type->getTypeName() == "ASIO")
                    setup.outputDeviceName = device;
                devices.setAudioDeviceSetup (setup, true);
            }
        }
    }
    else if (settingResultIsFor (result, AudioOutputDevice))
    {
        // Audio output device
        if (auto* type = devices.getCurrentDeviceTypeObject())
        {
            AudioDeviceManager::AudioDeviceSetup setup;
            devices.getAudioDeviceSetup (setup);
            const auto device = type->getDeviceNames (false)[result - AudioOutputDevice];
            if (device.isNotEmpty() && device != setup.outputDeviceName)
            {
                if (type->getTypeName() == "ASIO")
                    setup.inputDeviceName = device;
                setup.outputDeviceName = device;
                devices.setAudioDeviceSetup (setup, true);
            }
        }
    }
    else if (settingResultIsFor (result, SampleRate))
    {
        // sample rate
        if (auto* device = devices.getCurrentAudioDevice())
        {
            const auto rate = device->getAvailableSampleRates()[result - SampleRate];
            if (rate > 0 && rate != device->getCurrentSampleRate())
            {
                AudioDeviceManager::AudioDeviceSetup setup;
                devices.getAudioDeviceSetup (setup);
                setup.sampleRate = rate;
                devices.setAudioDeviceSetup (setup, true);
            }
        }
    }
    else if (settingResultIsFor (result, BufferSize))
    {
        // buffer size
        if (auto* device = devices.getCurrentAudioDevice())
        {
            const auto bufSize = device->getAvailableBufferSizes()[result - BufferSize];
            if (bufSize > 0 && bufSize != device->getCurrentBufferSizeSamples())
            {
                AudioDeviceManager::AudioDeviceSetup setup;
                devices.getAudioDeviceSetup (setup);
                setup.bufferSize = bufSize;
                devices.setAudioDeviceSetup (setup, true);
            }
        }
    }
    else
    {
        handled = false;
    }

    if (handled)
        saveIfNeeded();

    return handled;
}

} // namespace element
