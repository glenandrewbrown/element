import type {
  AlertData,
  DemoPerform,
  EngineHealth,
  MacroControl,
  SceneData,
  SignalChainEntry,
} from "./types";

// ── 8 Scenes ──

const scenes: SceneData[] = [
  { id: "scene-init", name: "Init", index: 0, active: true },
  { id: "scene-verse-a", name: "Verse A", index: 1, active: false },
  { id: "scene-chorus", name: "Chorus", index: 2, active: false },
  { id: "scene-bridge", name: "Bridge", index: 3, active: false },
  { id: "scene-verse-b", name: "Verse B", index: 4, active: false },
  { id: "scene-drop", name: "Drop", index: 5, active: false },
  { id: "scene-ambient", name: "Ambient", index: 6, active: false },
  { id: "scene-outro", name: "Outro", index: 7, active: false },
];

// ── 6 Macro Controls ──

const macros: MacroControl[] = [
  {
    id: "macro-cutoff",
    name: "CUTOFF",
    sourceBlock: "serum-main",
    sourceParam: "cutoff",
    value: 42,
    type: "knob",
    signalType: "audio",
  },
  {
    id: "macro-q-peak",
    name: "Q-PEAK",
    sourceBlock: "pro-q3",
    sourceParam: "qPeak",
    value: 78,
    type: "knob",
    signalType: "audio",
  },
  {
    id: "macro-lfo-rate",
    name: "LFO RATE",
    sourceBlock: "lfo-tool",
    sourceParam: "rate",
    value: 60,
    type: "fader",
    signalType: "value",
  },
  {
    id: "macro-wet-dry",
    name: "WET/DRY",
    sourceBlock: "valhalla-room",
    sourceParam: "mix",
    value: 30,
    type: "fader",
    signalType: "audio",
  },
  {
    id: "macro-gain",
    name: "GAIN",
    sourceBlock: "osc-a",
    sourceParam: "outputGain",
    value: 62,
    type: "fader",
    signalType: "audio",
  },
  {
    id: "macro-detune",
    name: "DETUNE",
    sourceBlock: "osc-a",
    sourceParam: "detune",
    value: 56,
    type: "knob",
    signalType: "audio",
  },
];

// ── Signal Chain ──

const signalChain: SignalChainEntry[] = [
  {
    id: "chain-serum",
    name: "SERUM_MAIN",
    format: "VST3",
    channelConfig: "Stereo",
    category: "generator",
    active: true,
  },
  {
    id: "chain-proq",
    name: "PRO-Q 3",
    format: "VST3",
    channelConfig: "Stereo",
    category: "modifier",
    active: false,
  },
  {
    id: "chain-ott",
    name: "OTT_COMP",
    format: "VST3",
    channelConfig: "Stereo",
    category: "modifier",
    active: false,
  },
];

// ── Engine Health ──

const health: EngineHealth = {
  cpuPercent: 42.8,
  bufferSize: 256,
  latencyMs: 2.6,
  clockSource: "Internal 48k",
  sampleRate: 48000,
  bpm: 124.0,
  timecode: "00:42:15:12",
  ioActivity: "nominal",
};

// ── Alerts ──

const alerts: AlertData[] = [
  {
    id: "alert-midi-jitter",
    severity: "warning",
    title: "MIDI Clock Jitter",
    message: "Fluctuation detected in External Sync",
  },
];

// ── Assembled Perform Data ──

export const demoPerform: DemoPerform = {
  scenes,
  macros,
  signalChain,
  health,
  alerts,
};
