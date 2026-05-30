// SPDX-FileCopyrightText: Copyright (C) Kushview, LLC.
// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once

#include <element/juce.hpp>

namespace element {

/** Pure keyword-matching helper for Block category inference.
 *
 *  Takes the vendor plugin category string and the node name, concatenates
 *  them into a single lowercase haystack, and returns one of the four React
 *  BlockCategory union values:
 *
 *    "midifx"    — MIDI processing, routing, sequencers
 *    "modulator" — LFO, envelope, CV, automation, macro, analysis, utility
 *    "instrument"— synths, samplers, instruments, audio input, oscillators
 *    "audiofx"   — everything else (EQ, compressor, reverb, delay, filter,
 *                  limiter, output, containers, uncategorised)
 *
 *  Checks are ordered most-specific first so that e.g. a "MIDI Modulator"
 *  correctly lands in midifx rather than modulator.
 *
 *  NOTE: The graph/container guard (n.isGraph()) is handled in the caller
 *  before delegating here, because it requires a Node object.
 */
inline juce::String mapBlockCategoryFromStrings (const juce::String& nodeName,
                                                 const juce::String& pluginCategory)
{
    const juce::String haystack = (pluginCategory + " " + nodeName).toLowerCase();

    // midifx — MIDI processing, routing, sequencers
    if (haystack.contains ("midi")
        || haystack.contains ("sequenc")
        || (haystack.contains ("router") && haystack.contains ("midi")))
        return "midifx";

    // modulator — LFO, envelope, CV, automation, macro, analysis, utility
    if (haystack.contains ("lfo")
        || haystack.contains ("envelope")
        || haystack.contains ("modulat")
        || haystack.contains ("cv")
        || haystack.contains ("automation")
        || haystack.contains ("macro")
        || haystack.contains ("analy")
        || haystack.contains ("utility"))
        return "modulator";

    // instrument — synths, samplers, audio input, oscillators, drums, keys
    if (haystack.contains ("instrument")
        || haystack.contains ("synth")
        || haystack.contains ("sampler")
        || haystack.contains ("generat")
        || haystack.contains ("osc")
        || haystack.contains ("input")
        || haystack.contains ("drum")
        || haystack.contains ("keys"))
        return "instrument";

    // audiofx — default bucket: EQ, compressor, reverb, delay, filter,
    // limiter, output, containers, and everything not caught above.
    return "audiofx";
}

} // namespace element
