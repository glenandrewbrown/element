import type {
  BlockData,
  CableData,
  CommentBoxData,
  DemoGraph,
  MacroControl,
  SceneData,
} from "./types";

// ── Generators (blue #4A90D9) ──

const oscA: BlockData = {
  id: "osc-a",
  name: "OSC_A",
  category: "generator",
  format: "VST3",
  position: { x: 100, y: 180 },
  ports: [
    {
      id: "osc-a-out",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: true,
    },
    {
      id: "osc-a-midi",
      type: "midi",
      direction: "input",
      label: "MIDI In",
      connected: true,
    },
  ],
  cpuLoad: 0.4,
  latencyMs: 0.4,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

const audioInput: BlockData = {
  id: "audio-in",
  name: "Audio Input",
  category: "generator",
  format: "INT",
  position: { x: 80, y: 400 },
  ports: [
    {
      id: "audio-in-out",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: true,
    },
  ],
  cpuLoad: 0.1,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

const kontakt: BlockData = {
  id: "kontakt",
  name: "Kontakt 8",
  category: "generator",
  format: "VST3",
  position: { x: 100, y: 550 },
  ports: [
    {
      id: "kontakt-midi",
      type: "midi",
      direction: "input",
      label: "MIDI In",
      connected: true,
    },
    {
      id: "kontakt-out",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: true,
    },
  ],
  cpuLoad: 4.8,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

// ── Modifiers (orange #E8A838) ──

const filterCore: BlockData = {
  id: "filter-core",
  name: "FILTER_CORE",
  category: "modifier",
  format: "INT",
  position: { x: 520, y: 220 },
  ports: [
    {
      id: "filter-in",
      type: "audio",
      direction: "input",
      label: "Audio In",
      connected: true,
    },
    {
      id: "filter-out",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: true,
    },
    {
      id: "filter-val",
      type: "value",
      direction: "input",
      label: "Cutoff CV",
      connected: true,
    },
  ],
  cpuLoad: 1.4,
  latencyMs: 1.4,
  bypassed: false,
  error: false,
  isMacroTagged: true,
};

const proQ3: BlockData = {
  id: "pro-q3",
  name: "FabFilter Pro-Q 3",
  category: "modifier",
  format: "VST3",
  position: { x: 400, y: 350 },
  ports: [
    {
      id: "proq-in",
      type: "audio",
      direction: "input",
      label: "Audio In",
      connected: true,
    },
    {
      id: "proq-out",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: true,
    },
    {
      id: "proq-val",
      type: "value",
      direction: "input",
      label: "Gain CV",
      connected: true,
    },
  ],
  cpuLoad: 2.1,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: true,
};

const compressor1176: BlockData = {
  id: "comp-1176",
  name: "1176 Compressor",
  category: "modifier",
  format: "AU",
  position: { x: 400, y: 500 },
  ports: [
    {
      id: "comp-in",
      type: "audio",
      direction: "input",
      label: "Audio In",
      connected: true,
    },
    {
      id: "comp-sc",
      type: "audio",
      direction: "input",
      label: "Sidechain",
      connected: true,
    },
    {
      id: "comp-out",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: true,
    },
  ],
  cpuLoad: 1.8,
  latencyMs: 0,
  bypassed: true,
  error: false,
  isMacroTagged: false,
};

const valhallaRoom: BlockData = {
  id: "valhalla-room",
  name: "Valhalla Room",
  category: "modifier",
  format: "VST3",
  position: { x: 650, y: 400 },
  ports: [
    {
      id: "valhalla-in",
      type: "audio",
      direction: "input",
      label: "Audio In",
      connected: true,
    },
    {
      id: "valhalla-out",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: true,
    },
  ],
  cpuLoad: 12.1,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: true,
};

const hDelay: BlockData = {
  id: "h-delay",
  name: "H-Delay",
  category: "modifier",
  format: "AU",
  position: { x: 700, y: 550 },
  ports: [
    {
      id: "hdelay-in",
      type: "audio",
      direction: "input",
      label: "Audio In",
      connected: true,
    },
    {
      id: "hdelay-out",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: true,
    },
  ],
  cpuLoad: 1.9,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

const peakLimiter: BlockData = {
  id: "peak-limiter",
  name: "PEAK_LIMITER",
  category: "modifier",
  format: "INT",
  position: { x: 850, y: 350 },
  ports: [
    {
      id: "limiter-in",
      type: "audio",
      direction: "input",
      label: "Audio In",
      connected: true,
    },
    {
      id: "limiter-out",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: true,
    },
  ],
  cpuLoad: 0.3,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

// ── Logic (teal #2BC4C4) ──

const midiRouter: BlockData = {
  id: "midi-router",
  name: "MIDI Router",
  category: "logic",
  format: "INT",
  position: { x: 250, y: 100 },
  ports: [
    {
      id: "mr-midi-in",
      type: "midi",
      direction: "input",
      label: "MIDI In",
      connected: true,
    },
    {
      id: "mr-midi-out1",
      type: "midi",
      direction: "output",
      label: "MIDI Out 1",
      connected: true,
    },
    {
      id: "mr-midi-out2",
      type: "midi",
      direction: "output",
      label: "MIDI Out 2",
      connected: true,
    },
  ],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

const lfoTool: BlockData = {
  id: "lfo-tool",
  name: "LFO Tool",
  category: "logic",
  format: "CLAP",
  position: { x: 350, y: 600 },
  ports: [
    {
      id: "lfo-val-out",
      type: "value",
      direction: "output",
      label: "Value Out",
      connected: true,
    },
  ],
  cpuLoad: 0.1,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

const valueConstant: BlockData = {
  id: "val-const",
  name: "Value Constant",
  category: "logic",
  format: "INT",
  position: { x: 200, y: 700 },
  ports: [
    {
      id: "valconst-out",
      type: "value",
      direction: "output",
      label: "Value Out",
      connected: true,
    },
  ],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

// ── MIDI Processing Suite (teal #2BC4C4) ──

const midiFilter: BlockData = {
  id: "midi-filter",
  name: "MIDI Filter",
  category: "logic",
  format: "INT",
  position: { x: 450, y: 80 },
  ports: [
    {
      id: "mf-midi-in",
      type: "midi",
      direction: "input",
      label: "MIDI In",
      connected: true,
    },
    {
      id: "mf-midi-out",
      type: "midi",
      direction: "output",
      label: "MIDI Out",
      connected: true,
    },
  ],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

const midiTranspose: BlockData = {
  id: "midi-transpose",
  name: "MIDI Transpose",
  category: "logic",
  format: "INT",
  position: { x: 650, y: 80 },
  ports: [
    {
      id: "mt-midi-in",
      type: "midi",
      direction: "input",
      label: "MIDI In",
      connected: true,
    },
    {
      id: "mt-midi-out",
      type: "midi",
      direction: "output",
      label: "MIDI Out",
      connected: true,
    },
  ],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: true,
};

const arpeggiator: BlockData = {
  id: "arpeggiator",
  name: "Arpeggiator",
  category: "logic",
  format: "INT",
  position: { x: 450, y: 180 },
  ports: [
    {
      id: "arp-midi-in",
      type: "midi",
      direction: "input",
      label: "MIDI In",
      connected: true,
    },
    {
      id: "arp-midi-out",
      type: "midi",
      direction: "output",
      label: "MIDI Out",
      connected: true,
    },
    {
      id: "arp-clock",
      type: "value",
      direction: "input",
      label: "Clock In",
      connected: false,
    },
  ],
  cpuLoad: 0.1,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: true,
};

const logicalEditor: BlockData = {
  id: "logical-editor",
  name: "Logical Editor",
  category: "logic",
  format: "INT",
  position: { x: 650, y: 180 },
  ports: [
    {
      id: "le-midi-in",
      type: "midi",
      direction: "input",
      label: "MIDI In",
      connected: true,
    },
    {
      id: "le-midi-out",
      type: "midi",
      direction: "output",
      label: "MIDI Out",
      connected: true,
    },
    {
      id: "le-midi-reject",
      type: "midi",
      direction: "output",
      label: "Rejected",
      connected: false,
    },
  ],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

const midiVelocity: BlockData = {
  id: "midi-velocity",
  name: "MIDI Velocity",
  category: "logic",
  format: "INT",
  position: { x: 350, y: 280 },
  ports: [
    {
      id: "mv-midi-in",
      type: "midi",
      direction: "input",
      label: "MIDI In",
      connected: true,
    },
    {
      id: "mv-midi-out",
      type: "midi",
      direction: "output",
      label: "MIDI Out",
      connected: true,
    },
  ],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

const midiChannelizer: BlockData = {
  id: "midi-channelizer",
  name: "MIDI Channelizer",
  category: "logic",
  format: "INT",
  position: { x: 550, y: 280 },
  ports: [
    {
      id: "mc-midi-in",
      type: "midi",
      direction: "input",
      label: "MIDI In",
      connected: true,
    },
    {
      id: "mc-midi-out1",
      type: "midi",
      direction: "output",
      label: "Ch 1-8",
      connected: true,
    },
    {
      id: "mc-midi-out2",
      type: "midi",
      direction: "output",
      label: "Ch 9-16",
      connected: false,
    },
  ],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

// ── Special ──

const voiceChain: BlockData = {
  id: "voice-chain",
  name: "VOICE_CHAIN_01",
  category: "modifier",
  format: "INT",
  position: { x: 500, y: 420 },
  ports: [
    {
      id: "vc-in",
      type: "audio",
      direction: "input",
      label: "Audio In",
      connected: true,
    },
    {
      id: "vc-out",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: true,
    },
  ],
  cpuLoad: 3.2,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
  containerNodeCount: 3,
};

const externalPortal: BlockData = {
  id: "portal-out",
  name: "External Portal: Output-01",
  category: "modifier",
  format: "INT",
  position: { x: 750, y: 140 },
  ports: [
    {
      id: "portal-in",
      type: "audio",
      direction: "input",
      label: "Audio In",
      connected: true,
    },
    {
      id: "portal-out-port",
      type: "audio",
      direction: "output",
      label: "Audio Out",
      connected: false,
    },
  ],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
  isPortal: true,
};

const audioOutput: BlockData = {
  id: "audio-out",
  name: "Audio Output",
  category: "modifier",
  format: "INT",
  position: { x: 900, y: 350 },
  ports: [
    {
      id: "audio-out-in",
      type: "audio",
      direction: "input",
      label: "Audio In",
      connected: true,
    },
  ],
  cpuLoad: 0,
  latencyMs: 0,
  bypassed: false,
  error: false,
  isMacroTagged: false,
};

// ── Cables (18 connections) ──

const cables: CableData[] = [
  // --- MIDI cables (teal, 2px mono) ---
  {
    id: "cable-mr-to-filter",
    source: "midi-router",
    sourcePort: "mr-midi-out1",
    target: "midi-filter",
    targetPort: "mf-midi-in",
    signalType: "midi",
    channelCount: 1,
    isSidechain: false,
  },
  {
    id: "cable-filter-to-transpose",
    source: "midi-filter",
    sourcePort: "mf-midi-out",
    target: "midi-transpose",
    targetPort: "mt-midi-in",
    signalType: "midi",
    channelCount: 1,
    isSidechain: false,
  },
  {
    id: "cable-transpose-to-osc",
    source: "midi-transpose",
    sourcePort: "mt-midi-out",
    target: "osc-a",
    targetPort: "osc-a-midi",
    signalType: "midi",
    channelCount: 1,
    isSidechain: false,
  },
  {
    id: "cable-mr-to-arp",
    source: "midi-router",
    sourcePort: "mr-midi-out2",
    target: "arpeggiator",
    targetPort: "arp-midi-in",
    signalType: "midi",
    channelCount: 1,
    isSidechain: false,
  },
  {
    id: "cable-arp-to-logical",
    source: "arpeggiator",
    sourcePort: "arp-midi-out",
    target: "logical-editor",
    targetPort: "le-midi-in",
    signalType: "midi",
    channelCount: 1,
    isSidechain: false,
  },
  {
    id: "cable-logical-to-kontakt",
    source: "logical-editor",
    sourcePort: "le-midi-out",
    target: "kontakt",
    targetPort: "kontakt-midi",
    signalType: "midi",
    channelCount: 1,
    isSidechain: false,
  },
  {
    id: "cable-mr-to-velocity",
    source: "midi-router",
    sourcePort: "mr-midi-out1",
    target: "midi-velocity",
    targetPort: "mv-midi-in",
    signalType: "midi",
    channelCount: 1,
    isSidechain: false,
  },
  {
    id: "cable-velocity-to-channelizer",
    source: "midi-velocity",
    sourcePort: "mv-midi-out",
    target: "midi-channelizer",
    targetPort: "mc-midi-in",
    signalType: "midi",
    channelCount: 1,
    isSidechain: false,
  },

  // --- Main audio path: OSC_A → Filter → Portal (stereo, 3px) ---
  {
    id: "cable-osc-to-filter",
    source: "osc-a",
    sourcePort: "osc-a-out",
    target: "filter-core",
    targetPort: "filter-in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  },
  {
    id: "cable-filter-to-portal",
    source: "filter-core",
    sourcePort: "filter-out",
    target: "portal-out",
    targetPort: "portal-in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  },

  // --- Audio Input → Pro-Q 3 → 1176 → Valhalla Room (stereo) ---
  {
    id: "cable-ain-to-proq",
    source: "audio-in",
    sourcePort: "audio-in-out",
    target: "pro-q3",
    targetPort: "proq-in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  },
  {
    id: "cable-proq-to-comp",
    source: "pro-q3",
    sourcePort: "proq-out",
    target: "comp-1176",
    targetPort: "comp-in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  },
  {
    id: "cable-comp-to-valhalla",
    source: "comp-1176",
    sourcePort: "comp-out",
    target: "valhalla-room",
    targetPort: "valhalla-in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  },

  // --- Kontakt → Voice Chain → H-Delay (stereo) ---
  {
    id: "cable-kontakt-to-vc",
    source: "kontakt",
    sourcePort: "kontakt-out",
    target: "voice-chain",
    targetPort: "vc-in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  },
  {
    id: "cable-vc-to-hdelay",
    source: "voice-chain",
    sourcePort: "vc-out",
    target: "h-delay",
    targetPort: "hdelay-in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  },

  // --- Valhalla → Peak Limiter → Audio Output (stereo) ---
  {
    id: "cable-valhalla-to-limiter",
    source: "valhalla-room",
    sourcePort: "valhalla-out",
    target: "peak-limiter",
    targetPort: "limiter-in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  },
  {
    id: "cable-limiter-to-out",
    source: "peak-limiter",
    sourcePort: "limiter-out",
    target: "audio-out",
    targetPort: "audio-out-in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  },

  // --- H-Delay → Peak Limiter (mono, 2px) ---
  {
    id: "cable-hdelay-to-limiter",
    source: "h-delay",
    sourcePort: "hdelay-out",
    target: "peak-limiter",
    targetPort: "limiter-in",
    signalType: "audio",
    channelCount: 1,
    isSidechain: false,
  },

  // --- Sidechain: Audio Input → 1176 sidechain (blue, dashed) ---
  {
    id: "cable-sc-ain-to-comp",
    source: "audio-in",
    sourcePort: "audio-in-out",
    target: "comp-1176",
    targetPort: "comp-sc",
    signalType: "audio",
    channelCount: 1,
    isSidechain: true,
  },

  // --- Value cables (orange, 2px) ---
  {
    id: "cable-lfo-to-proq",
    source: "lfo-tool",
    sourcePort: "lfo-val-out",
    target: "pro-q3",
    targetPort: "proq-val",
    signalType: "value",
    channelCount: 1,
    isSidechain: false,
  },
  {
    id: "cable-valconst-to-filter",
    source: "val-const",
    sourcePort: "valconst-out",
    target: "filter-core",
    targetPort: "filter-val",
    signalType: "value",
    channelCount: 1,
    isSidechain: false,
  },

  // --- Multichannel: Kontakt → Audio Output (6ch surround, 5px) ---
  {
    id: "cable-kontakt-surround",
    source: "kontakt",
    sourcePort: "kontakt-out",
    target: "audio-out",
    targetPort: "audio-out-in",
    signalType: "audio",
    channelCount: 6,
    isSidechain: false,
  },

  // --- Pro-Q 3 → Valhalla send (stereo) ---
  {
    id: "cable-proq-to-valhalla",
    source: "pro-q3",
    sourcePort: "proq-out",
    target: "valhalla-room",
    targetPort: "valhalla-in",
    signalType: "audio",
    channelCount: 2,
    isSidechain: false,
  },

  // --- Voice Chain → Valhalla reverb send (mono) ---
  {
    id: "cable-vc-to-valhalla",
    source: "voice-chain",
    sourcePort: "vc-out",
    target: "valhalla-room",
    targetPort: "valhalla-in",
    signalType: "audio",
    channelCount: 1,
    isSidechain: false,
  },
];

// ── Comment Boxes ──

const commentBoxes: CommentBoxData[] = [
  {
    id: "comment-sources",
    label: "SOURCES",
    color: "rgba(74, 144, 217, 0.12)",
    position: { x: 40, y: 120 },
    size: { width: 280, height: 520 },
  },
  {
    id: "comment-midi-processing",
    label: "MIDI PROCESSING",
    color: "rgba(43, 196, 196, 0.12)",
    position: { x: 330, y: 50 },
    size: { width: 420, height: 280 },
  },
  {
    id: "comment-insert",
    label: "INSERT CHAIN",
    color: "rgba(232, 168, 56, 0.12)",
    position: { x: 360, y: 350 },
    size: { width: 580, height: 320 },
  },
];

// ── Scenes ──

const scenes: SceneData[] = [
  { id: "scene-1", name: "Default", index: 0, active: true },
  { id: "scene-2", name: "Verse", index: 1, active: false },
  { id: "scene-3", name: "Chorus", index: 2, active: false },
  { id: "scene-4", name: "Bridge", index: 3, active: false },
];

// ── Macro Controls ──

const macros: MacroControl[] = [
  {
    id: "macro-filter-cutoff",
    name: "Filter Cutoff",
    sourceBlock: "filter-core",
    sourceParam: "cutoff",
    value: 72,
    type: "knob",
    signalType: "audio",
  },
  {
    id: "macro-proq-gain",
    name: "EQ Output Gain",
    sourceBlock: "pro-q3",
    sourceParam: "outputGain",
    value: 65,
    type: "fader",
    signalType: "audio",
  },
  {
    id: "macro-valhalla-mix",
    name: "Reverb Mix",
    sourceBlock: "valhalla-room",
    sourceParam: "mix",
    value: 38,
    type: "knob",
    signalType: "audio",
  },
  {
    id: "macro-transpose",
    name: "Transpose",
    sourceBlock: "midi-transpose",
    sourceParam: "semitones",
    value: 50,
    type: "knob",
    signalType: "midi",
  },
  {
    id: "macro-arp-rate",
    name: "Arp Rate",
    sourceBlock: "arpeggiator",
    sourceParam: "rate",
    value: 60,
    type: "knob",
    signalType: "midi",
  },
];

// ── Assembled Demo Graph ──

export const demoGraph: DemoGraph = {
  blocks: [
    oscA,
    audioInput,
    kontakt,
    filterCore,
    proQ3,
    compressor1176,
    valhallaRoom,
    hDelay,
    peakLimiter,
    midiRouter,
    lfoTool,
    valueConstant,
    voiceChain,
    externalPortal,
    audioOutput,
    // MIDI Processing Suite
    midiFilter,
    midiTranspose,
    arpeggiator,
    logicalEditor,
    midiVelocity,
    midiChannelizer,
  ],
  cables,
  commentBoxes,
  scenes,
  macros,
};
