/**
 * BlockEmbed fixture — one BlockData per category for Tier-1/Tier-3 story
 * variants. Used by BlockEmbed stories (G-20..G-23). APPEND-ONLY: do NOT
 * mutate existing exports after initial commit.
 *
 * ⚠️ DEMO ONLY — NOT real engine data. See demoGraph.ts header for policy.
 */
import type { BlockData } from "../types";

export const beInstrument: BlockData = {
  id: "be-instrument",
  name: "Vital Synth",
  category: "instrument",
  format: "VST3",
  position: { x: 0, y: 0 },
  ports: [
    { id: "be-i-out-l", type: "audio", direction: "output", label: "Out L", connected: true },
    { id: "be-i-out-r", type: "audio", direction: "output", label: "Out R", connected: true },
    { id: "be-i-midi-in", type: "midi", direction: "input", label: "MIDI In", connected: true },
  ],
  cpuLoad: 18,
  latencyMs: 2.1,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

export const beAudiofx: BlockData = {
  id: "be-audiofx",
  name: "Pro-Q 4",
  category: "audiofx",
  format: "AU",
  position: { x: 200, y: 0 },
  ports: [
    { id: "be-a-in-l", type: "audio", direction: "input", label: "In L", connected: true },
    { id: "be-a-in-r", type: "audio", direction: "input", label: "In R", connected: true },
    { id: "be-a-out-l", type: "audio", direction: "output", label: "Out L", connected: true },
    { id: "be-a-out-r", type: "audio", direction: "output", label: "Out R", connected: true },
  ],
  cpuLoad: 9,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

export const beMidifx: BlockData = {
  id: "be-midifx",
  name: "MIDI Router",
  category: "midifx",
  format: "INT",
  position: { x: 0, y: 200 },
  ports: [
    { id: "be-m-midi-in", type: "midi", direction: "input", label: "MIDI In", connected: true },
    { id: "be-m-midi-out", type: "midi", direction: "output", label: "MIDI Out", connected: true },
  ],
  cpuLoad: 1,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

export const beModulator: BlockData = {
  id: "be-modulator",
  name: "LFO Tool",
  category: "modulator",
  format: "VST3",
  position: { x: 200, y: 200 },
  ports: [
    { id: "be-v-out", type: "value", direction: "output", label: "CV Out", connected: false },
  ],
  cpuLoad: 3,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

/** Bypassed variant for Tier-3 info-card "bypassed" story. */
export const beBypassedAudiofx: BlockData = {
  ...beAudiofx,
  id: "be-audiofx-bypassed",
  bypassed: true,
};

/** Error variant for Tier-3 "error state" story. */
export const beErrorBlock: BlockData = {
  ...beInstrument,
  id: "be-instrument-error",
  error: true,
};

/** All embed fixture blocks in a flat array. */
export const allEmbedBlocks: BlockData[] = [
  beInstrument,
  beAudiofx,
  beMidifx,
  beModulator,
];
