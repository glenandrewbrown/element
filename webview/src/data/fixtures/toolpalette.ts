/**
 * Tool-palette fixture — plugin browser entries covering all 4 categories,
 * multiple formats, and a mix of manufacturers. Used by ToolPalette stories
 * (G-17). APPEND-ONLY: do NOT mutate existing exports after initial commit.
 *
 * ⚠️ DEMO ONLY — NOT real engine data. See demoGraph.ts header for policy.
 */
import type { BrowserPlugin } from "../../stores/usePluginBrowserStore";

export const tpPlugins: BrowserPlugin[] = [
  // Instruments (blue)
  {
    identifier: "tp-inst-vital",
    name: "Vital",
    manufacturer: "Matt Tytel",
    format: "VST3",
    category: "Instrument/Synth",
    blockCategory: "instrument",
  },
  {
    identifier: "tp-inst-kontakt",
    name: "Kontakt 7",
    manufacturer: "Native Instruments",
    format: "AU",
    category: "Sampler",
    blockCategory: "instrument",
  },
  {
    identifier: "tp-inst-surge",
    name: "Surge XT",
    manufacturer: "Surge Synth Team",
    format: "CLAP",
    category: "Instrument/Synth",
    blockCategory: "instrument",
  },
  // Audio effects (orange)
  {
    identifier: "tp-audiofx-proq4",
    name: "Pro-Q 4",
    manufacturer: "FabFilter",
    format: "VST3",
    category: "EQ",
    blockCategory: "audiofx",
  },
  {
    identifier: "tp-audiofx-proc2",
    name: "Pro-C 2",
    manufacturer: "FabFilter",
    format: "AU",
    category: "Compressor",
    blockCategory: "audiofx",
  },
  {
    identifier: "tp-audiofx-valhalla",
    name: "Valhalla Room",
    manufacturer: "Valhalla DSP",
    format: "VST3",
    category: "Reverb",
    blockCategory: "audiofx",
  },
  // MIDI effects (teal)
  {
    identifier: "tp-midifx-router",
    name: "MIDI Router",
    manufacturer: "Element",
    format: "INT",
    category: "MIDI",
    blockCategory: "midifx",
  },
  {
    identifier: "tp-midifx-arp",
    name: "Arp & Chord",
    manufacturer: "KORG",
    format: "AU",
    category: "Sequencer/Arp",
    blockCategory: "midifx",
  },
  // Modulators / Utilities (purple)
  {
    identifier: "tp-mod-lfotool",
    name: "LFO Tool",
    manufacturer: "Xfer Records",
    format: "VST3",
    category: "Modulator/LFO",
    blockCategory: "modulator",
  },
  {
    identifier: "tp-mod-constant",
    name: "Value Constant",
    manufacturer: "Element",
    format: "INT",
    category: "Utility",
    blockCategory: "modulator",
  },
];

/** Instruments-only subset for filtered-view stories. */
export const tpInstrumentsOnly: BrowserPlugin[] = tpPlugins.filter(
  (p) => p.blockCategory === "instrument",
);
