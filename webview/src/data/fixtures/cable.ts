/**
 * Cable fixture — CableData covering all signal types (audio/midi/value),
 * sidechain, and bus variants. Used by Cable stories (G-24..G-28).
 * APPEND-ONLY: do NOT mutate existing exports after initial commit.
 *
 * ⚠️ DEMO ONLY — NOT real engine data. See demoGraph.ts header for policy.
 */
import type { BlockData, CableData } from "../types";

// ── Minimal block stubs (id + identity only; Cable stories need source/target ids) ──

export const cbBlocks: Pick<BlockData, "id" | "name" | "category" | "format">[] = [
  { id: "cb-synth", name: "Lead Synth", category: "instrument", format: "VST3" },
  { id: "cb-eq", name: "Pro-Q 4", category: "audiofx", format: "VST3" },
  { id: "cb-arp", name: "MIDI Arp", category: "midifx", format: "INT" },
  { id: "cb-lfo", name: "LFO Tool", category: "modulator", format: "INT" },
  { id: "cb-comp", name: "Compressor", category: "audiofx", format: "AU" },
];

// ── Audio stereo cable ──
export const audioCableStereo: CableData = {
  id: "cb-audio-stereo",
  source: "cb-synth",
  sourcePort: "out-l",
  target: "cb-eq",
  targetPort: "in-l",
  signalType: "audio",
  channelCount: 2,
  isSidechain: false,
};

// ── Audio mono cable ──
export const audioCableMono: CableData = {
  id: "cb-audio-mono",
  source: "cb-synth",
  sourcePort: "out-l",
  target: "cb-comp",
  targetPort: "in-l",
  signalType: "audio",
  channelCount: 1,
  isSidechain: false,
};

// ── MIDI cable ──
export const midiCable: CableData = {
  id: "cb-midi-1",
  source: "cb-arp",
  sourcePort: "midi-out",
  target: "cb-synth",
  targetPort: "midi-in",
  signalType: "midi",
  channelCount: 1,
  isSidechain: false,
};

// ── Value / CV cable ──
export const valueCable: CableData = {
  id: "cb-value-1",
  source: "cb-lfo",
  sourcePort: "cv-out",
  target: "cb-eq",
  targetPort: "cv-in",
  signalType: "value",
  channelCount: 1,
  isSidechain: false,
};

// ── Sidechain audio cable ──
export const sidechainCable: CableData = {
  id: "cb-sidechain-1",
  source: "cb-synth",
  sourcePort: "sc-out",
  target: "cb-comp",
  targetPort: "sc-in",
  signalType: "audio",
  channelCount: 1,
  isSidechain: true,
};

// ── Named-bus (wireless) cable — retained for back-compat story; wireless
//    rendering will be REMOVED by G-29 task. Story should show the bus
//    representation, not the old wireless ghost. ──
export const busCable: CableData = {
  id: "cb-bus-1",
  source: "cb-synth",
  sourcePort: "bus-out",
  target: "cb-eq",
  targetPort: "bus-in",
  signalType: "audio",
  channelCount: 2,
  isSidechain: false,
  busName: "Main Bus",
};

/** All cable fixture variants in a flat array. */
export const allCables: CableData[] = [
  audioCableStereo,
  audioCableMono,
  midiCable,
  valueCable,
  sidechainCable,
  busCable,
];
