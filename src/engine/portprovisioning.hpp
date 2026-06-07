// Copyright 2023 Kushview, LLC <info@kushview.net>
// SPDX-License-Identifier: GPL-3.0-or-later

#pragma once

#include <element/node.hpp>

namespace element {

/** The I/O a freshly-dropped Block actually needs, derived from the REAL
    instantiated node's ports — NOT the PluginDescription `signalOut` UI
    heuristic (element_webview_host.cpp:6516), which misclassifies internal MIDI
    nodes (element.midiTranspose / element.midiVelocityAmp set no MIDI category
    and would be tagged "value"). Counting the node's own audio/MIDI in/out ports
    is correct for internal nodes, third-party plugins, and snippet members
    alike. Wave-1 Item 1 (product-feedback-v4 §2): drives per-Block IO
    provisioning + the auto-cabled first drop.

    Value/CV ports are intentionally ignored here: the default Board provisions
    only audio + MIDI IO device nodes (Node::createDefaultGraph — node.cpp:179),
    so CV capability does not map to a Board IO endpoint. */
struct NodePortNeeds
{
    bool needsMidiIn = false;
    bool needsMidiOut = false;
    bool needsAudioIn = false;
    bool needsAudioOut = false;

    bool any() const noexcept { return needsMidiIn || needsMidiOut || needsAudioIn || needsAudioOut; }
};

/** Every non-IO/non-device Processor is given ONE universal "MIDI In" port even
    when it does not accept MIDI (Processor::setPorts — processor.cpp:718-725), so
    that any Block can still be fed MIDI. That phantom port carries this fixed
    symbol. A MIDI-in port with this symbol is NOT a real MIDI capability and must
    NOT drive MIDI-In provisioning (else an audio-only EQ would falsely keep a
    MIDI In device node). A genuinely MIDI-accepting node declares its own MIDI-in
    (different symbol) and the phantom is then never added. */
inline const char* kUniversalMidiInputPortSymbol() { return "element_midi_input"; }

/** Pure classifier: a Block node → the audio/MIDI IO it needs, read from the
    node's real port set (object-independent — reads the persisted Port
    ValueTrees), with the universal phantom MIDI-in discounted. Examples by
    capability:
      - sampler/instrument (real MIDI in + audio out) → { needsMidiIn, needsAudioOut }
      - MIDI fx / router   (real MIDI in + MIDI out)  → { needsMidiIn, needsMidiOut }
      - EQ / audio fx      (audio in + audio out)      → { needsAudioIn, needsAudioOut }
      - internal midiTranspose (real MIDI in + MIDI out, no audio) → classified
        MIDI, NOT "value" (the bug the signalOut heuristic causes). */
inline NodePortNeeds classifyNodePorts (const Node& node)
{
    NodePortNeeds needs;
    if (! node.isValid())
        return needs;

    // Count REAL MIDI inputs: every MIDI input port EXCEPT the lone universal
    // phantom (symbol == element_midi_input). A real MIDI-accepting node declares
    // its own MIDI-in (the phantom is then never added), so any non-phantom MIDI
    // input = a true MIDI capability.
    int realMidiIns = 0;
    for (int i = 0; i < node.getNumPorts(); ++i)
    {
        const Port p (node.getPort (i));
        if (p.isA (PortType::Midi, true)
            && p.symbol() != juce::String (kUniversalMidiInputPortSymbol()))
            ++realMidiIns;
    }
    needs.needsMidiIn = realMidiIns > 0;

    PortArray ports;

    ports.clearQuick();
    node.getPorts (ports, PortType::Midi, false);
    needs.needsMidiOut = ports.size() > 0;

    ports.clearQuick();
    node.getPorts (ports, PortType::Audio, true);
    needs.needsAudioIn = ports.size() > 0;

    ports.clearQuick();
    node.getPorts (ports, PortType::Audio, false);
    needs.needsAudioOut = ports.size() > 0;

    return needs;
}

} // namespace element
