// Copyright 2026 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/juce/core.hpp>

namespace element {

/** One engine-described inline parameter for a built-in node whose controls
    render directly on the Block face. The engine is the source of truth for the
    current value AND its range (nothing-fake): the webview renders exactly what
    the node reports, never a fabricated control. */
struct InlineParamInfo
{
    juce::String key;   ///< stable id, matches the webview registry entry's `key`
    juce::String label; ///< human caption (webview may override)
    double value;       ///< current raw value (NOT normalised)
    double min;
    double max;
    double step;        ///< 0 = continuous; >0 = snap increment
};

/** Mixin implemented by built-in MIDI-FX nodes (the pizmidi-native family) so the
    webview host can enumerate + write their parameters generically — one
    `dynamic_cast<InlineParamControl*>` in the host serves every such node, so
    adding nodes never re-touches element_webview_host.cpp.

    Threading: setInlineParam is called on the MESSAGE thread; implementations MUST
    store into atomics the audio thread reads (relaxed). getInlineParams is called
    on the message thread (snapshot builder) and reads those atomics. */
struct InlineParamControl
{
    virtual ~InlineParamControl() = default;

    /** Apply a raw value to the named parameter. Returns false for an unknown key.
        Implementations clamp to their own range. */
    virtual bool setInlineParam (const juce::String& key, double value) = 0;

    /** Append this node's current inline parameters (value + range). */
    virtual void getInlineParams (juce::Array<InlineParamInfo>& out) const = 0;
};

} // namespace element
