// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#include <element/ui.hpp>
#include <element/ui/content.hpp>
#include <element/session.hpp>
#include "presetmanager.hpp"
#include <element/context.hpp>

#include <element/datapath.hpp>
#include "services/presetservice.hpp"

using namespace juce;

namespace element {

// Returns a safe filename component derived from a format+identifier pair.
// Replaces characters that are invalid in filenames with underscores.
static String sanitizeForFilename (const String& s)
{
    String result;
    result.preallocateBytes (static_cast<size_t> (s.length() + 1));
    for (int i = 0; i < s.length(); ++i)
    {
        const juce_wchar c = s[i];
        if (CharacterFunctions::isLetterOrDigit (c) || c == '-' || c == '_' || c == '.')
            result += c;
        else
            result += '_';
    }
    return result;
}

// Returns the defaults marker directory for this DataPath root.
// Layout: <root>/Nodes/_defaults/<sanitizedFormat>/<sanitizedIdentifier>.default
static File defaultMarkerFile (const File& presetsDir,
                               const String& format,
                               const String& identifier)
{
    return presetsDir
        .getChildFile ("_defaults")
        .getChildFile (sanitizeForFilename (format))
        .getChildFile (sanitizeForFilename (identifier) + ".default");
}

struct PresetService::Impl
{
    Impl() {}
    ~Impl() {}

    void refresh()
    {
    }
};

PresetService::PresetService()
{
    impl.reset (new Impl());
}

PresetService::~PresetService()
{
    impl.reset (nullptr);
}

void PresetService::activate()
{
}

void PresetService::deactivate()
{
}

void PresetService::refresh()
{
    context().presets().refresh();
}

void PresetService::add (const Node& node, const String& presetName)
{
    const DataPath path;

    if (! node.savePresetTo (path, presetName))
    {
        AlertWindow::showMessageBoxAsync (AlertWindow::WarningIcon,
                                          TRANS ("Preset"),
                                          TRANS ("Could not save preset"));
    }
    else
    {
        context().presets().refresh();
    }

    if (auto* ui = sibling<UI>())
        ui->stabilizeContent();
}

bool PresetService::saveBlockPreset (const Node& node, const String& name)
{
    if (! node.isValid() || name.trim().isEmpty())
        return false;

    const DataPath path;
    if (! node.savePresetTo (path, name))
        return false;

    context().presets().refresh();
    return true;
}

bool PresetService::loadBlockPreset (Node& node, const String& name)
{
    if (! node.isValid() || name.trim().isEmpty())
        return false;

    const DataPath path;
    const File presetFile = path.getPresetFile (name);
    if (! presetFile.existsAsFile())
        return false;

    const Node preset (Node::parse (presetFile), false);
    if (! preset.isValid())
        return false;

    // Guard: only apply if format + identifier match.
    if (preset.getFormat().toString() != node.getFormat().toString()
        || preset.getIdentifier().toString() != node.getIdentifier().toString())
        return false;

    // Copy state properties from the preset's ValueTree into the live node's
    // ValueTree so that restorePluginState() picks them up.
    // node.data() returns by value but ValueTree is ref-counted — the copy
    // shares the same underlying object, so setProperty/removeProperty mutate
    // the node's actual tree.
    const ValueTree src = preset.data();
    ValueTree dst = node.data();

    for (const Identifier prop : { tags::state, tags::program, tags::programState })
    {
        if (src.hasProperty (prop))
            dst.setProperty (prop, src.getProperty (prop), nullptr);
        else
            dst.removeProperty (prop, nullptr);
    }

    // Apply the copied state to the live processor.
    node.restorePluginState();
    return true;
}

StringArray PresetService::listBlockPresets (const String& format, const String& identifier)
{
    StringArray names;
    if (format.isEmpty() || identifier.isEmpty())
        return names;

    const DataPath path;
    const File presetsDir = path.getRootDir().getChildFile ("Nodes");
    if (! presetsDir.isDirectory())
        return names;

    for (DirectoryEntry entry : RangedDirectoryIterator (presetsDir, false, EL_PRESET_FILE_EXTENSIONS))
    {
        const Node node (Node::parse (entry.getFile()), false);
        if (node.isValid()
            && node.getFormat().toString() == format
            && node.getIdentifier().toString() == identifier)
        {
            names.add (node.getName());
        }
    }

    names.sort (true);
    return names;
}

String PresetService::setDefaultForPlugin (const Node& node)
{
    if (! node.isValid())
        return {};

    const String format     = node.getFormat().toString();
    const String identifier = node.getIdentifier().toString();
    if (format.isEmpty() || identifier.isEmpty())
        return {};

    // Save the preset first (named "<NodeName> (default)").
    const String presetName = node.getName() + " (default)";
    if (! saveBlockPreset (node, presetName))
        return {};

    // Write the marker file.
    const DataPath path;
    const File presetsDir = path.getRootDir().getChildFile ("Nodes");
    const File marker = defaultMarkerFile (presetsDir, format, identifier);
    if (! marker.getParentDirectory().exists())
        marker.getParentDirectory().createDirectory();

    if (! marker.replaceWithText (presetName))
        return {};

    return presetName;
}

String PresetService::getDefaultPresetName (const String& format, const String& identifier)
{
    if (format.isEmpty() || identifier.isEmpty())
        return {};

    const DataPath path;
    const File presetsDir = path.getRootDir().getChildFile ("Nodes");
    const File marker = defaultMarkerFile (presetsDir, format, identifier);
    if (! marker.existsAsFile())
        return {};

    return marker.loadFileAsString().trim();
}

} // namespace element
