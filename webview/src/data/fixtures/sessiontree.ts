/**
 * Session-tree fixture — blocks covering all 4 categories with realistic port
 * configs. Used by SessionTree stories (G-12/G-13). APPEND-ONLY: do NOT
 * mutate existing exports after initial commit — add new named exports below.
 *
 * ⚠️ DEMO ONLY — NOT real engine data. See demoGraph.ts header for policy.
 */
import type { BlockData } from "../types";

export const stInstrument: BlockData = {
  id: "st-instrument-1",
  name: "Lead Synth",
  category: "instrument",
  format: "VST3",
  position: { x: 0, y: 0 },
  ports: [
    { id: "st-i1-out-l", type: "audio", direction: "output", label: "Out L", connected: true },
    { id: "st-i1-out-r", type: "audio", direction: "output", label: "Out R", connected: true },
    { id: "st-i1-midi-in", type: "midi", direction: "input", label: "MIDI In", connected: true },
  ],
  cpuLoad: 12,
  latencyMs: 2.3,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

export const stAudiofx: BlockData = {
  id: "st-audiofx-1",
  name: "EQ / Compressor",
  category: "audiofx",
  format: "AU",
  position: { x: 200, y: 0 },
  ports: [
    { id: "st-a1-in-l", type: "audio", direction: "input", label: "In L", connected: true },
    { id: "st-a1-in-r", type: "audio", direction: "input", label: "In R", connected: true },
    { id: "st-a1-out-l", type: "audio", direction: "output", label: "Out L", connected: true },
    { id: "st-a1-out-r", type: "audio", direction: "output", label: "Out R", connected: true },
  ],
  cpuLoad: 7,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

export const stMidifx: BlockData = {
  id: "st-midifx-1",
  name: "MIDI Arpeggio",
  category: "midifx",
  format: "CLAP",
  position: { x: 0, y: 150 },
  ports: [
    { id: "st-m1-midi-in", type: "midi", direction: "input", label: "MIDI In", connected: true },
    { id: "st-m1-midi-out", type: "midi", direction: "output", label: "MIDI Out", connected: true },
  ],
  cpuLoad: 2,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

export const stModulator: BlockData = {
  id: "st-modulator-1",
  name: "LFO Mod",
  category: "modulator",
  format: "INT",
  position: { x: 200, y: 150 },
  ports: [
    { id: "st-v1-out", type: "value", direction: "output", label: "CV Out", connected: false },
  ],
  cpuLoad: 1,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

/** All 4 session-tree fixture blocks (one per category). */
export const sessionTreeBlocks: BlockData[] = [
  stInstrument,
  stAudiofx,
  stMidifx,
  stModulator,
];
