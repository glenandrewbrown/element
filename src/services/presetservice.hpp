// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/services.hpp>

namespace element {

class Node;

class PresetService : public Service
{
public:
    PresetService();
    ~PresetService();
    void activate() override;
    void deactivate() override;

    void refresh();
    void add (const Node& Node, const juce::String& presetName = juce::String());

    // Block preset API (P3-T21)
    // Save node state as a named preset under DataPath "Nodes/<name>.eln".
    // Returns true on success.
    bool saveBlockPreset (const Node& node, const juce::String& name);

    // Load a named preset onto node. Guards: format+identifier must match.
    // Returns true when the state was applied.
    bool loadBlockPreset (Node& node, const juce::String& name);

    // List preset names available for the given format/identifier pair.
    juce::StringArray listBlockPresets (const juce::String& format, const juce::String& identifier);

    // Write a "default preset" marker file for the node's plugin identifier.
    // When a new block is added for that plugin the controller should call
    // loadBlockPreset(node, defaultPresetName) to auto-apply the default.
    // Returns the name of the default preset (same as the preset stored by
    // saveBlockPreset), or empty string on failure.
    juce::String setDefaultForPlugin (const Node& node);

    // Return the default preset name for a format/identifier pair, or "" if none.
    juce::String getDefaultPresetName (const juce::String& format, const juce::String& identifier);

private:
    friend struct Impl;
    struct Impl;
    std::unique_ptr<Impl> impl;
};

} // namespace element
